-- ============================================================
-- EcoWatch SCG — ALIGNEMENT DE LA BASE SUPABASE
--
-- Genere automatiquement par supabase/fix/build-alignement.mjs
-- depuis schema.sql + migrations 001..011. NE PAS MODIFIER A LA MAIN.
--
-- Ce script :
--   * est IDEMPOTENT  : rejouable sans effet de bord ;
--   * est TRANSACTIONNEL : BEGIN ... COMMIT, avec verification finale ;
--   * ne supprime AUCUNE donnee : aucune ligne existante n'est
--     supprimee, aucune colonne n'est renommee, aucune table
--     n'est supprimee ;
--   * n'ouvre AUCUN acces public en lecture : les visiteurs anonymes
--     ne peuvent ni lister, ni modifier, ni supprimer une observation.
--
-- Mode d'emploi :
--   1. Sauvegarder la base (Dashboard > Database > Backups, ou pg_dump).
--   2. SQL Editor > New query > coller TOUT ce fichier > Run.
--   3. Si un message d'erreur apparait, TOUT est annule : corriger
--      puis relancer le fichier entier.
--   4. Apres succes, executer supabase/fix/verification-apres.sql.
--
-- Où l'appliquer : sur la branche feat/supabase-auth, base de production.
-- ============================================================

begin;

-- ============================================================
-- ETAPE schema.sql — Structure de base (deja appliquee : no-op)
-- Fichier source : supabase/schema.sql
-- ============================================================
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

-- ============================================================
-- ETAPE 001 — Liaison agents.auth_user_id
-- Fichier source : supabase/migrations/001_add_auth_link.sql
-- ============================================================
-- Migration 001: Add auth_user_id link between agents and Supabase Auth
-- Idempotent, no data loss, reversible

-- Add auth_user_id column to agents table
alter table if exists public.agents
add column if not exists auth_user_id uuid unique;

-- Index for fast lookup by auth_user_id
create index if not exists idx_agents_auth_user_id
on public.agents(auth_user_id);

-- Comment for documentation
comment on column public.agents.auth_user_id is
'Links to auth.users.id. Populated by migration script after Supabase Auth user creation.';

-- ============================================================
-- ETAPE 002 — is_admin, current_agent_id, trigger de notification
-- Fichier source : supabase/migrations/002_auth_helpers.sql
-- ============================================================
-- Migration 002: Auth helpers and notification trigger
-- Idempotent, no data loss

-- Function to check if current user is admin
-- Uses app_metadata.role from JWT (set by Supabase Admin API)
-- SECURITY DEFINER with fixed search_path for safety
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin';
$$;

-- Function to get current user's agent_id (for observations FK)
-- Returns the historical agents.id linked to auth.uid()
create or replace function public.current_agent_id()
returns text
language sql
security definer
set search_path = public
as $$
  select id from public.agents
  where auth_user_id = auth.uid()
  limit 1;
$$;

-- Trigger function: create notification when observation is inserted
-- Runs with SECURITY DEFINER to bypass RLS on notifs
-- Gets agent_nom from agents table using NEW.agent_id (never trust client input)
create or replace function public.create_notification_for_observation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent_nom text;
begin
  -- Fetch agent name from agents table using the agent_id from the observation
  select nom into v_agent_nom
  from public.agents
  where id = new.agent_id
  limit 1;

  -- Only create notification if agent exists
  if v_agent_nom is not null then
    insert into public.notifs (
      id,
      obs_id,
      agent_nom,
      type_probleme,
      zone,
      date_creation,
      lu
    ) values (
      'n-' || new.id,
      new.id,
      v_agent_nom,
      new.type_probleme,
      new.zone,
      new.date_creation,
      false
    );
  end if;
  return new;
end;
$$;

-- Attach trigger to observations table
drop trigger if exists trigger_create_notification on public.observations;
create trigger trigger_create_notification
after insert on public.observations
for each row
execute function public.create_notification_for_observation();

-- Grant execute on helper functions to authenticated role only (not anon)
grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_agent_id() to authenticated;

-- ============================================================
-- ETAPE 003 — Politiques RLS sur auth.uid()
-- Fichier source : supabase/migrations/003_secure_rls.sql
-- ============================================================
-- Migration 003: Secure RLS policies using auth.uid() and is_admin()
-- Idempotent, reversible (old policies preserved in comments below)
-- Apply AFTER 001 and 002, and AFTER agents.auth_user_id is populated

-- ============================================================
-- AGENTS TABLE
-- ============================================================
-- Agents can read their own profile + admins read all
drop policy if exists "agents_read_own_or_admin" on public.agents;
create policy "agents_read_own_or_admin" on public.agents
for select using (
  auth_user_id = auth.uid()
  or public.is_admin()
);

-- Agents can update their own profile (not role, not auth_user_id)
drop policy if exists "agents_update_own" on public.agents;
create policy "agents_update_own" on public.agents
for update using (
  auth_user_id = auth.uid()
) with check (
  auth_user_id = auth.uid()
  and role = (select role from public.agents where auth_user_id = auth.uid())
  and auth_user_id = (select auth_user_id from public.agents where auth_user_id = auth.uid())
);

-- Insert: only via migration script (service_role) or admin
-- No public insert policy for agents

-- ============================================================
-- OBSERVATIONS TABLE
-- ============================================================
-- Agents read own observations; admins read all
drop policy if exists "obs_read_own_or_admin" on public.observations;
create policy "obs_read_own_or_admin" on public.observations
for select using (
  agent_id = public.current_agent_id()
  or public.is_admin()
);

-- Agents insert own observations (agent_id forced by current_agent_id)
drop policy if exists "obs_insert_own" on public.observations;
create policy "obs_insert_own" on public.observations
for insert with check (
  agent_id = public.current_agent_id()
);

-- Agents update own observations; admins update all
drop policy if exists "obs_update_own_or_admin" on public.observations;
create policy "obs_update_own_or_admin" on public.observations
for update using (
  agent_id = public.current_agent_id()
  or public.is_admin()
) with check (
  agent_id = public.current_agent_id()
  or public.is_admin()
);

-- Admins delete observations
drop policy if exists "obs_delete_admin" on public.observations;
create policy "obs_delete_admin" on public.observations
for delete using (public.is_admin());

-- ============================================================
-- NOTIFICATIONS TABLE
-- ============================================================
-- Only admins can read notifications
drop policy if exists "notifs_admin_read" on public.notifs;
create policy "notifs_admin_read" on public.notifs
for select using (public.is_admin());

-- Only admins can update notifications (mark read/unread)
drop policy if exists "notifs_admin_update" on public.notifs;
create policy "notifs_admin_update" on public.notifs
for update using (public.is_admin())
with check (public.is_admin());

-- Only system (trigger with SECURITY DEFINER) can insert notifications
-- No public insert policy
drop policy if exists "notifs_system_insert" on public.notifs;
create policy "notifs_system_insert" on public.notifs
for insert with check (false); -- effectively blocks client inserts

-- Admins can delete notifications
drop policy if exists "notifs_delete_admin" on public.notifs;
create policy "notifs_delete_admin" on public.notifs
for delete using (public.is_admin());

-- ============================================================
-- REVERT INSTRUCTIONS (keep for rollback)
-- ============================================================
-- To rollback, run:
-- drop policy if exists "agents_read_own_or_admin" on public.agents;
-- drop policy if exists "agents_update_own" on public.agents;
-- drop policy if exists "obs_read_own_or_admin" on public.observations;
-- drop policy if exists "obs_insert_own" on public.observations;
-- drop policy if exists "obs_update_own_or_admin" on public.observations;
-- drop policy if exists "obs_delete_admin" on public.observations;
-- drop policy if exists "notifs_admin_read" on public.notifs;
-- drop policy if exists "notifs_admin_update" on public.notifs;
-- drop policy if exists "notifs_system_insert" on public.notifs;
-- drop policy if exists "notifs_delete_admin" on public.notifs;
-- Then re-enable old permissive policies from 000_initial_schema.sql

-- ============================================================
-- ETAPE 004 — Publication Realtime + REPLICA IDENTITY
-- Fichier source : supabase/migrations/004_realtime.sql
-- ============================================================
-- Migration 004: Enable Realtime for observations and notifications
-- Idempotent, safe to run multiple times

