# AUDIT PHASE 2 — RÉSULTATS : base Supabase réelle EcoWatch SCG

- **Date de l'audit** : 2026-11-13
- **Branche** : `feat/supabase-auth` — **commit de référence** : `d309db6` (local = `origin`)
- **Dépôt** : `kbelayadi4-ux/ecowatch` — **projet Supabase** : `ecowatch`
- **Migrations attendues** : `001` → `010`
- **Accès réel à la base** : **NON DISPONIBLE**
- **Verdict** : **NO-GO** (aucun contrôle distant n'a pu être exécuté ; les objets
  bloquants restent NON VÉRIFIÉS)

> Aucune requête n'a été exécutée sur la base réelle. Aucun objet créé, modifié ou
> supprimé. Aucune migration appliquée. Aucun rôle modifié. Aucun fichier déployé.
> Ce document ne contient **aucune donnée personnelle** : aucun numéro, email ou
> UUID réel n'a été lu ni affiché.

---

## 1. Résumé exécutif

| Élément | Valeur |
|---|---|
| Branche active | `feat/supabase-auth` |
| HEAD local / distant | `d309db60f3dc473122faddf71f7c77a91c1520de` / identique |
| Working tree | propre |
| `main` | `f058a77`, intacte (non touchée) |
| Migrations `001`–`010` dans Git | présentes (10/10) |
| `supabase/audit/audit-lecture-seule.sql` | présent, **39 SELECT**, 0 écriture |
| `docs/AUDIT-BASE-ECOWATCH.md` | présent |
| Accès base réelle | **absent** (voir §1.1) |
| Contrôles exécutés sur la base réelle | **0** |

**Conclusion** : le dépôt est prêt et vérifié ; la base réelle ne l'est pas. La
recette multi-téléphones ne peut pas être autorisée : les six contrôles bloquants
(migrations appliquées, RLS, objets 009, Storage 010, Realtime, comptes agents)
sont **NON VÉRIFIÉS**, ce qui — selon la règle de décision de la mission — vaut
**NO-GO**.

### 1.1 Preuves de l'absence d'accès

| Moyen d'accès contrôlé | Résultat |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | absente |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | absente |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | absentes |
| `SUPABASE_SERVICE_ROLE_KEY` | absente (jamais lue ni affichée) |
| `SUPABASE_ACCESS_TOKEN` | absent |
| `DATABASE_URL` | absente |
| Fichiers `.env` / `.env.local` | aucun |
| CLI `supabase` | absent |
| `~/.supabase`, `~/.config/supabase` | absents |
| `psql` / `pg_isready` | absents |
| Sortie réseau | disponible (`github.com` 200, `supabase.com` 200) |
| URL du projet Supabase | inconnue (fournie uniquement par les variables Netlify) |

Le réseau est joignable mais **sans URL ni clé**, aucune requête authentifiée
n'est possible. Conformément à la consigne : l'audit distant est **arrêté** et une
procédure manuelle est fournie (§11).

---

## 2. Matrice des contrôles

