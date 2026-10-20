// ── Serverová automatická změna vysílaček ──────────────────────────────────────
// Volá se pravidelně (každou minutu) z externího cronu. Když nastal nový časový slot,
// pošle oznámení na Discord a zapíše lastSlot do DB — i když není nikdo přihlášený.
// Algoritmus slotů a frekvencí je 1:1 stejný jako v app.js, takže web a Discord ukazují totéž.
//
// Vercel → Settings → Environment Variables (už existují z admin-users.js):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (musí patřit ke STEJNÉMU projektu jako SUPABASE_URL v app.js)
// Nová:
//   CRON_SECRET = libovolné dlouhé tajné heslo
//
// Volání:  GET https://TVUJ-WEB.vercel.app/api/radio-tick?key=CRON_SECRET
//          (nebo hlavička Authorization: Bearer CRON_SECRET — tu posílá i Vercel Cron)

const TABLE = 'frakce_kv';
const TZ = 'Europe/Prague';
const DEF_TIMES = ['15:00', '17:00'];

/* ---------- pomocné: čas v Praze ---------- */
function pragueNow() {
  const p = {};
  new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric'
  }).formatToParts(new Date()).forEach(x => { if (x.type !== 'literal') p[x.type] = +x.value; });
  return p; // {year,month,day,hour,minute}
}
const fmt = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
function parseT(s) {
  const p = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!p) return null;
  const h = +p[1], m = +p[2];
  return (h > 23 || m > 59) ? null : h * 60 + m;
}

/* ---------- port z app.js ---------- */
function radioTimes(cfg) {
  const src = (cfg.times && cfg.times.length) ? cfg.times : DEF_TIMES, seen = {}, out = [];
  src.forEach(s => { const m = parseT(s); if (m !== null && !seen[m]) { seen[m] = 1; out.push(m); } });
  if (!out.length) return DEF_TIMES.map(parseT).sort((a, b) => a - b);
  return out.sort((a, b) => a - b);
}
const tag = m => (m % 60 === 0 ? String(m / 60) : fmt(m));
function currentSlot(cfg, now) {
  const ts = radioTimes(cfg), nowM = now.hour * 60 + now.minute;
  let pick = -1;
  ts.forEach(t => { if (t <= nowM) pick = t; });
  let base = new Date(Date.UTC(now.year, now.month - 1, now.day)), prevDay = false;
  if (pick < 0) { base = new Date(base.getTime() - 86400000); pick = ts[ts.length - 1]; prevDay = true; }
  let s = base.getUTCFullYear() + '-' + (base.getUTCMonth() + 1) + '-' + base.getUTCDate() + '-' + tag(pick);
  if (cfg.hold && cfg.hold.bad === s) s = cfg.hold.keep;
  return { slot: s, pick, lateMin: prevDay ? nowM + 1440 - pick : nowM - pick };
}
function slotLabel(slot) {
  const t = String(slot).split('-')[3];
  return t.indexOf(':') > -1 ? t : fmt(+t * 60);
}
function hashStr(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return h >>> 0;
}
function rngFrom(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function autoRadios(cfg, slot) {
  const r = rngFrom(hashStr((cfg.salt || 'x') + '|' + slot)), used = {}, out = [];
  while (out.length < 4) {
    const n = ((1000 + Math.floor(r() * 8991)) / 10).toFixed(1).replace('.', ',');
    if (!used[n]) { used[n] = 1; out.push(n); }
  }
  return { primary: out[0], secondary: out[1], action: out[2], vedeni: out[3] };
}
function pingTag(v) {
  v = String(v || '').trim(); if (!v) return '';
  if (/^@?(everyone|here)$/i.test(v)) return '@' + v.replace('@', '').toLowerCase();
  const m = v.match(/\d{5,}/); return m ? '<@&' + m[0] + '>' : '';
}

/* ---------- Supabase REST ---------- */
function sbHeaders(extra) {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Object.assign({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, extra || {});
}
async function getKeys(keys) {
  const url = process.env.SUPABASE_URL + '/rest/v1/' + TABLE + '?select=key,value&key=in.(' + keys.join(',') + ')';
  const r = await fetch(url, { headers: sbHeaders() });
  if (!r.ok) throw new Error('Supabase čtení: HTTP ' + r.status + ' ' + (await r.text()));
  const o = {}; (await r.json()).forEach(x => { o[x.key] = x.value; }); return o;
}
async function setKey(key, value) {
  const r = await fetch(process.env.SUPABASE_URL + '/rest/v1/' + TABLE + '?on_conflict=key', {
    method: 'POST',
    headers: sbHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify([{ key, value, updated_at: new Date().toISOString() }])
  });
  if (!r.ok) throw new Error('Supabase zápis: HTTP ' + r.status + ' ' + (await r.text()));
}

/* ---------- handler ---------- */
module.exports = async (req, res) => {
  try {
    const secret = process.env.CRON_SECRET;
    const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || (req.query && req.query.key) || '';
    if (!secret || given !== secret) return res.status(401).json({ error: 'unauthorized' });
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'chybí SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' });

    const db = await getKeys(['radioauto2', 'settings']);
    const cfg = db.radioauto2;
    if (!cfg || !cfg.on) return res.status(200).json({ ok: true, skipped: 'automatická změna je vypnutá' });

    const now = pragueNow();
    const { slot, lateMin } = currentSlot(cfg, now);
    if (cfg.lastSlot === slot) return res.status(200).json({ ok: true, skipped: 'slot už oznámen', slot });

    // nejdřív zapsat slot (aby webové klienty už nic neposílaly), pak teprve Discord
    const next = Object.assign({}, cfg, { lastSlot: slot, lastAt: Date.now() });
    await setKey('radioauto2', next);

    const s = db.settings || {};
    const sec = ((s.sections || {}).radio) || {};
    const url = (sec.url || '').trim() || s.webhook;
    let sent = false;
    if (sec.on !== false && url) {
      const f = autoRadios(cfg, slot);
      const hh = slotLabel(slot);
      const nowHM = fmt(now.hour * 60 + now.minute);
      const note = lateMin > 5 ? ' (oznámeno až v **' + nowHM + '**)' : '';
      const ping = pingTag(sec.ping);
      const body = {
        username: s.webhookName || 'Frakce LOG',
        allowed_mentions: { parse: ['roles', 'everyone', 'users'] },
        embeds: [{
          title: '📻 Automatická změna frekvencí',
          description: 'Platí od **' + hh + '**' + note + ' — předchozí frekvence už nefungují.',
          color: 0xc49a14,
          fields: [
            { name: '🟡 Primární', value: '`' + f.primary + '`', inline: true },
            { name: '🔵 Sekundární', value: '`' + f.secondary + '`', inline: true },
            { name: '🟢 Akce', value: '`' + f.action + '`', inline: true }
          ],
          footer: { text: 'Vysílačka' },
          timestamp: new Date().toISOString()
        }]
      };
      if (ping) body.content = ping;
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      sent = r.ok;
      if (!r.ok) console.error('Discord HTTP', r.status, await r.text());
    }
    return res.status(200).json({ ok: true, slot, sent, lateMin });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
};