-- Add tables to supabase_realtime publication
-- Using DO block to handle "already in publication" gracefully
do $$
begin
  -- Add observations table
  begin
    alter publication supabase_realtime add table public.observations;
  exception when duplicate_object then
    -- Table already in publication, ignore
    null;
  end;

  -- Add notifs table
  begin
    alter publication supabase_realtime add table public.notifs;
  exception when duplicate_object then
    -- Table already in publication, ignore
    null;
  end;
end $$;

-- Set REPLICA IDENTITY to FULL for proper UPDATE/DELETE events
alter table public.observations replica identity full;
alter table public.notifs replica identity full;

-- ============================================================
-- ETAPE 005 — Purge des politiques permissives + politiques cibles
-- Fichier source : supabase/migrations/005_secure_cleanup.sql
-- ============================================================
-- ============================================================
-- Migration 005 : purge des politiques RLS permissives résiduelles
-- Objectif : supprimer toute politique `USING (true)` / `WITH CHECK (true)`
--            qui, en PostgreSQL, est combinée par un OU logique avec les
--            politiques de sécurité et les neutralise.
-- Idémpotent : rejouable sans effet de bord.
-- Non destructif : aucune donnée n'est supprimée, aucun accès légitime retiré.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Diagnostic : inventaire des politiques avant purge
-- ------------------------------------------------------------
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public'
    and tablename in ('agents', 'observations', 'notifs')
    and (qual = 'true' or with_check = 'true');

  if v_count > 0 then
    raise notice '005: % politique(s) permissive(s) detectee(s), purge en cours', v_count;
  else
    raise notice '005: aucune politique permissive detectee';
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. Suppression explicite des politiques permissives
--    (issues de supabase/schema.sql, jamais retirées par 003)
-- ------------------------------------------------------------

-- agents
drop policy if exists "agents_read_all" on public.agents;   -- select using (true)
drop policy if exists "agents_insert"   on public.agents;   -- insert with check (true)
drop policy if exists "agents_update_own" on public.agents; -- update using (true) [version permissive]

-- observations
drop policy if exists "obs_read_all" on public.observations; -- select using (true)
drop policy if exists "obs_insert"   on public.observations; -- insert with check (true)

-- notifications
drop policy if exists "notifs_read_all" on public.notifs; -- select using (true)
drop policy if exists "notifs_insert"   on public.notifs; -- insert with check (true)
drop policy if exists "notifs_update"   on public.notifs; -- update using (true)

-- Politique d'insertion des notifications : aucun INSERT client ne doit exister.
-- L'unique insertion est realisee par le trigger SECURITY DEFINER
-- public.create_notification_for_observation(), qui contourne la RLS.
drop policy if exists "notifs_system_insert" on public.notifs;

-- ------------------------------------------------------------
-- 2b. Balayage generique : toute politique permissive residuelle
--     est supprimee, meme si son nom n'est pas liste ci-dessus.
--     Une future politique `using (true)` ne pourra donc pas
--     reintroduire silencieusement la fuite.
-- ------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('agents', 'observations', 'notifs')
      and (qual = 'true' or with_check = 'true')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
    raise notice '005: politique permissive supprimee: %.%', r.tablename, r.policyname;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 3. Politiques cibles
-- ------------------------------------------------------------

-- ---------- agents ----------
-- Lecture : son propre profil uniquement, ou profil complet pour un admin.
drop policy if exists "agents_read_own_or_admin" on public.agents;
create policy "agents_read_own_or_admin" on public.agents
for select to authenticated
using (
  auth_user_id = auth.uid()
  or public.is_admin()
);

-- Mise a jour : son propre profil, role et identite de liaison figees.
-- La protection effective du role repose sur :
--   a) le WITH CHECK ci-dessous (interdit tout changement de role),
--   b) le GRANT colonne a colonne de la section 4 (seul `nom` est modifiable).
drop policy if exists "agents_update_own" on public.agents;
create policy "agents_update_own" on public.agents
for update to authenticated
using (auth_user_id = auth.uid())
with check (
  auth_user_id = auth.uid()
  and role = (select role from public.agents where auth_user_id = auth.uid())
  and auth_user_id = (select auth_user_id from public.agents where auth_user_id = auth.uid())
);

-- Aucune politique d'INSERT sur agents : seuls le trigger d'inscription
-- (migration 006) et service_role peuvent creer un agent.

-- ---------- observations ----------
-- Lecture : l'agent ne voit que ses propres observations ; l'admin voit tout.
drop policy if exists "obs_read_own_or_admin" on public.observations;
create policy "obs_read_own_or_admin" on public.observations
for select to authenticated
using (
  agent_id = public.current_agent_id()
  or public.is_admin()
);

-- Insertion : uniquement pour l'agent concerne, avec agent_id impose.
drop policy if exists "obs_insert_own" on public.observations;
create policy "obs_insert_own" on public.observations
for insert to authenticated
with check (
  agent_id = public.current_agent_id()
);

-- Mise a jour : reservee a l'administrateur.
-- Un agent ne peut ni modifier une observation ni changer un statut.
drop policy if exists "obs_update_own_or_admin" on public.observations;
drop policy if exists "obs_update_admin" on public.observations;
create policy "obs_update_admin" on public.observations
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Suppression : reservee a l'administrateur.
drop policy if exists "obs_delete_admin" on public.observations;
create policy "obs_delete_admin" on public.observations
for delete to authenticated
using (public.is_admin());

-- ---------- notifications ----------
-- Le destinataire (agent) et l'administrateur peuvent lire.
drop policy if exists "notifs_admin_read" on public.notifs;
drop policy if exists "notifs_read_own_or_admin" on public.notifs;
create policy "notifs_read_own_or_admin" on public.notifs
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.observations o
    where o.id = public.notifs.obs_id
      and o.agent_id = public.current_agent_id()
  )
);

-- Marquer comme lu / non lu : uniquement le destinataire.
drop policy if exists "notifs_admin_update" on public.notifs;
drop policy if exists "notifs_update_own" on public.notifs;
create policy "notifs_update_own" on public.notifs
for update to authenticated
using (
  exists (
    select 1 from public.observations o
    where o.id = public.notifs.obs_id
      and o.agent_id = public.current_agent_id()
  )
)
with check (
  exists (
    select 1 from public.observations o
    where o.id = public.notifs.obs_id
      and o.agent_id = public.current_agent_id()
  )
);

-- Suppression : administrateur uniquement.
drop policy if exists "notifs_delete_admin" on public.notifs;
create policy "notifs_delete_admin" on public.notifs
for delete to authenticated
using (public.is_admin());

-- ------------------------------------------------------------
-- 4. Privilèges colonnes sur agents
--    Un agent ne peut modifier que `nom`. Le role, l'id de liaison
--    Auth et le telephone ne sont modifiables par aucun client.
-- ------------------------------------------------------------
revoke update on public.agents from authenticated, anon;
grant update (nom) on public.agents to authenticated;

-- ------------------------------------------------------------
-- 5. Garde-fou : aucune table de donnees ne doit rester sans RLS
-- ------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select string_agg(tablename, ', ') into v_missing
  from pg_tables
  where schemaname = 'public'
    and tablename in ('agents', 'observations', 'notifs')
    and not rowsecurity;

  if v_missing is not null then
    raise exception '005: RLS desactivee sur : %', v_missing;
  end if;
end $$;

alter table public.agents       enable row level security;
alter table public.observations enable row level security;
alter table public.notifs       enable row level security;

-- ------------------------------------------------------------
-- 6. Verification finale : plus aucune politique permissive
-- ------------------------------------------------------------
do $$
declare
  v_remaining int;
begin
  select count(*) into v_remaining
  from pg_policies
  where schemaname = 'public'
    and tablename in ('agents', 'observations', 'notifs')
    and (qual = 'true' or with_check = 'true');

  if v_remaining > 0 then
    raise exception '005: % politique(s) permissive(s) subsiste(nt)', v_remaining;
  end if;

  raise notice '005: purge RLS terminee, aucune politique permissive restante';
end $$;

