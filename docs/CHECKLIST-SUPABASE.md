# Checklist Supabase — avant pilote

Audit en **lecture seule** de la base de production. Aucune commande de cet
document ne modifie de donnée.

> **État de l'audit** : ce document décrit la procédure et les résultats
> attendus. L'audit réel de l'instance Supabase **n'a pas pu être exécuté** lors
> de la préparation : aucun identifiant de projet (`SUPABASE_URL`, clé de
> service, accès dashboard) n'était disponible dans l'environnement de travail.
> Les cases non confirmées restent donc **à cocher** après exécution.

## Mode opératoire

1. Ouvrir le projet Supabase → *SQL Editor* → *New query*.
2. Coller le contenu de `supabase/audit/audit-lecture-seule.sql`.
3. Exécuter, puis cocher chaque section ci-dessous en comparant au résultat
   attendu.

## 1. Migrations appliquées

| Attendu | À vérifier |
| --- | --- |
| `001_add_auth_link` | présent |
| `002_auth_helpers` | présent |
| `003_secure_rls` | présent |
| `004_realtime` | présent |
| `005_secure_cleanup` | présent |
| `006_agent_signup_trigger` | présent |
| `007_fix_admin_notifications` | présent |
| `008_unify_admin_roles` | présent |
| `009_suivi_observations` | présent |
| `010_storage_photos` | présent |

- [ ] Les 10 versions apparaissent dans `supabase_migrations.schema_migrations`.
- [ ] Aucune migration `005`–`008` n'a été rejouée (une seule ligne par version).

> Si une migration manque : **ne pas la rejouer à l'aveugle**. Comparer d'abord
> l'état réel (sections 2, 3, 4, 5) avec ce que la migration est censée
> produire, puis appliquer la migration manquante (elle est idempotente).

## 2. Tables et colonnes

- [ ] `public.agents` : `id`, `telephone`, `nom`, `role`, `auth_user_id`.
- [ ] `public.observations` : colonnes de base **+** `numero_suivi`, `statut`,
      `priorite`, `assigne_a`, `echeance`, `date_cloture`, `maj_le`, `photo_path`
      (présentes seulement si 009 est appliquée).
- [ ] `public.notifs` : `id`, `obs_id`, `agent_nom`, `type_probleme`, `zone`,
      `date_creation`, `lu`.
- [ ] `public.observation_history` existe (créée par 009).

## 3. Row Level Security

- [ ] `agents`, `observations`, `notifs`, `observation_history` : RLS **activée**.
- [ ] Section 3b de l'audit **vide** : aucune politique `USING (true)` /
      `WITH CHECK (true)`.
- [ ] Politiques présentes :
  - `agents_read_own_or_admin`, `agents_update_own`
  - `obs_read_own_or_admin`, `obs_insert_own`, `obs_insert_admin` (009),
    `obs_update_admin`, `obs_delete_admin`
  - `notifs_read_own_or_admin`, `notifs_update_own`, `notifs_update_admin`,
    `notifs_delete_admin`
  - `obs_history_read_own_or_admin`, `obs_history_system_insert` (009)
- [ ] Aucune politique d'`INSERT` sur `agents` (seul le trigger 006 écrit).

## 4. Fonctions de sécurité

Pour `is_admin`, `current_agent_id`, `current_agent_role`, `admin_set_role`,
`admin_update_observation` :

- [ ] `security_definer = true`
- [ ] `proconfig` contient `search_path` **et** `row_security=off`
- [ ] `executable_par_anon = false`
- [ ] `executable_par_authenticated = true` (sauf celles non destinées aux
      clients, qui doivent rester non accordées)

## 5. Triggers

- [ ] `auth.users` → `on_auth_user_created` (migration 006)
- [ ] `observations` → `trigger_create_notification` (002)
- [ ] `observations` → `trg_obs_impose_agent`, `trg_obs_journal`,
      `trg_obs_notifie_statut` (009)

## 6. Comptes agents

- [ ] Section 7 de l'audit : liste des agents **sans** `auth_user_id`.
      Chaque ligne est un compte qui ne pourra pas se connecter.
- [ ] Section 7b : chaque agent relié pointe vers un compte Auth existant.
- [ ] Section 7c : tout compte Auth sans profil agent est identifié
      (inscription interrompue ou compte de test).

## 7. Utilisateurs Auth

- [ ] Section 8 : aucun compte `service_role` créé par erreur.
- [ ] `app_metadata.role` est cohérent avec `agents.role` (simple cache).
- [ ] Aucun mot de passe en clair, aucun numéro de test résiduel en production.

## 8. Volumes et intégrité

- [ ] Section 9 : effectifs `agents`, `observations`, `notifs`.
- [ ] `observations_orphelines = 0` (toutes les observations ont un agent valide).
- [ ] `notifs_orphelines = 0`.

## 9. Realtime

- [ ] `supabase_realtime` contient `observations` et `notifs`.
- [ ] Après 009 : contient également `observation_history`.
- [ ] `relreplident = f` (FULL) pour `observations` et `notifs`.

## 10. Storage

- [ ] Bucket `photos` présent, `public = false`.
- [ ] `file_size_limit = 5242880` (5 Mo).
- [ ] `allowed_mime_types` = jpeg, png, webp.
- [ ] Politiques sur `storage.objects` : lecture propriétaire/admin, dépôt dans
      son propre dossier, mise à jour/suppression admin.
- [ ] Section 11b : aucun objet dans un dossier qui n'appartient pas à un agent.

## 11. Diagnostic photos

- [ ] Section 12 : `avec_photo_base64` indique le nombre d'observations dont
      l'image est encore encodée dans la base (héritage). Après 010, les
      nouvelles observations utilisent `photo_path`.

## 12. Numéros de suivi

- [ ] Section 13 : `avec_numero = total` et `numeros_distincts = avec_numero`
      après application de 009.

## Sauvegarde avant toute modification

- [ ] *Database → Backups* : créer un point de restauration daté.
- [ ] Noter l'horodatage du point de restauration.
- [ ] Vérifier qu'un export `.sql` a été téléchargé si la politique de
      rétention le permet.

## Résultat

| Section | Statut |
| --- | --- |
| 1. Migrations | ☐ |
| 2. Colonnes | ☐ |
| 3. RLS | ☐ |
| 4. Fonctions | ☐ |
| 5. Triggers | ☐ |
| 6. Comptes agents | ☐ |
| 7. Auth | ☐ |
| 8. Intégrité | ☐ |
| 9. Realtime | ☐ |
| 10. Storage | ☐ |
| 11. Photos | ☐ |
| 12. Numéros | ☐ |