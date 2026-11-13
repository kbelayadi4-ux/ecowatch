-- ============================================================
-- Migration 009 : suivi complet des observations
-- Ajoute le cycle de traitement (statut, priorite, affectation,
-- echeance), la tracabilite (historique) et durcit l'insertion
-- cote serveur (identite de l'agent imposee par la base).
--
-- Non destructif : aucune donnee supprimee, aucune colonne renommee.
-- Idempotent : rejouable sans effet de bord.
-- Prerequis : schema.sql, 001..008 appliques.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Sequence du numero de suivi
-- ------------------------------------------------------------
create sequence if not exists public.observations_numero_seq start 1;
create sequence if not exists public.notifs_statut_seq start 1;

-- ------------------------------------------------------------
-- 2. Colonnes de suivi
-- ------------------------------------------------------------
alter table public.observations
  add column if not exists numero_suivi text,
  add column if not exists statut text not null default 'nouvelle',
  add column if not exists priorite text not null default 'normale',
  add column if not exists assigne_a text references public.agents(id) on delete set null,
  add column if not exists echeance timestamptz,
  add column if not exists date_cloture timestamptz,
  add column if not exists maj_le timestamptz not null default now(),
  add column if not exists photo_path text;

-- Contraintes de domaine : posees a part car ADD COLUMN IF NOT EXISTS ne
-- peut pas porter de CHECK, et une contrainte deja presente est conservee.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'observations_statut_check'
      and conrelid = 'public.observations'::regclass
  ) then
    alter table public.observations
      add constraint observations_statut_check
      check (statut in ('nouvelle', 'en_analyse', 'action_en_cours', 'attente_verification', 'cloturee'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'observations_priorite_check'
      and conrelid = 'public.observations'::regclass
  ) then
    alter table public.observations
      add constraint observations_priorite_check
      check (priorite in ('basse', 'normale', 'haute', 'critique'));
  end if;
end $$;

-- ------------------------------------------------------------
-- 3. Identite de l'agent imposee par la base (avant insertion)
--    Un client ne peut pas usurper l'identite d'un autre agent :
--    agent_nom et agent_telephone sont relus depuis public.agents.
-- ------------------------------------------------------------
create or replace function public.obs_impose_agent()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_nom text;
  v_tel text;
begin
  select nom, telephone into v_nom, v_tel
  from public.agents
  where id = new.agent_id
  limit 1;

  if v_nom is null then
    raise exception 'agent % introuvable pour cette observation', new.agent_id
      using errcode = '23503';
  end if;

  new.agent_nom := v_nom;
  new.agent_telephone := v_tel;

  if new.numero_suivi is null or btrim(new.numero_suivi) = '' then
    new.numero_suivi :=
      'SCG-' || to_char(now() at time zone 'Africa/Tunis', 'YYYYMMDD') || '-'
      || lpad(nextval('public.observations_numero_seq')::text, 5, '0');
  end if;

  if new.statut is null then
    new.statut := 'nouvelle';
  end if;

  if new.statut = 'cloturee' and new.date_cloture is null then
    new.date_cloture := now();
  end if;

  new.maj_le := now();
  return new;
end;
$$;

drop trigger if exists trg_obs_impose_agent on public.observations;
create trigger trg_obs_impose_agent
before insert or update of statut, priorite, assigne_a, echeance
on public.observations
for each row execute function public.obs_impose_agent();

-- ------------------------------------------------------------
-- 4. Historique des interventions
-- ------------------------------------------------------------
create table if not exists public.observation_history (
  id bigint generated always as identity primary key,
  observation_id text references public.observations(id) on delete set null,
  observation_identifiant text not null,
  action text not null check (action in ('creation', 'modification', 'suppression')),
  auteur_id text,
  auteur_nom text,
  auteur_role text,
  resume text,
  avant jsonb,
  apres jsonb,
  cree_le timestamptz not null default now()
);

create index if not exists idx_obs_history_obs_id
  on public.observation_history (observation_id, cree_le desc);
create index if not exists idx_obs_history_identifiant
  on public.observation_history (observation_identifiant, cree_le desc);

alter table public.observation_history enable row level security;

-- Ecriture : uniquement par la fonction ci-dessous (SECURITY DEFINER).
drop policy if exists "obs_history_system_insert" on public.observation_history;
create policy "obs_history_system_insert" on public.observation_history
for insert to authenticated
with check (false);

-- Lecture : l'agent concerne et l'administrateur.
drop policy if exists "obs_history_read_own_or_admin" on public.observation_history;
create policy "obs_history_read_own_or_admin" on public.observation_history
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.observations o
    where o.id = observation_history.observation_identifiant
      and o.agent_id = public.current_agent_id()
  )
);

revoke all on public.observation_history from anon;
revoke insert, update, delete on public.observation_history from authenticated;
grant select on public.observation_history to authenticated;
grant all on public.observation_history to service_role;

