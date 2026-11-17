-- ============================================================
-- EcoWatch SCG — VERIFICATION APRES ALIGNEMENT (LECTURE SEULE)
--
-- A executer dans le SQL Editor APRES supabase/fix/alignement-eco-watch.sql.
-- Ce script ne modifie rien : il ne contient que des SELECT et des
-- RAISE NOTICE. Aucune donnee n'est modifiee.
--
-- Lecture : la derniere requete affiche un tableau
--   libelle | etat | detail
-- ou etat vaut OK ou ECHEC. Le bloc final affiche le compte.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Colonnes de liaison et de suivi
-- ------------------------------------------------------------
select 'agents.auth_user_id' as libelle,
       case when exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='agents' and column_name='auth_user_id'
       ) then 'OK' else 'ECHEC' end as etat
union all
select 'observations.statut',
       case when exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='observations' and column_name='statut'
       ) then 'OK' else 'ECHEC' end
union all
select 'observations.priorite',
       case when exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='observations' and column_name='priorite'
       ) then 'OK' else 'ECHEC' end
union all
select 'observations.assigne_a',
       case when exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='observations' and column_name='assigne_a'
       ) then 'OK' else 'ECHEC' end
union all
select 'observations.echeance',
       case when exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='observations' and column_name='echeance'
       ) then 'OK' else 'ECHEC' end
union all
select 'observations.numero_suivi',
       case when exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='observations' and column_name='numero_suivi'
       ) then 'OK' else 'ECHEC' end
union all
select 'observations.photo_path',
       case when exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='observations' and column_name='photo_path'
       ) then 'OK' else 'ECHEC' end
union all
select 'observations.operateur_nom',
       case when exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='observations' and column_name='operateur_nom'
       ) then 'OK' else 'ECHEC' end
union all
select 'observations.operateur_matricule',
       case when exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='observations' and column_name='operateur_matricule'
       ) then 'OK' else 'ECHEC' end
union all
select 'table observation_history',
       case when exists (
         select 1 from information_schema.tables
         where table_schema='public' and table_name='observation_history'
       ) then 'OK' else 'ECHEC' end
union all
select 'table signalement_public_abus',
       case when exists (
         select 1 from information_schema.tables
         where table_schema='public' and table_name='signalement_public_abus'
       ) then 'OK' else 'ECHEC' end
order by 1;


-- ------------------------------------------------------------
-- 2. Fonctions de securite
-- ------------------------------------------------------------
select p.proname as fonction,
       case when n.nspname = 'public' then 'OK' else 'ECHEC' end as etat,
       case when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end as securite
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'is_admin', 'current_agent_id', 'current_agent_role',
    'admin_set_role', 'admin_update_observation', 'creer_signalement_public',
    'obs_impose_agent', 'obs_journalise', 'obs_notifie_statut',
    'handle_new_auth_user', 'create_notification_for_observation'
  )
order by 1;


-- ------------------------------------------------------------
-- 3. is_admin() ne doit plus dependre du JWT
--    (source de verite = agents.role, migration 008)
-- ------------------------------------------------------------
select 'is_admin() lit agents.role' as libelle,
       case when exists (
         select 1 from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname='public' and p.proname='is_admin'
           and position('agents' in pg_get_functiondef(p.oid)) > 0
           and position('auth.jwt' in pg_get_functiondef(p.oid)) = 0
       ) then 'OK' else 'ECHEC' end as etat;


-- ------------------------------------------------------------
-- 4. RLS activee sur toutes les tables concernees
-- ------------------------------------------------------------
select c.relname as table,
       case when c.relrowsecurity then 'OK' else 'ECHEC' end as rls_activee,
       (select count(*) from pg_policies p
         where p.schemaname='public' and p.tablename=c.relname) as nb_politiques
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('agents','observations','notifs','observation_history','signalement_public_abus')
order by 1;


-- ------------------------------------------------------------
-- 5. Aucune politique permissive residuelle
--    (une seule politique `using (true)` neutralise les autres)
-- ------------------------------------------------------------
select 'politiques permissives restantes' as libelle,
       count(*)::text as etat
from pg_policies
where schemaname in ('public','storage')
  and (qual = 'true' or with_check = 'true');


-- ------------------------------------------------------------
-- 6. Accès du role anonyme
--    attendu : SELECT/INSERT faux sur observations, EXECUTE sur la RPC
-- ------------------------------------------------------------
select 'anon SELECT observations' as libelle,
       case when has_table_privilege('anon','public.observations','select')
            then 'ECHEC (acces public)' else 'OK' end as etat
union all
select 'anon INSERT observations',
       case when has_table_privilege('anon','public.observations','insert')
            then 'ECHEC (ecriture publique)' else 'OK' end
union all
select 'anon UPDATE observations',
       case when has_table_privilege('anon','public.observations','update')
            then 'ECHEC (modification publique)' else 'OK' end
union all
select 'anon DELETE observations',
       case when has_table_privilege('anon','public.observations','delete')
            then 'ECHEC (suppression publique)' else 'OK' end
union all
select 'anon SELECT agents',
       case when has_table_privilege('anon','public.agents','select')
            then 'ECHEC' else 'OK' end
union all
select 'anon SELECT notifs',
       case when has_table_privilege('anon','public.notifs','select')
            then 'ECHEC' else 'OK' end
union all
select 'anon EXECUTE creer_signalement_public()',
       case when has_function_privilege('anon',
              'public.creer_signalement_public(text,text,text,text,text,text)','execute')
            then 'OK' else 'ECHEC (formulaire public bloque)' end