| Contrôle | Attendu | Résultat réel | Statut | Risque | Action |
|---|---|---|---|---|---|
| Branche / HEAD / working tree | `feat/supabase-auth`, local = distant, propre | conforme | **CONFORME** | faible | aucune |
| `main` intacte | `f058a77` | conforme | **CONFORME** | faible | aucune |
| Migrations présentes dans Git | 10 fichiers `001`–`010` | 10/10 | **CONFORME** | faible | aucune |
| Migrations **appliquées** sur Supabase | 10 versions | inconnu | **NON VÉRIFIÉ** | **critique** | `audit §1` |
| Ordre d'application | croissant, sans trou | inconnu | **NON VÉRIFIÉ** | élevé | `audit §1` |
| RLS active (4 tables) | `true` × 4 | inconnu | **NON VÉRIFIÉ** | **critique** | `audit §3c` |
| Politiques permissives résiduelles | 0 | inconnu | **NON VÉRIFIÉ** | **critique** | `audit §3b` |
| Politique INSERT sur `agents` | 0 | inconnu | **NON VÉRIFIÉ** | **critique** | `audit §3d` |
| Privilèges `anon` / `authenticated` | `anon` sans écriture | inconnu | **NON VÉRIFIÉ** | élevé | `audit §15` |
| Fonctions attendues (10) + `search_path` | 10, toutes definer sauf règle | inconnu | **NON VÉRIFIÉ** | élevé | `audit §4`, `§4b`, `§16` |
| Triggers (5) | présents et actifs | inconnu | **NON VÉRIFIÉ** | élevé | `audit §5`, `§16b` |
| Colonnes 009 (8) | présentes | inconnu | **NON VÉRIFIÉ** | **critique** | `audit §2c` |
| `observation_history` + RLS + grants | présents | inconnu | **NON VÉRIFIÉ** | **critique** | `audit §2d`, `§3`, `§15` |
| Séquences de numérotation | 2 | inconnu | **NON VÉRIFIÉ** | élevé | `audit §2`, `§15b` |
| RPC `admin_update_observation` | présente, EXECUTE = `authenticated` | inconnu | **NON VÉRIFIÉ** | **critique** | `audit §4`, `§16` |
| RPC `admin_set_role` | présente, EXECUTE = `authenticated` | inconnu | **NON VÉRIFIÉ** | élevé | `audit §4`, `§16` |
| Index 009 (8 + 1 unique) | présents | inconnu | **NON VÉRIFIÉ** | moyen | requête §11.3 |
| Bucket `photos` | existe, privé, 5 Mo, 3 MIME | inconnu | **NON VÉRIFIÉ** | **critique** | `audit §11` |
| Politiques Storage (4) | présentes et correctes | inconnu | **NON VÉRIFIÉ** | élevé | `audit §11b` |
| Realtime (3 tables) | publiées | inconnu | **NON VÉRIFIÉ** | élevé | `audit §10` |
| `replica identity full` | `observations`, `notifs` | inconnu | **NON VÉRIFIÉ** | élevé | `audit §10b` |
| Agents liés à `auth.users` | 0 orphelin | inconnu | **NON VÉRIFIÉ** | **critique** | `audit §7`, `§7b` |
| Doublons de liaison | 0 | inconnu | **NON VÉRIFIÉ** | élevé | `audit §7d` |
| Au moins un `admin` | ≥ 1 | inconnu | **NON VÉRIFIÉ** | **critique** | `audit §8` |
| Cohérence cache de rôle | divergence tolérée | inconnu | **NON VÉRIFIÉ** | faible | `audit §8b` |
| Suite de tests du dépôt | 75 RLS + 18 unitaires, build OK | conforme | **CONFORME** | faible | aucune |

---

## 3. Migrations 001 à 010

| Fichier | Objet | Présent Git | Appliqué Supabase |
|---|---|---|---|
| `001_add_auth_link.sql` | `agents.auth_user_id` + index | oui | **NON VÉRIFIÉ** |
| `002_auth_helpers.sql` | `is_admin`, `current_agent_id`, `create_notification_for_observation` | oui | **NON VÉRIFIÉ** |
| `003_secure_rls.sql` | première vague de politiques + trigger de notification | oui | **NON VÉRIFIÉ** |
| `004_realtime.sql` | publication `supabase_realtime`, replica identity full | oui | **NON VÉRIFIÉ** |
| `005_secure_cleanup.sql` | purge des politiques permissives, politiques cibles, `grant update (nom)` | oui | **NON VÉRIFIÉ** |
| `006_agent_signup_trigger.sql` | `handle_new_auth_user` + `on_auth_user_created` | oui | **NON VÉRIFIÉ** |
| `007_fix_admin_notifications.sql` | `notifs_update_admin` | oui | **NON VÉRIFIÉ** |
| `008_unify_admin_roles.sql` | `current_agent_role`, `admin_set_role`, durcissement | oui | **NON VÉRIFIÉ** |
| `009_suivi_observations.sql` | suivi, historique, index, RPC, triggers | oui | **NON VÉRIFIÉ** |
| `010_storage_photos.sql` | bucket privé + 4 politiques | oui | **NON VÉRIFIÉ** |

**Requête exacte (§11.1)** :

```sql
select version, name, applied_at
from supabase_migrations.schema_migrations
order by version;
```

> Le SQL Editor du dashboard n'écrit pas dans la table `supabase_migrations`. Si elle est
> vide ou absente, l'état réel se lit aux sections 2, 3 et 5 de l'audit (objets
> présents ou non) : c'est la méthode de référence.

---

## 4. Sécurité

### 4.1 RLS

| Table | Attendu |
|---|---|
| `agents` | RLS = `true` |
| `observations` | RLS = `true` |
| `notifs` | RLS = `true` |
| `observation_history` | RLS = `true` |

Résultat réel : **NON VÉRIFIÉ** — `audit §3c`.

