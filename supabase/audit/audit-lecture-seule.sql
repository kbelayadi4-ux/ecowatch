-- ============================================================
-- Audit en LECTURE SEULE de la base Supabase EcoWatch SCG
--
-- Ce script ne modifie rien : aucune insertion, mise a jour,
-- suppression, creation de politique ni migration.
-- Il se contente de SELECT et d'affichage de resultats.
--
-- Mode d'emploi :
--   Supabase > SQL Editor > New query > coller ce fichier > Run
--   puis lire section par section.
--
-- Prerequis : etre connecte avec un compte autorise (dashboard).
-- ============================================================

\echo '============================================================='
\echo ' 1. MIGRATIONS APPLIQUEES'
\echo '============================================================='
select version, name, statements
from supabase_migrations.schema_migrations
order by version;

\echo ''
\echo '============================================================='
\echo ' 2. OBJETS DE PUBLIC (tables, vues, colonnes)'
\echo '============================================================='
select table_name,
       string_agg(column_name || ' ' || data_type ||
                  case when is_nullable = 'NO' then ' NOT NULL' else '' end,
                  ', ' order by ordinal_position) as colonnes
from information_schema.columns
where table_schema = 'public'
group by table_name
order by table_name;

\echo ''
\echo '============================================================='
\echo ' 3. POLITIQUES RLS PAR TABLE'
\echo '============================================================='
select tablename, policyname, cmd, roles::text, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

\echo ''
\echo '--- 3b. POLITIQUES PERMISSIVES RESIDUELLES (doit etre vide) ---'
select tablename, policyname, qual, with_check
from pg_policies
where schemaname = 'public'
  and (qual = 'true' or with_check = 'true');

\echo ''
\echo '--- 3c. RLS ACTIVEE (toutes les tables de donnees doivent etre a true) ---'
select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

\echo ''
\echo '============================================================='
\echo ' 4. FONCTIONS DE SECURITE (SECURITY DEFINER, search_path, row_security)'
\echo '============================================================='
select p.proname,
       pg_get_function_identity_arguments(p.oid) as signature,
       p.prosecdef as security_definer,
       p.proconfig as configuration,
       has_function_privilege('anon', p.oid, 'execute') as executable_par_anon,
       has_function_privilege('authenticated', p.oid, 'execute') as executable_par_authenticated
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_admin', 'current_agent_id', 'current_agent_role',
                    'admin_set_role', 'admin_update_observation',
                    'obs_impose_agent', 'obs_journalise', 'obs_notifie_statut')
order by p.proname;

\echo ''
\echo '============================================================='
\echo ' 5. TRIGGERS'
\echo '============================================================='
select c.relname as table_name, t.tgname, p.proname as fonction
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and not t.tgisinternal
order by c.relname, t.tgname;

\echo ''
\echo '============================================================='
\echo ' 6. CONTRAINTES (cles etrangeres, uniques, checks)'
\echo '============================================================='
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
  and contype in ('f', 'u', 'c')
order by conrelid::regclass::text, contype, conname;

\echo ''
\echo '============================================================='
\echo ' 7. COMPTES AGENTS SANS auth_user_id'
\echo '============================================================='
select id, telephone, nom, role, auth_user_id, created_at
from public.agents
where auth_user_id is null
order by telephone;

\echo ''
\echo '--- 7b. AGENTS RELIES A UN COMPTE AUTH (coherence) ---'
select a.id, a.telephone, a.role, a.auth_user_id, u.phone as auth_phone, u.email
from public.agents a
left join auth.users u on u.id = a.auth_user_id
order by a.role, a.telephone;

\echo ''
\echo '--- 7c. COMPTES AUTH SANS PROFIL AGENT ---'
select u.id, u.phone, u.email, u.created_at
from auth.users u
left join public.agents a on a.auth_user_id = u.id
where a.id is null
order by u.created_at desc;

\echo ''
\echo '============================================================='
\echo ' 8. UTILISATEURS SUPABASE AUTH'
\echo '============================================================='
select id, phone, email, role as auth_role,
       raw_app_meta_data ->> 'role' as app_metadata_role,
       last_sign_in_at, created_at
from auth.users
order by created_at desc
limit 50;

\echo ''
\echo '============================================================='
\echo ' 9. VOLUMES DE DONNEES'
\echo '============================================================='
select 'agents' as table_name, count(*) from public.agents
union all select 'observations', count(*) from public.observations
union all select 'notifs', count(*) from public.notifs
union all select 'observation_history', count(*) from public.observation_history;

\echo ''
\echo '--- 9b. INTEGRITE : observations sans agent valide ---'
select count(*) as observations_orphelines
from public.observations o
left join public.agents a on a.id = o.agent_id
where a.id is null;

\echo ''
\echo '--- 9c. INTEGRITE : notifications sans observation ---'
select count(*) as notifs_orphelines
from public.notifs n
left join public.observations o on o.id = n.obs_id
where o.id is null;

\echo ''
\echo '============================================================='
\echo '10. PUBLICATION REALTIME'
\echo '============================================================='
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;

\echo ''
\echo '--- 10b. REPLICA IDENTITY (FULL attendu pour observations/notifs) ---'
select c.relname, c.relreplident
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

\echo ''
\echo '============================================================='
\echo '11. STORAGE : BUCKETS ET REGLES'
\echo '============================================================='
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
order by id;

\echo ''
select policyname, cmd, roles::text, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;

\echo ''
\echo '--- 11b. OBJETS DEJA DEPOSES (apercu, 20 premiers) ---'
select bucket_id, name, metadata ->> 'size' as taille, created_at
from storage.objects
order by created_at desc
limit 20;

\echo ''
\echo '============================================================='
\echo '12. COLONNE photo_path / photos en base64 (diagnostic de migration)'
\echo '============================================================='
select count(*) as observations_total,
       count(photo_path) as avec_chemin_storage,
       count(photo) as avec_photo_base64
from public.observations;

\echo ''
\echo '============================================================='
\echo '13. NUMEROS DE SUIVI'
\echo '============================================================='
select count(*) as total,
       count(numero_suivi) as avec_numero,
       count(distinct numero_suivi) as numeros_distincts
from public.observations;

\echo ''
\echo '============================================================='
\echo ' FIN DE L AUDIT — aucune donnee modifiee.'
\echo '============================================================='