-- ------------------------------------------------------------
-- 5. Journalisation automatique
-- ------------------------------------------------------------
create or replace function public.obs_journalise()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_auteur_id text;
  v_auteur_nom text;
  v_auteur_role text;
  v_avant jsonb;
  v_apres jsonb;
  v_resume text;
  v_changements text[] := '{}';
begin
  v_auteur_id := auth.uid()::text;
  if v_auteur_id is null then
    v_auteur_id := 'systeme';
  end if;

  begin
    select nom, role into v_auteur_nom, v_auteur_role
    from public.agents
    where auth_user_id = auth.uid()
    limit 1;
  exception when others then
    v_auteur_nom := null;
    v_auteur_role := null;
  end;

  if v_auteur_nom is null then
    v_auteur_nom := 'Système';
    v_auteur_role := 'systeme';
  end if;

  if tg_op = 'DELETE' then
    insert into public.observation_history (observation_id, observation_identifiant, action, auteur_id, auteur_nom, auteur_role, resume, avant)
    values (null, old.id, 'suppression', v_auteur_id, v_auteur_nom, v_auteur_role,
            'Observation supprimée', to_jsonb(old));
    return old;
  end if;

  if tg_op = 'INSERT' then
    insert into public.observation_history (observation_id, observation_identifiant, action, auteur_id, auteur_nom, auteur_role, resume, apres)
    values (new.id, new.id, 'creation', v_auteur_id, v_auteur_nom, v_auteur_role,
            'Observation créée', to_jsonb(new));
    return new;
  end if;

  -- UPDATE
  v_avant := to_jsonb(old);
  v_apres := to_jsonb(new);

  if old.statut is distinct from new.statut then
    v_changements := array_append(v_changements, 'statut: ' || coalesce(old.statut, '∅') || ' → ' || coalesce(new.statut, '∅'));
  end if;
  if old.priorite is distinct from new.priorite then
    v_changements := array_append(v_changements, 'priorité: ' || coalesce(old.priorite, '∅') || ' → ' || coalesce(new.priorite, '∅'));
  end if;
  if old.assigne_a is distinct from new.assigne_a then
    v_changements := array_append(v_changements, 'responsable modifié');
  end if;
  if old.echeance is distinct from new.echeance then
    v_changements := array_append(v_changements, 'échéance modifiée');
  end if;

  if array_length(v_changements, 1) is null then
    return new;
  end if;

  v_resume := array_to_string(v_changements, ' • ');

  insert into public.observation_history (observation_id, observation_identifiant, action, auteur_id, auteur_nom, auteur_role, resume, avant, apres)
  values (new.id, new.id, 'modification', v_auteur_id, v_auteur_nom, v_auteur_role, v_resume, v_avant, v_apres);

  return new;
end;
$$;

drop trigger if exists trg_obs_journal on public.observations;
create trigger trg_obs_journal
after insert or update or delete on public.observations
for each row execute function public.obs_journalise();

-- ------------------------------------------------------------
-- ------------------------------------------------------------
-- 5b. Insertion pour le compte d'un autre agent : administrateur uniquement.
--     L'agent ne peut insérer que pour lui-même (obs_insert_own, migration 005).
-- ------------------------------------------------------------
drop policy if exists "obs_insert_admin" on public.observations;
create policy "obs_insert_admin" on public.observations
for insert to authenticated
with check (public.is_admin());

-- ------------------------------------------------------------
-- 6. Notification a l'agent lors d'un changement de statut
-- ------------------------------------------------------------
create or replace function public.obs_notifie_statut()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_id text;
begin
  if tg_op = 'UPDATE' and old.statut is distinct from new.statut and new.statut <> 'nouvelle' then
    -- Identifiant unique : deux changements de statut dans la meme seconde
    -- produisent deux notifications distinctes.
    v_id := 'ns-' || new.id || '-' || nextval('public.notifs_statut_seq');

    insert into public.notifs (id, obs_id, agent_nom, type_probleme, zone, date_creation, lu)
    values (v_id, new.id, new.agent_nom, new.type_probleme, new.zone, now(), false);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_obs_notifie_statut on public.observations;
create trigger trg_obs_notifie_statut
after update of statut on public.observations
for each row execute function public.obs_notifie_statut();

-- ------------------------------------------------------------
-- 7. Mise a jour du suivi reservee a l'administrateur
-- ------------------------------------------------------------
create or replace function public.admin_update_observation(
  p_id text,
  p_statut text default null,
  p_priorite text default null,
  p_assigne_a text default null,
  p_echeance timestamptz default null,
  p_commentaire text default null,
  p_effacer_echeance boolean default false
)
returns public.observations
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_obs public.observations;
  v_role text;
  v_desaffecter boolean := p_assigne_a is not null and btrim(p_assigne_a) = '';
