const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const HOOK = /^https:\/\/([\w-]+\.)?discord(app)?\.com\/api\/webhooks\//i;
const hits = new Map();

function limited(id) {
  const now = Date.now();
  const a = (hits.get(id) || []).filter((t) => now - t < 60000);
  a.push(now);
  hits.set(id, a);
  return a.length > 40;
}
function svc(path, opts = {}) {
  return fetch(SB_URL + path, {
    ...opts,
    headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
}
function pingTag(v) {
  v = String(v || '').trim();
  if (!v) return '';
  if (/^@?(everyone|here)$/i.test(v)) return '@' + v.replace('@', '').toLowerCase();
  const m = v.match(/\d{5,}/);
  return m ? '<@&' + m[0] + '>' : '';
}
function cleanPing(v) {
  return (String(v || '').match(/<@!?\d{5,}>|<@&\d{5,}>/g) || []).slice(0, 40).join(' ');
}
const isEmbed = (e) => e && typeof e === 'object' && !Array.isArray(e);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SB_URL || !SERVICE) return res.status(500).json({ error: 'Server není nakonfigurován' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Chybí přihlášení' });
  const ur = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: SERVICE, Authorization: 'Bearer ' + token } });
  if (!ur.ok) return res.status(401).json({ error: 'Neplatné přihlášení' });
  const caller = await ur.json();
  if (!(caller.app_metadata && caller.app_metadata.frakce)) return res.status(403).json({ error: 'Nejsi člen frakce' });
  if (limited(caller.id)) return res.status(429).json({ error: 'Příliš mnoho zpráv' });

  const b = req.body || {};
  if (JSON.stringify(b).length > 60000) return res.status(413).json({ error: 'Příliš velká zpráva' });
  let type = String(b.type || '');
  if (!/^[\w-]{1,40}$/.test(type)) return res.status(400).json({ error: 'Neplatný typ' });
  const o = b.opts && typeof b.opts === 'object' ? b.opts : {};

  const r = await svc('/rest/v1/frakce_kv?key=in.(members,settings)&select=key,value');
  if (!r.ok) return res.status(500).json({ error: 'Čtení nastavení selhalo' });
  const rows = await r.json();
  const get = (k) => (rows.find((x) => x.key === k) || {}).value;
  const members = get('members') || [];
  if (!members.some((m) => m.authId === caller.id)) return res.status(403).json({ error: 'Nejsi veden jako člen' });
  const s = get('settings') || {};

  let priv = o.private === true;
  if (type === 'member') { type = 'member_adm'; priv = true; }
  const secs = s.sections || {};
  const sec = secs[type] || {};
  if (sec.on === false) return res.status(200).json({ skipped: 'off' });
  const pingCat = /^[\w-]{1,40}$/.test(String(o.pingCat || '')) ? String(o.pingCat) : '';
  const csec = pingCat ? secs['cat_' + pingCat] || {} : {};
  if (csec.on === false) return res.status(200).json({ skipped: 'off' });

  let url = (csec.url || '').trim() || (sec.url || '').trim() || s.webhook;
  if (priv) url = (sec.url || '').trim();
  if (!url || !HOOK.test(url)) return res.status(200).json({ skipped: 'nohook' });

  let ping = '';
  if (!o.noPing) ping = pingTag((pingCat && csec.ping) || sec.ping);
  const extra = cleanPing(o.extraPing);
  if (extra) ping = (ping ? ping + ' ' : '') + extra;

  const msg = String(b.msg || '').slice(0, 3800);
  const time = String(b.time || '').slice(0, 40);
  const text = '`' + time + '` ' + msg;
  const img = /^https?:\/\/[^\s"'<>]+$/i.test(String(o.img || '')) ? String(o.img) : '';
  const body = { username: String(s.webhookName || 'Frakce LOG').slice(0, 80), allowed_mentions: { parse: ['roles', 'everyone', 'users'] } };

  if (isEmbed(o.embed)) {
    if (ping) body.content = ping;
    body.embeds = [o.embed].concat(Array.isArray(o.extraEmbeds) ? o.extraEmbeds.filter(isEmbed) : []).slice(0, 10);
  } else if (o.embedTitle) {
    if (ping) body.content = ping;
    const em = { title: String(o.embedTitle).slice(0, 250), description: msg, color: 0xc49a14, footer: { text: time } };
    if (img) em.image = { url: img };
    body.embeds = [em];
  } else if (img) {
    if (ping) body.content = ping;
    body.embeds = [{ description: text, color: 0xc49a14, image: { url: img } }];
  } else {
    body.content = ((ping ? ping + ' ' : '') + text).slice(0, 1990);
  }

  try {
    const d = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return res.status(d.ok ? 200 : 502).json({ ok: d.ok, status: d.status });
  } catch (e) {
    return res.status(502).json({ error: 'Discord nedostupný' });
  }
};