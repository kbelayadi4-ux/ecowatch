# CONTRE-AUDIT DES LIVRABLES SUPABASE — ECOWATCH SCG

**Branche :** `feat/supabase-auth`
**Objet :** contre-audit indépendant des quatre livrables produits le 17/11/2026,
puis correction et validation du SQL avant toute exécution.
**Date :** 21/11/2026

> **Aucun SQL n'a été exécuté sur le projet Supabase réel.**
> Aucune migration n'a été appliquée, aucune donnée modifiée, aucun déploiement.
> Ce document est un rapport d'audit ; il se termine par un verdict.

---

## 1. Rapport de contre-audit détaillé

### 1.1 Méthode

| Étape | Moyen | Limite assumée |
|---|---|---|
| Relecture intégrale des 4 livrables | lecture ligne à ligne | — |
| Relecture des migrations 001→011 | 1 480 lignes | — |
| Contrôle statique du SQL généré | recherche de `DELETE`, `DROP`, `TRUNCATE`, `RENAME`, `UPDATE`, `GRANT/REVOKE` | — |
| Exécution sur base vierge reproduisant le schéma réel | PGlite (PostgreSQL 17) | ce n'est **pas** l'instance Supabase |
| Scénario d'échec et de rollback | table antérieure mal formée | — |
| Scénario de simulation (dry-run) | variante `ROLLBACK` | — |
| Escalade de privilèges | 8 tentatives réelles sous rôle `authenticated` | — |
| Accès Storage | silhouette `storage` avec RLS | approximation du schéma Supabase |
| Suite projet | `typecheck`, `lint`, `build`, `test`, `test:rls`, `fix:verifier` | — |

### 1.2 Conclusion de la relecture

Le SQL est **exécutable et sûr**, mais le premier jeu de livrables présentait
**sept insuffisances** (section 2). Six sont des manques de *preuve* (le SQL
était correct, mais rien ne le démontrait) ; une est une véritable ambiguïté
de livraison (`ROLLBACK` / `COMMIT`). Toutes sont corrigées.

Aucun défaut bloquant n'a été trouvé dans les migrations 001→011 elles-mêmes.

---

## 2. Erreurs et insuffisances découvertes dans le premier SQL

### E1 — Aucune variante de simulation (ambiguïté de livraison)

**Constat.** Le premier jeu ne contenait qu'un script se terminant par `COMMIT`.
Un relecteur pouvait craindre — à juste titre — qu'un script de test avec
`ROLLBACK` soit présenté comme installation définitive. Le risque inverse
existait aussi : un script d'installation pouvait être confondu avec une
simulation.

**Correction.** Deux fichiers distincts, noms, en-têtes et empreintes
différents :

| Fichier | Fin | Effet |
|---|---|---|
| `alignement-eco-watch.sql` | `commit;` | **installation** — modifications conservées |
| `alignement-eco-watch-dry-run.sql` | `rollback;` | **simulation** — tout est annulé |

Le générateur `build-alignement.mjs --dry-run` produit la seconde ; le fichier
installateur ne contient **aucun** `rollback;` (asserté automatiquement).

### E2 — Aucune preuve de persistance après `COMMIT`

**Constat.** Le vérificateur relisait les objets dans des transactions
ultérieures, mais aucune assertion n'affirmait explicitement que les objets
créés par le script subsistaient après le `COMMIT`. Une annulation silencieuse
(ou un `ROLLBACK` résiduel) serait passée inaperçue.

**Correction.** Section 12 du vérificateur : après exécution, dans une
**nouvelle** transaction, contrôle de `agents.auth_user_id`, des 5 colonnes de
suivi, des 2 tables de service et des 2 observations insérées.

### E3 — Aucun test du chemin d'échec

**Constat.** Rien ne prouvait qu'une vérification en échec **annulait tout**.
C'est pourtant la garantie centrale du script.

