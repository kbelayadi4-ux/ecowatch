-- ============================================================
-- Tests de securite RLS et d'inscription EcoWatch
--
-- Sujet : migrations 005 (purge RLS) et 006 (trigger d'inscription).
-- Prerequis : supabase/schema.sql + migrations 001..006 appliques.
-- Base de test exclusivement : le script se termine par un ROLLBACK.
--
-- Mode d'emploi :
--   psql "$DATABASE_URL_TEST" -v ON_ERROR_STOP=1 -f supabase/tests/rls_security.test.sql
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Utilitaires
-- ------------------------------------------------------------
create or replace function pg_temp.check(condition boolean, label text)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'ECHEC: %', label;
  end if;
  raise notice 'OK: %', label;
end;
$$;

create or replace function pg_temp.count_rows(sql text)
returns bigint
language plpgsql
as $$
declare
  v bigint;
begin
  execute sql into v;
  return v;
end;
$$;

-- Simule un utilisateur authentifie : pose les claims JWT lus par auth.uid()
-- et auth.jwt(), tels que Supabase les expose dans la requete.
create or replace function pg_temp.act_as(uid text, app_role text)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid, 'app_metadata', json_build_object('role', app_role))::text,
    true
  );
  perform set_config('request.jwt.claim.sub', uid, true);
end;
$$;

-- ------------------------------------------------------------
-- Fixtures (executees en tant que postgres, RLS contournee)
-- ------------------------------------------------------------
insert into public.agents (id, auth_user_id, telephone, nom, role)
values
  ('test-agent-a', '00000000-0000-0000-0000-0000000000a1', '10000001', 'Agent A', 'agent'),
  ('test-agent-b', '00000000-0000-0000-0000-0000000000a2', '10000002', 'Agent B', 'agent'),
  ('test-admin',   '00000000-0000-0000-0000-0000000000a9', '10000009', 'Admin SCG', 'admin')
on conflict (id) do nothing;

insert into public.observations (id, agent_id, agent_nom, agent_telephone, type_probleme, commentaire, zone, date_creation)
values
  ('test-obs-a', 'test-agent-a', 'Agent A', '10000001', 'fuite_huile', 'A', 'cru',    now()),
  ('test-obs-b', 'test-agent-b', 'Agent B', '10000002', 'fuite_eau',   'B', 'ciment', now())
on conflict (id) do nothing;

-- ============================================================
-- 1. Aucune politique permissive residuelle
-- ============================================================
do $$
declare
  v int;
begin
  select count(*) into v
  from pg_policies
  where schemaname = 'public'
    and tablename in ('agents', 'observations', 'notifs')
    and (qual = 'true' or with_check = 'true');

  perform pg_temp.check(v = 0, format('aucune politique permissive (trouve: %s)', v));
end $$;

-- ============================================================
-- 2. Aucune politique d'insertion directe sur agents / notifications
-- ============================================================
do $$
declare
  v_agents int;
  v_notifs int;
begin
  select count(*) into v_agents from pg_policies
  where schemaname = 'public' and tablename = 'agents' and cmd in ('INSERT', 'ALL');
  select count(*) into v_notifs from pg_policies
  where schemaname = 'public' and tablename = 'notifs' and cmd in ('INSERT', 'ALL');

  perform pg_temp.check(v_agents = 0, 'aucune insertion cliente possible sur agents');
  perform pg_temp.check(v_notifs = 0, 'aucune insertion cliente possible sur notifs');
end $$;

-- ============================================================
-- 3. Agent A : lecture de son profil uniquement
-- ============================================================
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1', 'agent');

do $$
begin
  perform pg_temp.check(
    pg_temp.count_rows('select count(*) from public.agents where id = ''test-agent-a''') = 1,
    'agent A lit son propre profil'
  );
  perform pg_temp.check(
    pg_temp.count_rows('select count(*) from public.agents where id = ''test-agent-b''') = 0,
    'agent A ne lit pas le profil de agent B'
  );
  perform pg_temp.check(
    pg_temp.count_rows('select count(*) from public.agents') = 1,
    'agent A ne voit qu une seule ligne dans agents'
  );
end $$;

-- ============================================================
-- 4. Agent A : ecriture de ses propres observations
-- ============================================================
do $$
begin
  insert into public.observations (id, agent_id, agent_nom, agent_telephone, type_probleme, zone)
  values ('test-obs-a2', 'test-agent-a', 'Agent A', '10000001', 'fuite_huile', 'cru');

  perform pg_temp.check(
    pg_temp.count_rows('select count(*) from public.observations where id = ''test-obs-a2''') = 1,
    'agent A cree sa propre observation'
  );
  perform pg_temp.check(
    pg_temp.count_rows('select count(*) from public.observations') = 2,
    'agent A voit ses deux observations'
  );
  perform pg_temp.check(
    pg_temp.count_rows('select count(*) from public.observations where agent_id <> ''test-agent-a''') = 0,
    'agent A ne voit aucune observation d un autre agent'
  );
end $$;

-- ============================================================
-- 5. Agent A : impossible d'inserer au nom d'un autre agent
-- ============================================================
do $$
declare
  v_ok boolean := false;
begin
  begin
    insert into public.observations (id, agent_id, agent_nom, agent_telephone, type_probleme, zone)
    values ('test-obs-usurpee', 'test-agent-b', 'Agent B', '10000002', 'fuite_eau', 'ciment');
    v_ok := true;
  exception when others then
    v_ok := false;
  end;

  perform pg_temp.check(not v_ok, 'insertion au nom de agent B refusee');
  perform pg_temp.check(
    pg_temp.count_rows('select count(*) from public.observations where id = ''test-obs-usurpee''') = 0,
    'aucune observation usurpee presente'
  );
