-- ============================================================
-- Audit en LECTURE SEULE de la base Supabase EcoWatch SCG
--
-- Ce script ne contient QUE des SELECT.
-- Aucun INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE,
-- GRANT, REVOKE ni TRUNCATE : il ne peut rien modifier.
-- Les seules commandes non-SQL présentes sont des commentaires SQL.
--
-- Mode d'emploi :
--   Supabase > SQL Editor > New query > coller ce fichier > Run
--   Lire les résultats section par section.
--
-- Remarques :
--   * Certaines sections portent sur des objets introduits par la
--     migration 009 (suivi) ou 010 (photos). Si l'objet n'existe pas,
--     la requête concernée renvoie une erreur « does not exist » :
--     c'est une information, pas une panne (voir le guide d'audit).
--   * Sections 15 et 16 : privilèges table/séquence et corps exact des
--     fonctions et déclencheurs (comparaison avec les fichiers 008 / 009).
--   * Pour voir l'état réel du schéma sans rien supposer :
--     section 2b (aperçu des colonnes de public.observations).
-- ============================================================

-- ------------------------------------------------------------
-- 0. CONTEXTE DE L'EXECUTION
-- ------------------------------------------------------------
select current_database() as base,
       current_user as utilisateur,
       version() as version_postgresql,
       now() as horodatage;


-- ============================================================
-- 1. MIGRATIONS APPLIQUEES
-- ============================================================
-- Attention : le SQL Editor du dashboard n'enregistre pas les
-- migrations. Si cette table est vide ou absente, ce n'est pas
-- bloquant : l'etat reel se lit aux sections 2 a 5.
select version, name
from supabase_migrations.schema_migrations
order by version;

-- Si la table existe avec une colonne `statements`, on peut l'afficher :
--   select version, name, statements
--   from supabase_migrations.schema_migrations
--   order by version;


-- ============================================================
-- 2. OBJETS DE PUBLIC (tables, vues, colonnes)
-- ============================================================
select table_name,
       string_agg(
         column_name || ' ' || data_type ||
         case when is_nullable = 'NO' then ' NOT NULL' else '' end,
         ', ' order by ordinal_position
       ) as colonnes
from information_schema.columns
where table_schema = 'public'
group by table_name
order by table_name;


-- 2b. APERCU EXACT DES COLONNES DE observations
--     (resultat vide en apparence, mais les en-tetes de colonnes
--      donnent l'etat reel du schema de la table)
select * from public.observations limit 0;


-- 2c. PRESENCE DES COLONNES AJOUTEES PAR LA MIGRATION 009
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'observations'
  and column_name in ('numero_suivi', 'statut', 'priorite', 'assigne_a',
                      'echeance', 'date_cloture', 'maj_le', 'photo_path')
order by column_name;


-- 2d. TABLE D'HISTORIQUE (creee par 009)
select to_regclass('public.observation_history') as table_historique;


-- ============================================================
-- 3. POLITIQUES RLS PAR TABLE
-- ============================================================
select tablename, policyname, cmd, roles::text as roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;


-- 3b. POLITIQUES PERMISSIVES RESIDUELLES (doit etre VIDE)
--     Une politique `using (true)` ou `with check (true)` est
--     combinee par un OU logique avec les politiques de securite
--     et les neutralise.
select tablename, policyname, qual, with_check
from pg_policies
where schemaname = 'public'
  and (qual = 'true' or with_check = 'true');


-- 3c. RLS ACTIVEE (toutes les tables de donnees doivent etre a true)
select c.relname as table_name,
       c.relrowsecurity as rls_activee,
       c.relforcerowsecurity as rls_forcee
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;


-- 3d. POLITIQUES D'INSERTION PAR TABLE (agents doit etre a 0)
select tablename,
       count(*) filter (where cmd = 'INSERT') as politiques_insert,
       count(*) filter (where cmd = 'ALL') as politiques_all
from pg_policies
where schemaname = 'public'
group by tablename
order by tablename;


-- ============================================================
-- 4. FONCTIONS DE SECURITE
-- ============================================================
select p.proname as fonction,
       pg_get_function_identity_arguments(p.oid) as signature,
       p.prosecdef as security_definer,
       p.proconfig as configuration,
       has_function_privilege('anon', p.oid, 'execute') as execute_par_anon,
       has_function_privilege('authenticated', p.oid, 'execute') as execute_par_authenticated
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_admin', 'current_agent_id', 'current_agent_role',
                    'admin_set_role', 'admin_update_observation',
                    'obs_impose_agent', 'obs_journalise', 'obs_notifie_statut')
order by p.proname;

-- 4b. ALLER PLUS LOIN : toute fonction SECURITY DEFINER du schema public
--     (doit etre exhaustive et justifiee)
select p.proname as fonction,
       pg_get_function_identity_arguments(p.oid) as signature,
       p.proconfig as configuration
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by p.proname;


-- ============================================================
-- 5. TRIGGERS
-- ============================================================
select c.relname as table_name,
       t.tgname as trigger,
       p.proname as fonction
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'auth') and not t.tgisinternal
order by n.nspname, c.relname, t.tgname;


-- ============================================================
-- 6. CONTRAINTES (cles etrangeres, uniques, checks)
-- ============================================================
select conrelid::regclass::text as table_name,
       conname,
       case contype when 'f' then 'cle_etrangere'
                    when 'u' then 'unique'
                    when 'c' then 'check'
                    else contype::text end as type,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
  and contype in ('f', 'u', 'c')
order by 1, 3, conname;