**Correction.** Section 14 : création d'une table `observation_history` de forme
incorrecte **avant** exécution. Le script doit échouer, et l'on vérifie ensuite
que `agents.auth_user_id`, `observations.statut` et
`signalement_public_abus` n'existent pas, et que la table antérieure est
**intacte** (1 colonne, pas 0 : aucune destruction).

### E4 — Escalade de privilèges vérifiée par les droits déclarés, pas par des tentatives

**Constat.** Le premier vérificateur interrogeait `has_column_privilege()`.
C'est nécessaire mais insuffisant : une politique RLS absente ne se voit pas
dans les privilèges.

**Correction.** Section 11 : **8 tentatives réelles** sous rôle
`authenticated`, avec un utilisateur `agent` et un utilisateur `admin`.

| Tentative | Attendu | Résultat |
|---|---|---|
| `update agents set role='admin'` sur soi-même | refusé (privilège colonne) | OK |
| `update agents set nom=…` sur le profil d'un autre | 0 ligne | OK |
| `insert into agents (… 'admin')` | refusé (RLS) | OK |
| `update observations set statut='cloturee'` | 0 ligne | OK |
| `delete from observations` | 0 ligne | OK |
| `update notifs set lu=true` | 0 ligne | OK |
| `update observations` en tant qu'admin | 2 lignes | OK |
| `update agents set nom` en tant qu'admin | 1 ligne | OK |

### E5 — Accès aux photographies jamais testé

**Constat.** C'était la lacune la plus grave. Le vérificateur tournait sans
schéma `storage` : la migration 010 ne créait **ni bucket ni politique**, et
les règles d'accès aux photos n'étaient donc **jamais exercées**. Un audit qui
ne teste pas les photos ne pouvait pas conclure sur
« les photos ne sont pas accessibles publiquement ».

**Correction.** Le harnais monte une silhouette minimale du schéma `storage`
(`buckets`, `objects`, `foldername()`, RLS activée) et **9 contrôles** portent
désormais sur les photos :

| Contrôle | Résultat |
|---|---|
| bucket `photos` créé | OK |
| `public = false` | OK |
| limite 5 Mo | OK |
| types JPEG/PNG/WebP | OK |
| un agent ne lit que **son** dossier | OK |
| l'admin lit tout | OK |
| `anon` ne lit **aucune** photo | OK |
| `anon` ne peut pas déposer | OK |
| `authenticated` ne lit pas le registre anti-abus | OK |

### E6 — Contrat transactionnel non asserté

**Constat.** Rien n'empêchait une modification future du générateur
d'introduire un `ROLLBACK` dans le script d'installation — l'erreur la plus
dangereuse possible, puisqu'elle donnerait l'illusion d'un succès.

**Correction.** Section 0 du vérificateur : compte des instructions de
transaction dans **chaque** fichier.

| Fichier | BEGIN | COMMIT | ROLLBACK |
|---|---|---|---|
| installation | 1 | 1 | **0** |
| dry-run | 1 | **0** | 1 |

Plus l'assertion que la section « VERIFICATION FINALE » précède
numériquement le `COMMIT`.

### E7 — Rapport initial périmé après régénération

**Constat.** L'ajout de l'en-tête `Mode : …` dans le générateur a modifié
l'empreinte SHA-256 du script d'installation (`03db7ef8…` → `c3671a79…`) et son
nombre de lignes (2189 → 2191). Le rapport du 17/11/2026 citait l'ancienne
empreinte.

**Correction.** `docs/AUDIT-SYNCHRONISATION-SUPABASE.md` mis à jour
(section 4.1) et le présent document donne les empreintes courantes.

### 2.1 Ce qui a été vérifié sans anomalie

* **Ordre des migrations** : 001→011, chaque prérequis est bien créé avant son
  consommateur ; `011` refuse de s'exécuter sans `009` (préflight) et le script
  échouerait donc si l'ordre était cassé.
