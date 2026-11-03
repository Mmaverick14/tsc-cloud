// Vercel serverless funkce: /api/discord-claim
// Potřebuje v prostředí (Vercel → Settings → Environment Variables):
//   SUPABASE_SERVICE_ROLE_KEY  (Supabase → Project Settings → API → service_role)
//   SUPABASE_URL               (volitelné, výchozí je níže)
const SB = process.env.SUPABASE_URL || 'https://cufbeahjechwpyvldztr.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Pouze POST' });
  if (!KEY) return res.status(500).json({ error: 'Na serveru chybí SUPABASE_SERVICE_ROLE_KEY' });
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Chybí přihlášení' });

    // 1) ověř uživatele podle jeho tokenu
    const ur = await fetch(SB + '/auth/v1/user', { headers: { apikey: KEY, Authorization: 'Bearer ' + token } });
    if (!ur.ok) return res.status(401).json({ error: 'Neplatné přihlášení' });
    const user = await ur.json();
    if (!user.app_metadata || user.app_metadata.provider !== 'discord')
      return res.status(403).json({ error: 'Tohle není Discord účet' });
    const did = String((user.user_metadata && (user.user_metadata.provider_id || user.user_metadata.sub)) || '');
    if (!did) return res.status(403).json({ error: 'Discord ID se nepodařilo zjistit' });

    // 2) najdi člena podle Discord ID
    const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
    const mr = await fetch(SB + '/rest/v1/frakce_kv?key=eq.members&select=value', { headers: H });
    const rows = await mr.json();
    const members = (rows && rows[0] && rows[0].value) || [];
    const m = members.find((x) => String(x.discordId || '') === did);
    if (!m) return res.status(403).json({ error: 'Tvoje Discord ID není u žádného člena — řekni vedení, ať ti ho doplní' });
    if (m.panic) return res.status(403).json({ error: 'Přístup je zablokován' });

    // 3) propoj účet s členem (jen pokud ještě nemá authId)
    if (!m.authId) {
      m.authId = user.id;
      await fetch(SB + '/rest/v1/frakce_kv?key=eq.members', {
        method: 'PATCH', headers: H, body: JSON.stringify({ value: members, updated_at: new Date().toISOString() })
      });
    }

    // 4) dej účtu příznak frakce
    const ar = await fetch(SB + '/auth/v1/admin/users/' + user.id, {
      method: 'PUT', headers: H,
      body: JSON.stringify({ app_metadata: Object.assign({}, user.app_metadata, { frakce: true }) })
    });
    if (!ar.ok) return res.status(500).json({ error: 'Nepodařilo se uložit oprávnění' });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
};