union all
select 'anon EXECUTE admin_update_observation()',
       case when has_function_privilege('anon',
              'public.admin_update_observation(text,text,text,text,timestamptz,text,boolean)','execute')
            then 'ECHEC (danger)' else 'OK' end;


-- ------------------------------------------------------------
-- 7. Privilèges du role authentifié
-- ------------------------------------------------------------
select 'authenticated SELECT observations' as libelle,
       case when has_table_privilege('authenticated','public.observations','select')
            then 'OK' else 'ECHEC' end as etat
union all
select 'authenticated SELECT agents',
       case when has_table_privilege('authenticated','public.agents','select')
            then 'OK' else 'ECHEC' end
union all
select 'authenticated SELECT notifs',
       case when has_table_privilege('authenticated','public.notifs','select')
            then 'OK' else 'ECHEC' end
union all
select 'authenticated UPDATE agents.nom',
       case when has_column_privilege('authenticated','public.agents','nom','update')
            then 'OK' else 'ECHEC' end
union all
select 'authenticated UPDATE agents.role',
       case when has_column_privilege('authenticated','public.agents','role','update')
            then 'ECHEC (promotion possible)' else 'OK' end
union all
select 'authenticated UPDATE agents.auth_user_id',
       case when has_column_privilege('authenticated','public.agents','auth_user_id','update')
            then 'ECHEC (usurpation possible)' else 'OK' end;


-- ------------------------------------------------------------
-- 8. Declencheurs
-- ------------------------------------------------------------
select c.relname as table,
       count(*) as nb_declencheurs,
       string_agg(t.tgname, ', ' order by t.tgname) as declencheurs
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public','auth')
  and not t.tgisinternal
  and (c.relname in ('observations','users'))
group by c.relname
order by 1;


-- ------------------------------------------------------------
-- 9. Realtime et REPLICA IDENTITY
-- ------------------------------------------------------------
select c.relname as table,
       c.relreplident as replica_identity,
       case when exists (
         select 1 from pg_publication_tables pt
         where pt.pubname='supabase_realtime' and pt.schemaname='public'
           and pt.tablename=c.relname
       ) then 'OK' else 'ABSENTE' end as dans_publication
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname='public' and c.relkind='r'
  and c.relname in ('observations','notifs','observation_history')
order by 1;


-- ------------------------------------------------------------
-- 10. Bucket Storage des photographies (migration 010)
--     Bloc dynamique : le schema `storage` peut etre absent
--     (environnement sans Supabase Storage).
-- ------------------------------------------------------------
do $bucket$
declare
  v record;
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'DIAG 10: schema storage absent — bucket non applicable.';
    return;
  end if;

  for v in
    select id, public, file_size_limit, allowed_mime_types
    from storage.buckets
    where id = 'photos'
  loop
    raise notice 'DIAG 10: bucket photos -> public=%, taille=% Mo, types=%',
      v.public,
      coalesce((v.file_size_limit / 1024 / 1024)::text, 'illimitee'),
      coalesce(array_to_string(v.allowed_mime_types, ','), 'tous');
  end loop;

  if not found then
    raise notice 'DIAG 10: bucket photos ABSENT (a creer).';
  end if;
end $bucket$;


-- ------------------------------------------------------------
-- 11. Volumes et coherence des donnees
-- ------------------------------------------------------------
select (select count(*) from public.agents)       as agents,
       (select count(*) from public.observations) as observations,
       (select count(*) from public.notifs)       as notifs,
       (select count(*) from public.agents where role='admin') as administrateurs,
       (select count(*) from public.agents where auth_user_id is null) as agents_non_lies,
       (select count(*) from public.observations where numero_suivi is null) as observations_sans_numero;


-- ------------------------------------------------------------
-- 12. Les indicateurs du tableau de bord sont calculables
--     (chaque colonne utilisee par getKpis() doit exister)
-- ------------------------------------------------------------
select 'colonnes des indicateurs (date_creation, statut, priorite, echeance, photo, photo_path)' as libelle,
       case when (
         select count(*) from information_schema.columns
         where table_schema='public' and table_name='observations'
           and column_name in ('date_creation','statut','priorite','echeance','photo','photo_path')
       ) = 6 then 'OK' else 'ECHEC' end as etat;


-- ------------------------------------------------------------
-- 13. SYNTHESE
-- ------------------------------------------------------------
do $synth$
declare
  v_echecs int;
begin
  select count(*) into v_echecs
  from (
    select 1
    from pg_policies
    where schemaname in ('public','storage') and (qual='true' or with_check='true')

    union all
    select 1
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
      and c.relname in ('agents','observations','notifs','observation_history','signalement_public_abus')
      and not c.relrowsecurity

    union all
    select 1 where has_table_privilege('anon','public.observations','select')
      or has_table_privilege('anon','public.observations','insert')
      or has_table_privilege('anon','public.observations','update')
      or has_table_privilege('anon','public.observations','delete')

    union all
    select 1 where not has_function_privilege('anon',
      'public.creer_signalement_public(text,text,text,text,text,text)','execute')
  ) e;

  if v_echecs = 0 then
    raise notice 'VERDICT: % — aucune anomalie detectee.', 'OK';
  else
    raise exception 'VERDICT: % anomalie(s) detectee(s) — voir les sections ci-dessus.', v_echecs;
  end if;
end $synth$;

-- ============================================================
-- FIN — aucune donnee modifiee.
-- ============================================================