* **Types** : aucune migration ne modifie un type existant ; les ajouts sont
  `text` nullable, `timestamptz` nullable ou à défaut constant, `uuid` nullable.
  Aucune réécriture de table, aucun `ALTER COLUMN TYPE`.
* **Clés étrangères** : `observations.agent_id → agents(id)` (NOT NULL),
  `observations.assigne_a → agents(id)` (NULL, ON DELETE SET NULL),
  `notifs.obs_id → observations(id)` (ON DELETE CASCADE),
  `observation_history.observation_id → observations(id)` (ON DELETE SET NULL).
* **Contraintes NOT NULL** : les colonnes ajoutées à `observations` sont
  `statut` et `priorite` (NOT NULL **avec défaut** ⇒ aucune ligne existante en
  échec, et sur table vide aucun coût) et `maj_le` (défaut `now()`).
* **Fonctions SECURITY DEFINER** : les 11 fonctions publiques sont
  `SECURITY DEFINER`. Toutes figent `search_path` (`public, pg_temp` pour 9
  d'entre elles, `public` pour `current_agent_id()` et
  `create_notification_for_observation()`) ; 8 ajoutent `row_security = off`
  pour éviter la récursion RLS. Aucune n'est `SECURITY INVOKER`. Vérifié par
  empreinte du schéma (`pg_proc.prosecdef` et `proconfig`).
* **Politiques RLS** : aucune politique `USING (true)` ne subsiste
  (contrôle §5 du vérificateur et §12 du script de vérification).
* **Droits `anon`** : aucun `SELECT`/`INSERT`/`UPDATE`/`DELETE` sur
  `observations`, `agents`, `notifs`, `observation_history`,
  `signalement_public_abus` ; seul `EXECUTE` sur `creer_signalement_public`.
* **Droits `authenticated`** : `SELECT` sur `observations`/`agents`/`notifs` ;
  `UPDATE` limité à la colonne `agents.nom` ; ni `role`, ni `telephone`, ni
  `auth_user_id` modifiables.
* **Storage** : bucket privé, politiques `to authenticated` uniquement,
  lecture cloisonnée par dossier.

---

## 3. Corrections apportées

| # | Fichier | Nature | Détail |
|---|---|---|---|
| 1 | `supabase/fix/build-alignement.mjs` | modifié | option `--dry-run` : en-tête « SIMULATION », fin `rollback;`, sortie `…-dry-run.sql` |
| 2 | `supabase/fix/alignement-eco-watch-dry-run.sql` | **nouveau** | 2196 lignes, simulation annulée |
| 3 | `supabase/fix/alignement-eco-watch.sql` | régénéré | 2191 lignes, en-tête `Mode : INSTALLATION`, fin `commit;` |
| 4 | `supabase/fix/verifier-alignement.mjs` | modifié | + contrat transactionnel, persistance, dry-run, rollback, escalade (8), photos (9) |
| 5 | `package.json` | modifié | script `fix:dry-run` |
| 6 | `docs/AUDIT-SYNCHRONISATION-SUPABASE.md` | corrigé | empreinte et nombre de lignes du script d'installation |
| 7 | `docs/CONTRE-AUDIT-SUPABASE.md` | **nouveau** | ce rapport |

**Aucune migration 001→011 n'a été modifiée.** Les corrections portent
uniquement sur les outils d'audit et sur la livraison du SQL.

### 3.1 Diff du générateur (extrait)

```diff
-const EN_TETE = `-- ============================================================
--- EcoWatch SCG — ALIGNEMENT DE LA BASE SUPABASE
+const DRY_RUN = process.argv.includes("--dry-run");
+
+const EN_TETE = `-- ============================================================
+-- EcoWatch SCG — ALIGNEMENT DE LA BASE SUPABASE
+-- Mode : ${DRY_RUN ? "SIMULATION (ROLLBACK, aucune modification conservee)" : "INSTALLATION (COMMIT, modifications conservees)"}
```

```diff
-commit;
+${DRY_RUN ? "rollback;" : "commit;"}
```

