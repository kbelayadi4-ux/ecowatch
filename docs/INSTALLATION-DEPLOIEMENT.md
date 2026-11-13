# Installation et déploiement

## 1. Prérequis

- Node.js 20+ ou Bun 1.2+
- Un projet Supabase
- Un compte Netlify connecté au dépôt GitHub

## 2. Installation locale

```bash
bun install
cp .env.example .env.local   # si le fichier n'existe pas, le créer (voir §3)
bun run dev
```

> Le serveur de développement est géré par l'environnement d'exécution ; en
> local, `bun run dev` démarre l'application sur le port 3000.

## 3. Variables d'environnement

| Variable | Portée | Rôle |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | publique | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publique | Clé anonyme (jamais la clé `service_role`) |

Le fichier `.env.local` est ignoré par Git (`.gitignore` contient `.env*`).

**Règle absolue** : aucune clé `service_role`, aucun secret, aucun mot de passe
ne doit apparaître dans une variable `NEXT_PUBLIC_*` ni dans le dépôt.

## 4. Configuration Supabase

### 4.1 Créer le projet

Créer un projet sur [supabase.com](https://supabase.com), puis récupérer l'URL
et la clé anonyme dans *Project Settings → API*.

### 4.2 Activer l'authentification par téléphone

*Authentication → Providers → Phone* : activer le fournisseur, puis configurer
un fournisseur SMS (Twilio, Vonage, MessageBird…). Les variables de service
doivent être renseignées dans *Authentication → Phone Settings*.

Sans fournisseur SMS configuré, les codes OTP ne peuvent pas être envoyés :
prévoir un environnement de test avec un fournisseur de développement.

### 4.3 Appliquer les migrations

Dans *SQL Editor*, exécuter les fichiers **dans l'ordre** :

| Fichier | Objet |
| --- | --- |
| `supabase/schema.sql` | Structure des tables (agents, observations, notifs) |
| `001_add_auth_link.sql` | Lien `agents.auth_user_id` ↔ `auth.users` |
| `002_auth_helpers.sql` | `current_agent_id()`, `is_admin()`, notification à la création |
| `003_secure_rls.sql` | Politiques RLS de base |
| `004_realtime.sql` | Publication Realtime |
| `005_secure_cleanup.sql` | Purge des politiques permissives, durcissement |
| `006_agent_signup_trigger.sql` | Création du profil agent à l'inscription |
| `007_fix_admin_notifications.sql` | Droit administrateur de marquer les notifications lues |
| `008_unify_admin_roles.sql` | Rôle = `agents.role` (source de vérité) |
| `009_suivi_observations.sql` | Statut, priorité, affectation, échéance, historique, photos |
| `010_storage_photos.sql` | Bucket privé `photos` |

Chaque migration est **idempotente** et se termine par des vérifications qui
lèvent une exception en cas d'anomalie.

### 4.4 Premier administrateur

Après avoir créé un compte Auth pour l'administrateur (téléphone + OTP) :

```sql
update public.agents set role = 'admin' where telephone = 'XXXXXXXX';
```

ou, depuis un compte déjà administrateur :

```sql
select public.admin_set_role('XXXXXXXX', 'admin');
```

`admin_set_role` met à jour `agents.role` et synchronise `app_metadata.role`
lorsque le rôle exécutant dispose du privilège.

### 4.5 Realtime

*Database → Replication* : vérifier que la publication `supabase_realtime`
contient `observations`, `notifs` et `observation_history` (ajoutées par les
migrations 004 et 009).

## 5. Déploiement Netlify

1. *Add new site → Import an existing project* → sélectionner le dépôt.
2. Branche de production : **`feat/supabase-auth`**.
3. Build command : `bun run build`.
4. Publish directory : `.next` (Netlify détecte le plugin Next.js).
5. Variables d'environnement : `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
6. Déployer.

### Contrôles après déploiement

- Ouvrir l'URL, vérifier l'écran de connexion.
- Se connecter avec un compte agent, créer une observation.
- Se connecter avec un compte administrateur et vérifier la présence de
  l'observation.
- Vérifier l'absence d'erreur dans la console du navigateur.

## 6. Commandes utiles

| Commande | Rôle |
| --- | --- |
| `bun run dev` | Serveur de développement |
| `bun run build` | Build de production |
| `bun run lint` | Vérification ESLint |
| `bun run typecheck` | Vérification TypeScript |
| `bun run test:rls` | Tests RLS sur PostgreSQL embarqué (PGlite) |

## 7. Sauvegarde avant toute opération sur la base réelle

```sql
-- À exécuter dans le SQL Editor avant une migration structurante.
select pg_dump(...)
```

En pratique : utiliser *Database → Backups* de Supabase (point de restauration
daté) avant d'appliquer une migration qui modifie des données. Les migrations
009 et 010 n'ajoutent que des colonnes et des politiques : elles ne suppriment
aucune donnée, mais une sauvegarde reste recommandée.