### 4.2 Politiques attendues (résultat net de 001 → 010)

| Table | Politique | Commande | Rôle |
|---|---|---|---|
| `agents` | `agents_read_own_or_admin` | SELECT | `authenticated` |
| `agents` | `agents_update_own` | UPDATE | `authenticated` (colonne `nom` uniquement) |
| `agents` | *(aucune)* | INSERT / DELETE | — |
| `observations` | `obs_read_own_or_admin` | SELECT | `authenticated` |
| `observations` | `obs_insert_own` | INSERT | `authenticated` (`agent_id = current_agent_id()`) |
| `observations` | `obs_insert_admin` | INSERT | `authenticated` (`is_admin()`) |
| `observations` | `obs_update_admin` | UPDATE | `authenticated` (`is_admin()`) |
| `observations` | `obs_delete_admin` | DELETE | `authenticated` (`is_admin()`) |
| `notifs` | `notifs_read_own_or_admin` | SELECT | `authenticated` |
| `notifs` | `notifs_update_own` | UPDATE | `authenticated` (destinataire) |
| `notifs` | `notifs_update_admin` | UPDATE | `authenticated` (`is_admin()`) |
| `notifs` | `notifs_delete_admin` | DELETE | `authenticated` (`is_admin()`) |
| `notifs` | *(aucune)* | INSERT | insertion par trigger `SECURITY DEFINER` uniquement |
| `observation_history` | `obs_history_read_own_or_admin` | SELECT | `authenticated` |
| `observation_history` | `obs_history_system_insert` | INSERT | `with check (false)` — écriture par fonction definer uniquement |
| `storage.objects` | `photos_read_own_or_admin` | SELECT | propriétaire du dossier ou admin |
| `storage.objects` | `photos_insert_own` | INSERT | propriétaire du dossier |
| `storage.objects` | `photos_update_admin` | UPDATE | admin |
| `storage.objects` | `photos_delete_admin` | DELETE | admin |

Résultat réel : **NON VÉRIFIÉ** — `audit §3`, `§3b`, `§3d`, `§11b`.

**Points de contrôle critiques :**
1. `§3b` doit renvoyer **0 ligne** (aucune politique `using (true)` / `with check (true)`).
2. `§3d` doit indiquer `agents` : 0 politique INSERT, 0 politique ALL.
3. `§3` ne doit contenir **aucune** politique `anon`.
4. `observation_history` doit avoir `obs_history_system_insert` en `with check (false)`,
   et non une politique permissive.

### 4.3 Privilèges

| Attendu | Statut |
|---|---|
| `anon` : aucun privilège d'écriture sur les 4 tables | **NON VÉRIFIÉ** |
| `authenticated` : SELECT/INSERT/UPDATE selon les politiques, UPDATE limité à `agents(nom)` | **NON VÉRIFIÉ** |
| `observation_history` : `authenticated` = SELECT uniquement | **NON VÉRIFIÉ** |
| Séquences : `authenticated` = USAGE/SELECT | **NON VÉRIFIÉ** |

`audit §15`, `§15b`.

### 4.4 Fonctions

| Fonction | Sécurité | `search_path` | EXECUTE attendu |
|---|---|---|---|
| `is_admin()` | DEFINER | oui | `authenticated` |
| `current_agent_id()` | DEFINER | oui | `authenticated` |
| `current_agent_role()` | DEFINER | oui | `authenticated` |
| `admin_set_role(text, text)` | DEFINER | oui | `authenticated` |
| `admin_update_observation(...)` | DEFINER | oui | `authenticated` |
| `obs_impose_agent()` | DEFINER | oui | trigger uniquement |
| `obs_journalise()` | DEFINER | oui | trigger uniquement |
| `obs_notifie_statut()` | DEFINER | oui | trigger uniquement |
| `handle_new_auth_user()` | DEFINER | oui | trigger `auth` uniquement |
| `create_notification_for_observation()` | DEFINER | oui | trigger uniquement |

Résultat réel : **NON VÉRIFIÉ** — `audit §4`, `§4b`, `§16`.

**Comparaison mécanique** : `audit §16` renvoie `md5(pg_get_functiondef(p.oid))`.
Une empreinte différente du fichier `008`/`009` signale une dérive de définition.

### 4.5 Triggers