```diff
-writeFileSync(join(root, "supabase/fix/alignement-eco-watch.sql"), sortie, "utf8");
+const cheminSortie = DRY_RUN
+  ? "supabase/fix/alignement-eco-watch-dry-run.sql"
+  : "supabase/fix/alignement-eco-watch.sql";
```

---

## 4. SQL définitif prêt pour Supabase

### 4.1 Script d'installation

| | |
|---|---|
| Chemin | `supabase/fix/alignement-eco-watch.sql` |
| Lignes | **2191** |
| SHA-256 | `c3671a79395d61e5eb90bbb64c925124f1e10500d2d12a7a2613c69bdbc40b6c` |
| Structure | `begin;` (l.27) → 11 étapes → vérification (l.2020‑2188) → `commit;` (l.2189) |
| Effet | **conserve** les modifications |

Vérifications de contrat (assertées) : 1 `BEGIN`, 1 `COMMIT`, **0 `ROLLBACK`**,
pas de commande `psql` (`\echo`…), aucune instruction `DROP TABLE`, `TRUNCATE`,
`RENAME` ou `ALTER COLUMN TYPE`.

**Seul `DELETE` du script** (l.1798) :

```sql
delete from public.signalement_public_abus where cree_le < now() - interval '1 day';
```

Il porte sur le registre anti-abus **créé par ce même script**, jamais sur les
observations, les agents ou les notifications.

**Seuls `UPDATE` de données** :

| Ligne | Contexte | Portée |
|---|---|---|
| 625, 647 | `handle_new_auth_user()` | profils agents, à l'inscription |
| 922, 930 | `admin_set_role()` | changement de rôle, **réservé à l'admin** |
| 1346 | `admin_update_observation()` | suivi, **réservé à l'admin** |
| 1408 | boucle de reprise | `numero_suivi` **uniquement si NULL** |

### 4.2 Script de simulation

| | |
|---|---|
| Chemin | `supabase/fix/alignement-eco-watch-dry-run.sql` |
| Lignes | **2196** |
| SHA-256 | `6bc34b1f6e0b987a401d874887ac783d70bae6ce5a83f2caaec5571306f53aae` |
| Structure | `begin;` → 11 étapes → vérification → `rollback;` |
| Effet | **n'annule** rien : base strictement inchangée |

Usage recommandé : l'exécuter **en premier** pour vérifier que l'instance
accepte l'intégralité du script (rôle d'exécution, publication Realtime,
schéma `storage`). S'il passe, lancer le script d'installation.

Régénérer les deux : `bun run fix:generer` puis `bun run fix:dry-run`.

---

## 5. Ordre exact d'exécution

```
1. Sauvegarde              Dashboard > Database > Backups  (ou pg_dump)
2. Diagnostic avant        supabase/fix/diagnostic-avant.sql        (452 lignes, lecture seule)
3. Simulation              supabase/fix/alignement-eco-watch-dry-run.sql  (ROLLBACK)
4. Installation            supabase/fix/alignement-eco-watch.sql    (COMMIT)
5. Vérification après      supabase/fix/verification-apres.sql      (337 lignes, lecture seule)
6. Lien administrateur     procédure §4.6 du rapport du 17/11 (données réelles)
7. Test deux téléphones    §9 du présent document
```

| # | Fichier | Lignes | SHA-256 |
|---|---|---|---|
| 1 | `supabase/fix/diagnostic-avant.sql` | 452 | `f197b2d2d19c8d89eb682e76de95e2492b5669f8e7f0e120bb630e003a8a22e1` |
| 2 | `supabase/fix/alignement-eco-watch-dry-run.sql` | 2196 | `6bc34b1f6e0b987a401d874887ac783d70bae6ce5a83f2caaec5571306f53aae` |
| 3 | `supabase/fix/alignement-eco-watch.sql` | 2191 | `c3671a79395d61e5eb90bbb64c925124f1e10500d2d12a7a2613c69bdbc40b6c` |
| 4 | `supabase/fix/verification-apres.sql` | 337 | `4a0f8f7f632a4b89d6a34c7e9b4491ad552ca0d2e33bb1791869075ff1c00771` |

