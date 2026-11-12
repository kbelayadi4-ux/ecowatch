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