-- ============================================================
-- ETAPE 006 — Creation du profil agent apres OTP
-- Fichier source : supabase/migrations/006_agent_signup_trigger.sql
-- ============================================================
-- ============================================================
-- Migration 006 : creation automatique du profil agent apres OTP
--
-- Constat (audit du 12/11/2026) : signUpAgent() cree un utilisateur
-- dans auth.users mais aucune ligne dans public.agents. Apres un code
-- OTP valide, getCurrentAgent() ne trouve rien et l'agent reste bloque
-- sur l'ecran de connexion.
--
-- Solution : un trigger AFTER INSERT sur auth.users cree ou relie la
-- ligne `agents` correspondante, avec le role 'agent' impose par le serveur.
--
-- Idempotent, non destructif, aucune donnee supprimee.
-- ============================================================

-- gen_random_uuid() est natif depuis PostgreSQL 13. On charge pgcrypto
-- uniquement s'il est disponible (Supabase l'inclut ; certains environnements
-- de test ne l'exposent pas).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pgcrypto') then
    execute 'create extension if not exists pgcrypto';
  end if;
end $$;

-- ------------------------------------------------------------
-- 1. Fonction de creation / liaison du profil agent
-- ------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tel      text;
  v_nom      text;
  v_agent_id text;
begin
  -- Telephone en E.164 -> format historique local (sans +216)
  v_tel := nullif(regexp_replace(coalesce(new.phone, ''), '^\+216', ''), '');

  -- Nom issu des metadata d'inscription. Le role n'est JAMAIS lu ici :
  -- il est force a 'agent' par le serveur.
  v_nom := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'nom', '')), '');

  -- Pas de telephone exploitable : on ne cree pas de profil.
  -- (La connexion echouera proprement, sans corrompre la table agents.)
  if v_tel is null then
    return new;
  end if;

  -- Cas 1 : un agent existe deja avec ce telephone (donnees historiques
  -- localStorage ou migration). On le relie au compte Auth, sans jamais
  -- modifier son role.
  select id into v_agent_id
  from public.agents
  where telephone = v_tel
  limit 1;

  if v_agent_id is not null then
    update public.agents
       set auth_user_id = new.id
     where id = v_agent_id
       and auth_user_id is null;
    return new;
  end if;

  -- Cas 2 : nouvelle inscription. Role impose 'agent'.
  insert into public.agents (id, auth_user_id, telephone, nom, role)
  values (
    'agt-' || replace(gen_random_uuid()::text, '-', ''),
    new.id,
    v_tel,
    coalesce(v_nom, 'Agent ' || v_tel),
    'agent'
  );

  return new;

exception
  when unique_violation then
    -- Course entre deux inscriptions simultanees : on tente la liaison.
    update public.agents
       set auth_user_id = new.id
     where telephone = v_tel
       and auth_user_id is null;
    return new;
end;
$$;

-- ------------------------------------------------------------
-- 2. Droits d'execution : Auth uniquement
-- ------------------------------------------------------------
revoke all on function public.handle_new_auth_user() from public;
revoke all on function public.handle_new_auth_user() from anon;
revoke all on function public.handle_new_auth_user() from authenticated;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.handle_new_auth_user() to supabase_auth_admin;

-- ------------------------------------------------------------
-- 3. Trigger
-- ------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

-- ------------------------------------------------------------
-- 4. Verification : le trigger existe et est actif
-- ------------------------------------------------------------
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'auth'
    and c.relname = 'users'
    and t.tgname = 'on_auth_user_created'
    and not t.tgisinternal;

  if v_count = 0 then
    raise exception '006: trigger on_auth_user_created absent sur auth.users';
  end if;

  raise notice '006: trigger d''inscription agent operationnel';
end $$;

-- ============================================================
-- ETAPE 007 — Marquage lu des notifications par l'admin
-- Fichier source : supabase/migrations/007_fix_admin_notifications.sql
-- ============================================================
-- ============================================================
-- Migration 007 : A1 — l'administrateur peut de nouveau gerer
--                 l'etat de lecture des notifications.
--
-- Constat (audit du 13/11/2026) :
--   La migration 005 a supprime `notifs_admin_update` (de 003) et l'a
--   remplacee par `notifs_update_own`, reservee au destinataire.
--   Consequence : marquerToutLu() et marquerNotifLu() (src/lib/data.ts)
--   n'affectent plus aucune ligne cote admin. L'UI se met a jour en local
--   puis l'etat revient au rechargement.
--
-- Relation reelle dans le schema (verifiee, non supposee) :
--   notifs.obs_id -> observations.id
--   observations.agent_id -> agents.id
--   La table `notifs` n'a PAS de colonne agent_id : le destinataire est
--   derive de l'observation rattachee. Les deux politiques restent donc
--   exprimees par une jointure, jamais par une colonne inexistante.
--
-- Idempotent, non destructif, aucune donnee modifiee.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Verification de l'etat initial
-- ------------------------------------------------------------
do $$
declare
  v_existing int;
begin
  select count(*) into v_existing
  from pg_policies
  where schemaname = 'public'
    and tablename = 'notifs'
    and policyname = 'notifs_update_admin';

  if v_existing > 0 then
    raise notice '007: politique notifs_update_admin deja presente, remplacement';
  else
    raise notice '007: creation de la politique notifs_update_admin';
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. Politique de mise a jour reservee a l'administrateur
--    Avec plusieurs politiques PERMISSIVE sur le meme FOR UPDATE,
--    PostgreSQL applique un OU logique : l'admin obtient l'acces global,
--    l'agent conserve l'acces a ses propres notifications.
-- ------------------------------------------------------------
drop policy if exists "notifs_update_admin" on public.notifs;
create policy "notifs_update_admin" on public.notifs
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ------------------------------------------------------------
-- 3. Verification : aucune politique permissive introduite
-- ------------------------------------------------------------
do $$
declare
  v_permissive int;
begin
  select count(*) into v_permissive
  from pg_policies
  where schemaname = 'public'
    and tablename in ('agents', 'observations', 'notifs')
    and (qual = 'true' or with_check = 'true');

  if v_permissive > 0 then
    raise exception '007: % politique(s) permissive(s) detectee(s)', v_permissive;
  end if;
end $$;

do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'notifs'
    and cmd = 'UPDATE';

  if v_count < 2 then
    raise exception '007: % politique(s) UPDATE sur notifs (attendu >= 2)', v_count;
  end if;

  raise notice '007: % politiques UPDATE sur notifs (destinataire + admin)', v_count;
end $$;

-- ============================================================
-- ETAPE 008 — is_admin() aligne sur agents.role
-- Fichier source : supabase/migrations/008_unify_admin_roles.sql
-- ============================================================
-- ============================================================
-- Migration 008 : A2 — source de verite unique pour le role.
--
-- DECISION D'ARCHITECTURE
-- -----------------------
-- Source de verite metier : public.agents.role.
--
-- Pourquoi la table et non le JWT :
--   * le JWT est emis a la connexion et reste valide jusqu'a son expiration
--     (1 h par defaut). Un administrateur retrograde continuerait donc a
--     etre administrateur pendant une heure : la revocation ne serait pas
--     immediate. La table, elle, est lue a chaque requete.
--   * app_metadata.role ne peut etre ecrit que par l'API Admin (service_role).
--     Depuis le client, seul le serveur peut le modifier, ce qui en fait un
--     canal de synchronisation, pas une source de verite.
--
-- Consequence : app_metadata.role devient un simple cache jetable, utilise
-- pour l'affichage et l'outillage. Il ne peut plus, a lui seul, ouvrir un
-- acces administrateur. Un ancien JWT portant app_metadata.role = "admin"
-- ne donne donc plus aucun droit si agents.role = "agent".
--
-- Idempotent, non destructif, aucune donnee modifiee.
-- ============================================================

-- ------------------------------------------------------------
-- 1. is_admin() : lit desormais agents.role
-- ------------------------------------------------------------
-- SECURITY DEFINER + row_security = off : la fonction s'execute comme son
-- proprietaire et ignore la RLS de `agents`. Sans cela, la politique
-- d'`, agents` qui appelle is_admin() reevaluerait la RLS -> recursion.
-- search_path est fige : aucune fonction tierce ne peut etre detournee.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select exists (
    select 1
    from public.agents a
    where a.auth_user_id = auth.uid()
      and a.role = 'admin'
  );