**L'étape 6 n'est pas dans le SQL.** Elle exige le numéro et le nom réels de
l'administrateur ; je n'en dispose pas et je n'ai créé aucun compte.

---

## 6. Script de vérification après installation

`supabase/fix/verification-apres.sql` — **337 lignes**, lecture seule
(SELECT + `RAISE NOTICE`/`EXCEPTION`, aucune écriture).

| Section | Contrôle |
|---|---|
| 1 | 11 colonnes de liaison et de suivi |
| 2 | 11 fonctions publiques + `SECURITY DEFINER` |
| 3 | `is_admin()` ne dépend plus du JWT |
| 4 | RLS active + nombre de politiques par table |
| 5 | **0** politique permissive (`using (true)`) |
| 6 | droits `anon` (SELECT/INSERT/UPDATE/DELETE + RPC) |
| 7 | droits `authenticated` (dont `role` et `auth_user_id` non modifiables) |
| 8 | déclencheurs `observations` et `auth.users` |
| 9 | Realtime + `REPLICA IDENTITY` |
| 10 | bucket `photos` (bloc tolérant si `storage` absent) |
| 11 | volumes et cohérence (observations sans numéro) |
| 12 | colonnes nécessaires aux 4 indicateurs |
| 13 | **VERDICT** : `OK` ou `N anomalie(s)` |

Testé sur base vierge (`AVANT`) et sur base alignée (`APRES`) : **sans erreur**.

---

## 7. Résultats réels des tests

### 7.1 Vérificateur du script d'alignement — **77 contrôles, tous verts**

| Bloc | Portée | Contrôles |
|---|---|---|
| 0 | contrat transactionnel des 2 scripts | 7 |
| 1‑2 | base de départ, application, **équivalence du schéma cible**, idempotence | 4 |
| 3 | données antérieures préservées (observation + agent) | 2 |
| 4 | rôle `anon` : 5 refus | 5 |
| 5 | parcours QR Code : dépôt, dépôt sans identité, 3 refus | 5 |
| 6 | identité imposée (agent technique, n° de suivi, statut) | 3 |
| 7 | admin / isolation / indicateurs / journal / notifications | 12 |
| 8 | privilèges déclarés (`anon`, `authenticated`, colonnes, RPC) | 12 |
| 9 | escalade de privilèges (tentatives réelles) | 8 |
| 10 | **photos et registre anti-abus** | 9 |
| 11 | persistance après `COMMIT` | 3 |
| 12 | **dry-run** : 0 modification conservée | 4 |
| 13 | **rollback** en cas d'anomalie | 5 |

### 7.2 Tests du projet

| Commande | Résultat |
|---|---|
| `bun typecheck` | ✅ `tsc --noEmit` — 0 erreur |
| `bun lint` | ✅ 0 erreur, **1 avertissement préexistant** (`<img>` AdminApp.tsx:1005, non lié) |
| `bun run build` | ✅ Next.js 16.1.3 — 4 routes (`/`, `/admin`, `/signaler`, `_not-found`) |
| `bun test` | ✅ **41/41** |
| `bun run test:rls` | ✅ **94 assertions** + persistance A1 + isolement RLS |
| `bun run fix:verifier` | ✅ **77/77** |

### 7.3 Sur une base vierge reproduisant le schéma réel

Le vérificateur construit exactement l'état déclaré : `schema.sql` seul
(10 colonnes sur `observations`, `agents` à 4 colonnes, aucune fonction, aucune
politique, 0 ligne). Puis :

* le script s'applique **sans erreur** ;
* le schéma obtenu est **identique** à `schema.sql + 001..011` (empreinte
  complète : colonnes, contraintes, politiques, fonctions, triggers, index,
  séquences, RLS) ;
