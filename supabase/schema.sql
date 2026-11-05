-- EcoWatch schema (idempotent, no destructive statements)
create table if not exists public.agents (
  id text primary key,
  telephone text unique not null,
  nom text not null,
  role text not null check (role in ('agent','admin'))
);

create table if not exists public.observations (
  id text primary key,
  agent_id text not null references public.agents(id),
  agent_nom text not null,
  agent_telephone text not null,
  type_probleme text not null,
  commentaire text,
  zone text not null,
  photo text,
  date_creation timestamptz not null default now(),
  partage boolean default false
);

create table if not exists public.notifs (
  id text primary key,
  obs_id text not null references public.observations(id) on delete cascade,
  agent_nom text not null,
  type_probleme text not null,
  zone text not null,
  date_creation timestamptz not null default now(),
  lu boolean default false
);

alter table public.observations enable row level security;
alter table public.agents enable row level security;
alter table public.notifs enable row level security;

-- Policies (idempotent). App uses anon key + phone-based accounts (no Supabase Auth),
-- so role-based RLS cannot be enforced securely here. These policies allow anon access
-- required by the current app; restrict via Supabase Auth if stronger security is needed.
drop policy if exists "agents_read_all" on public.agents;
create policy "agents_read_all" on public.agents for select using (true);
drop policy if exists "agents_insert" on public.agents;
create policy "agents_insert" on public.agents for insert with check (true);
drop policy if exists "agents_update_own" on public.agents;
create policy "agents_update_own" on public.agents for update using (true);

drop policy if exists "obs_read_all" on public.observations;
create policy "obs_read_all" on public.observations for select using (true);
drop policy if exists "obs_insert" on public.observations;
create policy "obs_insert" on public.observations for insert with check (true);

drop policy if exists "notifs_read_all" on public.notifs;
create policy "notifs_read_all" on public.notifs for select using (true);
drop policy if exists "notifs_insert" on public.notifs;
create policy "notifs_insert" on public.notifs for insert with check (true);
drop policy if exists "notifs_update" on public.notifs;
create policy "notifs_update" on public.notifs for update using (true);

create index if not exists idx_observations_agent_id on public.observations(agent_id);
create index if not exists idx_observations_date on public.observations(date_creation desc);
create index if not exists idx_notifs_obs_id on public.notifs(obs_id);
