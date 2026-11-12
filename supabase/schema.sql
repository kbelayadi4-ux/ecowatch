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

-- Politiques RLS : NE PAS en declarer ici.
-- Ce fichier ne pose que la structure. Les politiques securisees sont definies dans :
--   003_secure_rls.sql   -> politiques de acces
--   005_secure_cleanup.sql -> purge des politiques permissives + durcissement
--   006_agent_signup_trigger.sql -> creation du profil agent apres OTP
--
-- Historique : ce fichier creait des politiques `using (true)` / `with check (true)`.
-- En PostgreSQL, plusieurs politiques PERMISSIVE sont combinees par un OU logique :
-- une seule politique permissive suffisait a neutraliser toutes les politiques
-- de securite. Elles ont ete supprimees (voir 005). Ne jamais les reintroduire.

create index if not exists idx_observations_agent_id on public.observations(agent_id);
create index if not exists idx_observations_date on public.observations(date_creation desc);
create index if not exists idx_notifs_obs_id on public.notifs(obs_id);
