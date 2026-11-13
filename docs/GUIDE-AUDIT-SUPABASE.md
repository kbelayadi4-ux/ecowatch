# Guide d'audit Supabase — pas à pas

Accompagnement pour l'audit en lecture seule de la base Supabase EcoWatch SCG,
depuis le **Dashboard** (aucun client, aucune CLI).

Fichier d'audit : `supabase/audit/audit-lecture-seule.sql`
Version du code audité : commit `aae1b17`, branche `feat/supabase-auth`.

---

## 0. Ce que l'audit ne peut pas faire

L'audit est **100 % lecture**. Il ne peut pas :

- modifier une donnée, un rôle, un compte ;
- appliquer une migration ;
- créer ou supprimer un bucket, une politique, une fonction ;
- déployer quoi que ce soit.

Aucune action irréversible n'est possible depuis ce script.

---

## 1. Exécuter l'audit

1. Ouvrir le projet Supabase → menu de gauche → **SQL Editor**.
2. Cliquer sur **New query**.
3. Ouvrir `supabase/audit/audit-lecture-seule.sql`, tout sélectionner, coller.
4. Cliquer sur **Run** (ou `Ctrl/Cmd + Enter`).
5. L'éditeur affiche le résultat de la **dernière** requête. Pour lire les
   autres, utiliser l'une des deux méthodes :
   - sélectionner la requête (ou son numéro de section) puis **Run selection** ;
   - ou exécuter section par section en copiant chaque bloc `select`.

> **Important** : ne pas utiliser le client `psql` pour ce fichier. Les blocs
> sont écrits en SQL standard, sans commande `\echo`, précisément pour être
> exécutables dans le SQL Editor.

### Repérer une section

Chaque section commence par un commentaire `====` et un numéro. Les sections
dépendantes de la migration 009 sont signalées « Nécessite la migration 009 ».

---

## 2. Tableau de correspondance Git → base

| # | Migration (Git) | Objet attendu en base | Requête de contrôle | Si absent |
| --- | --- | --- | --- | --- |
| — | `schema.sql` | Tables `agents`, `observations`, `notifs` | Section 2 | **BLOQUANT** |
| 001 | `001_add_auth_link` | Colonne `agents.auth_user_id` (unique) | Sections 2c, 6 | **BLOQUANT** |
| 002 | `002_auth_helpers` | `current_agent_id()`, `is_admin()`, `create_notification_for_observation()` | Sections 4, 5 | **BLOQUANT** |
| 003 | `003_secure_rls` | Politiques RLS de base | Section 3 | **BLOQUANT** |
| 004 | `004_realtime` | `observations`, `notifs` dans `supabase_realtime`, `REPLICA IDENTITY FULL` | Sections 10, 10b | Realtime inopérant |
| 005 | `005_secure_cleanup` | Aucune politique `using (true)` | Section 3b | **BLOQUANT (fuite RLS)** |
| 006 | `006_agent_signup_trigger` | Trigger `on_auth_user_created` sur `auth.users` | Section 5 | Inscription cassée |
| 007 | `007_fix_admin_notifications` | Politique `notifs_update_admin` | Section 3 | Admin ne peut plus marquer lu |
| 008 | `008_unify_admin_roles` | `current_agent_role()`, `admin_set_role()`, `is_admin()` sur `agents.role` | Section 4 | Rôle non unifié |
| 009 | `009_suivi_observations` | 8 colonnes + `observation_history` + 3 triggers + `admin_update_observation` | Sections 2c, 2d, 3, 4, 5, 9d, 12, 13, 14 | **Suivi indisponible** |
| 010 | `010_storage_photos` | Bucket `photos` privé + politiques `storage.objects` | Section 11 | **Photos impossible** |

**Règle de lecture** : l'absence d'une ligne dans
`supabase_migrations.schema_migrations` (section 1) **ne prouve pas** qu'une
migration n'est pas appliquée : le SQL Editor du dashboard n'écrit rien dans
cette table. La preuve réelle est fournie par les objets (sections 2 à 5).
La section 1 est un indice, pas une source de vérité.

---

## 3. Détail par section

### Section 0 — Contexte
- **Attendu** : base = projet SCG, utilisateur = `postgres`, PostgreSQL 15+.
- **Anomalie** : base ≠ projet attendu → **arrêter** et vérifier le projet.
- **Bloquant** : oui (mauvaise base).

### Section 1 — Migrations enregistrées
- **Attendu** : liste des versions appliquées via la CLI (souvent vide si tout a
  été fait au dashboard).
- **Anomalie** : `relation "supabase_migrations.schema_migrations" does not
  exist` → aucun historique CLI. **Non bloquant** : continuer avec les sections
  2 à 5.