| Trigger | Table | Attendu |
|---|---|---|
| `trg_obs_impose_agent` | `observations` | BEFORE INSERT OR UPDATE OF statut, priorite, assigne_a, echeance |
| `trg_obs_journal` | `observations` | AFTER INSERT/UPDATE/DELETE |
| `trg_obs_notifie_statut` | `observations` | AFTER UPDATE OF statut |
| `trigger_create_notification` | `observations` | AFTER INSERT |
| `on_auth_user_created` | `auth.users` | AFTER INSERT |

Résultat réel : **NON VÉRIFIÉ** — `audit §5`, `§16b`.

---

## 5. Fonctionnalités 009 et Storage 010

### 5.1 Colonnes de suivi

| Colonne | Type attendu | Contrainte |
|---|---|---|
| `numero_suivi` | `text` | nullable, rempli par trigger |
| `statut` | `text` | NOT NULL, défaut `nouvelle`, CHECK 5 valeurs |
| `priorite` | `text` | NOT NULL, défaut `normale`, CHECK 4 valeurs |
| `assigne_a` | `text` | FK `agents(id)` ON DELETE SET NULL |
| `echeance` | `timestamptz` | nullable |
| `date_cloture` | `timestamptz` | nullable |
| `maj_le` | `timestamptz` | NOT NULL, défaut `now()` |
| `photo_path` | `text` | nullable |

`audit §2c` — résultat **NON VÉRIFIÉ**.

### 5.2 Historique, séquences, index

| Objet | Attendu | Statut |
|---|---|---|
| `observation_history` | table (id, observation_id, observation_identifiant, action, auteur_*, resume, cree_le) | **NON VÉRIFIÉ** |
| RLS + grants | voir §4.1 / §4.3 | **NON VÉRIFIÉ** |
| `observations_numero_seq` | séquence | **NON VÉRIFIÉ** |
| `notifs_statut_seq` | séquence | **NON VÉRIFIÉ** |
| `idx_observations_statut` | index | **NON VÉRIFIÉ** |
| `idx_observations_priorite` | index | **NON VÉRIFIÉ** |
| `idx_observations_assigne_a` | index | **NON VÉRIFIÉ** |
| `idx_observations_echeance` | index | **NON VÉRIFIÉ** |
| `idx_observations_numero` | index | **NON VÉRIFIÉ** |
| `idx_observations_numero_uniq` | index **unique** | **NON VÉRIFIÉ** |
| `idx_obs_history_obs_id` | index | **NON VÉRIFIÉ** |
| `idx_obs_history_identifiant` | index | **NON VÉRIFIÉ** |
| `idx_agents_auth_user_id` | index | **NON VÉRIFIÉ** |

> **Écart de couverture de l'outil d'audit** : `audit-lecture-seule.sql` ne contient
> aucune requête sur les index. La vérification passe par la requête §11.3.

### 5.3 RPC

| RPC | Attendu | Statut |
|---|---|---|
| `admin_update_observation(text, text, text, text, timestamptz, text, boolean)` | definer, `set row_security = off`, refus si `auth.uid()` null, réservé admin | **NON VÉRIFIÉ** |
| `admin_set_role(text, text)` | definer, garde-fou « dernier admin », sync `app_metadata.role` best-effort | **NON VÉRIFIÉ** |

`audit §4`, `§16`.

### 5.4 Storage (010)

| Contrôle | Attendu | Statut |
|---|---|---|
| Bucket `photos` | existe | **NON VÉRIFIÉ** |
| `public` | `false` | **NON VÉRIFIÉ** |
| `file_size_limit` | `5242880` | **NON VÉRIFIÉ** |
| `allowed_mime_types` | `image/jpeg`, `image/png`, `image/webp` | **NON VÉRIFIÉ** |
| `photos_read_own_or_admin` | `(storage.foldername(name))[1] = current_agent_id()` ou `is_admin()` | **NON VÉRIFIÉ** |
| `photos_insert_own` | `(storage.foldername(name))[1] = current_agent_id()` | **NON VÉRIFIÉ** |
| `photos_update_admin` | `is_admin()` | **NON VÉRIFIÉ** |
| `photos_delete_admin` | `is_admin()` | **NON VÉRIFIÉ** |

`audit §11`, `§11b`. Aucun fichier n'a été téléversé, modifié ou supprimé.

---

## 6. Realtime

| Table | Publiée dans `supabase_realtime` | `replica identity` |
|---|---|---|
| `observations` | **NON VÉRIFIÉ** | `full` attendu — **NON VÉRIFIÉ** |
| `notifs` | **NON VÉRIFIÉ** | `full` attendu — **NON VÉRIFIÉ** |
| `observation_history` | **NON VÉRIFIÉ** | `default` acceptable |