$$;

-- ------------------------------------------------------------
-- 2. current_agent_role() : helper de lecture pour l'UI
-- ------------------------------------------------------------
create or replace function public.current_agent_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select a.role
  from public.agents a
  where a.auth_user_id = auth.uid()
  limit 1;
$$;

-- ------------------------------------------------------------
-- 3. admin_set_role() : unique mecanisme serveur de changement de role
-- ------------------------------------------------------------
-- Toute promotion / retrogradation passe par cette fonction.
-- Elle met a jour agents.role ET, au mieux, auth.users.raw_app_meta_data,
-- afin que le cache reste coherent avec la source de verite.
create or replace function public.admin_set_role(p_phone text, p_role text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_target_id  text;
  v_target_tel text;
  v_target_auth uuid;
  v_target_role text;
  v_admins     int;
begin
  if p_role is null or p_role not in ('agent', 'admin') then
    raise exception 'role invalide: %', p_role using errcode = '22023';
  end if;

  -- Un appelant non authentifie ou non administrateur est refuse.
  if auth.uid() is null then
    raise exception 'authentification requise' using errcode = '28000';
  end if;

  if not public.is_admin() then
    raise exception 'reserve a l''administrateur' using errcode = '42501';
  end if;

  select id, telephone, auth_user_id, role
    into v_target_id, v_target_tel, v_target_auth, v_target_role
  from public.agents
  where regexp_replace(coalesce(telephone, ''), '\s', '') =
        regexp_replace(coalesce(p_phone, ''), '\s', '')
  limit 1;

  if v_target_id is null then
    raise exception 'aucun agent avec le telephone %', p_phone using errcode = 'P0002';
  end if;

  if v_target_auth is null then
    raise exception 'agent % non lie a un compte Auth (voir migrate-agents)',
      v_target_tel using errcode = 'P0001';
  end if;

  if v_target_role = p_role then
    return;
  end if;

  -- Garde-fou : ne jamais laisser l'usine sans administrateur.
  if p_role = 'agent' then
    select count(*) into v_admins
    from public.agents
    where role = 'admin';

    if v_admins <= 1 then
      raise exception 'impossible de retrograder le dernier administrateur'
        using errcode = 'P0001';
    end if;
  end if;

  update public.agents
     set role = p_role
   where id = v_target_id;

  -- Synchronisation du cache Auth. Si le role executing n'a pas le droit
  -- d'ecrire dans auth.users, on n'echoue pas : agents.role reste la
  -- reference et is_admin() ne depend plus de ce cache.
  begin
    update auth.users
       set raw_app_meta_data =
             coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', p_role)
     where id = v_target_auth;
  exception
    when insufficient_privilege then
      raise notice 'app_metadata non synchronise pour % (privilege insuffisant)', v_target_tel;
  end;
end;
$$;

-- ------------------------------------------------------------
-- 4. Droits d'execution
-- ------------------------------------------------------------
revoke all on function public.is_admin() from public;
revoke all on function public.current_agent_role() from public;
revoke all on function public.admin_set_role(text, text) from public;

revoke all on function public.is_admin() from anon;
revoke all on function public.current_agent_role() from anon;
revoke all on function public.admin_set_role(text, text) from anon;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_agent_role() to authenticated;
grant execute on function public.admin_set_role(text, text) to authenticated;

-- ------------------------------------------------------------
-- 5. Verification
-- ------------------------------------------------------------
do $$
declare
  v_src text;
  v_secdef boolean;
  v_rowsec text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'is_admin';

  if v_src is null then
    raise exception '008: fonction is_admin introuvable';
  end if;

  if v_src like '%auth.jwt%' then
    raise exception '008: is_admin depend encore du JWT';
  end if;

  if v_src not like '%agents%' then
    raise exception '008: is_admin ne lit pas agents.role';
  end if;

  select prosecdef into v_secdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'is_admin';

  if v_secdef is not true then
    raise exception '008: is_admin doit etre SECURITY DEFINER';
  end if;

  raise notice '008: is_admin lit agents.role, SECURITY DEFINER, row_security off';
end $$;

do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('is_admin', 'current_agent_role', 'admin_set_role');

  if v_count < 3 then
    raise exception '008: % fonctions attendues sur 3', v_count;
  end if;
end $$;

-- ============================================================
-- ETAPE 009 — Statut, priorite, affectation, echeance, historique
-- Fichier source : supabase/migrations/009_suivi_observations.sql
-- ============================================================
-- ============================================================
-- Migration 009 : suivi complet des observations
-- Ajoute le cycle de traitement (statut, priorite, affectation,
-- echeance), la tracabilite (historique) et durcit l'insertion
-- cote serveur (identite de l'agent imposee par la base).
--
-- Non destructif : aucune donnee supprimee, aucune colonne renommee.
-- Idempotent : rejouable sans effet de bord.
-- Prerequis : schema.sql, 001..008 appliques.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Sequence du numero de suivi
-- ------------------------------------------------------------
create sequence if not exists public.observations_numero_seq start 1;
create sequence if not exists public.notifs_statut_seq start 1;

-- ------------------------------------------------------------
-- 2. Colonnes de suivi
-- ------------------------------------------------------------
alter table public.observations
  add column if not exists numero_suivi text,
  add column if not exists statut text not null default 'nouvelle',
  add column if not exists priorite text not null default 'normale',
  add column if not exists assigne_a text references public.agents(id) on delete set null,
  add column if not exists echeance timestamptz,
  add column if not exists date_cloture timestamptz,
  add column if not exists maj_le timestamptz not null default now(),
  add column if not exists photo_path text;

-- Contraintes de domaine : posees a part car ADD COLUMN IF NOT EXISTS ne
-- peut pas porter de CHECK, et une contrainte deja presente est conservee.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'observations_statut_check'
      and conrelid = 'public.observations'::regclass
  ) then
    alter table public.observations
      add constraint observations_statut_check
      check (statut in ('nouvelle', 'en_analyse', 'action_en_cours', 'attente_verification', 'cloturee'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'observations_priorite_check'
      and conrelid = 'public.observations'::regclass
  ) then
    alter table public.observations
      add constraint observations_priorite_check
      check (priorite in ('basse', 'normale', 'haute', 'critique'));
  end if;
end $$;

-- ------------------------------------------------------------
-- 3. Identite de l'agent imposee par la base (avant insertion)
--    Un client ne peut pas usurper l'identite d'un autre agent :
--    agent_nom et agent_telephone sont relus depuis public.agents.
-- ------------------------------------------------------------
create or replace function public.obs_impose_agent()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_nom text;
  v_tel text;
begin
  select nom, telephone into v_nom, v_tel
  from public.agents
  where id = new.agent_id
  limit 1;

  if v_nom is null then
    raise exception 'agent % introuvable pour cette observation', new.agent_id
      using errcode = '23503';
  end if;

  new.agent_nom := v_nom;
  new.agent_telephone := v_tel;

  if new.numero_suivi is null or btrim(new.numero_suivi) = '' then
    new.numero_suivi :=
      'SCG-' || to_char(now() at time zone 'Africa/Tunis', 'YYYYMMDD') || '-'
      || lpad(nextval('public.observations_numero_seq')::text, 5, '0');
  end if;

  if new.statut is null then
    new.statut := 'nouvelle';
  end if;

  if new.statut = 'cloturee' and new.date_cloture is null then
    new.date_cloture := now();
  end if;

  new.maj_le := now();
  return new;
end;
$$;

drop trigger if exists trg_obs_impose_agent on public.observations;
create trigger trg_obs_impose_agent
before insert or update of statut, priorite, assigne_a, echeance
on public.observations
for each row execute function public.obs_impose_agent();

-- ------------------------------------------------------------
-- 4. Historique des interventions
-- ------------------------------------------------------------
create table if not exists public.observation_history (
  id bigint generated always as identity primary key,
  observation_id text references public.observations(id) on delete set null,
  observation_identifiant text not null,
  action text not null check (action in ('creation', 'modification', 'suppression')),
  auteur_id text,
  auteur_nom text,
  auteur_role text,
  resume text,
  avant jsonb,
  apres jsonb,
  cree_le timestamptz not null default now()
);

create index if not exists idx_obs_history_obs_id
  on public.observation_history (observation_id, cree_le desc);
create index if not exists idx_obs_history_identifiant
  on public.observation_history (observation_identifiant, cree_le desc);

alter table public.observation_history enable row level security;

-- Ecriture : uniquement par la fonction ci-dessous (SECURITY DEFINER).
drop policy if exists "obs_history_system_insert" on public.observation_history;
create policy "obs_history_system_insert" on public.observation_history
for insert to authenticated
with check (false);

-- Lecture : l'agent concerne et l'administrateur.
drop policy if exists "obs_history_read_own_or_admin" on public.observation_history;
create policy "obs_history_read_own_or_admin" on public.observation_history
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.observations o
    where o.id = observation_history.observation_identifiant
      and o.agent_id = public.current_agent_id()
  )
);

