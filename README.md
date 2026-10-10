# frakce — Supabase přihlášení + Vercel

## Soubory
- `index.html`, `style.css`, `app.js` — web (statické)
- `api/admin-users.js` — serverless funkce na Vercelu (vytvoření/smazání účtu, změna hesla)
- `supabase.sql` — tabulka + zabezpečení (RLS) + realtime

## Nastavení
1. **Supabase → SQL Editor:** spusť `supabase.sql`.
2. **Supabase → Project Settings → API:** zkopíruj `anon public` key a vlož ho na začátek `app.js` do `SUPABASE_ANON_KEY`
   (`SUPABASE_URL` je předvyplněná, případně přepiš).
3. **První admin:** Authentication → Users → Add user (e-mail + heslo, Auto Confirm) a spusť SQL z konce `supabase.sql`.
4. **Vercel → Settings → Environment Variables:**
   - `SUPABASE_URL` = `https://chlxbgbqkusdmudizbmy.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = `service_role` key (Supabase → Settings → API; **tajný**, jen na Vercelu!)
5. Nahraj repo na Vercel (složka `api/` musí být v kořeni vedle `index.html`, bez build commandu).
6. Přihlas se prvním účtem → Administrace → Nový člen (e-mail + heslo) pro ostatní.