begin
  if auth.uid() is null then
    raise exception 'authentification requise' using errcode = '28000';
  end if;

  if not public.is_admin() then
    raise exception 'reserve a l''administrateur' using errcode = '42501';
  end if;

  if p_statut is not null and p_statut not in ('nouvelle', 'en_analyse', 'action_en_cours', 'attente_verification', 'cloturee') then
    raise exception 'statut invalide: %', p_statut using errcode = '22023';
  end if;

  if p_priorite is not null and p_priorite not in ('basse', 'normale', 'haute', 'critique') then
    raise exception 'priorite invalide: %', p_priorite using errcode = '22023';
  end if;

  -- Chaine vide : desaffectation explicite. Toute autre valeur doit
  -- correspondre a un agent existant.
  if p_assigne_a is not null and not v_desaffecter then
    select role into v_role from public.agents where id = p_assigne_a;
    if v_role is null then
      raise exception 'responsable % introuvable', p_assigne_a using errcode = 'P0002';
    end if;
  end if;

  update public.observations
     set statut = coalesce(p_statut, statut),
         priorite = coalesce(p_priorite, priorite),
         assigne_a = case
           when v_desaffecter then null
           when p_assigne_a is null then assigne_a
           else p_assigne_a
         end,
         echeance = case
           when p_effacer_echeance then null
           else coalesce(p_echeance, echeance)
         end,
         commentaire = case
           when p_commentaire is null or btrim(p_commentaire) = '' then commentaire
           when commentaire is null or btrim(commentaire) = '' then btrim(p_commentaire)
           else commentaire || E'\n[' || to_char(now() at time zone 'Africa/Tunis', 'DD/MM/YYYY HH24:MI') || '] ' || btrim(p_commentaire)
         end,
         date_cloture = case
           when coalesce(p_statut, statut) = 'cloturee' then coalesce(date_cloture, now())
           else null
         end,
         maj_le = now()
   where id = p_id
   returning * into v_obs;

  if v_obs.id is null then
    raise exception 'observation % introuvable', p_id using errcode = 'P0002';
  end if;

  return v_obs;
end;
$$;

revoke all on function public.admin_update_observation(text, text, text, text, timestamptz, text, boolean) from public;
revoke all on function public.admin_update_observation(text, text, text, text, timestamptz, text, boolean) from anon;
grant execute on function public.admin_update_observation(text, text, text, text, timestamptz, text, boolean) to authenticated;

-- ------------------------------------------------------------
-- 8. Index de service
-- ------------------------------------------------------------
create index if not exists idx_observations_statut on public.observations (statut);
create index if not exists idx_observations_priorite on public.observations (priorite);
create index if not exists idx_observations_assigne_a on public.observations (assigne_a);
create index if not exists idx_observations_echeance on public.observations (echeance);
create index if not exists idx_observations_numero on public.observations (numero_suivi);

-- ------------------------------------------------------------
-- 8b. Numeros de suivi : attribution aux observations anterieures
--     puis unicite garantie.
--     Les observations deja enregistrees n'avaient pas de numero : on leur
--     en attribue un, dans l'ordre chronologique, sans toucher au reste.
-- ------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select id, date_creation
    from public.observations
    where numero_suivi is null
    order by date_creation asc, id asc
  loop
    update public.observations
       set numero_suivi =
             'SCG-' || to_char(coalesce(r.date_creation, now()) at time zone 'Africa/Tunis', 'YYYYMMDD')
             || '-' || lpad(nextval('public.observations_numero_seq')::text, 5, '0')
     where id = r.id;
  end loop;
end $$;

-- Unicite : un numero de suivi ne peut pas etre duplique.
create unique index if not exists idx_observations_numero_uniq
  on public.observations (numero_suivi);

-- Realtime : les nouvelles colonnes doivent etre diffusees.
do $$
begin
  begin
    alter publication supabase_realtime add table public.observation_history;
  exception when duplicate_object then
    null;
  end;
end $$;

alter table public.observations replica identity full;

-- ------------------------------------------------------------
-- 9. Verification finale
-- ------------------------------------------------------------
do $$
declare
  v_manquantes text;
  v_trigger int;
begin
  select string_agg(c, ', ') into v_manquantes
  from (values ('statut'), ('priorite'), ('assigne_a'), ('echeance'), ('numero_suivi'), ('photo_path')) as t(c)
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'observations' and column_name = t.c
  );

  if v_manquantes is not null then
    raise exception '009: colonnes manquantes: %', v_manquantes;
  end if;

  select count(*) into v_trigger
  from pg_trigger
  where not tgisinternal
    and tgrelid = 'public.observations'::regclass
    and tgname in ('trg_obs_impose_agent', 'trg_obs_journal', 'trg_obs_notifie_statut');

  if v_trigger < 3 then
    raise exception '009: % trigger(s) de suivi manquant(s) sur observations', 3 - v_trigger;
  end if;

  raise notice '009: suivi operationnel (statut, priorite, affectation, echeance, historique)';
end $$;