revoke all on public.observation_history from anon;
revoke insert, update, delete on public.observation_history from authenticated;
grant select on public.observation_history to authenticated;
grant all on public.observation_history to service_role;

-- ------------------------------------------------------------
-- 5. Journalisation automatique
-- ------------------------------------------------------------
create or replace function public.obs_journalise()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_auteur_id text;
  v_auteur_nom text;
  v_auteur_role text;
  v_avant jsonb;
  v_apres jsonb;
  v_resume text;
  v_changements text[] := '{}';
begin
  v_auteur_id := auth.uid()::text;
  if v_auteur_id is null then
    v_auteur_id := 'systeme';
  end if;

  begin
    select nom, role into v_auteur_nom, v_auteur_role
    from public.agents
    where auth_user_id = auth.uid()
    limit 1;
  exception when others then
    v_auteur_nom := null;
    v_auteur_role := null;
  end;

  if v_auteur_nom is null then
    v_auteur_nom := 'Système';
    v_auteur_role := 'systeme';
  end if;

  if tg_op = 'DELETE' then
    insert into public.observation_history (observation_id, observation_identifiant, action, auteur_id, auteur_nom, auteur_role, resume, avant)
    values (null, old.id, 'suppression', v_auteur_id, v_auteur_nom, v_auteur_role,
            'Observation supprimée', to_jsonb(old));
    return old;
  end if;

  if tg_op = 'INSERT' then
    insert into public.observation_history (observation_id, observation_identifiant, action, auteur_id, auteur_nom, auteur_role, resume, apres)
    values (new.id, new.id, 'creation', v_auteur_id, v_auteur_nom, v_auteur_role,
            'Observation créée', to_jsonb(new));
    return new;
  end if;

  -- UPDATE
  v_avant := to_jsonb(old);
  v_apres := to_jsonb(new);

  if old.statut is distinct from new.statut then
    v_changements := array_append(v_changements, 'statut: ' || coalesce(old.statut, '∅') || ' → ' || coalesce(new.statut, '∅'));
  end if;
  if old.priorite is distinct from new.priorite then
    v_changements := array_append(v_changements, 'priorité: ' || coalesce(old.priorite, '∅') || ' → ' || coalesce(new.priorite, '∅'));
  end if;
  if old.assigne_a is distinct from new.assigne_a then
    v_changements := array_append(v_changements, 'responsable modifié');
  end if;
  if old.echeance is distinct from new.echeance then
    v_changements := array_append(v_changements, 'échéance modifiée');
  end if;

  if array_length(v_changements, 1) is null then
    return new;
  end if;

  v_resume := array_to_string(v_changements, ' • ');

  insert into public.observation_history (observation_id, observation_identifiant, action, auteur_id, auteur_nom, auteur_role, resume, avant, apres)
  values (new.id, new.id, 'modification', v_auteur_id, v_auteur_nom, v_auteur_role, v_resume, v_avant, v_apres);

  return new;
end;
$$;

drop trigger if exists trg_obs_journal on public.observations;
create trigger trg_obs_journal
after insert or update or delete on public.observations
for each row execute function public.obs_journalise();

-- ------------------------------------------------------------
-- ------------------------------------------------------------
-- 5b. Insertion pour le compte d'un autre agent : administrateur uniquement.
--     L'agent ne peut insérer que pour lui-même (obs_insert_own, migration 005).
-- ------------------------------------------------------------
drop policy if exists "obs_insert_admin" on public.observations;
create policy "obs_insert_admin" on public.observations
for insert to authenticated
with check (public.is_admin());

-- ------------------------------------------------------------
-- 6. Notification a l'agent lors d'un changement de statut
-- ------------------------------------------------------------
create or replace function public.obs_notifie_statut()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_id text;
begin
  if tg_op = 'UPDATE' and old.statut is distinct from new.statut and new.statut <> 'nouvelle' then
    -- Identifiant unique : deux changements de statut dans la meme seconde
    -- produisent deux notifications distinctes.
    v_id := 'ns-' || new.id || '-' || nextval('public.notifs_statut_seq');

    insert into public.notifs (id, obs_id, agent_nom, type_probleme, zone, date_creation, lu)
    values (v_id, new.id, new.agent_nom, new.type_probleme, new.zone, now(), false);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_obs_notifie_statut on public.observations;
create trigger trg_obs_notifie_statut
after update of statut on public.observations
for each row execute function public.obs_notifie_statut();

-- ------------------------------------------------------------
-- 7. Mise a jour du suivi reservee a l'administrateur
-- ------------------------------------------------------------
create or replace function public.admin_update_observation(
  p_id text,
  p_statut text default null,
  p_priorite text default null,
  p_assigne_a text default null,
  p_echeance timestamptz default null,
  p_commentaire text default null,
  p_effacer_echeance boolean default false
)
returns public.observations
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_obs public.observations;
  v_role text;
  v_desaffecter boolean := p_assigne_a is not null and btrim(p_assigne_a) = '';
begin
  if auth.uid() is null then
    raise exception 'authentification requise' using errcode = '28000';
  end if;

  if not public.is_admin() then
    raise exception 'reserve a l''administrateur' using errcode = '42501';
  end if;

  if p_statut is not null and p_statut not in ('nouvelle', 'en_analyse', 'action_en_cours', 'attente_verification', 'cloturee') then
    raise exception 'statut invalide: %', p_statut using errcode = '22023';
  end if;

  if p_priorite is not null and p_priorite not in ('basse', 'normale', 'haute', 'critique') then
    raise exception 'priorite invalide: %', p_priorite using errcode = '22023';
  end if;

  -- Chaine vide : desaffectation explicite. Toute autre valeur doit
  -- correspondre a un agent existant.
  if p_assigne_a is not null and not v_desaffecter then
    select role into v_role from public.agents where id = p_assigne_a;
    if v_role is null then
      raise exception 'responsable % introuvable', p_assigne_a using errcode = 'P0002';
    end if;
  end if;

  update public.observations
     set statut = coalesce(p_statut, statut),
         priorite = coalesce(p_priorite, priorite),
         assigne_a = case
           when v_desaffecter then null
           when p_assigne_a is null then assigne_a
           else p_assigne_a
         end,
         echeance = case
           when p_effacer_echeance then null
           else coalesce(p_echeance, echeance)
         end,
         commentaire = case
           when p_commentaire is null or btrim(p_commentaire) = '' then commentaire
           when commentaire is null or btrim(commentaire) = '' then btrim(p_commentaire)
           else commentaire || E'\n[' || to_char(now() at time zone 'Africa/Tunis', 'DD/MM/YYYY HH24:MI') || '] ' || btrim(p_commentaire)
         end,
         date_cloture = case
           when coalesce(p_statut, statut) = 'cloturee' then coalesce(date_cloture, now())
           else null
         end,
         maj_le = now()
   where id = p_id
   returning * into v_obs;

  if v_obs.id is null then
    raise exception 'observation % introuvable', p_id using errcode = 'P0002';
  end if;

  return v_obs;
end;
$$;

