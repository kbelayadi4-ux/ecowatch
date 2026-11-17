-- ============================================================
-- EcoWatch SCG — DIAGNOSTIC AVANT ALIGNEMENT (LECTURE SEULE)
--
-- Ce script ne contient aucune instruction d'écriture :
-- pas d'INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, GRANT, REVOKE.
-- Il peut etre execute sans risque dans le SQL Editor Supabase.
--
-- Mode d'emploi :
--   Supabase > SQL Editor > New query > coller ce fichier > Run
--   puis lire les sections dans l'ordre.
--
-- Les sections 3 a 6 ne declenchent jamais d'erreur « does not exist » :
-- elles interrogent le catalogue, pas les objets.
-- ============================================================


-- ------------------------------------------------------------
-- 0. Contexte d'execution
-- ------------------------------------------------------------
select current_database()  as base,
       current_user      as utilisateur,
       version()         as version_postgresql,
       now()             as horodatage;


-- ------------------------------------------------------------
-- 1. Migrations enregistrees (le SQL Editor n'enregistre rien)
-- ------------------------------------------------------------
do $do$
declare
  v_texte text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise notice 'DIAG 1: table supabase_migrations.schema_migrations absente — les migrations ont ete jouees a la main dans le SQL Editor.';
    return;
  end if;

  execute 'select coalesce(string_agg(version || '' '' || coalesce(name, ''''), E''\n'' order by version), ''(table vide)'')'
       || ' from supabase_migrations.schema_migrations'
    into v_texte;

  raise notice 'DIAG 1: migrations enregistrees -> %', v_texte;
end $do$;


-- ------------------------------------------------------------
-- 2. Tables publiques etat des lieux
-- ------------------------------------------------------------
select c.relname                as table,
       c.relrowsecurity         as rls_activee,
       c.relforcerowsecurity    as rls_forcee,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as nb_politiques
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relname;


-- ------------------------------------------------------------
-- 3. Colonnes de public.agents
-- ------------------------------------------------------------
select column_name    as colonne,
       data_type      as type,
       is_nullable    as nullable,
       coalesce(column_default, '') as defaut
from information_schema.columns
where table_schema = 'public' and table_name = 'agents'
order by ordinal_position;


-- ------------------------------------------------------------
-- 4. Colonnes de public.observations
-- ------------------------------------------------------------
select column_name    as colonne,
       data_type      as type,
       is_nullable    as nullable,
       coalesce(column_default, '') as defaut
from information_schema.columns
where table_schema = 'public' and table_name = 'observations'
order by ordinal_position;


-- ------------------------------------------------------------
-- 5. Colonnes de public.notifs
-- ------------------------------------------------------------
select column_name    as colonne,
       data_type      as type,
       is_nullable    as nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'notifs'
order by ordinal_position;


-- ------------------------------------------------------------
-- 6. Tables de service attendues
--    observation_history      (migration 009)
--    signalement_public_abus  (migration 011)
-- ------------------------------------------------------------
select table_name as table_attendue,
       case when to_regclass('public.' || table_name) is null
            then 'ABSENTE' else 'PRESENTE'
       end as etat
from (values ('observation_history'), ('signalement_public_abus')) as t(table_name);


-- ------------------------------------------------------------
-- 7. Contraintes et cles etrangeres
-- ------------------------------------------------------------
select conrelid::regclass::text as table,
       conname                  as contrainte,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
  and conrelid::regclass::text in ('agents', 'observations', 'notifs')
order by 1, 2;


-- ------------------------------------------------------------
-- 8. Politiques RLS par table et par commande
-- ------------------------------------------------------------
select tablename as table,
       policyname as politique,
       cmd        as commande,
       coalesce(roles::text, '-') as roles,
       coalesce(qual, '-')        as expression_using,
       coalesce(with_check, '-')  as expression_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;


-- ------------------------------------------------------------
-- 9. Politiques permissives residuelles (toile de securite)
--    Toute ligne ici annule les politiques de securite :
--    PostgreSQL combine les politiques PERMISSIVE par un OU logique.
-- ------------------------------------------------------------
select schemaname as schema,
       tablename  as table,
       policyname as politique,
       cmd        as commande,
       qual       as using,
       with_check as check
from pg_policies
where schemaname in ('public', 'storage')
  and (qual = 'true' or with_check = 'true')
order by schemaname, tablename, policyname;


-- ------------------------------------------------------------
-- 10. Fonctions publiques et securite
-- ------------------------------------------------------------
select p.proname     as fonction,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef   as security_definer,
       coalesce(p.proconfig::text, '') as configuration
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;


-- ------------------------------------------------------------
-- 11. Declencheurs
-- ------------------------------------------------------------
select n.nspname as schema,
       c.relname as table,
       t.tgname  as declencheur,
       pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'auth')
  and not t.tgisinternal
order by 1, 2, 3;


-- ------------------------------------------------------------
-- 12. Realtime et REPLICA IDENTITY
-- ------------------------------------------------------------
do $do$
declare
  v_publication text;
  v_tables      text;
  v_identity    text;
begin
  select pubname into v_publication
  from pg_publication
  where pubname = 'supabase_realtime';

  if v_publication is null then
    raise notice 'DIAG 12: publication supabase_realtime absente.';
  else
    select coalesce(string_agg(tablename, ', ' order by tablename), '(aucune table)')
      into v_tables
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public';

    raise notice 'DIAG 12: publication supabase_realtime -> %', v_tables;
  end if;

  select coalesce(string_agg(relname || '=' || relreplident::text, ', ' order by relname), '(aucune)')
    into v_identity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and c.relname in ('observations', 'notifs', 'observation_history');

  raise notice 'DIAG 12: REPLICA IDENTITY -> %', v_identity;
end $do$;


-- ------------------------------------------------------------
-- 13. Bucket Storage des photographies (migration 010)
-- ------------------------------------------------------------
do $do$
declare
  v_bucket record;
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'DIAG 13: schema storage absent (bucket non applicable).';
    return;
  end if;

  for v_bucket in
    select id, name, public, file_size_limit, allowed_mime_types
    from storage.buckets
    where id = 'photos'
  loop
    raise notice 'DIAG 13: bucket photos -> public=%, limite=% Mo, types=%',
      v_bucket.public,
      coalesce((v_bucket.file_size_limit / 1024 / 1024)::text, 'illimitee'),
      coalesce(array_to_string(v_bucket.allowed_mime_types, ','), 'tous');
  end loop;

  if not found then
    raise notice 'DIAG 13: bucket photos ABSENT.';
  end if;
end $do$;


-- ------------------------------------------------------------
-- 14. Volumes et coherence
--     Bloc dynamique : la colonne agents.auth_user_id peut etre
--     absente (migration 001 non appliquee).
-- ------------------------------------------------------------
do $volumes$
declare
  v_agents bigint;
  v_obs bigint;
  v_notifs bigint;
  v_admins bigint;
  v_non_lies text;
  v_champ boolean;
begin
  select count(*) into v_agents from public.agents;
  select count(*) into v_obs from public.observations;
  select count(*) into v_notifs from public.notifs;
  select count(*) into v_admins from public.agents where role = 'admin';

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'agents' and column_name = 'auth_user_id'
  ) into v_champ;

  if v_champ then
    execute 'select count(*)::text from public.agents where auth_user_id is null' into v_non_lies;
  else
    v_non_lies := 'n/a (migration 001 non appliquee)';
  end if;

  raise notice 'DIAG 14: agents=%, observations=%, notifs=%, administrateurs=%, agents non lies=%',
    v_agents, v_obs, v_notifs, v_admins, v_non_lies;
end $volumes$;


-- ------------------------------------------------------------
-- 14b. Observations orphelines (agent_id sans agent correspondant)
-- ------------------------------------------------------------
select count(*) as observations_orphelines
from public.observations o
left join public.agents a on a.id = o.agent_id
where a.id is null;


-- ------------------------------------------------------------
-- 15. VERDICT PAR MIGRATION
--     Une migration est declaree MANQUANTE des que l'objet qu'elle
--     introduit est absent. L'ordre de la colonne `ordre` est l'ordre
--     d'application.
-- ------------------------------------------------------------
with etat(migration, objet_attendu, present) as (
  select '001', 'agents.auth_user_id',
         exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='agents' and column_name='auth_user_id')
  union all
  select '002', 'fonction public.is_admin()',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='is_admin')
  union all
  select '002', 'fonction public.current_agent_id()',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='current_agent_id')
  union all
  select '003', 'politique observations.obs_read_own_or_admin',
         exists (select 1 from pg_policies
                  where schemaname='public' and tablename='observations' and policyname='obs_read_own_or_admin')
  union all
  select '004', 'table observations dans la publication realtime',
         exists (select 1 from pg_publication_tables
                  where pubname='supabase_realtime' and schemaname='public' and tablename='observations')
  union all
  select '005', 'politique agents.agents_update_own',
         exists (select 1 from pg_policies
                  where schemaname='public' and tablename='agents' and policyname='agents_update_own')
  union all
  select '006', 'declencheur auth.users.on_auth_user_created',
         exists (select 1 from pg_trigger t
                  join pg_class c on c.oid=t.tgrelid
                  join pg_namespace n on n.oid=c.relnamespace
                  where n.nspname='auth' and c.relname='users' and t.tgname='on_auth_user_created' and not t.tgisinternal)
  union all
  select '007', 'politique notifs.notifs_update_admin',
         exists (select 1 from pg_policies
                  where schemaname='public' and tablename='notifs' and policyname='notifs_update_admin')
  union all
  select '008', 'is_admin() aligne sur agents.role',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='is_admin'
                    and pg_get_functiondef(p.oid) like '%agents%')
  union all
  select '009', 'observations.statut',
         exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='observations' and column_name='statut')
  union all
  select '009', 'table observation_history',
         exists (select 1 from information_schema.tables
                  where table_schema='public' and table_name='observation_history')
  union all
  select '009', 'fonction public.admin_update_observation()',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='admin_update_observation')
  union all
  select '010', 'bucket storage photos',
         exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                  where n.nspname='storage' and c.relname='buckets')
  union all
  select '011', 'observations.operateur_nom',
         exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='observations' and column_name='operateur_nom')
  union all
  select '011', 'fonction public.creer_signalement_public()',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='creer_signalement_public')
  union all
  select '011', 'table signalement_public_abus',
         exists (select 1 from information_schema.tables
                  where table_schema='public' and table_name='signalement_public_abus')
)
select migration,
       objet_attendu,
       case when present then 'OK' else 'MANQUANT' end as etat
from etat
order by migration, objet_attendu;


-- ------------------------------------------------------------
-- 16. MIGRATIONS A APPLIQUER, DANS L'ORDRE
--     Liste vide = base deja alignee.
-- ------------------------------------------------------------
with etat(migration, present) as (
  select '001', exists (select 1 from information_schema.columns
                         where table_schema='public' and table_name='agents' and column_name='auth_user_id')
  union all
  select '002', exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                         where n.nspname='public' and p.proname='is_admin')
                and exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                         where n.nspname='public' and p.proname='current_agent_id')
  union all
  select '003', exists (select 1 from pg_policies
                         where schemaname='public' and tablename='observations' and policyname='obs_read_own_or_admin')
  union all
  select '004', exists (select 1 from pg_publication_tables
                         where pubname='supabase_realtime' and schemaname='public' and tablename='observations')
  union all
  select '005', exists (select 1 from pg_policies
                         where schemaname='public' and tablename='agents' and policyname='agents_update_own')
                and not exists (select 1 from pg_policies
                         where schemaname='public' and tablename in ('agents','observations','notifs')
                           and (qual='true' or with_check='true'))
  union all
  select '006', exists (select 1 from pg_trigger t
                         join pg_class c on c.oid=t.tgrelid
                         join pg_namespace n on n.oid=c.relnamespace
                         where n.nspname='auth' and c.relname='users'
                           and t.tgname='on_auth_user_created' and not t.tgisinternal)
  union all
  select '007', exists (select 1 from pg_policies
                         where schemaname='public' and tablename='notifs' and policyname='notifs_update_admin')
  union all
  select '008', exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                         where n.nspname='public' and p.proname='is_admin'
                           and pg_get_functiondef(p.oid) like '%agents%')
  union all
  select '009', exists (select 1 from information_schema.tables
                         where table_schema='public' and table_name='observation_history')
                and exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                         where n.nspname='public' and p.proname='admin_update_observation')
  union all
  select '010', exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                         where n.nspname='storage' and c.relname='buckets')
  union all
  select '011', exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                         where n.nspname='public' and p.proname='creer_signalement_public')
                and exists (select 1 from information_schema.tables
                         where table_schema='public' and table_name='signalement_public_abus')
)
select string_agg(migration, ' -> ' order by migration) as migrations_a_appliquer
from etat
where not present;


-- ------------------------------------------------------------
-- 17. Acces anon : ce que le role anonyme peut reellement faire
--     (ne rien executer ici si la base est deja alignee : le resultat
--      doit etre « aucune lecture »)
-- ------------------------------------------------------------
do $do$
declare
  v_select  boolean;
  v_insert  boolean;
  v_execute boolean;
begin
  if to_regprocedure('public.creer_signalement_public(text,text,text,text,text,text)') is null then
    raise notice 'DIAG 17: fonction creer_signalement_public() absente — migration 011 non appliquee.';
    return;
  end if;

  select has_table_privilege('anon', 'public.observations', 'select'),
         has_table_privilege('anon', 'public.observations', 'insert'),
         has_function_privilege('anon', 'public.creer_signalement_public(text,text,text,text,text,text)', 'execute')
    into v_select, v_insert, v_execute;

  raise notice 'DIAG 17: anon SELECT observations = %, anon INSERT observations = %, anon EXECUTE creer_signalement_public = %',
    v_select, v_insert, v_execute;
end $do$;

-- ============================================================
-- FIN DU DIAGNOSTIC — aucune donnee modifiee.
-- ============================================================