-- ============================================================
-- 7. COMPTES AGENTS SANS auth_user_id
-- ============================================================
select id, telephone, nom, role, auth_user_id
from public.agents
where auth_user_id is null
order by telephone;


-- 7b. COHERENCE AGENTS / AUTH
select a.id as agent_id,
       a.telephone,
       a.role,
       a.auth_user_id,
       u.phone as auth_phone,
       u.email as auth_email
from public.agents a
left join auth.users u on u.id = a.auth_user_id
order by a.role, a.telephone;


-- 7c. COMPTES AUTH SANS PROFIL AGENT
select u.id, u.phone, u.email, u.created_at
from auth.users u
left join public.agents a on a.auth_user_id = u.id
where a.id is null
order by u.created_at desc;


-- 7d. DOUBLONS DE LIAISON (un compte Auth lie a deux agents)
select auth_user_id, count(*) as nb_agents
from public.agents
where auth_user_id is not null
group by auth_user_id
having count(*) > 1;


-- ============================================================
-- 8. UTILISATEURS SUPABASE AUTH
-- ============================================================
select id,
       phone,
       email,
       role as auth_role,
       raw_app_meta_data ->> 'role' as app_metadata_role,
       last_sign_in_at,
       created_at
from auth.users
order by created_at desc
limit 50;

-- 8b. COHERENCE DU CACHE DE ROLE
--     app_metadata.role n'est qu'un cache : il peut diverger de
--     agents.role sans consequence sur les droits.
select a.telephone,
       a.role as role_agent,
       u.raw_app_meta_data ->> 'role' as role_cache_auth
from public.agents a
left join auth.users u on u.id = a.auth_user_id
where a.auth_user_id is not null
  and coalesce(u.raw_app_meta_data ->> 'role', '') <> a.role
order by a.telephone;


-- ============================================================
-- 9. VOLUMES DE DONNEES
-- ============================================================
select 'agents' as table_name, count(*) as lignes from public.agents
union all
select 'observations', count(*) from public.observations
union all
select 'notifs', count(*) from public.notifs
union all
select 'observation_history', count(*) from public.observation_history;


-- 9b. INTEGRITE : observations sans agent valide
select count(*) as observations_orphelines
from public.observations o
left join public.agents a on a.id = o.agent_id
where a.id is null;

-- 9c. INTEGRITE : notifications sans observation
select count(*) as notifs_orphelines
from public.notifs n
left join public.observations o on o.id = n.obs_id
where o.id is null;

-- 9d. INTEGRITE : observations sans numero de suivi (attendu 0 apres 009)
select count(*) as sans_numero
from public.observations
where numero_suivi is null or btrim(numero_suivi) = '';


-- ============================================================
-- 10. PUBLICATION REALTIME
-- ============================================================
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;

-- 10b. REPLICA IDENTITY (FULL attendu sur observations et notifs)
select c.relname as table_name, c.relreplident as replica_identity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;


-- ============================================================
-- 11. STORAGE : BUCKETS ET REGLES
-- ============================================================
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
order by id;

-- 11b. POLITIQUES DU BUCKET
select policyname, cmd, roles::text as roles, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;

-- 11c. OBJETS DEJA DEPOSES (apercu)
select bucket_id, name, metadata ->> 'size' as taille, created_at
from storage.objects
order by created_at desc
limit 20;


-- ============================================================
-- 12. DIAGNOSTIC PHOTOS (base64 vs Storage)
--     Necessite la migration 009 (colonne photo_path).
-- ============================================================
select count(*) as observations_total,
       count(photo_path) as avec_chemin_storage,
       count(photo) as avec_photo_base64
from public.observations;


-- ============================================================
-- 13. NUMEROS DE SUIVI
--     Necessite la migration 009.
-- ============================================================
select count(*) as total,
       count(numero_suivi) as avec_numero,
       count(distinct numero_suivi) as numeros_distincts
from public.observations;


-- ============================================================
-- 14. REPARTITION PAR STATUT / PRIORITE (apres 009)
--     Necessite la migration 009.
-- ============================================================
select statut, priorite, count(*) as observations
from public.observations
group by statut, priorite
order by statut, priorite;


-- ============================================================
-- ============================================================
-- 15. PRIVILEGES SUR LES TABLES DE DONNEES
--     Attendu : SELECT/INSERT/UPDATE/DELETE pour authenticated,
--     aucun privilege d ecriture pour anon.
-- ============================================================
select table_name, grantee, string_agg(distinct privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;

-- 15b. PRIVILEGES SUR LES SEQUENCES
select sequence_name, grantee, string_agg(distinct privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_usage_grants
where object_schema = 'public'
  and object_type = 'SEQUENCE'
  and grantee in ('anon', 'authenticated')
group by sequence_name, grantee
order by sequence_name, grantee;


-- ============================================================
-- 16. CORPS EXACT DES FONCTIONS CLES
--     A comparer avec les fichiers 008 / 009 du depot :
--     empreinte md5 rapide, puis pg_get_functiondef pour le diff.
-- ============================================================
select p.proname,
       md5(pg_get_functiondef(p.oid)) as empreinte_md5,
       pg_get_function_result(p.oid) as valeur_retour,
       p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('admin_set_role', 'admin_update_observation', 'obs_impose_agent',
                    'is_admin', 'current_agent_role')
order by p.proname;

-- 16b. TRIGGERS DE SUIVI ET DE NOTIFICATION
select c.relname as table_name, t.tgname as trigger_name, pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and not t.tgisinternal
  and c.relname in ('observations', 'notifs', 'agents', 'observation_history')
order by c.relname, t.tgname;


-- ============================================================
-- FIN DE L'AUDIT — aucune donnee modifiee.
-- ============================================================
