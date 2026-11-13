-- ============================================================
-- Migration 010 : bucket prive pour les photographies
--
-- Objectif : ne plus stocker les photos en base64 dans la table
-- `observations` (colonne `photo` conservee pour compatibilite).
-- Les images sont deposees dans Supabase Storage, bucket prive,
-- avec des regles alignees sur la RLS metier.
--
-- Chemin d'un objet : <agent_id>/<observation_id>.jpg
--
-- La migration est volontairement tolérante : sur une base sans le
-- schema `storage` (environnement de test local, PGlite), elle se
-- contente d'un message d'information.
-- ============================================================

do $$
begin
  -- ------------------------------------------------------------
  -- 1. Creation du bucket
  -- ------------------------------------------------------------
  if to_regclass('storage.buckets') is null then
    raise notice '010: schema storage absent, bucket non cree (environnement local)';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
     set public = false,
         file_size_limit = 5242880,
         allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

  -- ------------------------------------------------------------
  -- 2. Regles d'acces sur storage.objects
  -- ------------------------------------------------------------
  -- Lecture : l'agent proprietaire du dossier, ou l'administrateur.
  drop policy if exists "photos_read_own_or_admin" on storage.objects;
  create policy "photos_read_own_or_admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = public.current_agent_id()::text
    )
  );

  -- Depot : uniquement dans son propre dossier.
  drop policy if exists "photos_insert_own" on storage.objects;
  create policy "photos_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = public.current_agent_id()::text
  );

  -- Mise a jour / suppression : administrateur uniquement.
  drop policy if exists "photos_update_admin" on storage.objects;
  create policy "photos_update_admin" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and public.is_admin())
  with check (bucket_id = 'photos' and public.is_admin());

  drop policy if exists "photos_delete_admin" on storage.objects;
  create policy "photos_delete_admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and public.is_admin());

  raise notice '010: bucket prive photos pret (lecture proprietaire/admin, depot proprietaire)';

exception
  when undefined_object then
    raise notice '010: schema storage indisponible, politiques non creees';
  when insufficient_privilege then
    raise notice '010: privileges insuffisants pour configurer le bucket photos';
end $$;

-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
do $$
declare
  v_bucket int;
begin
  if to_regclass('storage.buckets') is null then
    raise notice '010: verification ignoree (pas de schema storage)';
    return;
  end if;

  select count(*) into v_bucket from storage.buckets where id = 'photos';
  if v_bucket = 1 then
    raise notice '010: bucket photos present et prive';
  else
    raise notice '010: bucket photos absent (a creer manuellement si besoin)';
  end if;
end $$;