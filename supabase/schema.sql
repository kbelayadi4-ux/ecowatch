-- EcoWatch Supabase schema (versioned)
create extension if not exists "uuid-ossp";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nom text not null,
  telephone text,
  role text not null check (role in ('agent','admin')) default 'agent',
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.observations (
  id text primary key,
  numero_suivi text unique not null,
  agent_id text not null,
  agent_nom text not null,
  agent_telephone text not null,
  type_probleme text not null,
  commentaire text,
  zone text not null,
  photo text,
  date_creation timestamptz not null default now(),
  partage boolean default false,
  statut text not null default 'nouvelle',
  priorite text not null default 'moyenne',
  responsable text,
  echeance timestamptz,
  analyse_cause text,
  mesures_immediates text,
  actions_correctives text,
  date_realisation timestamptz,
  verification_efficacite text,
  commentaires jsonb default '[]'::jsonb,
  pieces_jointes jsonb default '[]'::jsonb,
  historique jsonb default '[]'::jsonb
);

create index if not exists idx_obs_statut on public.observations(statut);
create index if not exists idx_obs_priorite on public.observations(priorite);
create index if not exists idx_obs_zone on public.observations(zone);
create index if not exists idx_obs_date on public.observations(date_creation desc);

alter table public.observations enable row level security;
alter table public.profiles enable row level security;

-- Policies observations
create policy "obs_read_auth" on public.observations
  for select to authenticated using (true);
create policy "obs_insert_auth" on public.observations
  for insert to authenticated with check (true);
create policy "obs_update_admin" on public.observations
  for update to authenticated using (true);

-- Policies profiles: read own + admins
create policy "profiles_read_own" on public.profiles
  for select to authenticated using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id);

-- Storage bucket
insert into storage.buckets (id, name, public) values ('ecowatch-photos','ecowatch-photos',true)
on conflict (id) do nothing;

create policy "photos_read" on storage.objects for select using (bucket_id='ecowatch-photos');
create policy "photos_insert_auth" on storage.objects for insert to authenticated with check (bucket_id='ecowatch-photos');
