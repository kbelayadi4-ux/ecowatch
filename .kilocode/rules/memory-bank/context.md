# Active Context: EcoWatch – Application de Signalement Environnemental

## Current State

**App Status**: 🟡 En cours de migration vers Supabase — branche `feat/supabase-auth`

La branche `main` reste sur localStorage. La branche `feat/supabase-auth` porte la
migration vers Supabase Auth / Postgres / Realtime. L'interface et les fonctionnalités
existantes sont conservées.

## Recently Completed

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
  - 25 assertions d'isolation, d'écriture, d'élévation de privilèges et d'inscription

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

- Le rôle `admin` ne s'attribue que via l'API Admin Supabase (`service_role`).
- `SUPABASE_SERVICE_ROLE_KEY` ne doit jamais apparaître dans le code client.
- Toute nouvelle politique RLS doit être ajoutée dans `005_secure_cleanup.sql`
  ou dans une migration postérieure, jamais dans `schema.sql` sous forme permissive.
- Les tests SQL se lancent avec `bun run test:rls` avant tout commit touchant le schéma.

## Configuration Admin

Le rôle administrateur n'est plus choisi par le client. Il est attribué
côté serveur, par l'équipe technique :

```sql
update public.agents set role = 'admin' where telephone = '12345678';
```

puis, dans le dashboard Supabase, `Authentication > Users > app_metadata.role = "admin"`
(la RLS s'appuie sur `app_metadata`).

## Session History

| Date | Changes |
|------|---------|
| Initial | Template created with base setup |
| 2026-03-18 | Application EcoWatch complète – agent + admin dashboard |
| 2026-11-12 | Audit : RLS contournée par des politiques permissives résiduelles ; inscription OTP sans création de profil agent |
| 2026-11-12 | Migrations 005 (purge RLS + durcissement) et 006 (trigger d'inscription) ; 25 tests SQL verts sur Postgres embarqué |
