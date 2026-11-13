# Tests et validation

Ce document distingue impérativement trois niveaux de validation :

| Statut | Signification |
| --- | --- |
| **Validé par tests locaux** | Vérifié par une commande exécutable dans le dépôt |
| **Validé sur Supabase réel** | Vérifié manuellement sur l'instance hébergée |
| **Validé sur appareils physiques** | Vérifié depuis un téléphone réel |
| **Non testé / en attente** | Nécessite une action humaine non réalisable ici |

## 1. Tests techniques exécutés

| Commande | Résultat |
| --- | --- |
| `bun typecheck` | ✅ 0 erreur |
| `bun lint` | ✅ 0 erreur, 3 avertissements (`<img>` pour les photos en data URL / URL signée) |
| `bun run test:rls` | ✅ 72 assertions vertes |
| `bun run build` | ✅ build de production réussi |
| `git diff --check` | ✅ aucun conflit de marques |

### Détail des tests RLS

`bun run test:rls` applique `schema.sql` puis les migrations 001 à 010 sur un
PostgreSQL embarqué (PGlite, PostgreSQL 17 compilé en WASM), puis exécute
`supabase/tests/rls_security.test.sql`. Ce dernier se termine par un `ROLLBACK` :
aucune donnée n'est conservée.

Les assertions couvrent :

1. Absence de politique permissive (`USING (true)` / `WITH CHECK (true)`).
2. Aucune insertion cliente possible sur `agents` et `notifs`.
3. Un agent lit uniquement son profil et ses observations.
4. Un agent ne peut pas se promouvoir administrateur.
5. `is_admin()` suit `agents.role`, pas le jeton.
6. `admin_set_role` refuse un agent, protège le dernier administrateur,
   synchronise `app_metadata`.
7. Le trigger d'inscription impose le rôle `agent`.
8. Après 009 : identité de l'agent imposée par la base, numéro de suivi généré,
   historique et notification de changement de statut, refus d'écriture
   directe dans l'historique, traçabilité après suppression.
9. Après 010 : bucket `photos` privé (lorsque le schéma `storage` est
   disponible).

## 2. Tests fonctionnels à réaliser

Ces tests nécessitent un compte de test et un fournisseur SMS actif.

- [ ] Inscription d'un agent (OTP reçu).
- [ ] Connexion d'un agent existant.
- [ ] Persistance de la session après actualisation du navigateur.
- [ ] Déconnexion puis reconnexion.
- [ ] Création d'une observation avec photo.
- [ ] Vérification de la présence côté administrateur.
- [ ] Changement de statut / priorité / responsable / échéance.
- [ ] Ajout d'un commentaire de traitement et vérification dans l'historique.
- [ ] Notification créée pour l'agent lors d'un changement de statut.
- [ ] Export Excel.
- [ ] Promotion / rétrogradation d'un agent.

## 3. Test multi-téléphones (indispensable, non réalisé ici)

Scénario à exécuter sur le terrain :

1. Téléphone 1 : connexion de l'agent A.
2. Téléphone 2 : connexion de l'agent B.
3. L'agent A crée une observation (avec photo).
4. L'agent B crée une seconde observation.
5. Depuis un ordinateur, l'administrateur vérifie que **les deux** observations
   apparaissent, avec leur photo.
6. Actualiser la page administrateur : les observations sont toujours là.
7. Déconnecter / reconnecter chaque agent : leurs observations restent visibles.

**Statut : non réalisé.** Aucun appareil physique ni instance Supabase réelle
n'était accessible lors de la préparation.

## 4. Limite importante concernant les tests locaux

Les tests PGlite exécutent réellement le SQL des migrations, mais **ne
remplacent pas** une validation sur l'instance Supabase :

- le schéma `storage` n'existe pas en local (la migration 010 s'y adapte) ;
- les rôles `authenticated` / `anon` sont simulés ;
- les fonctions `auth.uid()` / `auth.jwt()` sont réimplémentées localement ;
- Realtime n'est pas exercé.

## 5. Procédure de validation sur Supabase réel

1. Créer un projet de recette (ou utiliser l'environnement de test).
2. Appliquer les migrations 001 → 010 dans l'ordre.
3. Vérifier les messages de fin de chaque migration (`raise notice`).
4. Créer un agent et un administrateur de test.
5. Exécuter le scénario multi-téléphones du §3.
6. Contrôler les journaux Supabase (*Logs → Postgres*) : aucune erreur RLS.
7. Vérifier la présence des objets dans le bucket `photos`.

## 6. Journalisation

- Les erreurs d'écriture Supabase sont affichées à l'utilisateur sous forme de
  message compréhensible (« Le signalement n'a pas pu être envoyé… »).
- Les erreurs techniques sont visibles dans la console du navigateur et dans les
  journaux Supabase.
- Aucune donnée personnelle n'est journalisée.