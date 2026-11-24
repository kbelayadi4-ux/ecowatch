-- ============================================================
-- Migration 012 : durcissement des privileges SQL
--
-- Constat (audit du 24/11/2026) : les migrations 001 a 011 corrigent la
-- RLS et les politiques, mais laissent intacts les privileges herites des
-- « default privileges » Supabase :
--
--   grant all on tables    to anon, authenticated, service_role
--   grant all on sequences to anon, authenticated, service_role
--
-- Consequence verifiable : un utilisateur authentifie, meme simple agent,
-- peut executer
--
--   truncate table public.agents, public.observations,
--                  public.notifs, public.observation_history;
--
-- et effacer la totalite des donnees. TRUNCATE n'est pas soumis a la RLS :
-- aucune politique ne peut l'empecher. De meme, `nextval()` sur les
-- sequences publiques est accessible directement, ce qui permet de
-- consommer les numeros de suivi et d'observer l'avancement.
--
-- Cette migration ne touche a aucun droit metier :
--   * SELECT / INSERT / UPDATE / DELETE accordes par 005, 009 et 011
--     restent inchanges ;
--   * les fonctions restent accessibles aux memes roles.
--
-- Elle ne retire que :
--   * TRUNCATE, REFERENCES, TRIGGER sur les tables publiques ;
--   * tout privilege sur les sequences de `public`.
--
-- Idempotente, non destructive, rejouable.
-- Prerequis : schema.sql + 001..011.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TRUNCATE, REFERENCES, TRIGGER
--    TRUNCATE contourne la RLS : c'est la faille principale.
--    REFERENCES permet d'ajouter une cle etrangere vers une table
--    que l'on ne maitrise pas ; TRIGGER permet d'y attacher un
--    declencheur. Aucun des trois n'a d'usage cote client.
-- ------------------------------------------------------------
revoke truncate on
  public.agents,
  public.observations,
  public.notifs,
  public.observation_history,
  public.signalement_public_abus
from anon, authenticated;

revoke references, trigger on
  public.agents,
  public.observations,
  public.notifs,
  public.observation_history,
  public.signalement_public_abus
from anon, authenticated;

-- ------------------------------------------------------------
-- 2. Sequences
--    `nextval()` direct consomme les numeros de suivi et permet de
--    sonder la sequence. Les fonctions qui en ont besoin sont
--    SECURITY DEFINER : elles s'executent avec les droits du
--    proprietaire et conservent l'acces.
-- ------------------------------------------------------------
revoke all on all sequences in schema public from anon, authenticated;

-- ------------------------------------------------------------
-- 3. current_agent_id()
--    002 l'a expose a PUBLIC. La fonction est SECURITY DEFINER :
--    elle doit rester reservee aux roles applicatifs.
-- ------------------------------------------------------------
revoke execute on function public.current_agent_id() from public;
revoke execute on function public.current_agent_id() from anon;
grant execute on function public.current_agent_id() to authenticated;

-- ------------------------------------------------------------
-- 4. Verification
-- ------------------------------------------------------------
do $verif012$
declare
  v_echecs text := '';
begin
  -- 4.1 Plus aucun TRUNCATE pour les roles applicatifs
  if has_table_privilege('authenticated', 'public.observations', 'truncate')
     or has_table_privilege('anon', 'public.observations', 'truncate')
     or has_table_privilege('authenticated', 'public.notifs', 'truncate')
     or has_table_privilege('authenticated', 'public.agents', 'truncate')
     or has_table_privilege('authenticated', 'public.observation_history', 'truncate') then
    v_echecs := v_echecs || E'\n  - TRUNCATE encore accorde';
  end if;

  -- 4.2 Plus aucun acces direct aux sequences
  if has_sequence_privilege('authenticated', 'public.observations_numero_seq', 'usage')
     or has_sequence_privilege('anon', 'public.observations_numero_seq', 'usage')
     or has_sequence_privilege('authenticated', 'public.notifs_statut_seq', 'usage') then
    v_echecs := v_echecs || E'\n  - USAGE sur sequence encore accorde';
  end if;

  -- 4.3 Les droits metiers restent en place
  if not has_table_privilege('authenticated', 'public.observations', 'select')
     or not has_table_privilege('authenticated', 'public.observations', 'insert')
     or not has_table_privilege('authenticated', 'public.agents', 'select')
     or not has_table_privilege('authenticated', 'public.notifs', 'update') then
    v_echecs := v_echecs || E'\n  - droits metiers perdus';
  end if;

  -- 4.4 La RPC publique reste utilisable par anon
  if not has_function_privilege('anon',
       'public.creer_signalement_public(text,text,text,text,text,text)', 'execute') then
    v_echecs := v_echecs || E'\n  - anon ne peut plus appeler creer_signalement_public()';
  end if;

  if v_echecs <> '' then
    raise exception '012: durcissement incomplet : %', v_echecs;
  end if;

  raise notice '012: privileges durcis (aucun TRUNCATE, aucune sequence accessible, RPC anon preservee)';
end $verif012$;