revoke all on function public.admin_update_observation(text, text, text, text, timestamptz, text, boolean) from public;
revoke all on function public.admin_update_observation(text, text, text, text, timestamptz, text, boolean) from anon;
grant execute on function public.admin_update_observation(text, text, text, text, timestamptz, text, boolean) to authenticated;

-- ------------------------------------------------------------
-- 8. Index de service
-- ------------------------------------------------------------
create index if not exists idx_observations_statut on public.observations (statut);
create index if not exists idx_observations_priorite on public.observations (priorite);
create index if not exists idx_observations_assigne_a on public.observations (assigne_a);
create index if not exists idx_observations_echeance on public.observations (echeance);
create index if not exists idx_observations_numero on public.observations (numero_suivi);

-- ------------------------------------------------------------
-- 8b. Numeros de suivi : attribution aux observations anterieures
--     puis unicite garantie.
--     Les observations deja enregistrees n'avaient pas de numero : on leur
--     en attribue un, dans l'ordre chronologique, sans toucher au reste.
-- ------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select id, date_creation
    from public.observations
    where numero_suivi is null
    order by date_creation asc, id asc
  loop
    update public.observations
       set numero_suivi =
             'SCG-' || to_char(coalesce(r.date_creation, now()) at time zone 'Africa/Tunis', 'YYYYMMDD')
             || '-' || lpad(nextval('public.observations_numero_seq')::text, 5, '0')
     where id = r.id;
  end loop;
end $$;

-- Unicite : un numero de suivi ne peut pas etre duplique.
create unique index if not exists idx_observations_numero_uniq
  on public.observations (numero_suivi);

-- Realtime : les nouvelles colonnes doivent etre diffusees.
do $$
begin
  begin
    alter publication supabase_realtime add table public.observation_history;
  exception when duplicate_object then
    null;
  end;
end $$;

alter table public.observations replica identity full;

-- ------------------------------------------------------------
-- 9. Verification finale
-- ------------------------------------------------------------
do $$
declare
  v_manquantes text;
  v_trigger int;
begin
  select string_agg(c, ', ') into v_manquantes
  from (values ('statut'), ('priorite'), ('assigne_a'), ('echeance'), ('numero_suivi'), ('photo_path')) as t(c)
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'observations' and column_name = t.c
  );

  if v_manquantes is not null then
    raise exception '009: colonnes manquantes: %', v_manquantes;
  end if;

  select count(*) into v_trigger
  from pg_trigger
  where not tgisinternal
    and tgrelid = 'public.observations'::regclass
    and tgname in ('trg_obs_impose_agent', 'trg_obs_journal', 'trg_obs_notifie_statut');

  if v_trigger < 3 then
    raise exception '009: % trigger(s) de suivi manquant(s) sur observations', 3 - v_trigger;
  end if;

  raise notice '009: suivi operationnel (statut, priorite, affectation, echeance, historique)';
end $$;

-- ============================================================
-- ETAPE 010 — Bucket prive photos
-- Fichier source : supabase/migrations/010_storage_photos.sql
-- ============================================================
-- ============================================================
-- Migration 010 : bucket prive pour les photographies
--
-- Objectif : ne plus stocker les photos en base64 dans la table
-- `observations` (colonne `photo` conservee pour compatibilite).
-- Les images sont deposees dans Supabase Storage, bucket prive,
-- avec des regles alignees sur la RLS metier.
--
-- Chemin d'un objet : <agent_id>/<observation_id>.jpg
--
-- La migration est volontairement tolérante : sur une base sans le
-- schema `storage` (environnement de test local, PGlite), elle se
-- contente d'un message d'information.
-- ============================================================

do $$
begin
  -- ------------------------------------------------------------
  -- 1. Creation du bucket
  -- ------------------------------------------------------------
  if to_regclass('storage.buckets') is null then
    raise notice '010: schema storage absent, bucket non cree (environnement local)';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
     set public = false,
         file_size_limit = 5242880,
         allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

  -- ------------------------------------------------------------
  -- 2. Regles d'acces sur storage.objects
  -- ------------------------------------------------------------
  -- Lecture : l'agent proprietaire du dossier, ou l'administrateur.
  drop policy if exists "photos_read_own_or_admin" on storage.objects;
  create policy "photos_read_own_or_admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = public.current_agent_id()::text
    )
  );

  -- Depot : uniquement dans son propre dossier.
  drop policy if exists "photos_insert_own" on storage.objects;
  create policy "photos_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = public.current_agent_id()::text
  );

  -- Mise a jour / suppression : administrateur uniquement.
  drop policy if exists "photos_update_admin" on storage.objects;
  create policy "photos_update_admin" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and public.is_admin())
  with check (bucket_id = 'photos' and public.is_admin());

  drop policy if exists "photos_delete_admin" on storage.objects;
  create policy "photos_delete_admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and public.is_admin());

  raise notice '010: bucket prive photos pret (lecture proprietaire/admin, depot proprietaire)';

exception
  when undefined_object then
    raise notice '010: schema storage indisponible, politiques non creees';
  when insufficient_privilege then
    raise notice '010: privileges insuffisants pour configurer le bucket photos';
end $$;

-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
do $$
declare
  v_bucket int;
begin
  if to_regclass('storage.buckets') is null then
    raise notice '010: verification ignoree (pas de schema storage)';
    return;
  end if;

  select count(*) into v_bucket from storage.buckets where id = 'photos';
  if v_bucket = 1 then
    raise notice '010: bucket photos present et prive';
  else
    raise notice '010: bucket photos absent (a creer manuellement si besoin)';
  end if;
end $$;

-- ============================================================
-- ETAPE 011 — RPC de signalement public + champs operateur
-- Fichier source : supabase/migrations/011_signalement_public.sql
-- ============================================================
-- ============================================================
-- Migration 011 : signalement public par QR Code
--
-- Objectif : permettre à un opérateur de transmettre une observation
-- sans compte, sans numéro de téléphone et sans session, tout en
-- gardant la base fermée :
--
--   QR Code -> formulaire public -> RPC securisee -> observations
--                                              -> administration
--
-- Principes de sécurité :
--   * aucune lecture publique : les visiteurs anonymes ne peuvent ni
--     lister, ni modifier, ni supprimer la moindre observation ;
--   * une seule écriture possible pour `anon` : la fonction
--     `public.creer_signalement_public()`, qui valide les champs,
--     impose l'identité technique et limite le débit ;
--   * aucune clé `service_role` n'est exposée : le navigateur n'utilise
--     que la clé `anon` publique, et la fonction s'exécute côté serveur ;
--   * les photos restent dans la base (colonne `photo`) : le bucket
--     Storage n'est jamais ouvert aux anonymes ;
--   * aucune donnée existante n'est supprimée, aucune colonne n'est
--     renommée, aucune table n'est supprimée.
--
-- Prérequis (à appliquer dans cet ordre) :
--   001 (auth_user_id) -> 002 (is_admin, current_agent_id)
--   -> 008 (is_admin aligne sur agents.role) -> 009 (suivi, numero_suivi)
--   -> 011 (ce fichier)
--
-- Idempotent : rejouable sans effet de bord.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Préflight : refuser une exécution prématurée
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.observations') is null then
    raise exception '011: table public.observations absente (appliquez schema.sql)';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'observations'
      and column_name = 'statut'
  ) then
    raise exception '011: colonne observations.statut absente (appliquez 009)';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'observations'
      and column_name = 'numero_suivi'
  ) then
    raise exception '011: colonne observations.numero_suivi absente (appliquez 009)';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_admin'
  ) then
    raise exception '011: fonction public.is_admin() absente (appliquez 002 puis 008)';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'current_agent_id'
  ) then
    raise exception '011: fonction public.current_agent_id() absente (appliquez 002)';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'agents'
      and column_name = 'auth_user_id'
  ) then
    raise exception '011: colonne agents.auth_user_id absente (appliquez 001)';
  end if;
end $$;

-- ------------------------------------------------------------
-- 1. Champs opérateur (facultatifs)
--    Deux colonnes nullables : aucune donnée existante modifiée.
-- ------------------------------------------------------------
alter table public.observations
  add column if not exists operateur_nom text,
  add column if not exists operateur_matricule text;

