# Active Context: EcoWatch – Application de Signalement Environnemental

## Current State

**App Status**: 🟢 Finalisée (validée localement) — branche `feat/supabase-auth`

La branche `main` reste sur localStorage. La branche `feat/supabase-auth` porte la
migration vers Supabase Auth / Postgres / Realtime. L'interface et les fonctionnalités
existantes sont conservées.

## Recently Completed

- [x] **Robustesse du formulaire agent (13/11/2026)**
  - `handleEnvoyer` enveloppé dans `try/catch/finally` avec verrou anti double-clic
    (`envoiRef`) : le bouton n'est plus bloqué après un échec.
  - Le bandeau d'avertissement photo (`avertissement`) est désormais **affiché dans
    le formulaire**, plus seulement sur l'écran de succès : un format refusé est
    expliqué à l'utilisateur.
  - Photo explicitement marquée facultative ; `accept` élargi (HEIC/HEIF) ;
    formats refusés et fichier vide signalés par un message clair.
  - `GererAgents.televerserPhotoAdmin` : `notePhoto` (échec d'upload sans perte du
    signalement) est maintenant affiché au lieu d'être ignoré.
  - `handleAjoutManuel` / `handlePhotoManuelle` : `try/catch/finally` (plus de
    chargement figé) et message en cas d'échec d'enregistrement.
- [x] **Conversion photo HEIC/HEIF contrôlée (13/11/2026)** : `TYPES_STOCKAGE_AUTORISES` /
  `typeDeDataUrl` / `estTypeStockable` dans `store.ts` ; `televerserPhoto` refuse un type
  non déposable ; le formulaire agent et l'admin préviennent avant envoi si le navigateur
  ne sait pas convertir (iOS Safari convertit en JPEG automatiquement).
- [x] **Tests unitaires `bun test` (18 tests)** : payload d'insertion avec et sans
  photo, payload historique, détection d'une base sans migration 009, validation
  du fichier photo (HEIC, vide, 25 Mo refusé, 8 Mo accepté). Commande :
  `bun run test:unit`.

- [x] **Finalisation du 13/11/2026 — migrations 009 / 010**
  - `009_suivi_observations.sql` : colonnes `statut`, `priorite`, `assigne_a`,
    `echeance`, `date_cloture`, `numero_suivi`, `photo_path`, `maj_le` ; table
    `observation_history` + trigger de journalisation ; trigger
    `trg_obs_impose_agent` (identité imposée par la base) ;
    `admin_update_observation()` ; politique `obs_insert_admin` ; notification
    automatique de changement de statut.
  - `010_storage_photos.sql` : bucket privé `photos`, lecture propriétaire/admin,
    dépôt dans son propre dossier, 5 Mo max.
  - `src/lib/data.ts` réécrit : pagination, filtres, KPI, historique, RPC
    d'administration, upload et URL signée des photos.
  - `src/lib/store.ts` réduit aux utilitaires navigateur : plus aucune donnée
    métier dans le localStorage (cause racine du défaut multi-téléphones).
  - `AdminApp` : tableau de bord KPI, filtres, fiche détaillée, changement de
    statut/priorité/responsable/échéance, historique, gestion des agents et des
    rôles, export Excel. Polling 3 s supprimé (Realtime uniquement).
  - `MesSignalements` : statut, priorité, échéance, historique + Realtime.
  - PWA : icônes 192/512/180, manifeste complété, bandeau hors ligne.
  - Documentation : `docs/README-PROJET.md`, `INSTALLATION-DEPLOIEMENT.md`,
    `SECURITE-SUPABASE.md`, `TESTS-VALIDATION.md`, `RAPPORT-FINAL-DIRECTION.md`.
  - Tests : 72 assertions RLS vertes, typecheck / lint / build OK.