`audit §10`, `§10b`.

---

## 7. Agents et Auth

| Contrôle | Attendu | Statut |
|---|---|---|
| `agents.auth_user_id` renseigné | 0 agent orphelin | **NON VÉRIFIÉ** |
| Correspondance `agents` ↔ `auth.users` | 1 agent ↔ 1 compte | **NON VÉRIFIÉ** |
| Comptes Auth sans profil agent | 0 (ou comptes en attente justifiés) | **NON VÉRIFIÉ** |
| Doublons de liaison | 0 | **NON VÉRIFIÉ** |
| Présence d'un administrateur | ≥ 1 `role = 'admin'` | **NON VÉRIFIÉ** |
| Cohérence `agents.role` ↔ `app_metadata.role` | divergence tolérée (cache JWT 1 h) | **NON VÉRIFIÉ** |

`audit §7`, `§7b`, `§7c`, `§7d`, `§8`, `§8b`.

**Masquage obligatoire à l'exploitation des résultats** : ne reporter que des
identifiants tronqués, par exemple `06xx.xx` pour un téléphone et `a1b2…f9` pour un
UUID ; ne jamais coller la sortie brute de `§7b` ou `§8` dans un canal partagé.

---

## 8. Anomalies prioritaires

| # | Anomalie | Gravité | Statut |
|---|---|---|---|
| A1 | Base réelle jamais auditée : état des migrations inconnu | **CRITIQUE** | NON VÉRIFIÉ |
| A2 | RLS et politiques permissives non contrôlées sur la base réelle | **CRITIQUE** | NON VÉRIFIÉ |
| A3 | Objets 009 (suivi, historique, RPC, triggers) non confirmés | **CRITIQUE** | NON VÉRIFIÉ |
| A4 | Bucket `photos` et ses 4 politiques non confirmés | **CRITIQUE** | NON VÉRIFIÉ |
| A5 | Présence d'un administrateur et intégrité des liaisons Auth non confirmées | **CRITIQUE** | NON VÉRIFIÉ |
| A6 | Realtime / `replica identity` non confirmés | ÉLEVÉ | NON VÉRIFIÉ |
| A7 | Privilèges `anon` / `authenticated` non contrôlés | ÉLEVÉ | NON VÉRIFIÉ |
| A8 | Dérive possible du corps des fonctions (`§16`) | ÉLEVÉ | NON VÉRIFIÉ |
| A9 | Index 009 non contrôlés (hors périmètre de l'outil d'audit) | MOYEN | NON VÉRIFIÉ |
| A10 | Cache `app_metadata.role` potentiellement désynchronisé | FAIBLE | NON VÉRIFIÉ |

Aucune anomalie **CONFORME** ne peut être revendiquée côté base : l'absence de
mesure n'est pas une conformité.

---

## 9. Plan de correction (à exécuter manuellement, dans l'ordre)

| Ordre | Objet | Fichier concerné | Action proposée | Risque | Prérequis | Vérification après correction |
|---|---|---|---|---|---|---|
| 1 | Lecture de l'état réel | `supabase/audit/audit-lecture-seule.sql` | Exécuter les 39 SELECT dans SQL Editor, récupérer les sections 0 à 16 | nul (lecture seule) | accès dashboard | résultats archivés hors ligne |
| 2 | Migrations manquantes | `supabase/migrations/00X_*.sql` | Appliquer **uniquement** les migrations absentes, dans l'ordre | **élevé** (irréversible) | sauvegarde, fenêtre de maintenance | `§1` + `§2c` conformes |
| 3 | Politiques permissives résiduelles | `005`, `009` | Réexécuter la partie « politiques cibles » de `005` si `§3b` ≠ 0 | élevé | sauvegarde | `§3b` = 0 ligne |
| 4 | RLS inactive | `003`, `005`, `009` | Activer RLS sur les tables sans RLS (script fourni par la migration) | élevé | sauvegarde | `§3c` = `true` ×4 |
| 5 | Bucket `photos` | `010_storage_photos.sql` | Appliquer `010` si `§11` ne renvoie rien | moyen (Storage) | bucket vide ou sauvegardé | `§11`, `§11b` conformes |
| 6 | Fonctions divergentes | `008`, `009` | Comparer `§16` aux fichiers ; rejouer la migration concernée si écart | élevé | sauvegarde | empreintes md5 identiques |
| 7 | Comptes agents orphelins | `006` | Créer le profil manquant via le parcours d'inscription, jamais par SQL direct | moyen | — | `§7` = 0 orphelin |
| 8 | Administrateur absent | `008` | Désigner un admin via `admin_set_role` depuis un compte existant | **élevé** | validation métier | `§8` ≥ 1 admin |
| 9 | Realtime | `004`, `009` | Ajouter les tables manquantes, `alter table … replica identity full` | moyen | — | `§10`, `§10b` conformes |
| 10 | Index manquants | `009` | Créer les index listés au §5.2 | faible (sur volume faible) | — | requête §11.3 |