- **À vérifier** : noter les versions présentes pour le tableau de §2.
- **Bloquant** : non.

### Section 2 — Objets de `public`
- **Attendu** : 4 tables (`agents`, `observations`, `notifs`,
  `observation_history` si 009), avec leurs colonnes.
- **Anomalie** : table manquante → migration correspondante non appliquée.
- **À vérifier** : `agents` doit avoir `auth_user_id`.
- **Bloquant** : oui si `agents` ou `observations` manque.

### Section 2b — Aperçu des colonnes de `observations`
- **Attendu** : résultat vide, mais la grille affiche **toutes les colonnes**
  de la table. C'est le moyen le plus simple de voir l'état réel.
- **À vérifier** : présence de `statut`, `priorite`, `assigne_a`, `echeance`,
  `date_cloture`, `maj_le`, `photo_path`, `numero_suivi`.
- **Bloquant** : non (c'est un diagnostic).

### Section 2c / 2d — Colonnes 009 et table d'historique
- **Attendu** : 8 lignes de colonnes ; `table_historique = observation_history`.
- **Anomalie** : 0 ligne ou `null` → **009 non appliquée**.
- **Bloquant** : non (009 est justement la migration à appliquer ensuite).

### Section 3 — Politiques RLS
- **Attendu** : au minimum
  `agents_read_own_or_admin`, `agents_update_own`, `obs_read_own_or_admin`,
  `obs_insert_own`, `obs_update_admin`, `obs_delete_admin`,
  `notifs_read_own_or_admin`, `notifs_update_own`, `notifs_update_admin`,
  `notifs_delete_admin`.
- **Anomalie** : politique manquante → droits incorrects.
- **À vérifier** : `qual` et `with_check` ne contiennent jamais `true`.
- **Bloquant** : oui si une politique attendue manque **et** que l'écran
  correspondant ne fonctionne pas.

### Section 3b — Politiques permissives
- **Attendu** : **0 ligne**.
- **Anomalie** : une ligne → faille : une politique permissive se combine par un
  OU logique et **neutralise** les politiques de sécurité.
- **Bloquant** : **oui, impérativement**. Ne pas ouvrir le pilote.

### Section 3c — RLS activée
- **Attendu** : `rls_activee = true` pour les 4 tables métier.
- **Anomalie** : `false` → **BLOQUANT**.

### Section 3d — Politiques d'insertion
- **Attendu** : `agents` → `politiques_insert = 0`, `politiques_all = 0`.
- **Anomalie** : une politique d'insertion sur `agents` → un client pourrait se
  créer un profil (et se promouvoir).
- **Bloquant** : **oui**.

### Section 4 — Fonctions de sécurité
- **Attendu** : `security_definer = true`, `proconfig` contient `search_path` et
  `row_security=off`, `execute_par_anon = false`.
- **Anomalie** : `security_definer = false` sur une fonction de sécurité, ou
  `search_path` absent → risque de détournement.
- **Bloquant** : **oui** si une fonction de sécurité manque `search_path`.

### Section 4b — Toutes les fonctions SECURITY DEFINER
- **Attendu** : uniquement les fonctions métier connues.
- **Anomalie** : fonction inconnue → à investiguer avant tout.
- **Bloquant** : non, mais signaler.

### Section 5 — Triggers
- **Attendu** :
  - `auth.users` → `on_auth_user_created` ;
  - `observations` → `trigger_create_notification` (+ les 3 triggers de 009).
- **Anomalie** : trigger d'inscription absent → les nouveaux agents n'auront pas
  de profil ; trigger de notification absent → pas de notification.
- **Bloquant** : **oui** pour `on_auth_user_created` et
  `trigger_create_notification`.

### Section 6 — Contraintes
- **Attendu** : `observations.agent_id` → `agents.id` ; `notifs.obs_id` →
  `observations.id` ; contraintes `check` de `statut` / `priorite` (après 009).
- **Anomalie** : contrainte de clé étrangère manquante → risque de données
  orphelines.
- **Bloquant** : non, mais à corriger.

### Section 7 — Agents sans `auth_user_id`
- **Attendu** : idéalement **0 ligne**.
- **Anomalie** : une ou plusieurs lignes → ces agents **ne peuvent pas se
  connecter**.
- **À vérifier** : chaque ligne doit correspondre à un compte encore utilisé.
- **Bloquant** : **oui** pour les agents du pilote concernés.

### Section 7b — Cohérence agents / Auth
- **Attendu** : chaque agent a un `auth_phone` non vide.
- **Anomalie** : `auth_phone` vide → `auth_user_id` invalide.
- **Bloquant** : **oui** pour les comptes concernés.

### Section 7c — Comptes Auth sans profil agent
- **Attendu** : aucun, ou uniquement des comptes de test identifiés.
- **Anomalie** : compte sans profil → inscription interrompue.
- **Bloquant** : non (à nettoyer avant le pilote).

### Section 7d — Doublons de liaison
- **Attendu** : **0 ligne**.
- **Anomalie** : un compte Auth lié à deux agents → les deux agents verront les
  mêmes données.
- **Bloquant** : **oui**.

### Section 8 — Utilisateurs Auth
- **Attendu** : comptes `authenticated`, `app_metadata.role` cohérent avec
  `agents.role` (ou vide), pas de `service_role`.
- **Anomalie** : compte `service_role` dans la table → à supprimer (hors périmètre
  de l'audit).
- **Bloquant** : **oui** si un compte `service_role` existe.

### Section 8b — Cache de rôle
- **Attendu** : divergence possible **sans conséquence** (le cache n'autorise rien).
- **Anomalie** : divergence → simple rafraîchissement du cache via
  `admin_set_role`, non bloquant.
- **Bloquant** : non.

### Section 9 — Volumes
- **Attendu** : effectifs cohérents avec la réalité SCG.
- **À vérifier** : noter les valeurs, elles servent de base au test multi-téléphones.

### Section 9b/9c — Intégrité référentielle
- **Attendu** : `0` orphelines.
- **Anomalie** : > 0 → observations ou notifications perdues de vue.
- **Bloquant** : non, mais à corriger.

### Section 9d — Numéros de suivi
- **Attendu** : `0` après 009 ; avant 009, la colonne n'existe pas (erreur de
  requête = 009 non appliquée).
- **Bloquant** : non.

### Section 10 / 10b — Realtime
- **Attendu** : `supabase_realtime` contient `observations`, `notifs`
  (+ `observation_history` après 009) ; `replica_identity = f` (FULL) sur ces
  tables.
- **Anomalie** : table absente → pas de mise à jour automatique (polling
  supprimé, donc écran figé jusqu'à *Actualiser*).
- **Bloquant** : **oui** pour le confort du pilote (mais pas pour l'enregistrement).

### Section 11 — Storage
- **Attendu** : bucket `photos`, `public = false`, `file_size_limit = 5242880`,
  types jpeg/png/webp ; politiques `photos_*` présentes.
- **Anomalie** : bucket absent → 010 non appliquée ; bucket `public = true` →
  **photos exposées**.
- **Bloquant** : **oui** si `public = true` ; **oui** pour l'envoi de photos si
  le bucket est absent.

### Section 12 — Diagnostic photos
- **Attendu** : `avec_photo_base64` décroît, `avec_chemin_storage` croît après 010.
- **Anomalie** : `photo` très volumineuse → base chargée inutilement.
- **Bloquant** : non.

### Section 13 — Numéros de suivi
- **Attendu** : `avec_numero = total = numeros_distincts`.
- **Anomalie** : `avec_numero < total` → backfill incomplet (009 à reprendre).
- **Bloquant** : non.

### Section 14 — Répartition statut / priorité
- **Attendu** : distribution cohérente (majorité `nouvelle` au démarrage).
- **Bloquant** : non (information de pilotage).

---

## 4. Synthèse des critères bloquants

Interdire l'ouverture du pilote si l'un de ces points est constaté :

1. Section 3b non vide (politique permissive).
2. Section 3c : RLS désactivée sur une table métier.
3. Section 3d : politique d'insertion sur `agents`.
4. Section 4 : fonction de sécurité sans `search_path`.
5. Section 5 : `on_auth_user_created` ou `trigger_create_notification` absent.
6. Section 7 / 7b / 7d : un agent du pilote sans `auth_user_id`, avec une
   liaison invalide ou en doublon.
7. Section 8 : présence d'un compte `service_role` dans `auth.users`.
8. Section 11 : bucket `photos` en `public = true`.

Points **non bloquants** mais à traiter avant le pilote : sections 1, 2c, 2d,
4b, 6, 7c, 8b, 9b, 9c, 9d, 12, 13, 14.

---

## 5. Après réception de vos résultats

Je produirai, sans rien exécuter :

1. Le tableau de correspondance Git ↔ base renseigné (migrations réellement
   présentes / manquantes).
2. La liste des comptes agents orphelins et la conduite à tenir pour chacun.
3. La vérification du premier administrateur (rôle, `auth_user_id`, identité).
4. La décision « 009 et 010 applicables sans risque » motivée par les objets
   réellement constatés.
5. Les instructions SQL exactes, dans l'ordre, avec le contrôle après chaque
   étape et le point de retour arrière.

## 6. Règles que je m'impose

- Aucune migration lancée.
- Aucune donnée modifiée.
- Aucun compte existant touché.
- Aucun déploiement.
- Aucun numéro de téléphone choisi par moi.
- Aucun résultat de test inventé.