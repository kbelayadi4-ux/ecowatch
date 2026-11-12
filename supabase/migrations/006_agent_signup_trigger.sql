-- ============================================================
-- Migration 006 : creation automatique du profil agent apres OTP
--
-- Constat (audit du 12/11/2026) : signUpAgent() cree un utilisateur
-- dans auth.users mais aucune ligne dans public.agents. Apres un code
-- OTP valide, getCurrentAgent() ne trouve rien et l'agent reste bloque
-- sur l'ecran de connexion.
--
-- Solution : un trigger AFTER INSERT sur auth.users cree ou relie la
-- ligne `agents` correspondante, avec le role 'agent' impose par le serveur.
--
-- Idempotent, non destructif, aucune donnee supprimee.
-- ============================================================

-- gen_random_uuid() est natif depuis PostgreSQL 13. On charge pgcrypto
-- uniquement s'il est disponible (Supabase l'inclut ; certains environnements
-- de test ne l'exposent pas).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pgcrypto') then
    execute 'create extension if not exists pgcrypto';
  end if;
end $$;

-- ------------------------------------------------------------
-- 1. Fonction de creation / liaison du profil agent
-- ------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tel      text;
  v_nom      text;
  v_agent_id text;
begin
  -- Telephone en E.164 -> format historique local (sans +216)
  v_tel := nullif(regexp_replace(coalesce(new.phone, ''), '^\+216', ''), '');

  -- Nom issu des metadata d'inscription. Le role n'est JAMAIS lu ici :
  -- il est force a 'agent' par le serveur.
  v_nom := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'nom', '')), '');

  -- Pas de telephone exploitable : on ne cree pas de profil.
  -- (La connexion echouera proprement, sans corrompre la table agents.)
  if v_tel is null then
    return new;
  end if;

  -- Cas 1 : un agent existe deja avec ce telephone (donnees historiques
  -- localStorage ou migration). On le relie au compte Auth, sans jamais
  -- modifier son role.
  select id into v_agent_id
  from public.agents
  where telephone = v_tel
  limit 1;

  if v_agent_id is not null then
    update public.agents
       set auth_user_id = new.id
     where id = v_agent_id
       and auth_user_id is null;
    return new;
  end if;

  -- Cas 2 : nouvelle inscription. Role impose 'agent'.
  insert into public.agents (id, auth_user_id, telephone, nom, role)
  values (
    'agt-' || replace(gen_random_uuid()::text, '-', ''),
    new.id,
    v_tel,
    coalesce(v_nom, 'Agent ' || v_tel),
    'agent'
  );

  return new;

exception
  when unique_violation then
    -- Course entre deux inscriptions simultanees : on tente la liaison.
    update public.agents
       set auth_user_id = new.id
     where telephone = v_tel
       and auth_user_id is null;
    return new;
end;
$$;

-- ------------------------------------------------------------
-- 2. Droits d'execution : Auth uniquement
-- ------------------------------------------------------------
revoke all on function public.handle_new_auth_user() from public;
revoke all on function public.handle_new_auth_user() from anon;
revoke all on function public.handle_new_auth_user() from authenticated;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.handle_new_auth_user() to supabase_auth_admin;

-- ------------------------------------------------------------
-- 3. Trigger
-- ------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

-- ------------------------------------------------------------
-- 4. Verification : le trigger existe et est actif
-- ------------------------------------------------------------
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'auth'
    and c.relname = 'users'
    and t.tgname = 'on_auth_user_created'
    and not t.tgisinternal;

  if v_count = 0 then
    raise exception '006: trigger on_auth_user_created absent sur auth.users';
  end if;

  raise notice '006: trigger d''inscription agent operationnel';
end $$;