**Aucune migration corrective n'est produite dans ce document et rien n'est appliqué.**

---

## 10. Verdict final

**NO-GO**

Justification : au moins un contrôle de sécurité et de fonctionnement bloquant est
**non vérifié** sur la base réelle — migrations appliquées, RLS, politiques
permissives, objets 009, Storage 010, intégrité des comptes agents. La règle de
décision de la mission impose NO-GO dans ce cas, et la priorité de sécurité des
données de la Société des Ciments de Gabès interdit de supposer une conformité.

**Ce qui est confirmé** : le dépôt (`d309db6`) est cohérent, les migrations 001→010
y sont complètes, l'outil d'audit est strictement en lecture seule (39 SELECT), et
la suite de tests locale est verte (75 RLS + 18 unitaires, build OK).

**Ce qui manque** : l'exécution de l'audit sur la base réelle et la levée des points
2 à 8 du §9.

---

## 11. Procédure manuelle (accès dashboard)

### 11.1 Historique des migrations

```sql
select version, name, applied_at
from supabase_migrations.schema_migrations
order by version;
```

Sections à récupérer : **1**.

### 11.2 Sécurité, 009, 010, Realtime, agents

Exécuter intégralement `supabase/audit/audit-lecture-seule.sql` puis relever :

| Section | Objet | Attendu |
|---|---|---|
| 0 | contexte | version PostgreSQL, utilisateur |
| 1 | migrations | 10 versions |
| 2 / 2c / 2d | colonnes | 8 colonnes 009, `observation_history` présent |
| 3 / 3b / 3c / 3d | RLS et politiques | 4 tables RLS, 0 politique permissive, 0 INSERT sur `agents` |
| 4 / 4b | fonctions | 10 fonctions, toutes definer, `search_path` renseigné |
| 5 | triggers | 5 triggers |
| 7 / 7b / 7c / 7d | agents | 0 orphelin, 0 doublon |
| 8 / 8b | Auth | ≥ 1 admin, cache de rôle cohérent ou divergence expliquée |
| 9 / 9b / 9c / 9d | intégrité | 0 orpheline, 0 sans numéro |
| 10 / 10b | Realtime | 3 tables publiées, `full` sur 2 |
| 11 / 11b | Storage | bucket privé 5 Mo, 4 politiques |
| 15 / 15b | privilèges | `anon` sans écriture |
| 16 / 16b | empreintes | identiques aux fichiers `008` / `009` |

### 11.3 Complément index (non couvert par l'outil d'audit)

```sql
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('observations', 'observation_history', 'agents', 'notifs')
order by tablename, indexname;
```

### 11.4 Complément Realtime / privilèges (redondance de contrôle)

```sql
select * from pg_publication_tables where pubname = 'supabase_realtime';
select grantee, privilege_type, table_name
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon';
```

### 11.5 Règles d'exploitation des résultats

1. Ne jamais coller une sortie contenant `service_role`, un token ou une clé.
2. Masquer les PII (`06xx.xx`, UUID tronqués) avant tout partage.
3. Ne jamais rejouer une migration « pour voir » : une migration appliquée deux fois
   est idempotente par conception, mais l'ordre et les effets de bord doivent être
   vérifiés avant toute réexécution.
4. Archiver les résultats dans `docs/` (fichier daté) et faire contresigner par le
   responsable métier avant de lever le NO-GO.

---

## 12. Fichiers modifiés par cette mission

| Fichier | Nature |
|---|---|
| `docs/AUDIT-BASE-ECOWATCH-RESULTATS.md` | **créé** (ce document) |

Aucun autre fichier modifié. Aucun commit, aucun push : `feat/supabase-auth` reste
sur `d309db6` et `main` sur `f058a77`.