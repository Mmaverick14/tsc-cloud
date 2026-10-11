// Vercel serverless funkce — správa přihlašovacích účtů členů.
// Potřebuje env proměnné: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (nikdy je nedávej do klientského kódu!)

const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function svc(path, opts = {}) {
  return fetch(SB_URL + path, {
    ...opts,
    headers: {
      apikey: SERVICE,
      Authorization: 'Bearer ' + SERVICE,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SB_URL || !SERVICE) return res.status(500).json({ error: 'Server není nakonfigurován (env proměnné)' });

  // 1) kdo volá?
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Chybí přihlášení' });
  const ur = await fetch(SB_URL + '/auth/v1/user', {
    headers: { apikey: SERVICE, Authorization: 'Bearer ' + token },
  });
  if (!ur.ok) return res.status(401).json({ error: 'Neplatné přihlášení' });
  const caller = await ur.json();
  if (!(caller.app_metadata && caller.app_metadata.frakce)) return res.status(403).json({ error: 'Nejsi člen frakce' });

  // 2) je admin?
  const mr = await svc('/rest/v1/frakce_kv?key=eq.members&select=value');
  if (!mr.ok) {
    // čtení databáze selhalo (typicky špatný SUPABASE_SERVICE_ROLE_KEY → 401/403)
    return res.status(500).json({ error: 'Čtení členů z databáze selhalo (HTTP ' + mr.status + ') — zkontroluj SUPABASE_SERVICE_ROLE_KEY' });
  }
  const rows = await mr.json();
  const members = (rows[0] && rows[0].value) || [];
  if (!members.length) {
    // prázdný výsledek = klíč nemá přístup k tabulce (RLS) nebo řádek "members" neexistuje
    return res.status(500).json({ error: 'Seznam členů je prázdný — pravděpodobně je v SUPABASE_SERVICE_ROLE_KEY anon klíč místo service_role' });
  }
  const me = members.find((m) => m.authId === caller.id);
  if (!me) {
    // DOČASNÝ DEBUG: po vyřešení problému nahraď běžnou hláškou
    return res.status(403).json({ error: 'Nemáš admin přístup — tvoje ID ' + caller.id + ' nenalezeno mezi členy (členů: ' + members.length + ')' });
  }
  if (!me.adminAccess || me.panic) return res.status(403).json({ error: 'Nemáš admin přístup' });

  const b = req.body || {};

  try {
    if (b.action === 'create') {
      const email = String(b.email || '').trim().toLowerCase();
      const password = String(b.password || '');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Neplatný e-mail' });
      if (password.length < 6) return res.status(400).json({ error: 'Heslo musí mít min. 6 znaků' });
      const r = await svc('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email, password, email_confirm: true, app_metadata: { frakce: true } }),
      });
      const j = await r.json();
      if (!r.ok) {
        const msg = j.msg || j.message || j.error_description || 'Nepodařilo se vytvořit účet';
        return res.status(r.status === 422 ? 409 : 400).json({ error: msg });
      }
      return res.status(200).json({ authId: j.id });
    }

    if (b.action === 'setPassword' || b.action === 'delete') {
      const id = String(b.authId || '');
      if (!UUID.test(id)) return res.status(400).json({ error: 'Neplatné ID účtu' });

      // dotýkat se smí jen účtů frakce (projekt může sdílet jiné aplikace)
      const gr = await svc('/auth/v1/admin/users/' + id);
      if (!gr.ok) return res.status(404).json({ error: 'Účet nenalezen' });
      const target = await gr.json();
      if (!(target.app_metadata && target.app_metadata.frakce)) return res.status(403).json({ error: 'Tento účet nepatří frakci' });

      if (b.action === 'setPassword') {
        const password = String(b.password || '');
        if (password.length < 6) return res.status(400).json({ error: 'Heslo musí mít min. 6 znaků' });
        const r = await svc('/auth/v1/admin/users/' + id, { method: 'PUT', body: JSON.stringify({ password }) });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          return res.status(400).json({ error: j.msg || j.message || 'Změna hesla selhala' });
        }
        return res.status(200).json({ ok: true });
      }

      if (id === caller.id) return res.status(400).json({ error: 'Nemůžeš smazat sám sebe' });
      const r = await svc('/auth/v1/admin/users/' + id, { method: 'DELETE' });
      if (!r.ok) return res.status(400).json({ error: 'Smazání účtu selhalo' });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Neznámá akce' });
  } catch (e) {
    return res.status(500).json({ error: 'Chyba serveru' });
  }
};
