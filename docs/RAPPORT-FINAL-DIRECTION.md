# Rapport final — Direction

**Projet** : EcoWatch — suivi des observations environnementales
**Client** : Société des Ciments de Gabès (SCG)
**Branche de référence** : `feat/supabase-auth` — commit `9ff71ef`
**Date** : novembre 2026

---

## 1. Contexte et objectifs du projet

La SCG souhaite disposer d'un outil permettant aux agents d'usine de signaler
rapidement les anomalies environnementales constatées sur le terrain (fuites,
déchets mal triés, EPI éparpillés, odeurs anormales…) et à l'administration de
recevoir, traiter et suivre ces signalements jusqu'à leur clôture.

Objectifs :

- un canal de signalement simple, utilisable avec des gants, sur téléphone ;
- une vision consolidée et partagée de toutes les observations ;
- une traçabilité complète des actions correctives ;
- une base de données unique, sécurisée, accessible depuis plusieurs appareils.

## 2. Difficultés de gestion des observations avant EcoWatch

- Les signalements étaient saisis sur papier ou transmis oralement : aucune
  consolidation, aucun suivi d'avancement.
- Aucune traçabilité : impossible de savoir qui a traité quoi, ni quand.
- Les relances et les clôtures n'étaient pas formalisées.
- Aucune donnée exploitable pour le pilotage environnemental.

## 3. Solution développée

Une application web (téléphone et ordinateur) adossée à une base de données
**Supabase** :

- les agents saisissent une observation depuis leur téléphone, avec photo ;
- l'administration reçoit l'observation en temps réel, la qualifie (statut,
  priorité), l'affecte, fixe une échéance et la suit jusqu'à clôture ;
- chaque intervention est horodatée et journalisée ;
- les données sont centralisées : Supabase est l'unique source de vérité.

## 4. Fonctionnalités Agent

- Connexion par numéro de téléphone et code SMS.
- Création d'un signalement en quelques secondes (type, zone, commentaire).
- Prise de photo, compressée automatiquement avant envoi.
- Liste de ses propres signalements avec statut, priorité et échéance.
- Historique des interventions sur chacun de ses signalements.
- Partage du signalement par e-mail ou messagerie.

## 5. Fonctionnalités Administrateur

- Tableau de bord : total, nouvelles, en cours, en retard, clôturées.
- Liste filtrable et paginée de tous les signalements (statut, priorité, zone,
  type, agent, recherche texte, « en retard uniquement »).
- Traitement d'une observation : statut, priorité, responsable, échéance,
  commentaire.
- Historique complet par observation.
- Statistiques par type de problème et par zone.
- Gestion des agents et des rôles (promotion, rétrogradation).
- Ajout manuel d'un signalement pour le compte d'un agent.
- Export Excel et QR code d'accès.

## 6. Suivi des anomalies et actions correctives

Chaque observation suit le cycle :

`nouvelle` → `en_analyse` → `action_en_cours` → `attente_verification` →
`cloturee`

Pour chaque observation sont enregistrés : le numéro de suivi unique
(`SCG-AAAAMMJJ-00001`), l'agent déclarant, la date, le type, la zone, le
commentaire, la photo, le statut, la priorité, le responsable, l'échéance et la
date de clôture. Chaque changement de statut déclenche une notification pour
l'agent concerné et une entrée dans l'historique.

## 7. Centralisation et synchronisation des données

- Les données sont stockées dans **PostgreSQL (Supabase)**, et non plus dans le
  navigateur.
- La synchronisation entre appareils est assurée par **Supabase Realtime** : une
  observation créée sur un téléphone apparaît immédiatement côté administration,
  sans rechargement de page.
- Aucun mécanisme d'interrogation périodique : la charge réseau est limitée aux
  changements réels.
- Les photographies sont stockées dans un espace privé (bucket `photos`) et
  accessibles par lien temporaire.

## 8. Dispositifs de sécurité

- **Cloisonnement** : un agent ne voit que ses propres signalements ; un
  administrateur voit l'ensemble.