* une seconde exécution ne change rien (**idempotence**) ;
* une observation et un agent antérieurs sont **conservés** ;
* le parcours QR Code fonctionne et l'administration le lit.

---

## 8. Risques résiduels

| # | Risque | Probabilité | Impact | Traitement / détection |
|---|---|---|---|---|
| **R1** | `006` crée un trigger sur `auth.users`. Si le rôle du SQL Editor n'a pas le droit, la migration échoue. | **Moyenne** | Élevé (pas de création de profil agent) | **Le script échoue et annule tout** (§E3). Message attendu : `must be owner of table users`. Contournement : créer le déclencheur depuis un rôle propriétaire de `auth`. |
| **R2** | Publication `supabase_realtime` absente : `004` lève `undefined_object` (seul `duplicate_object` est géré). | Faible (Supabase la fournit) | Élevé | Échec et annulation. Pré-contrôle : `select pubname from pg_publication;` |
| **R3** | Schéma `storage` absent : `010` n'émet qu'un `NOTICE`, aucune politique photo. | Faible | Moyen | Détecté par `verification-apres.sql` §10 (bucket). |
| **R4** | Limitation de débit contournée si le passerelle ne transmet ni `x-forwarded-for` ni `x-real-ip` **et** si le visiteur omet nom et matricule : l'empreinte devient aléatoire. | Faible | Moyen (spam) | Choix assumé « fail-open » pour ne pas bloquer des opérateurs légitimes. À surveiller si le registre `signalement_public_abus` reste vide en production. |
| **R5** | `agents.telephone` du profil technique vaut `qrcode@ecowatch.local` : l'export admin affiche cette valeur dans la colonne « Téléphone ». | Certain | Faible (cosmétique) | Aucun impact sécurité. Amélioration possible : remplacer par `Non renseigné` dans `011`. **Non appliqué** pour ne pas modifier une migration validée sans nécessité. |
| **R6** | Compteur KPI partiellement en échec : la valeur affichée est `0`, signalée par le bandeau « Compteurs indisponibles ». | Faible | Faible | Le bandeau empêche l'interprétation « zéro observation ». Amélioration possible : `null` par compteur. |
| **R7** | OTP SMS non configuré (fournisseur absent). | Indépendante du SQL | Élevé | Vérifier *Authentication → Providers → Phone*. |
| **R8** | Le compte administrateur n'existe pas encore. | Certain | Élevé | Étape 6 du §5, à faire avec les données réelles. |
| **R9** | Comportement de l'instance réelle (rôle, timeouts, taille de requête ~80 Ko). | Faible | Moyen | Simulation (étape 3) puis installation (étape 4) : le `COMMIT` final prouve la bonne exécution. |

**Aucun risque résiduel ne touche la confidentialité des données** : les
politiques `anon` et l'escalade de privilèges sont couvertes par 29 contrôles
exécutés (sections 4, 9, 10).

---

## 9. Procédure de test avec deux téléphones

### 9.1 Préparation

* **Téléphone A** — opérateur, **aucun compte**, **aucun numéro fourni**.
* **Téléphone B** — administrateur, compte Auth créé (§5, étape 6).
* QR Code du site pointant vers `https://<domaine>/signaler`.

### 9.2 Parcours opérateur (téléphone A)

1. Scanner le QR Code → `/signaler` s'ouvre **sans authentification**.
2. Choisir un **type** et une **zone**.
3. Facultatif : photo, nom, matricule.
4. *Envoyer le signalement*.
5. **Attendu** : « Signalement enregistré » + numéro `SCG-AAAAMMJJ-NNNNN`. Le noter.

### 9.3 Vérification administrateur (téléphone B)

1. `/admin` → numéro → code SMS → connexion.
2. **Attendu** : tableau de bord (pas « Accès refusé »).
3. **KPI** : `Total +1`, `Aujourd'hui +1`, `Cette semaine +1`, `Nouvelles +1`.
4. Rechercher le **numéro de suivi** exact dans *Signalements*.
5. **Attendu** : la ligne apparaît (type, zone, opérateur, horodatage, photo).
6. Détail → *Historique* : entrée **« Observation créée »**.