- [x] **Préparation du pilote (13/11/2026)**
  - `009` amendée : backfill et unicité des numéros de suivi,
    `p_effacer_echeance`, désaffectation d'un responsable par chaîne vide.
  - `supabase/audit/audit-lecture-seule.sql` : audit 100 % SELECT (migrations,
    RLS, fonctions, triggers, comptes, Auth, Realtime, Storage).
  - `docs/PROCEDURE-PILOTE-SCG.md`, `docs/CHECKLIST-SUPABASE.md`,
    `docs/PLAN-TEST-MULTI-TELEPHONES.md`.
  - Constat Netlify : site HTTP 200 mais build antérieur à 73591f4
    (icônes `icon-192.png` en 404).
  - 75 assertions RLS vertes.

- [x] Base Next.js 16 setup with App Router
- [x] TypeScript + Tailwind CSS 4
- [x] **EcoWatch app complète** – Application mobile-first de signalement environnemental
  - Interface agent + tableau de bord admin conservés
  - Design vert/blanc, gros boutons pour utilisation avec gants
- [x] **Migration Supabase (partielle)** — `src/lib/supabase.ts`, `src/lib/auth.ts`, `src/lib/data.ts`
  - Auth OTP téléphonique
  - Realtime côté admin
  - Schéma SQL `agents` / `observations` / `notifs`
- [x] **Correctifs prioritaires du 12/11/2026**
  - `supabase/migrations/005_secure_cleanup.sql` : purge de **toute** politique RLS
    permissive (`using (true)` / `with check (true)`) sur `agents`, `observations`,
    `notifs`, puis politiques cibles + révocation du `UPDATE` global sur `agents`
    (seul `nom` reste modifiable par un agent).
  - `supabase/migrations/006_agent_signup_trigger.sql` : trigger `on_auth_user_created`
    sur `auth.users` qui crée ou relie la ligne `agents` avec le rôle **`agent` imposé**
    côté serveur. Le rôle n'est jamais lu depuis les métadonnées client.
  - `src/lib/auth.ts` : le champ `role` n'est plus transmis à `signInWithOtp`.
  - `src/components/AuthPage.tsx` : suppression du choix de rôle administrateur dans
    l'inscription.
  - `supabase/schema.sql` : ne crée plus de politique permissive.
- [x] **Tests SQL exécutés réellement** — `supabase/tests/run-rls-tests.mjs`
  - PostgreSQL 17 embarqué (PGlite), `bun run test:rls`
  - Démonstration avant/après : agent A voit 2 observations avant 005, 1 après
  - 51 assertions d'isolation, d'écriture, d'élévation de privilèges, de rôles
    et d'inscription
  - Persistance inter-transaction vérifiée (marquage « lu » survive au commit)
  - Idempotence vérifiée sur 3 exécutions complètes des 9 migrations
- [x] **A1 + A2 du 13/11/2026**
  - `supabase/migrations/007_fix_admin_notifications.sql` : politique
    `notifs_update_admin`, l'admin peut de nouveau marquer les notifications lues.
  - `supabase/migrations/008_unify_admin_roles.sql` : `is_admin()` lit `agents.role`
    (plus le JWT), `current_agent_role()`, et `admin_set_role()` — unique mécanisme
    serveur de promotion / rétrogradation, avec synchronisation de `app_metadata`
    et garde-fou « dernier administrateur ».

## Current Structure

| File/Directory | Purpose | Status |
|----------------|---------|--------|
| `src/app/page.tsx` | Routeur principal (session Supabase → agent/admin) | ✅ |
| `src/app/layout.tsx` | Layout avec métadonnées PWA | ✅ |
| `src/app/globals.css` | Styles globaux (boutons terrain, badges) | ✅ |
| `src/lib/types.ts` | Types TypeScript + libellés | ✅ |
| `src/lib/store.ts` | localStorage — ne plus utiliser pour les données métier | ⚠️ |
| `src/lib/supabase.ts` | Client Supabase navigateur | ✅ |
| `src/lib/auth.ts` | OTP, session, `isCurrentUserAdmin` | ✅ |
| `src/lib/data.ts` | Accès observations / notifications | ✅ |
| `supabase/schema.sql` | Structure des tables (sans politique) | ✅ |
| `supabase/migrations/` | 001 → 006 | ✅ |
| `supabase/tests/` | Tests RLS + inscription | ✅ |
| `src/components/AuthPage.tsx` | Connexion / inscription OTP | ✅ |
| `src/components/AgentApp.tsx` | Accueil agent terrain | ✅ |
| `src/components/NouvelleObservation.tsx` | Formulaire de signalement | ✅ |
| `src/components/MesSignalements.tsx` | Historique des observations de l'agent | ✅ |
| `src/components/AdminApp.tsx` | Tableau de bord direction | ✅ |
| `src/components/QRCodeCanvas.tsx` | Partage QR code | ✅ |
| `public/manifest.json` | Manifest PWA (icônes manquantes) | ⚠️ |

