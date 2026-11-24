# AUDIT ET ALIGNEMENT — BASE SUPABASE ECOWATCH SCG

**Branche :** `feat/supabase-auth`
**Objet :** rendre la base Supabase de production cohérente avec le dépôt
(QR Code → `/signaler` → Supabase → tableau de bord `/admin`).
**Date :** 17/11/2026

> **Aucune migration n'a été appliquée et rien n'a été déployé.**
> Ce document fournit le diagnostic, le SQL à faire valider et la procédure
> de contrôle. L'application du script reste une décision humaine.

---

## 1. Diagnostic précis

### 1.1 Périmètre et méthode

| Élément | Valeur |
|---|---|
| Branche auditée | `feat/supabase-auth` (commit `50e7fbf`) |
| Accès à la base réelle | **aucun** — aucun client Postgres, aucune clé de service, aucun réseau vers l'instance |
| Source d'état | relevés fournis dans la demande (SQL Editor) + dépôt |
| Preuve | `supabase/fix/diagnostic-avant.sql` (lecture seule) à exécuter pour confirmer |

**Avertissement de méthode.** Les constats de la section 1.2 proviennent des
relevés transmis, pas d'une connexion directe. Ils sont *cohérents entre eux*
et *vérifiables* : le script de diagnostic les rejoue en sept requêtes. Tant
qu'il n'a pas été exécuté, ils restent une hypothèse de travail, pas une
mesure.

### 1.2 État constaté

Les relevés décrivent une base **réduite au schéma initial** :

| Objet | État rapporté | Interprétation |
|---|---|---|
| `public.agents` | 4 colonnes : `id`, `telephone`, `nom`, `role` | `agents.auth_user_id` absent → **001 non appliquée** |
| `public.observations` | 10 colonnes, jusqu'à `partage` | aucune colonne de suivi → **009 non appliquée** ; `operateur_nom`/`operateur_matricule` absents → **011 non appliquée** |
| `public.agents` | 0 ligne | aucun compte, donc **aucun administrateur** |
| `public.observations` | 0 ligne | aucune donnée à préserver |
| `public.creer_signalement_public` | inexistante | **011 non appliquée** : le formulaire public ne peut rien enregistrer |
| `public.notifs` | non décrite | à confirmer, mais la RLS est active sans politique |

### 1.3 Les trois anomalies bloquantes

**A1 — La base n'est pas la base du dépôt.**
Le dépôt attend 12 migrations ; la base n'en montre aucune. L'application
« fonctionne » parce que `src/lib/data.ts` a été écrit pour *tolérer* cette
infériorité :
`estErreurSchemaAncien()` (data.ts:286) détecte « column … does not exist » et
bascule sur `payloadObservationLegacy()`. Résultat : l'écran ne plante pas,
mais les colonnes de suivi, les numéros de suivi et les champs opérateur
n'existent nulle part.

**A2 — RLS activée, zéro politique : plus personne ne lit rien.**
`supabase/schema.sql` active la RLS sur `agents`, `observations` et `notifs`
(lignes 32‑34) mais **ne crée volontairement aucune politique**. Les politiques
arrivent en 003/005/007/009/011. Sur la base actuelle, un administrateur
authentifié ne voit **aucune** observation — même s'il y en avait. Le
tableau de bord afficherait alors « Compteurs indisponibles » (bandeau ajouté
dans `Kpis.disponible`), et non des zéros rassurants.

