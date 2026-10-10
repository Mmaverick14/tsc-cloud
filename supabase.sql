-- Spusť v Supabase → SQL Editor (jednou)

create table if not exists public.frakce_kv (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.frakce_kv enable row level security;

-- Přístup mají jen účty s app_metadata.frakce = true (nastavuje pouze server / SQL, uživatel si to nemůže změnit)
drop policy if exists frakce_select on public.frakce_kv;
drop policy if exists frakce_insert on public.frakce_kv;
drop policy if exists frakce_update on public.frakce_kv;

create policy frakce_select on public.frakce_kv for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'frakce') = 'true');
create policy frakce_insert on public.frakce_kv for insert to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'frakce') = 'true');
create policy frakce_update on public.frakce_kv for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'frakce') = 'true')
  with check ((auth.jwt() -> 'app_metadata' ->> 'frakce') = 'true');

-- Realtime (změny od ostatních členů se zobrazí hned)
alter publication supabase_realtime add table public.frakce_kv;

-- ─────────────────────────────────────────────────────────────
-- PRVNÍ ADMIN: nejdřív v Authentication → Users → Add user vytvoř účet
-- (e-mail + heslo, zaškrtni Auto Confirm User), pak spusť s jeho e-mailem:
--
-- update auth.users
--   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"frakce": true}'::jsonb
--   where email = 'TVUJ@EMAIL.cz';
--
-- Při prvním přihlášení se tento účet sám stane Bossem s admin přístupem.
-- Další členy už přidáváš přímo v portálu (Administrace → Nový člen).