-- ------------------------------------------------------------
-- 2. Agent technique « signalement public »
--    observations.agent_id est NOT NULL et référence agents(id) :
--    les signalements QR sont rattachés à ce profil technique, jamais
--    à un agent identifié. Aucune donnée personnelle n'est requise.
-- ------------------------------------------------------------
insert into public.agents (id, telephone, nom, role)
values ('public', 'qrcode@ecowatch.local', 'Signalement public (QR Code)', 'agent')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 3. Registre anti-abus
--    Aucune politique : accès direct refusé à tous les rôles.
--    Seule la fonction ci-dessous (SECURITY DEFINER) y écrit.
-- ------------------------------------------------------------
create table if not exists public.signalement_public_abus (
  id bigint generated always as identity primary key,
  empreinte text not null,
  cree_le timestamptz not null default now()
);

create index if not exists idx_spa_empreinte
  on public.signalement_public_abus (empreinte, cree_le desc);

alter table public.signalement_public_abus enable row level security;

revoke all on public.signalement_public_abus from anon;
revoke all on public.signalement_public_abus from authenticated;

-- ------------------------------------------------------------
-- 4. Fonction d'insertion publique
--    Appel : supabase.rpc('creer_signalement_public', {...})
--    Aucun droit de lecture n'est accordé : seul l'INSERT est possible.
-- ------------------------------------------------------------
create or replace function public.creer_signalement_public(
  p_type_probleme text,
  p_zone text,
  p_nom text default null,
  p_matricule text default null,
  p_commentaire text default null,
  p_photo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_id        text := 'pub-' || replace(gen_random_uuid()::text, '-', '');
  v_type      text := lower(btrim(coalesce(p_type_probleme, '')));
  v_zone      text := lower(btrim(coalesce(p_zone, '')));
  v_nom       text := nullif(btrim(coalesce(p_nom, '')), '');
  v_matricule text := nullif(btrim(coalesce(p_matricule, '')), '');
  v_comm      text := nullif(btrim(coalesce(p_commentaire, '')), '');
  v_photo     text := nullif(btrim(coalesce(p_photo, '')), '');
  v_ip        text;
  v_empreinte text;
  v_recent    int;
  v_numero    text;
begin
  -- ---- Validation des champs (côté serveur, jamais côté client) ----
  if v_type not in ('fuite_huile', 'fuite_eau', 'fuite_matiere', 'dechet_mal_trie',
                    'chiffon_souille', 'epi_eparpille', 'site_mal_arrange',
                    'odeur_anormal', 'autre') then
    raise exception 'Type de problème invalide' using errcode = '22023';
  end if;

  if v_zone not in ('cru', 'cuisson', 'carriere', 'ciment', 'expedition', 'usine') then
    raise exception 'Zone invalide' using errcode = '22023';
  end if;

  if v_nom is not null and length(v_nom) > 80 then
    raise exception 'Nom trop long (80 caractères maximum)' using errcode = '22023';
  end if;

  if v_matricule is not null and length(v_matricule) > 40 then
    raise exception 'Matricule trop long (40 caractères maximum)' using errcode = '22023';
  end if;

  if v_comm is not null and length(v_comm) > 600 then
    raise exception 'Description trop longue (600 caractères maximum)' using errcode = '22023';
  end if;

  if v_photo is not null then
    if v_photo !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' then
      raise exception 'Format de photo non autorisé (JPEG, PNG ou WebP attendu)'
        using errcode = '22023';
    end if;
    if length(v_photo) > 7000000 then
      raise exception 'Photo trop volumineuse' using errcode = '22023';
    end if;
  end if;

  -- ---- Limitation de débit ----
  -- Empreinte = adresse IP transmise par PostgREST + identifiant opérateur
  -- éventuel. Aucune donnée personnelle n'est stockée en clair.
  begin
    -- PostgREST expose les en-têtes de la requête. Selon la passerelle,
    -- l'adresse du client arrive dans x-forwarded-for ou x-real-ip.
    -- x-forwarded-for peut contenir une chaîne de proxys : on ne retient que
    -- la première adresse, celle du client.
    v_ip := nullif(
      coalesce(
        nullif(btrim(split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1)), ''),
        current_setting('request.headers', true)::json ->> 'x-real-ip'
      ),
      ''
    );
  exception when others then
    v_ip := null;
  end;

  v_empreinte := md5(
    coalesce(v_ip, '') || '|' || coalesce(v_matricule, '') || '|' || coalesce(v_nom, '')
  );

  -- Si ni l'adresse IP, ni le matricule, ni le nom ne sont connus, aucun
  -- regroupement n'est possible : on neutralise la limitation plutôt que de
  -- bloquer tous les opérateurs sur une empreinte commune.
  if coalesce(v_ip, v_matricule, v_nom) is null then
    v_empreinte := md5(gen_random_uuid()::text);
  end if;

  select count(*) into v_recent
  from public.signalement_public_abus
  where empreinte = v_empreinte
    and cree_le > now() - interval '10 minutes';

  -- Seuil large : sur un site industriel, plusieurs opérateurs partagent
  -- la même adresse de sortie (NAT). 20 envois en 10 minutes laissent une
  -- marge confortable tout en bloquant une soumission automatique.
  if v_recent >= 20 then
    raise exception 'Trop de signalements envoyés. Réessayez dans quelques minutes.'
      using errcode = 'P0001';
  end if;

  insert into public.signalement_public_abus (empreinte) values (v_empreinte);

  -- Purge des empreintes de plus de 24 h (le registre ne grossit pas).
  delete from public.signalement_public_abus where cree_le < now() - interval '1 day';

  -- ---- Insertion ----
  -- `numero_suivi` est généré par le trigger de la migration 009.
  -- `statut` et `priorite` sont fixés par la base, jamais par le visiteur.
  insert into public.observations (
    id, agent_id, agent_nom, agent_telephone,
    operateur_nom, operateur_matricule,
    type_probleme, commentaire, zone, photo,
    date_creation, partage, statut, priorite
  ) values (
    v_id, 'public', 'Signalement public', 'Non renseigné',
    v_nom, v_matricule,
    v_type, coalesce(v_comm, ''), v_zone, v_photo,
    now(), false, 'nouvelle', 'normale'
  )
  returning numero_suivi into v_numero;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'numero_suivi', v_numero
  );
end;
$$;

revoke all on function public.creer_signalement_public(text, text, text, text, text, text) from public;
revoke all on function public.creer_signalement_public(text, text, text, text, text, text) from anon;
grant execute on function public.creer_signalement_public(text, text, text, text, text, text)
  to anon, authenticated;

-- ------------------------------------------------------------
-- 5. Durcissement RLS
--    Les politiques permissives héritées de l'ancien schéma
--    (`using (true)` / `with check (true)`) sont supprimées : en
--    PostgreSQL, plusieurs politiques PERMISSIVE sont combinées par un
--    OU logique, une seule politique `true` suffit à tout ouvrir.
-- ------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('agents', 'observations', 'notifs')
      and (qual = 'true' or with_check = 'true')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
    raise notice '011: politique permissive supprimee: %.%', r.tablename, r.policyname;
  end loop;
end $$;

-- Observations : lecture par l'agent propriétaire ou l'administrateur.
drop policy if exists "obs_read_own_or_admin" on public.observations;
create policy "obs_read_own_or_admin" on public.observations
for select to authenticated
using (
  agent_id = public.current_agent_id()
  or public.is_admin()
);

-- Insertion : agent pour lui-même, ou administrateur.
drop policy if exists "obs_insert_own" on public.observations;
create policy "obs_insert_own" on public.observations
for insert to authenticated
with check (agent_id = public.current_agent_id());

drop policy if exists "obs_insert_admin" on public.observations;
create policy "obs_insert_admin" on public.observations
for insert to authenticated
with check (public.is_admin());

-- Mise à jour et suppression : administrateur uniquement.
drop policy if exists "obs_update_admin" on public.observations;
create policy "obs_update_admin" on public.observations
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "obs_delete_admin" on public.observations;
create policy "obs_delete_admin" on public.observations
for delete to authenticated
using (public.is_admin());