**A3 — Aucun administrateur ne peut se connecter.**
`src/app/admin/page.tsx` exige `agent.role === 'admin'`, lu depuis
`public.agents`. Avec 0 ligne dans `agents`, le parcours OTP aboutit à un
utilisateur Auth sans profil : `getCurrentAgent()` renvoie `null` et
l'écran reste sur la demande de code. **Après alignement, cette étape reste à
faire** (section 5.4) : elle demande une donnée réelle (numéro et nom de
l'administrateur) que je n'ai pas.

### 1.4 Ce qui est sain

* Le dépôt est cohérent : `schema.sql` + `001`→`011` s'appliquent intégralement
  sur une base vierge, dans l'ordre, sans erreur (vérifié localement, §5.1).
* La couche client gère déjà une base non migrée sans planter
  (`getAgentsAdmin()` retombe sur les colonnes historiques, data.ts:429).
* Aucun type de colonne n'est modifié par les migrations : ce sont uniquement
  des **ajouts** de colonnes nullables ou à valeur par défaut, des index, des
  contraintes `CHECK`, des fonctions et des politiques. **Aucune réécriture de
  table, aucun renommage, aucune suppression.**

---

## 2. Différences schéma actuel / schéma cible

### 2.1 `public.agents`

| Élément | Actuel | Cible | Migration |
|---|---|---|---|
| `id` | `text` PK | `text` PK | — |
| `telephone` | `text` NOT NULL UNIQUE | inchangé | — |
| `nom` | `text` NOT NULL | inchangé | — |
| `role` | `text` NOT NULL CHECK(`agent`,`admin`) | inchangé | — |
| `auth_user_id` | **absent** | `uuid` NULL UNIQUE | 001 |
| Index de liaison | absent | `idx_agents_auth_user_id` | 001 |

Aucune contrainte de clé étrangère vers `auth.users` : la liaison est
volontairement logique (Supabase n'autorise pas toujours la FK vers `auth`).

### 2.2 `public.observations`

| Élément | Actuel | Cible | Migration |
|---|---|---|---|
| `id`, `agent_id`, `agent_nom`, `agent_telephone` | présents | inchangés | — |
| `type_probleme`, `commentaire`, `zone` | présents | inchangés | — |
| `photo`, `date_creation`, `partage` | présents | inchangés | — |
| `numero_suivi` | absent | `text` NULL, index unique | 009 |
| `statut` | absent | `text` NOT NULL DEFAULT `nouvelle` + CHECK 5 valeurs | 009 |
| `priorite` | absent | `text` NOT NULL DEFAULT `normale` + CHECK 4 valeurs | 009 |
| `assigne_a` | absent | `text` NULL → `agents(id)` ON DELETE SET NULL | 009 |
| `echeance` | absent | `timestamptz` NULL | 009 |
| `date_cloture` | absent | `timestamptz` NULL | 009 |
| `maj_le` | absent | `timestamptz` NOT NULL DEFAULT `now()` | 009 |
| `photo_path` | absent | `text` NULL (chemin Storage) | 009 |
| `operateur_nom` | absent | `text` NULL | 011 |
| `operateur_matricule` | absent | `text` NULL | 011 |
| Index | 2 | + `statut`, `priorite`, `assigne_a`, `echeance`, `numero_suivi` | 009 |
| Contraintes | 6 | + `statut_check`, `priorite_check` | 009 |
| Triggers | 0 | 4 (`trg_obs_impose_agent`, `trg_obs_journal`, `trg_obs_notifie_statut`, `trigger_create_notification`) | 002, 009 |

### 2.3 `public.notifs`

| Élément | Actuel | Cible | Migration |
|---|---|---|---|
| Colonnes | 7 | **inchangées** | — |
| `obs_id` → `observations(id)` ON DELETE CASCADE | présent | inchangé | — |
| Politiques | aucune | 4 politiques (`read_own_or_admin`, `update_own`, `update_admin`, `delete_admin`) | 003, 005, 007, 011 |

Aucune évolution de structure : `notifs` n'a pas de colonne `agent_id`, le
destinataire est dérivé de l'observation rattachée.

### 2.4 Objets nouveaux

| Objet | État | Migration |
|---|---|---|
| `public.observation_history` | absent | 009 |
| `public.signalement_public_abus` | absent | 011 |
| `public.observations_numero_seq` | absent | 009 |
| `public.notifs_statut_seq` | absent | 009 |
| 11 fonctions `public.*` | absentes | 002, 005, 006, 007, 008, 009, 011 |
| Trigger `auth.users.on_auth_user_created` | absent | 006 |
| Publication `supabase_realtime` | à confirmer | 004, 009 |
| Bucket `photos` (privé, 5 Mo) | à confirmer | 010 |

---

## 3. Migrations manquantes et ordre d'application

### 3.1 État par migration

| Ordre | Migration | État | Objet apporté |
|---|---|---|---|
| — | `schema.sql` | **appliquée** | structure initiale (tables, index, RLS activée) |
| 1 | `001_add_auth_link.sql` | **manquante** | `agents.auth_user_id` + index |
| 2 | `002_auth_helpers.sql` | **manquante** | `is_admin()`, `current_agent_id()`, trigger de notification |
| 3 | `003_secure_rls.sql` | **manquante** | premières politiques RLS |
| 4 | `004_realtime.sql` | **manquante** | Realtime + `REPLICA IDENTITY FULL` |
| 5 | `005_secure_cleanup.sql` | **manquante** | purge des politiques `true`, politiques cibles, privilèges colonnes |
| 6 | `006_agent_signup_trigger.sql` | **manquante** | profil agent créé après OTP |
| 7 | `007_fix_admin_notifications.sql` | **manquante** | `notifs_update_admin` (marquer lu) |
| 8 | `008_unify_admin_roles.sql` | **manquante** | `is_admin()` lit `agents.role` (et non le JWT) |
| 9 | `009_suivi_observations.sql` | **manquante** | statut, priorité, affectation, échéance, historique, n° de suivi |
| 10 | `010_storage_photos.sql` | **manquante** | bucket privé `photos` |
| 11 | `011_signalement_public.sql` | **manquante** | RPC publique, champs opérateur, registre anti-abus |
| 12 | `012_durcissement_privileges.sql` | **manquante** | retrait de `TRUNCATE`, des accès directs aux séquences et de `current_agent_id` pour `anon` |

### 3.2 Pourquoi cet ordre n'est pas négociable

1. **001 avant tout le reste** : `002` et `006` écrivent `agents.auth_user_id`.
2. **002 avant 003** : les politiques de 003 appellent `current_agent_id()` et
   `is_admin()`.
3. **008 après 002** : 008 réécrit `is_admin()` ; l'appliquer avant 002 serait
   écrasé.
4. **009 avant 011** : la RPC publique insère `statut`, `priorite` et
   `numero_suivi` ; `011` refuse de s'exécuter sans ces colonnes
   (préflight lignes 41‑79 du fichier `011`).
5. **005 après 003** : 005 purge les politiques permissives puis pose les
   politiques cibles ; l'inverse laisserait une politique `true` résiduelle.
6. **011** consolide l'ensemble des politiques et révoque les droits `anon`.
7. **012 en dernier** : elle retire `TRUNCATE` et les accès directs aux
   séquences, que la RLS ne couvre pas (voir `docs/AUDIT-RLS-ALIGNEMENT.md`).

Le script correctif exécute cet ordre dans une **seule transaction** : si une
étape échoue, tout est annulé et la base reste dans son état antérieur.

### 3.3 Conflits et incompatibilités signalés

| # | Point | Nature | Traitement |
|---|---|---|---|
| C1 | `006` crée un trigger sur `auth.users` | Nécessite le droit de créer un trigger sur la table `auth.users`. Le SQL Editor Supabase s'exécute avec un rôle autorisé : c'est le schéma standard documenté par Supabase. | Si l'éditeur renvoie `must be owner of table users`, appliquer `006` depuis un rôle propriétaire de `auth` ; sinon créer le déclencheur via un autre canal. **Seul point réellement susceptible d'échouer.** |
| C2 | `011` insère l'agent technique `id='public'` | `observations.agent_id` est `NOT NULL` avec FK vers `agents(id)` : un signalement anonyme doit être rattaché à *un* agent. | Ce n'est **pas** un faux agent : identifiant technique, aucun nom de personne, aucun téléphone réel (`qrcode@ecowatch.local`, non joignable). `ON CONFLICT DO NOTHING` ⇒ rejouable. |
| C3 | `010` dépend du schéma `storage` | Le bucket ne peut exister que sur un projet Storage actif. | La migration est *tolérante* par conception : elle émet un `NOTICE` et ne crée rien si `storage` est absent. |
| C4 | `004` dépend de la publication `supabase_realtime` | Présente sur tout projet Supabase ; absente d'un Postgres nu. | `ALTER PUBLICATION` est encadré par un gestionnaire `duplicate_object`. |
| C5 | `agents.telephone` est `UNIQUE NOT NULL` | L'agent technique `public` doit y écrire quelque chose. | Valeur technique non routée (`qrcode@ecowatch.local`). Aucune donnée réelle n'est inventée. |
| C6 | Connexion administrateur | Après alignement, `agents` contient l'agent technique `public` mais **aucun admin**. | Étape explicite à faire par un humain (§5.4), avec le numéro et le nom réels. |
| C7 | OTP par SMS | Le login admin est un OTP téléphone (`AdminLogin.tsx`). | Vérifier que *Authentication → Providers → Phone* est activé et qu'un fournisseur SMS est configuré, sinon aucun code n'arrive. |
| C8 | Écart de longueur du commentaire | Client : 300 caractères max (`LONGUEUR_MAX_COMMENTAIRE`) ; serveur : 600. | Aucun conflit : le serveur est plus permissif que l'interface. Le contrôle serveur reste la règle. |

---

## 4. SQL correctif prêt à copier-coller

### 4.1 Fichier

```
supabase/fix/alignement-eco-watch.sql     2315 lignes
sha256  04bc5ba2b86c424e6ac165d1cbe9a016f854d18c6378a98dea7d1a3cdb94b95a
```

> **Mise à jour du 24/11/2026** — la migration 012 (durcissement des
> privilèges) a été ajoutée à la chaîne. La variante de simulation
> `supabase/fix/alignement-eco-watch-dry-run.sql` continue d'être générée
> par `bun run fix:dry-run` (`rollback;` en fin de script). Voir
> `docs/AUDIT-RLS-ALIGNEMENT.md` et `docs/CONTRE-AUDIT-SUPABASE.md`.

Il est **généré** depuis `schema.sql` + `001`→`012` par
`supabase/fix/build-alignement.mjs` : aucune dérive possible avec les
migrations du dépôt. Pour le régénérer :

```bash
bun run fix:generer
```

### 4.2 Ce que fait le script

1. `begin;`
2. rejoue `schema.sql` (no-op : tables et index existent déjà) ;
3. rejoue `001` → `011` dans l'ordre, chaque étape étant *idempotente* ;
4. exécute un bloc de **vérification finale** qui contrôle 12 invariants
   (colonnes, tables, fonctions, `is_admin()` adossé à `agents`, RLS,
   politiques permissives, triggers, privilèges `anon`, Realtime) ;
5. `commit;`

**Conséquence :** si une seule assertion échoue, `RAISE EXCEPTION` annule
`COMMIT` — la base est intégralement restaurée. Si tout passe, la base est
alignée et l'erreur est impossible à masquer.

### 4.3 Mode d'emploi

1. **Sauvegarder** : Dashboard → *Database → Backups* (ou `pg_dump`).
2. SQL Editor → *New query* → coller **tout** le fichier → *Run*.
3. Un message d'erreur = tout est annulé. Corriger, relancer le fichier entier.
4. Exécuter `supabase/fix/verification-apres.sql` (§4.4).
5. Puis, seulement ensuite, l'étape administrateur (§5.4).

### 4.4 Script de vérification après application

```
supabase/fix/verification-apres.sql
sha256  0675f20a3dda6b4d77cb776c2cc6f32aa9a0c56dec3efd61159515efe506aac9
```

Lecture seule. Il affiche un tableau `libelle | etat` et termine par
`VERDICT: OK` ou `VERDICT: N anomalie(s)`.

### 4.5 Script de diagnostic avant application

```
supabase/fix/diagnostic-avant.sql
sha256  033d09e9aa1dce4d447618ee705a464ffc5504d70d8367f32c9c9caf1d6dd82a
```

Lecture seule, **aucune erreur possible** (`information_schema`, `pg_catalog`,
`to_regclass`, `to_regprocedure`). Il répond notamment à :

* §15 : une ligne `OK` / `MANQUANT` par objet introduit par chaque migration ;
* §16 : la liste ordonnée `001 -> 003 -> …` des migrations à appliquer
  (vide = base déjà alignée) ;
* §17 : les droits réels du rôle `anon`.

### 4.6 Lien du premier administrateur (à part, après alignement)

Ce bloc n'est **pas** dans le script correctif : il exige une donnée réelle que
je n'ai pas. À n'exécuter qu'une fois l'administrateur identifié.

```sql
-- 1. Créer le compte Auth (Dashboard > Authentication > Users > Add user)
--    avec le NUMÉRO et le NOM réels de l'administrateur.
--
-- 2. Vérifier que le profil a bien été créé par le trigger 006 :
select id, telephone, nom, role, auth_user_id
from public.agents
where auth_user_id = (select id from auth.users where phone = '+216XXXXXXXX');

-- 3a. Si le compte Auth existait AVANT 006, le trigger n'a pas joué :
--     créer le profil à la main (remplacer les valeurs réelles).
-- insert into public.agents (id, auth_user_id, telephone, nom, role)
-- values ('adm-' || replace(gen_random_uuid()::text,'-',''),
--         (select id from auth.users where phone = '+216XXXXXXXX'),
--         'XXXXXXXX', 'Nom Prénom', 'admin');

-- 3b. Sinon, promouvoir le profil créé automatiquement :
update public.agents set role = 'admin' where telephone = 'XXXXXXXX';

-- 4. Contrôle : il doit rester au moins un administrateur.
select count(*) as administrateurs from public.agents where role = 'admin';
```

Je n'ai créé **aucun** agent et **aucune** observation : les tables sont
laissées à l'état `-- 0 ligne` et le seul INSERT du script correctif est
l'agent technique `public` (C2).

---

## 5. Résultats des tests

### 5.1 Vérificateur du script correctif

`bun run fix:verifier` — **114 contrôles, tous verts**.

> Les contrôles ajoutés le 21/11 (contrat transactionnel, persistance après
> `COMMIT`, variante dry-run, rollback en cas d'anomalie, escalade de
> privilèges, accès Storage) restent actifs : ils font partie du même
> vérificateur. Détail des contrôles « politiques et privilèges » :
> `docs/AUDIT-RLS-ALIGNEMENT.md`.

| Bloc | Contrôle | Résultat |
|---|---|---|
| Base de départ | `schema.sql` seul = 10 colonnes sur `observations` | OK |
| Application | `alignement-eco-watch.sql` s'applique sans erreur | OK |
| **Équivalence** | empreinte du schéma obtenu **identique** à `schema.sql + 001..012` | OK |
| Idempotence | deuxième exécution sans erreur | OK |
| Données | observation antérieure conservée et complétée (`numero_suivi`, `statut`) | OK |
| Données | agent antérieur inchangé (`auth_user_id` reste vide) | OK |
| `anon` | lecture observations / insertion / modification / notifs / registre : **refusé** | OK ×5 |
| QR Code | dépôt d'un signalement via la RPC | OK |
| QR Code | dépôt sans nom, sans matricule, sans photo | OK |
| QR Code | type inconnu, zone inconnue, photo non base64 : **refusés** | OK ×3 |
| Identité | rattachement à l'agent technique `public` | OK |
| Identité | n° de suivi `SCG-AAAAMMJJ-NNNNN` généré par la base | OK |
| Identité | `statut=nouvelle`, `priorite=normale` imposés | OK |
| Admin | voit les 2 signalements | OK |
| Isolation | un agent ne voit aucun signalement public | OK |
| Isolation | un agent ne voit que son propre profil | OK |
| KPI | Total, Aujourd'hui, Cette semaine, Avec photo, Nouvelles, En cours + Clôturées | OK ×6 |
| Journal | chaque signalement journalisé (`creation`) | OK |
| Notifications | une notification par signalement | OK |
| Privilèges | `anon` : aucun SELECT/INSERT sur `observations`, `agents`, `notifs` | OK ×4 |
| Privilèges | `authenticated` : SELECT `observations`, `notifs` | OK ×2 |
| Privilèges | `authenticated` : `agents.nom` modifiable, `role` et `auth_user_id` **non** | OK ×3 |
| Fonctions | `anon` peut appeler `creer_signalement_public`, **pas** `admin_update_observation` | OK ×2 |

### 5.2 Tests du projet

| Commande | Résultat |
|---|---|
| `bun typecheck` | ✅ `tsc --noEmit` sans erreur |
| `bun lint` | ✅ 0 erreur, 1 avertissement **préexistant** (`<img>` AdminApp.tsx:1005) |
| `bun run build` | ✅ compilation Next.js 16.1.3, 4 routes (`/`, `/admin`, `/signaler`, `_not-found`) |
| `bun test` | ✅ **41 tests** / 41 passent |
| `bun run test:rls` | ✅ **94 assertions** RLS + persistance A1 + isolement |

### 5.3 Ce que ces tests prouvent — et ne prouvent pas

**Prouvé :** le SQL est syntaxiquement valide sur PostgreSQL 17, l'ordre est
correct, le résultat est structurellement identique aux migrations du dépôt, les
données existantes survivent, le script est rejouable, et les garanties de
sécurité (anon, RLS, privilèges colonnes, RPC) sont effectives.

**Non prouvé :** le comportement de **votre** instance Supabase (rôle
d'exécution du SQL Editor, présence du schéma `storage`, publication Realtime,
fournisseur SMS). Ces points sont couverts par C1, C3, C4, C7 et par le script
de diagnostic avant/après.

### 5.4 Capacité de production de la base réelle

Non vérifiée — je n'ai pas d'accès. Le diagnostic avant (`§15`, `§16`) donne la
réponse en une exécution ; le diagnostic après confirme l'alignement.

---

## 6. Procédure de validation sur deux téléphones

### 6.1 Préparation

* **Téléphone A** — un opérateur, **sans compte**.
* **Téléphone B** — l'administrateur, **compte Auth créé** (§4.6).
* Le QR Code affiché sur site pointe vers `https://<domaine>/signaler`.

### 6.2 Parcours opérateur (téléphone A)

1. Scanner le QR Code → la page `/signaler` s'ouvre **sans invite de connexion**.
2. Choisir un **type** et une **zone** (obligatoires).
3. Facultatif : ajouter une photo (appareil photo ou galerie), un nom, un matricule.
4. Appuyer sur *Envoyer le signalement*.
5. **Attendu :** écran « Signalement enregistré » + **numéro de suivi**
   `SCG-AAAAMMJJ-NNNNN`. Le noter.
6. **Échec attendu si** le numéro n'apparaît pas : la RPC n'existe pas ou une
   validation serveur a refusé. Le message s'affiche dans le bandeau rouge avec
   le détail technique.

### 6.3 Vérification administrateur (téléphone B)

1. Ouvrir `/admin` → saisir le numéro → recevoir l'OTP → saisir le code.
2. **Attendu :** le tableau de bord s'affiche (pas « Accès refusé »).
3. **KPI :** `Total` augmente de 1, `Aujourd'hui` augmente de 1,
   `Cette semaine` augmente de 1, `Nouvelles` augmente de 1.
4. Ouvrir *Signalements* et rechercher le **numéro de suivi** exact.
5. **Attendu :** la ligne apparaît avec le type, la zone, l'éventuel nom /
   matricule de l'opérateur, l'horodatage et la photo si fournie.
6. Ouvrir le détail → *Historique* : une entrée **« Observation créée »** doit
   être présente.

### 6.4 Boucle de traitement

1. Depuis le détail, passer le statut à *Action en cours*, affecter un
   responsable, fixer une échéance.
2. **Attendu :** `Nouvelles` diminue de 1, `En cours` augmente de 1.
3. Repasser en *Clôturée* : `Clôturées` augmente de 1, `En retard` diminue.
4. **Attendu :** une notification de changement de statut est créée pour
   l'agent destinataire (visible dans la cloche).

### 6.5 Contrôles négatifs

| Test | Attendu |
|---|---|
| Ouvrir `/signaler` dans un navigateur privé, **sans** réseau social ni session | identique : aucun compte requis |
| Appeler l'API en direct en tant qu'`anon` (`GET /rest/v1/observations`) | **401/403** — aucune lecture publique |
| Tenter un `POST /rest/v1/observations` en `anon` | ** refusé** (privilège révoqué) |
| 21ᵉ signalement en 10 minutes depuis la même connexion | message « Trop de signalements envoyés » |
| Une observation supprimée par l'admin | disparaît de la liste, reste dans l'historique (`suppression`) |

### 6.6 Confirmation « chaque observation apparaît dans l'administration »

**Ce que je peux affirmer :** le mécanisme est vérifié localement — un
signalement déposé par `anon` est relu par un `authenticated` de rôle `admin`
(§5.1, « l'admin voit les 2 signalements »), avec son numéro de suivi, son
statut et son opérateur, et il est cherchable par `numero_suivi`
(`appliquerFiltres`, data.ts:82).

**Ce que je ne peux pas affirmer :** que c'est vrai *sur votre instance*. La
confirmation de production est le §6.3, étape 5 : le numéro de suivi noté au
§6.2 doit apparaître dans la liste. Si ce n'est pas le cas, la cause est
forcément l'une de ces trois-là, à vérifier dans l'ordre :

1. `verification-apres.sql` ne renvoie pas `VERDICT: OK` → alignement incomplet ;
2. le compte de test n'a pas `role = 'admin'` dans `public.agents` (§4.6) ;
3. la session du navigateur n'est pas celle du compte administrateur
   (vérifier `auth.uid()` côté client via `getCurrentAgent()`).

---

## 7. Fichiers ajoutés ou modifiés par cette mission

| Fichier | Nature |
|---|---|
| `supabase/fix/diagnostic-avant.sql` | nouveau — diagnostic lecture seule, tolérant aux objets absents |
| `supabase/fix/build-alignement.mjs` | nouveau — générateur du script correctif |
| `supabase/fix/alignement-eco-watch.sql` | nouveau — **généré**, 2315 lignes, transactionnel |
| `supabase/fix/alignement-eco-watch-dry-run.sql` | nouveau — **généré**, simulation `ROLLBACK` |
| `supabase/fix/verification-apres.sql` | nouveau — contrôle lecture seule après application |
| `supabase/fix/verifier-alignement.mjs` | nouveau — vérificateur local (114 contrôles) |
| `package.json` | `fix:generer`, `fix:dry-run`, `fix:verifier` |
| `docs/AUDIT-SYNCHRONISATION-SUPABASE.md` | ce rapport |
| `docs/CONTRE-AUDIT-SUPABASE.md` | contre-audit du 21/11/2026 |
| `docs/AUDIT-RLS-ALIGNEMENT.md` | audit des politiques RLS et des privilèges |

**Aucune donnée, aucune migration du dépôt, aucune politique existante n'a été
modifiée.** Les fichiers de `supabase/migrations/` sont intacts : le script
correctif est *dérivé* d'eux, jamais l'inverse.

---

## 8. Synthèse pour décision

| Question | Réponse |
|---|---|
| La base est-elle synchronisée avec le dépôt ? | **Non.** Aucune des 12 migrations n'est appliquée. |
| Le QR Code peut-il enregistrer un signalement aujourd'hui ? | **Non.** `creer_signalement_public` n'existe pas. |
| L'administration peut-elle lire les données ? | **Non.** RLS active sans politique. |
| L'alignement est-il sûr ? | Oui : **transactionnel**, idempotent, sans suppression, sans renommage, avec vérification finale qui annule tout en cas d'écart. |
| Reste-t-il une action humaine ? | **Oui, deux** : appliquer le script, puis lier le premier administrateur (§4.6) et activer l'OTP SMS (C7). |
| Décision recommandée | **GO sous conditions** : sauvegarde + `diagnostic-avant.sql` + `alignement-eco-watch.sql` + `verification-apres.sql` + §4.6 + §6. |

**Décision finale : GO sous conditions.** La base est structurellement en
retard de 12 migrations ; l'écart est réparable sans perte et sans exposition,
à condition que les deux actions humaines (script + administrateur) soient
réalisées et contrôlées par le §6.