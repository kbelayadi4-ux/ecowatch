# Sécurité Supabase

Ce document décrit le modèle de sécurité de l'application EcoWatch SCG :
authentification, rôles, Row Level Security, fonctions privilégiées et stockage
des photographies.

## 1. Authentification

- Fournisseur : **Supabase Auth, mot de passe à usage unique par SMS (OTP)**.
- Session : `persistSession: true`, `autoRefreshToken: true` (le client Supabase
  conserve la session dans le stockage du navigateur et renouvelle le jeton).
- Déconnexion : `supabase.auth.signOut()` efface la session côté serveur et
  côté client.

### Association `auth.users` ↔ `public.agents`

La migration 001 ajoute `agents.auth_user_id uuid unique references
auth.users(id)`. La migration 006 crée un profil agent automatiquement à
l'inscription :

- le rôle est forcé à `agent` côté serveur (le client ne peut pas choisir) ;
- le numéro est normalisé au format `+216XXXXXXXX` ;
- le profil est relié au compte Auth ;
- un conflit d'unicité est géré sans interrompre l'inscription.

### Rôle

`public.agents.role` est la **source de vérité** (migration 008). Le champ
`app_metadata.role` du jeton n'est qu'un cache : il n'autorise aucune action et
expire avec le jeton.

Conséquence directe : la révocation d'un rôle est **immédiate**, sans attendre
l'expiration du jeton (1 heure).

## 2. Fonctions de sécurité

Toutes les fonctions ci-dessous sont `SECURITY DEFINER` avec
`search_path` figé (`public, pg_temp`) et `row_security = off` (pour éviter la
récursion RLS). Leur exécution est refusée à `anon` et accordée à
`authenticated` uniquement.

| Fonction | Rôle |
| --- | --- |
| `current_agent_id()` | Identifiant de l'agent correspondant à `auth.uid()`. |
| `current_agent_role()` | Rôle de l'agent courant, relu depuis `agents`. |
| `is_admin()` | Vrai si l'agent courant a le rôle `admin` dans `agents`. |
| `admin_set_role(telephone, role)` | Seul mécanisme serveur de changement de rôle. |
| `admin_update_observation(...)` | Seul mécanisme de mise à jour du suivi. |

`admin_set_role` et `admin_update_observation` refusent tout appelant non
authentifié ou non administrateur (exception `42501`).

## 3. Row Level Security

La RLS est activée sur `agents`, `observations`, `notifs` et
`observation_history`. La migration 005 supprime **toutes** les politiques
permissives (`USING (true)` / `WITH CHECK (true)`) qui, en PostgreSQL, se
combinent par un OU logique et neutraliseraient les politiques de sécurité.

### `agents`

| Opération | Politique | Droits |
| --- | --- | --- |
| SELECT | `agents_read_own_or_admin` | Son profil, ou tous les profils pour un admin |
| UPDATE | `agents_update_own` | Son profil uniquement |
| INSERT | *aucune* | Trigger d'inscription (006) ou `service_role` uniquement |

Privilèges colonnes : `revoke update on public.agents` puis
`grant update (nom)` : seul le nom est modifiable par un agent. Le rôle,
l'identifiant de liaison Auth et le téléphone ne sont modifiables par aucun
client.

### `observations`

| Opération | Politique | Droits |
| --- | --- | --- |
| SELECT | `obs_read_own_or_admin` | Ses observations, ou toutes pour un admin |
| INSERT | `obs_insert_own` | Uniquement pour lui-même (`agent_id = current_agent_id()`) |
| INSERT | `obs_insert_admin` | Uniquement pour un admin (ajout pour un autre agent) |
| UPDATE | `obs_update_admin` | Admin uniquement |
| DELETE | `obs_delete_admin` | Admin uniquement |

Un agent ne peut donc **ni modifier, ni supprimer** une observation, et ne peut
pas s'auto-attribuer le rôle administrateur.

Le trigger `trg_obs_impose_agent` (migration 009) relit `agent_nom` et
`agent_telephone` depuis `public.agents` à chaque insertion : un client ne peut
pas usurper l'identité d'un autre agent, même s'il modifie la requête.

### `notifs`

| Opération | Politique | Droits |
| --- | --- | --- |
| SELECT | `notifs_read_own_or_admin` | Destinataire (via l'observation liée) ou admin |
| UPDATE | `notifs_update_own` | Destinataire uniquement |
| UPDATE | `notifs_update_admin` | Admin |
| DELETE | `notifs_delete_admin` | Admin uniquement |
| INSERT | *aucune* | Trigger `SECURITY DEFINER` uniquement |

### `observation_history`

| Opération | Politique | Droits |
| --- | --- | --- |
| SELECT | `obs_history_read_own_or_admin` | Agent concerné ou admin |
| INSERT / UPDATE / DELETE | *aucune* | Trigger `SECURITY DEFINER` uniquement |

## 4. Photographies (Storage)

Bucket **`photos` privé** (migration 010) :

| Opération | Règle |
| --- | --- |
| Lecture | Agent propriétaire du dossier (`<agent_id>/…`) ou administrateur |
| Dépôt | Uniquement dans son propre dossier |
| Mise à jour / suppression | Administrateur uniquement |

- Taille maximale : 5 Mo par fichier.
- Types acceptés : `image/jpeg`, `image/png`, `image/webp`.
- L'application ne génère pas de lien public : elle demande une URL signée
  valable 1 heure.

## 5. Points de vigilance

- La clé `service_role` ne doit jamais apparaître dans le code ni dans une
  variable `NEXT_PUBLIC_*`.
- Toute nouvelle politique RLS doit être ajoutée dans une **nouvelle**
  migration, jamais dans `schema.sql` sous forme permissive.
- Les tests locaux (PGlite) valident la logique SQL ; ils ne remplacent pas une
  vérification sur l'instance Supabase réelle.
- Les journaux d'erreur applicatifs ne contiennent aucune donnée personnelle.

## 6. Vérifications automatisées

`bun run test:rls` applique le schéma et les migrations 001 → 010 sur un
PostgreSQL embarqué, puis exécute 72 assertions :

- absence de politique permissive ;
- isolement entre deux agents ;
- refus d'un agent sur les données d'un autre agent ;
- refus d'auto-promotion en administrateur ;
- refus d'appel de `admin_set_role` / `admin_update_observation` par un agent ;
- protection du dernier administrateur ;
- journalisation et notification de changement de statut ;
- persistance après réengagement de transaction.