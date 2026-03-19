# Active Context: EcoWatch – Application de Signalement Environnemental

## Current State

**App Status**: ✅ Fonctionnel – Interface agent + tableau de bord admin déployés

The template is a clean Next.js 16 starter with TypeScript and Tailwind CSS 4. It's ready for AI-assisted expansion to build any type of application.

## Recently Completed

- [x] Base Next.js 16 setup with App Router
- [x] TypeScript + Tailwind CSS 4
- [x] **EcoWatch app complète** – Application mobile-first de signalement environnemental
  - Authentification par numéro de téléphone tunisien (sans +216)
  - Rôles: agent (terrain) et admin (direction)
  - Interface agent: bouton "Nouvelle Observation", formulaire complet, photo, historique, partage WhatsApp/Email
  - Interface admin: tableau de bord avec graphiques (barres + camembert), liste filtrée, export Excel/CSV, QR code de partage
  - Données stockées en localStorage (côté client, sans serveur)
  - Design vert/blanc, gros boutons pour utilisation avec gants

## Current Structure

| File/Directory | Purpose | Status |
|----------------|---------|--------|
| `src/app/page.tsx` | Routeur principal (auth → agent/admin) | ✅ |
| `src/app/layout.tsx` | Layout avec métadonnées PWA | ✅ |
| `src/app/globals.css` | Styles globaux (boutons terrain, badges) | ✅ |
| `src/lib/types.ts` | Types TypeScript + constantes (ADMIN_PHONES) | ✅ |
| `src/lib/store.ts` | Gestion localStorage (observations, agents, session) | ✅ |
| `src/components/AuthPage.tsx` | Page connexion par téléphone | ✅ |
| `src/components/AgentApp.tsx` | Accueil agent terrain | ✅ |
| `src/components/NouvelleObservation.tsx` | Formulaire de signalement | ✅ |
| `src/components/MesSignalements.tsx` | Historique des observations de l'agent | ✅ |
| `src/components/AdminApp.tsx` | Tableau de bord direction | ✅ |
| `src/components/QRCodeCanvas.tsx` | Partage QR code | ✅ |
| `public/manifest.json` | Manifest PWA | ✅ |

## Configuration Admin

Pour ajouter un numéro admin, modifier `ADMIN_PHONES` dans `src/lib/types.ts`:
```ts
export const ADMIN_PHONES = ["12345678", "87654321"]; // sans +216
```

## Session History

| Date | Changes |
|------|---------|
| Initial | Template created with base setup |
| 2026-03-18 | Application EcoWatch complète – agent + admin dashboard |
