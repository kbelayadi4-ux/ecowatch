# EcoWatch — Observations environnementales (SCG)

Application de signalement et de suivi des anomalies environnementales pour la
**Société des Ciments de Gabès (SCG)**. Elle permet à un agent de terrain de
signaler un problème depuis son téléphone et à l'administration de suivre le
traitement jusqu'à la clôture.

## Objectifs

- Donner aux agents un canal de signalement simple (téléphone, photo, zone).
- Donner à l'administration une vision consolidée et partagée de toutes les
  observations, en temps réel.
- Tracer chaque intervention (statut, priorité, responsable, échéance,
  commentaires) pour un pilotage fiable.

## Utilisateurs et rôles

| Rôle | Accès |
| --- | --- |
| **Agent** | Crée ses observations, consulte les siennes, suit leur statut et leur historique. |
| **Administrateur** | Consulte toutes les observations, filtre, affecte, change le statut et la priorité, définit une échéance, consulte l'historique, gère les agents et les rôles. |

Le rôle est stocké dans `public.agents.role` : c'est la **source de vérité**.
Le champ `app_metadata.role` du jeton de connexion n'est qu'un cache d'affichage
et n'autorise aucune action (migration 008).

## Fonctionnalités

### Agent
- Connexion par téléphone + code OTP (Supabase Auth).
- Création d'une observation : type de problème, zone, commentaire, photo.
- Compression automatique de la photo avant envoi.
- Liste de ses signalements avec statut, priorité, échéance et historique.
- Partage externe du signalement (e-mail / messagerie).

### Administrateur
- Tableau de bord : total, nouvelles, en cours, en retard, clôturées.
- Liste paginée avec filtres (statut, priorité, zone, type, agent, recherche
  texte, « en retard uniquement »).
- Fiche détaillée : photo, informations, changement de statut, priorité,
  responsable, échéance, commentaire de traitement, historique complet.
- Statistiques par type de problème et par zone.
- Gestion des agents et promotion / rétrogradation des administrateurs.
- QR code d'accès à l'application.
- Export Excel de la sélection courante ou de la totalité.
- Ajout manuel d'une observation pour le compte d'un agent.

## Architecture

```
Next.js 16 (App Router, React 19, TypeScript)
        │
        ├── Interface Agent      (src/components/AgentApp.tsx)
        ├── Interface Admin      (src/components/AdminApp.tsx)
        │
        └── Couche données       (src/lib/data.ts)
                │
                ▼
        Supabase (Auth + PostgreSQL + RLS + Realtime + Storage)
```

- `src/lib/data.ts` : toutes les lectures/écritures Supabase, aucune donnée
  métier dans le localStorage.
- `src/lib/auth.ts` : inscription, connexion OTP, session, résolution du profil
  agent.
- `supabase/migrations/` : schéma et sécurité (001 → 010).
- `supabase/tests/` : tests RLS exécutables localement (PGlite).

## Cycle de traitement d'une observation

`nouvelle` → `en_analyse` → `action_en_cours` → `attente_verification` →
`cloturee`

Chaque changement est horodaté et journalisé dans `observation_history`, et une
notification est créée pour l'agent concerné.

## Données

- **Aucune donnée métier dans le navigateur** : Supabase est la seule source de
  vérité. Le localStorage ne conserve plus que des préférences d'affichage.
- Les photographies sont stockées dans le bucket privé `photos`
  (`<agent_id>/<observation_id>.jpg`) ; en cas d'indisponibilité du stockage,
  l'image est conservée dans la colonne `photo` pour ne pas perdre le
  signalement.

## Documentation

- [Installation et déploiement](INSTALLATION-DEPLOIEMENT.md)
- [Sécurité Supabase](SECURITE-SUPABASE.md)
- [Tests et validation](TESTS-VALIDATION.md)
- [Rapport final direction](RAPPORT-FINAL-DIRECTION.md)