end $$;

-- ============================================================
-- 6. Agent A : aucune modification d'observation
-- ============================================================
do $do$
declare
  v_rows int := -1;
begin
  begin
    update public.observations set commentaire = 'pirate' where id = 'test-obs-a';
    get diagnostics v_rows = row_count;
  exception when others then
    v_rows := -1;
  end;

  perform pg_temp.check(v_rows = 0, 'agent A ne modifie aucune observation');
end $do$;

-- ============================================================
-- 7. Agent A : role et identite de liaison inchangeables
-- ============================================================
do $$
begin
  begin
    update public.agents set role = 'admin' where id = 'test-agent-a';
  exception when others then null;
  end;

  perform pg_temp.check(
    pg_temp.count_rows('select count(*) from public.agents where id = ''test-agent-a'' and role = ''agent''') = 1,
    'role de agent A reste agent'
  );
end $$;

do $$
begin
  begin
    update public.agents set auth_user_id = '00000000-0000-0000-0000-0000000000ff' where id = 'test-agent-a';
  exception when others then null;
  end;

  perform pg_temp.check(
    pg_temp.count_rows('select count(*) from public.agents where id = ''test-agent-a'' and auth_user_id = ''00000000-0000-0000-0000-0000000000a1''') = 1,
    'auth_user_id de agent A inchange'
  );
end $$;

-- ============================================================
-- 8. Notifications : le destinataire lit les siennes
-- ============================================================
do $$
begin
  perform pg_temp.check(
    pg_temp.count_rows('select count(*) from public.notifs where obs_id = ''test-obs-a''') >= 1,
    'agent A lit la notification de son observation'
  );
  perform pg_temp.check(
    pg_temp.count_rows('select count(*) from public.notifs where obs_id = ''test-obs-b''') = 0,
    'agent A ne lit pas la notification de agent B'
  );
end $$;

-- ============================================================
-- 9. Agent A : ne peut pas marquer comme lue la notification d'un autre
-- ============================================================
do $do$
declare
  v_rows int := -1;
begin
  begin
    update public.notifs set lu = true where obs_id = 'test-obs-b';
    get diagnostics v_rows = row_count;
  exception when others then
    v_rows := -1;
  end;

  perform pg_temp.check(v_rows <= 0, 'agent A ne modifie pas la notification de agent B');
end $do$;

-- ============================================================
-- 10. Administrateur : lecture et modification globales
-- ============================================================
reset role;
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a9', 'admin');

do $$
declare
  v_obs int;
  v_ok  boolean := false;
begin
  select count(*) into v_obs from public.observations;
  perform pg_temp.check(v_obs >= 2, 'admin lit toutes les observations');

  begin
    update public.observations set commentaire = 'vu par admin' where id = 'test-obs-a';
    v_ok := true;
  exception when others then
    v_ok := false;
  end;

  perform pg_temp.check(v_ok, 'admin modifie une observation');
  perform pg_temp.check(
    pg_temp.count_rows('select count(*) from public.notifs') >= 2,
    'admin lit toutes les notifications'
  );
end $$;

-- ============================================================
-- 11. Trigger 006 : nouvelle inscription OTP -> role agent
-- ============================================================
reset role;

do $$
declare
  v_role text;
  v_tel  text;
begin
  insert into auth.users (id, phone, raw_user_meta_data)
  values ('11111111-1111-1111-1111-111111111111', '+21611110000', '{"nom":"Ahmed Ben Ali"}');

  select role, telephone into v_role, v_tel
  from public.agents where auth_user_id = '11111111-1111-1111-1111-111111111111';

  perform pg_temp.check(v_role = 'agent', 'trigger: role agent impose');
  perform pg_temp.check(v_tel = '11110000', 'trigger: telephone normalise sans +216');
end $$;

-- ============================================================
-- 12. Trigger 006 : le role envoye par le client est ignore
-- ============================================================
do $$
declare
  v_role text;
begin
  insert into auth.users (id, phone, raw_user_meta_data)
  values ('22222222-2222-2222-2222-222222222222', '+21622220000', '{"nom":"X","role":"admin"}');

  select role into v_role
  from public.agents where auth_user_id = '22222222-2222-2222-2222-222222222222';

  perform pg_temp.check(v_role = 'agent', 'trigger: role client ignore, agent applique');
end $$;

-- ============================================================
-- 13. Trigger 006 : agent existant relie, role preserve
-- ============================================================
do $$
declare
  v_role text;
begin
  insert into public.agents (id, telephone, nom, role)
  values ('test-admin-existant', '33330000', 'Responsable', 'admin')
  on conflict (telephone) do nothing;

  insert into auth.users (id, phone, raw_user_meta_data)
  values ('33333333-3333-3333-3333-333333333333', '+21633330000', '{"nom":"Responsable"}');

  select role into v_role
  from public.agents where auth_user_id = '33333333-3333-3333-3333-333333333333';

  perform pg_temp.check(v_role = 'admin', 'trigger: agent existant relie, role admin preserve');
end $$;

-- ============================================================
-- 14. getCurrentAgent() retrouve le profil apres OTP
-- ============================================================
set local role authenticated;
select pg_temp.act_as('11111111-1111-1111-1111-111111111111', 'agent');

do $$
declare
  v_nom text;
begin
  select nom into v_nom
  from public.agents
  where auth_user_id = (select auth.uid());

  perform pg_temp.check(v_nom = 'Ahmed Ben Ali', 'getCurrentAgent retrouve le profil apres OTP');
end $$;

reset role;

rollback;