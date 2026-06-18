-- ============================================================
--  Dugnadsloggen — databaseoppsett for Supabase
--  Kjør hele dette skriptet i Supabase: SQL Editor → New query → lim inn → Run
-- ============================================================

-- 1) Tabellen som lagrer alt innhold (nøkkel/verdi)
create table if not exists public.lagring (
  nokkel text primary key,
  verdi  text not null,
  endret timestamptz not null default now()
);

-- 2) Skru på radsikkerhet
alter table public.lagring enable row level security;

-- 3) Regler: bare innloggede medlemmer får lese og skrive.
--    (Alle innloggede deler samme felles logg — som i dagens app.)
drop policy if exists "innlogget lese" on public.lagring;
create policy "innlogget lese"
  on public.lagring for select
  to authenticated
  using (true);

drop policy if exists "innlogget skrive" on public.lagring;
create policy "innlogget skrive"
  on public.lagring for insert
  to authenticated
  with check (true);

drop policy if exists "innlogget oppdatere" on public.lagring;
create policy "innlogget oppdatere"
  on public.lagring for update
  to authenticated
  using (true) with check (true);

drop policy if exists "innlogget slette" on public.lagring;
create policy "innlogget slette"
  on public.lagring for delete
  to authenticated
  using (true);

-- Ferdig! Appen oppretter selv innholdet etter hvert som dere bruker den.
