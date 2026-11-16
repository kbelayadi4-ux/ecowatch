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
    v_ip := nullif(current_setting('request.headers', true)::json ->> 'x-forwarded-for', '');
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

  if v_recent >= 5 then
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