- **Cloisonnement appliqué par la base de données** (Row Level Security), et non
  seulement par l'interface : il ne peut pas être contourné depuis un navigateur.
- **Identité imposée par la base** à chaque enregistrement : un agent ne peut pas
  usurper l'identité d'un autre.
- **Rôles non falsifiables** : un agent ne peut pas se déclarer administrateur ;
  le rôle est lu dans la base, la révocation est immédiate.
- **Dernier administrateur protégé** : la rétrogradation du dernier
  administrateur est refusée.
- **Traçabilité** : chaque création, modification et suppression est journalisée
  avec l'auteur, l'horodatage et le détail du changement.
- **Photographies privées** : accès par lien temporaire uniquement.
- **Secrets** : aucune clé privée dans le code ni dans les variables publiques.

## 9. Résultats des tests

| Vérification | Statut |
| --- | --- |
| Contrôle de types (TypeScript) | ✅ Validé localement |
| Vérification du code (ESLint) | ✅ Validé localement |
| Tests de sécurité base de données (75 assertions) | ✅ Validés localement |
| Build de production | ✅ Validé localement |
| Audit de la base Supabase réelle | ⏳ En cours |
| Application des migrations 009 / 010 | ⏳ À autoriser |
| Test multi-téléphones (2 agents + administrateur) | ⏳ À réaliser |

Les tests de sécurité exécutent réellement le code des migrations sur un
PostgreSQL embarqué. Ils valident la logique métier et les règles de sécurité,
mais ne remplacent pas une vérification sur l'instance hébergée.

## 10. Bénéfices attendus pour la SCG

- **Réactivité** : une anomalie est signalée en moins d'une minute, avec photo
  géolocalisée par la zone.
- **Traçabilité** : chaque action corrective est datée et attribuée.
- **Pilotage** : indicateurs par zone et par type d'anomalie, export Excel pour
  les réunions.
- **Fiabilité** : données centralisées, partagées entre tous les appareils, sans
  ressaisie.
- **Conformité** : historique exploitable en cas d'audit environnemental.
- **Autonomie** : les agents sont acteurs du dispositif, l'administration garde
  la maîtrise du traitement.

## 11. Limites éventuelles

1. **Test multi-téléphones non réalisé** à ce jour : c'est la validation qui
   conditionne la mise en service.
2. **Envoi des codes SMS** : nécessite la configuration d'un fournisseur (Twilio,
   Vonage…) et un budget associé.
3. **Mode hors ligne** : l'application fonctionne en ligne. En cas de perte de
   réseau, l'utilisateur est informé et l'envoi est bloqué ; aucune
   synchronisation différée n'est proposée (choix assumé pour éviter toute perte).
4. **Notifications** : elles sont internes à l'application ; aucun e-mail ni SMS
   sortant n'est envoyé.
5. **Statistiques** : pas encore de tableau de bord d'indicateurs de délai de
   traitement (évolution prévue).

## 12. Conditions de généralisation à l'ensemble des agents

- [ ] Application des migrations 009 et 010 sur la base de production.
- [ ] Création du premier compte administrateur et vérification du rôle.
- [ ] Configuration du fournisseur SMS.
- [ ] Réalisation du test multi-téléphones (§ 9 de `TESTS-VALIDATION.md`).
- [ ] Création des comptes agents avec vérification de la liaison Auth.
- [ ] Déploiement de la branche `feat/supabase-auth` sur Netlify.
- [ ] Formation courte des agents (15 minutes) et de l'administration.
- [ ] Désignation d'un référent par atelier.

---

**Conclusion**

L'application est techniquement finalisée et validée localement : authentification,
cloisonnement des données, suivi des anomalies, temps réel, photographies et
documentation sont en place. La mise en service repose sur l'audit de la base
Supabase réelle, l'application des migrations 009 et 010, puis le test
multi-téléphones. Ces trois étapes restent à réaliser avant toute mise en
production.