## Règles de sécurité

- **Source de vérité du rôle : `public.agents.role`.** `auth.users.app_metadata.role`
  n'est qu'un cache d'affichage : il n'autorise plus aucune action (migration 008).
- Le rôle `admin` ne s'attribue que par `public.admin_set_role(telephone, role)`,
  elle-même réservée à un administrateur authentifié, ou directement en SQL avec
  les droits `service_role`.
- `SUPABASE_SERVICE_ROLE_KEY` ne doit jamais apparaître dans le code client.
- Toute nouvelle politique RLS doit être ajoutée dans une migration postérieure,
  jamais dans `schema.sql` sous forme permissive.
- Les tests SQL se lancent avec `bun run test:rls` avant tout commit touchant le schéma.

## Configuration Admin

Le rôle administrateur n'est plus choisi par le client. Il est attribué
côté serveur, par l'équipe technique :

```sql
-- Depuis un compte administrateur déjà existant
select public.admin_set_role('12345678', 'admin');
```

ou, en opération de bootstrap :

```sql
update public.agents set role = 'admin' where telephone = '12345678';
```

`admin_set_role` met à jour `agents.role` **et** synchronise `app_metadata.role`
(lorsque le rôle exécutant a le droit d'écrire dans `auth.users`). La RLS ne lit
que `agents.role` : la révocation est donc immédiate, sans attendre l'expiration du JWT.

## Session History

| Date | Changes |
|------|---------|
| Initial | Template created with base setup |
| 2026-03-18 | Application EcoWatch complète – agent + admin dashboard |
| 2026-11-12 | Audit : RLS contournée par des politiques permissives résiduelles ; inscription OTP sans création de profil agent |
| 2026-11-12 | Migrations 005 (purge RLS + durcissement) et 006 (trigger d'inscription) ; 25 tests SQL verts sur Postgres embarqué |
| 2026-11-13 | A1 : migration 007, l'admin peut de nouveau marquer les notifications comme lues |
| 2026-11-13 | A2 : migration 008, `is_admin()` lit `agents.role`, `admin_set_role()` devient l'unique mécanisme serveur de changement de rôle |
| 2026-11-13 | 51 assertions SQL (dont A1/A2), persistance inter-transaction vérifiée, idempotence 007/008 vérifiée sur 3 exécutions |
| 2026-11-13 | Finalisation complète : suivi des observations (statut, priorité, affectation, échéance, historique), photos Supabase Storage, interfaces Agent/Admin, PWA, documentation direction ; 72 assertions RLS vertes |
| 2026-11-13 | Robustesse du formulaire d'envoi (verrou double-clic, erreurs affichées, photo facultative/HEIC), affichage de `notePhoto`, 14 tests unitaires, 75 assertions RLS vertes |
| 2026-11-13 | Audit base réelle : aucun accès (ni env, ni CLI, ni psql) — livrables `docs/AUDIT-BASE-ECOWATCH.md` + audit SQL étendu (39 SELECT, sections 15/16) |
| 2026-11-13 | Contrôle final post-`9ff7050` : garde-fou HEIC/HEIF avant dépôt Storage, 18 tests unitaires, 75 assertions RLS vertes |