### 9.4 Boucle de traitement

1. Statut *Action en cours*, responsable, échéance.
2. **Attendu** : `Nouvelles −1`, `En cours +1`.
3. *Clôturée* : `Clôturées +1`, `En retard −1`.
4. **Attendu** : notification de changement de statut.

### 9.5 Contrôles négatifs

| Test | Attendu |
|---|---|
| `GET /rest/v1/observations` avec la clé anon | **401/403** — aucune lecture publique |
| `POST /rest/v1/observations` avec la clé anon | refusé |
| `GET /rest/v1/agents` avec la clé anon | refusé |
| 21ᵉ signalement en 10 min | « Trop de signalements envoyés » |
| Suppression par l'admin | disparaît de la liste, reste dans l'historique |

### 9.6 Confirmation de la synchronisation

**Vérifié localement** : un signalement créé par `anon` est relu par un
`authenticated` de rôle `admin`, avec son numéro de suivi et son statut ; les
indicateurs passent de 0 à 1 sur les quatre compteurs concernés.

**Non vérifiable sans production** : le comportement réel des deux téléphones.
Le §9.3 étape 4 (numéro de suivi exact) est la **preuve de synchronisation** :
si la ligne n'apparaît pas, la cause est, dans l'ordre,
`verification-apres.sql` ≠ `OK`, compte sans `role='admin'`, ou session
navigateur différente du compte administrateur.

---

## 10. Fichiers livrés

| Fichier | Lignes | Rôle |
|---|---|---|
| `supabase/fix/diagnostic-avant.sql` | 452 | diagnostic avant, lecture seule |
| `supabase/fix/alignement-eco-watch-dry-run.sql` | 2196 | simulation (`ROLLBACK`) |
| `supabase/fix/alignement-eco-watch.sql` | 2191 | installation (`COMMIT`) |
| `supabase/fix/verification-apres.sql` | 337 | contrôle après installation |
| `supabase/fix/build-alignement.mjs` | 258 | générateur (`--dry-run`) |
| `supabase/fix/verifier-alignement.mjs` | 791 | vérificateur (77 contrôles) |
| `docs/AUDIT-SYNCHRONISATION-SUPABASE.md` | 460 | rapport initial (corrigé) |
| `docs/CONTRE-AUDIT-SUPABASE.md` | ce fichier | contre-audit |

Copies téléchargeables : `/artifacts/ecowatch-alignement/`.

---

## 11. Verdict

### VALIDÉ POUR EXÉCUTION SUPABASE

sous réserve des points ci-dessous, qui **ne sont pas des défauts du SQL** mais
des conditions de son exécution :

1. **Sauvegarde** de la base avant l'étape 4.
2. **Simulation** (étape 3) réussie sur l'instance réelle.
3. **Installation** (étape 4) se terminant par `COMMIT`, sans message d'erreur.
4. `verification-apres.sql` renvoyant **`VERDICT: OK`**.
5. **Lien du premier administrateur** (§5, étape 6) — je n'ai pas créé de compte.
6. **OTP SMS** activé côté Auth (R7).

### Ce que ce verdict ne dit pas

EcoWatch n'est **pas déclaré prêt pour la production**. Le schéma réel, l'accès
administrateur, le signalement public et la synchronisation entre deux
téléphones n'ont **pas** été vérifiés sur l'instance Supabase : je n'y ai
aucun accès. Le verdict porte sur la **conformité et l'innocuité du SQL**,
établies sur une base PostgreSQL 17 reproduisant le schéma déclaré, et sur
l'absence de tout effet non maîtrisé (aucune suppression, aucune réécriture, un
seul `COMMIT` final, vérification préalable).

La production ne pourra être déclarée qu'après les six conditions ci-dessus,
dont le test à deux téléphones (§9.3).