// Vercel serverless funkce: /api/discord-claim
// Env proměnné: SUPABASE_SERVICE_ROLE_KEY (povinná), SUPABASE_URL (volitelná)
const SB = process.env.SUPABASE_URL || 'https://cufbeahjechwpyvldztr.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

async function kv(key) {
  const r = await fetch(SB + '/rest/v1/frakce_kv?key=eq.' + key + '&select=value', { headers: H });
  const a = await r.json();
  return a && a[0] ? a[0].value : null;
}
async function saveKv(key, value) {
  await fetch(SB + '/rest/v1/frakce_kv?on_conflict=key', {
    method: 'POST', headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify([{ key, value, updated_at: new Date().toISOString() }])
  });
}
// vrací pole ID rolí; [] = není na serveru; null = nepodařilo se zjistit
async function discordRoles(guildId, token) {
  try {
    const r = await fetch('https://discord.com/api/v10/users/@me/guilds/' + guildId + '/member', { headers: { Authorization: 'Bearer ' + token } });
    if (r.status === 404) return [];
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j.roles) ? j.roles : [];
  } catch (e) { return null; }
}
async function setFrakce(user, on) {
  const r = await fetch(SB + '/auth/v1/admin/users/' + user.id, {
    method: 'PUT', headers: H,
    body: JSON.stringify({ app_metadata: Object.assign({}, user.app_metadata, { frakce: on }) })
  });
  return r.ok;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Pouze POST' });
  if (!KEY) return res.status(500).json({ error: 'Na serveru chybí SUPABASE_SERVICE_ROLE_KEY' });
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Chybí přihlášení' });
    let body = req.body || {};
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const ptoken = body.providerToken || '';

    // 1) ověř uživatele
    const ur = await fetch(SB + '/auth/v1/user', { headers: { apikey: KEY, Authorization: 'Bearer ' + token } });
    if (!ur.ok) return res.status(401).json({ error: 'Neplatné přihlášení' });
    const user = await ur.json();
    if (!user.app_metadata || user.app_metadata.provider !== 'discord')
      return res.status(403).json({ error: 'Tohle není Discord účet' });
    const md = user.user_metadata || {};
    const did = String(md.provider_id || md.sub || '');
    if (!did) return res.status(403).json({ error: 'Discord ID se nepodařilo zjistit' });
    const name = String((md.custom_claims && md.custom_claims.global_name) || md.full_name || md.name || 'Discord').slice(0, 60);

    // 2) člen + nastavení rolí
    const members = (await kv('members')) || [];
    let m = members.find((x) => String(x.discordId || '') === did);
    const cfg = await kv('rolecfg');
    let roles = null, hit = [];
    if (cfg && cfg.on && cfg.guildId && ptoken) {
      roles = await discordRoles(String(cfg.guildId).trim(), ptoken);
      if (roles) hit = (cfg.rules || []).filter((r) => r.roleId && roles.indexOf(String(r.roleId).trim()) !== -1);
    }
    const roleAdmin = hit.some((r) => r.admin);
    let changed = false;

    // 3) účet vzniklý přes roli: musí roli stále mít
    if (m && m.viaRole && roles) {
      if (!hit.length) {
        await setFrakce(user, false);
        return res.status(403).json({ error: 'Už nemáš požadovanou roli na Discordu — přístup byl odebrán' });
      }
      if (!!m.adminAccess !== roleAdmin) { m.adminAccess = roleAdmin; changed = true; }
    }

    if (!m) {
      if (hit.length) {
        // nový člověk s platnou rolí -> automaticky skrytý účet
        m = { id: Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4), authId: user.id, email: '', displayName: name,
          position: 'Associate', adminAccess: roleAdmin, note: 'Automaticky přes Discord roli (' + hit.map((r) => r.label || r.roleId).join(', ') + ')',
          discordId: did, firstName: '', lastName: '', nick: '', strikes: 0, panic: false, hidden: true, viaRole: true,
          joined: new Date().toISOString().slice(0, 10) };
        members.push(m); changed = true;
      } else {
        // bez role: ulož žádost o přístup
        let reqs = (await kv('accessreq')) || [];
        if (!Array.isArray(reqs)) reqs = [];
        if (!reqs.some((x) => String(x.discordId) === did)) {
          reqs.push({ discordId: did, name, ts: Date.now() });
          await saveKv('accessreq', reqs.slice(-50));
          try {
            const st = await kv('settings');
            const hook = st && st.webhook;
            if (hook) await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: 'Frakce LOG', embeds: [{ title: '🔑 Žádost o přístup', description: '**' + name + '** (<@' + did + '>) se zkusil přihlásit přes Discord.\nSchval nebo zamítni v Administraci → Nastavení → Admin práva.', color: 0xe67e22 }] }) });
          } catch (e) {}
        }
        const hint = (cfg && cfg.on && roles && roles.length) ? ' (tvoje role na serveru: ' + roles.join(', ') + ')' : '';
        return res.status(403).json({ error: 'Nejsi na seznamu členů a nemáš potřebnou roli. Žádost byla odeslána vedení' + hint });
      }
    }
    if (m.panic) return res.status(403).json({ error: 'Přístup je zablokován' });
    if (!m.authId) { m.authId = user.id; changed = true; }
    if (changed) await saveKv('members', members);

    // 4) příznak frakce
    if (!(await setFrakce(user, true))) return res.status(500).json({ error: 'Nepodařilo se uložit oprávnění' });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
};
