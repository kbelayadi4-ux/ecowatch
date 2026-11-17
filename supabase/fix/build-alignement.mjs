// ============================================================
// Generateur du script correctif transactionnel EcoWatch.
//
// Concatene schema.sql + migrations 001..011 dans un unique
// script SQL, encadre par BEGIN/COMMIT, et termine par un bloc
// de verification qui annule tout en cas d'ecart.
//
// Le script genere peut donc etre copie-colle tel quel dans le
// SQL Editor Supabase : soit tout passe, soit rien n'est applique.
//
// Usage : bun run supabase/fix/build-alignement.mjs
// Sortie : supabase/fix/alignement-eco-watch.sql
// ============================================================
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8").replace(/\s+$/, "");

const ETAPES = [
  ["schema.sql", "supabase/schema.sql", "Structure de base (deja appliquee : no-op)"],
  ["001", "supabase/migrations/001_add_auth_link.sql", "Liaison agents.auth_user_id"],
  ["002", "supabase/migrations/002_auth_helpers.sql", "is_admin, current_agent_id, trigger de notification"],
  ["003", "supabase/migrations/003_secure_rls.sql", "Politiques RLS sur auth.uid()"],
  ["004", "supabase/migrations/004_realtime.sql", "Publication Realtime + REPLICA IDENTITY"],
  ["005", "supabase/migrations/005_secure_cleanup.sql", "Purge des politiques permissives + politiques cibles"],
  ["006", "supabase/migrations/006_agent_signup_trigger.sql", "Creation du profil agent apres OTP"],
  ["007", "supabase/migrations/007_fix_admin_notifications.sql", "Marquage lu des notifications par l'admin"],
  ["008", "supabase/migrations/008_unify_admin_roles.sql", "is_admin() aligne sur agents.role"],
  ["009", "supabase/migrations/009_suivi_observations.sql", "Statut, priorite, affectation, echeance, historique"],
  ["010", "supabase/migrations/010_storage_photos.sql", "Bucket prive photos"],
  ["011", "supabase/migrations/011_signalement_public.sql", "RPC de signalement public + champs operateur"],
];

const EN_TETE = `-- ============================================================
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
`;

const VERIFICATION = `
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
    v_echecs := v_echecs || E'\n  - colonnes absentes : ' || v_manquant;
  end if;

  -- 12.2 Tables de service
  select string_agg(t, ', ') into v_manquant
  from (values ('observation_history'), ('signalement_public_abus')) as s(t)
  where not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = s.t
  );

  if v_manquant is not null then
    v_echecs := v_echecs || E'\n  - tables absentes : ' || v_manquant;
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
    v_echecs := v_echecs || E'\n  - fonctions absentes : ' || v_manquant;
  end if;

  -- 12.4 is_admin() ne doit plus dependre du JWT
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_admin'
      and (position('auth.jwt' in pg_get_functiondef(p.oid)) > 0
           or position('agents' in pg_get_functiondef(p.oid)) = 0)
  ) then
    v_echecs := v_echecs || E'\n  - is_admin() ne lit pas agents.role';
  end if;

  -- 12.5 creer_signalement_public doit etre SECURITY DEFINER
  select prosecdef into v_secdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'creer_signalement_public';

  if v_secdef is not true then
    v_echecs := v_echecs || E'\n  - creer_signalement_public() n''est pas SECURITY DEFINER';
  end if;

  -- 12.6 RLS activee
  select string_agg(relname, ', ') into v_manquant
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('agents', 'observations', 'notifs', 'observation_history', 'signalement_public_abus')
    and not c.relrowsecurity;

  if v_manquant is not null then
    v_echecs := v_echecs || E'\n  - RLS desactivee sur : ' || v_manquant;
  end if;

  -- 12.7 Aucune politique permissive residuelle
  select string_agg(tablename || '.' || policyname, ', ') into v_manquant
  from pg_policies
  where schemaname = 'public'
    and tablename in ('agents', 'observations', 'notifs', 'observation_history', 'signalement_public_abus')
    and (qual = 'true' or with_check = 'true');

  if v_manquant is not null then
    v_echecs := v_echecs || E'\n  - politiques permissives : ' || v_manquant;
  end if;

  -- 12.8 Declencheurs de suivi
  select count(*) into v_nb
  from pg_trigger
  where not tgisinternal
    and tgrelid = 'public.observations'::regclass
    and tgname in ('trg_obs_impose_agent', 'trg_obs_journal', 'trg_obs_notifie_statut');

  if v_nb <> 3 then
    v_echecs := v_echecs || E'\n  - declencheurs de suivi : ' || v_nb || '/3';
  end if;

  -- 12.9 Le role anonyme ne doit rien pouvoir lire
  if has_table_privilege('anon', 'public.observations', 'select') then
    v_echecs := v_echecs || E'\n  - anon conserve un SELECT sur observations';
  end if;

  if has_table_privilege('anon', 'public.observations', 'insert') then
    v_echecs := v_echecs || E'\n  - anon conserve un INSERT sur observations';
  end if;

  -- 12.10 Le role anonyme doit pouvoir appeler la RPC
  if not has_function_privilege(
       'anon',
       'public.creer_signalement_public(text,text,text,text,text,text)',
       'execute') then
    v_echecs := v_echecs || E'\n  - anon ne peut pas appeler creer_signalement_public()';
  end if;

  -- 12.11 Realtime
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'observations'
  ) then
    v_echecs := v_echecs || E'\n  - observations absente de la publication supabase_realtime';
  end if;

  if v_echecs <> '' then
    raise exception 'Alignement incomplet : %', v_echecs;
  end if;

  raise notice 'Alignement verifie : schema complet, RLS active, aucune lecture publique.';
end $verif$;

commit;

`;

const morceaux = [EN_TETE];

for (const [id, chemin, role] of ETAPES) {
  morceaux.push(`-- ============================================================
-- ETAPE ${id} — ${role}
-- Fichier source : ${chemin}
-- ============================================================
${read(chemin)}
`);
}

morceaux.push(VERIFICATION);

const sortie = morceaux.join("\n");

writeFileSync(join(root, "supabase/fix/alignement-eco-watch.sql"), sortie, "utf8");

const lignes = sortie.split("\n").length;
console.log(`Genere : supabase/fix/alignement-eco-watch.sql (${lignes} lignes)`);