-- Notifications : destinataire ou administrateur.
drop policy if exists "notifs_read_own_or_admin" on public.notifs;
create policy "notifs_read_own_or_admin" on public.notifs
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.observations o
    where o.id = public.notifs.obs_id
      and o.agent_id = public.current_agent_id()
  )
);

drop policy if exists "notifs_update_own" on public.notifs;
create policy "notifs_update_own" on public.notifs
for update to authenticated
using (
  exists (
    select 1 from public.observations o
    where o.id = public.notifs.obs_id
      and o.agent_id = public.current_agent_id()
  )
)
with check (
  exists (
    select 1 from public.observations o
    where o.id = public.notifs.obs_id
      and o.agent_id = public.current_agent_id()
  )
);

drop policy if exists "notifs_update_admin" on public.notifs;
create policy "notifs_update_admin" on public.notifs
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "notifs_delete_admin" on public.notifs;
create policy "notifs_delete_admin" on public.notifs
for delete to authenticated
using (public.is_admin());

-- Agents : lecture du sien ou de tous pour l'administrateur.
drop policy if exists "agents_read_own_or_admin" on public.agents;
create policy "agents_read_own_or_admin" on public.agents
for select to authenticated
using (
  auth_user_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "agents_update_own" on public.agents;
create policy "agents_update_own" on public.agents
for update to authenticated
using (auth_user_id = auth.uid())
with check (
  auth_user_id = auth.uid()
  and role = (select role from public.agents where auth_user_id = auth.uid())
  and auth_user_id = (select auth_user_id from public.agents where auth_user_id = auth.uid())
);

-- Aucune politique d'INSERT sur agents : la création passe par le
-- trigger d'inscription (006) ou l'API Admin (service_role).

-- ------------------------------------------------------------
-- 6. Privilèges
-- ------------------------------------------------------------
revoke all on public.observations from anon;
grant select, insert, update, delete on public.observations to authenticated;

revoke all on public.notifs from anon;
grant select, update on public.notifs to authenticated;

revoke all on public.agents from anon;
grant select on public.agents to authenticated;
revoke update on public.agents from authenticated;
grant update (nom) on public.agents to authenticated;

-- ------------------------------------------------------------
-- 7. Storage : aucune politique permissive sur le bucket photos
--    Le bucket reste privé (010). Aucun dépôt public n'est ouvert.
-- ------------------------------------------------------------
do $$
declare
  r record;
begin
  if to_regclass('storage.objects') is null then
    raise notice '011: schema storage absent, controle ignore';
    return;
  end if;

  for r in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (qual = 'true' or with_check = 'true')
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
    raise notice '011: politique Storage permissive supprimee: %', r.policyname;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 8. Vérifications finales
-- ------------------------------------------------------------
do $$
declare
  v_permissives int;
  v_fn          int;
begin
  select count(*) into v_permissives
  from pg_policies
  where schemaname = 'public'
    and tablename in ('agents', 'observations', 'notifs')
    and (qual = 'true' or with_check = 'true');

  if v_permissives > 0 then
    raise exception '011: % politique(s) permissive(s) subsiste(nt)', v_permissives;
  end if;

  select count(*) into v_fn
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'creer_signalement_public';

  if v_fn <> 1 then
    raise exception '011: fonction creer_signalement_public absente';
  end if;

  raise notice '011: signalement public operationnel (insertion anon, aucune lecture anon)';
end $$;


-- ============================================================
-- 12. VERIFICATION FINALE (dans la meme transaction)
--     Toute anomalie annule l'ensemble : la base reste intacte.
-- ============================================================
do $verif$
declare
  v_echecs text := '';
  v_manquant text;
  v_nb int;
  v_secdef boolean;
begin
  -- 12.1 Colonnes de liaison et de suivi
  select string_agg(t.tbl || '.' || t.col, ', ') into v_manquant
  from (values
    ('agents', 'auth_user_id'),
    ('observations', 'numero_suivi'),
    ('observations', 'statut'),
    ('observations', 'priorite'),
    ('observations', 'assigne_a'),
    ('observations', 'echeance'),
    ('observations', 'date_cloture'),
    ('observations', 'maj_le'),
    ('observations', 'photo_path'),
    ('observations', 'operateur_nom'),
    ('observations', 'operateur_matricule')
  ) as t(tbl, col)
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = t.tbl and column_name = t.col
  );

  if v_manquant is not null then
    v_echecs := v_echecs || E'
  - colonnes absentes : ' || v_manquant;
  end if;

  -- 12.2 Tables de service
  select string_agg(t, ', ') into v_manquant
  from (values ('observation_history'), ('signalement_public_abus')) as s(t)
  where not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = s.t
  );

  if v_manquant is not null then
    v_echecs := v_echecs || E'
  - tables absentes : ' || v_manquant;
  end if;

  -- 12.3 Fonctions de securite
  select string_agg(f, ', ') into v_manquant
  from (values
    ('is_admin'),
    ('current_agent_id'),
    ('current_agent_role'),
    ('admin_set_role'),
    ('admin_update_observation'),
    ('creer_signalement_public'),
    ('obs_impose_agent'),
    ('obs_journalise'),
    ('obs_notifie_statut')
  ) as s(f)
  where not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = s.f
  );

  if v_manquant is not null then
    v_echecs := v_echecs || E'
  - fonctions absentes : ' || v_manquant;
  end if;

  -- 12.4 is_admin() ne doit plus dependre du JWT
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_admin'
      and (position('auth.jwt' in pg_get_functiondef(p.oid)) > 0
           or position('agents' in pg_get_functiondef(p.oid)) = 0)
  ) then
    v_echecs := v_echecs || E'
  - is_admin() ne lit pas agents.role';
  end if;

  -- 12.5 creer_signalement_public doit etre SECURITY DEFINER
  select prosecdef into v_secdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'creer_signalement_public';

  if v_secdef is not true then
    v_echecs := v_echecs || E'
  - creer_signalement_public() n''est pas SECURITY DEFINER';
  end if;

  -- 12.6 RLS activee
  select string_agg(relname, ', ') into v_manquant
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('agents', 'observations', 'notifs', 'observation_history', 'signalement_public_abus')
    and not c.relrowsecurity;

  if v_manquant is not null then
    v_echecs := v_echecs || E'
  - RLS desactivee sur : ' || v_manquant;
  end if;

  -- 12.7 Aucune politique permissive residuelle
  select string_agg(tablename || '.' || policyname, ', ') into v_manquant
  from pg_policies
  where schemaname = 'public'
    and tablename in ('agents', 'observations', 'notifs', 'observation_history', 'signalement_public_abus')
    and (qual = 'true' or with_check = 'true');

  if v_manquant is not null then
    v_echecs := v_echecs || E'
  - politiques permissives : ' || v_manquant;
  end if;

  -- 12.8 Declencheurs de suivi
  select count(*) into v_nb
  from pg_trigger
  where not tgisinternal
    and tgrelid = 'public.observations'::regclass
    and tgname in ('trg_obs_impose_agent', 'trg_obs_journal', 'trg_obs_notifie_statut');

  if v_nb <> 3 then
    v_echecs := v_echecs || E'
  - declencheurs de suivi : ' || v_nb || '/3';
  end if;

  -- 12.9 Le role anonyme ne doit rien pouvoir lire
  if has_table_privilege('anon', 'public.observations', 'select') then
    v_echecs := v_echecs || E'
  - anon conserve un SELECT sur observations';
  end if;

  if has_table_privilege('anon', 'public.observations', 'insert') then
    v_echecs := v_echecs || E'
  - anon conserve un INSERT sur observations';
  end if;

  -- 12.10 Le role anonyme doit pouvoir appeler la RPC
  if not has_function_privilege(
       'anon',
       'public.creer_signalement_public(text,text,text,text,text,text)',
       'execute') then
    v_echecs := v_echecs || E'
  - anon ne peut pas appeler creer_signalement_public()';
  end if;

  -- 12.11 Realtime
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'observations'
  ) then
    v_echecs := v_echecs || E'
  - observations absente de la publication supabase_realtime';
  end if;

  if v_echecs <> '' then
    raise exception 'Alignement incomplet : %', v_echecs;
  end if;

  raise notice 'Alignement verifie : schema complet, RLS active, aucune lecture publique.';
end $verif$;

commit;

