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