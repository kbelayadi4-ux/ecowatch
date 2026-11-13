# Rapport final — Direction

**Projet** : EcoWatch — suivi des observations environnementales
**Client** : Société des Ciments de Gabès (SCG)
**Branche de référence** : `feat/supabase-auth`
**Date** : novembre 2026

---

## 1. Problématique initiale

Les agents d'usine constatent sur le terrain des anomalies environnementales
(fuites, déchets mal triés, EPI éparpillés, odeurs anormales…) et les
transmettent à l'administration. Avant ce travail, les signalements créés depuis
certains téléphones **n'apparaissaient pas** dans l'espace administrateur.

## 2. Cause identifiée

L'application conservait les observations dans le **stockage local du
navigateur** (localStorage). Deux téléphones ne partageaient donc aucune donnée :
chaque appareil ne voyait que ses propres signalements. Les rôles étaient par
ailleurs lus depuis le jeton de connexion, ce qui retardait toute révocation.

## 3. Solution apportée

- **Supabase est devenu l'unique source de vérité** des données partagées. Le
  stockage local ne conserve plus aucune donnée métier.
- **Synchronisation en temps réel** : chaque appareil est abonné aux changements
  de la base (Realtime), sans interrogation périodique.
- **Rôles fiables** : le rôle métier est lu dans la base (`agents.role`), ce qui
  rend une révocation immédiate.
- **Suivi complet** : statut, priorité, responsable, échéance, commentaires et
  historique horodaté de chaque observation.
- **Photographies** : stockées dans un espace privé Supabase (bucket `photos`),
  avec compression avant envoi.

## 4. Fonctionnalités opérationnelles

### Espace Agent
- Connexion par téléphone et code SMS.
- Création d'un signalement en quelques secondes (type, zone, commentaire,
  photo).
- Suivi de ses propres signalements : statut, priorité, échéance, historique.
- Partage du signalement par e-mail ou messagerie.

### Espace Administrateur
- Tableau de bord : total, nouvelles, en cours, en retard, clôturées.
- Liste filtrable et paginée de tous les signalements.
- Traitement : changement de statut, priorité, affectation d'un responsable,
  échéance, commentaire.
- Historique complet des interventions par observation.
- Statistiques par type de problème et par zone.
- Gestion des agents et des rôles.
- Export Excel.
- Ajout manuel d'un signalement pour le compte d'un agent.

## 5. Architecture technique

| Composant | Technologie |
| --- | --- |
| Interface | Next.js 16 (App Router), React 19, TypeScript |
| Style | Tailwind CSS 4 |
| Base de données | PostgreSQL managé (Supabase) |
| Authentification | Supabase Auth (OTP SMS) |
| Sécurité | Row Level Security + fonctions `SECURITY DEFINER` |
| Temps réel | Supabase Realtime |
| Fichiers | Supabase Storage (bucket privé) |
| Hébergement | Netlify |

Le code source est organisé en trois couches : interfaces (`src/components`),
logique d'authentification (`src/lib/auth.ts`) et accès aux données
(`src/lib/data.ts`).

## 6. Sécurité et protection des données

- **Cloisonnement strict** : un agent ne voit que ses propres signalements ;
  l'administrateur voit l'ensemble.
- **Aucun contournement possible depuis le navigateur** : les règles de sécurité
  sont appliquées par la base de données, pas seulement par l'interface.
- **Rôles non falsifiables** : un agent ne peut pas se déclarer administrateur ;
  la base impose son identité à chaque enregistrement.
- **Dernier administrateur protégé** : la rétrogradation du dernier
  administrateur est refusée.
- **Traçabilité** : chaque création, modification et suppression est
  journalisée avec l'auteur, l'horodatage et le détail du changement.
- **Photographies privées** : accès par lien temporaire uniquement, jamais de
  lien public.
- **Secrets** : aucune clé privée dans le code ni dans les variables publiques.

## 7. Résultats des tests

| Vérification | Statut |
| --- | --- |
| Contrôle de types (TypeScript) | ✅ Réussi |
| Vérification du code (ESLint) | ✅ Réussi |
| Tests de sécurité base de données (72 assertions) | ✅ Réussis |
| Build de production | ✅ Réussi |
| Test sur base Supabase réelle | ⏳ À réaliser |
| Test multi-téléphones | ⏳ À réaliser |

Les tests de sécurité exécutent réellement le code des migrations sur un
PostgreSQL embarqué. Ils valident la logique, mais **ne remplacent pas** une
vérification sur l'instance hébergée : ce point est détaillé dans
`TESTS-VALIDATION.md`.

## 8. Limites restantes

1. **Test multi-téléphones non réalisé** : aucun appareil physique ni instance
   Supabase réelle n'était accessible lors de la préparation. C'est le test qui
   conditionne la mise en service.
2. **Fournisseur SMS** : l'envoi des codes OTP nécessite la configuration d'un
   fournisseur (Twilio, Vonage…) et un budget associé.
3. **Mode hors ligne** : l'application fonctionne en ligne. En cas de perte de
   réseau, l'utilisateur est informé et l'envoi est bloqué ; aucune synchronisation
   différée n'est proposée (choix assumé pour éviter toute perte de données).
4. **Échéance** : la fonction de mise à jour ne permet pas d'effacer une échéance
   déjà fixée (elle peut être modifiée). Évolution prévue.
5. **Notifications** : elles sont internes à l'application. Aucun e-mail ni SMS
   sortant n'est envoyé.

## 9. Conditions de mise en production

- [ ] Appliquer les migrations 001 → 010 sur l'instance Supabase de production.
- [ ] Créer le premier compte administrateur et vérifier son rôle.
- [ ] Configurer le fournisseur SMS.
- [ ] Réaliser le test multi-téléphones (§ 3 de `TESTS-VALIDATION.md`).
- [ ] Vérifier la configuration Netlify (branche `feat/supabase-auth`, variables
      `NEXT_PUBLIC_*`).
- [ ] Former les agents et l'administration (15 minutes).
- [ ] Vérifier l'export Excel et le QR code d'accès.

## 10. Perspectives d'évolution

- Application mobile installable (PWA déjà amorcée : manifeste et icônes en
  place) avec notification locale à la réception d'un changement de statut.
- Tableau de bord d'indicateurs (délai moyen de traitement, taux de clôture).
- Pièces jointes multiples par observation.
- Mode hors ligne avec file d'attente synchronisée.
- Export PDF mis en forme pour les rapports mensuels.
- Statistiques par période et par atelier.

---

**Conclusion**

L'application est techniquement finalisée : authentification, cloisonnement des
données, suivi des anomalies, temps réel, photographies et documentation sont en
place, et les tests techniques sont au vert. La validation finale repose sur le
test multi-téléphones à réaliser sur l'instance Supabase réelle, qui conditionne
la mise en service.