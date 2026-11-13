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