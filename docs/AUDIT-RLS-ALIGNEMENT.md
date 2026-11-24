# AUDIT CRITIQUE — POLITIQUES RLS ET PRIVILÈGES RÉELS

**Branche :** `feat/supabase-auth`
**Objet :** vérifier que `supabase/fix/alignement-eco-watch.sql` supprime les 8
politiques permissives relevées dans le SQL Editor et installe un jeu de
politiques cohérent avec le fonctionnement prévu.
**Date :** 24/11/2026

> **Aucune requête SQL n'a été exécutée sur Supabase.** Tous les résultats
> ci-dessous proviennent de `PGlite` (PostgreSQL 17 en WASM), qui rejoue les
> migrations et les politiques à l'identique. Les vérifications réelles
> se distinguent explicitement des tests locaux.

---

## 1. Périmètre, méthode et hypothese de départ

### 1.1 État initial fourni

Huit politiques, toutes `TO public`, toutes à expression constante `true` :

| # | Politique | Table | Commande | `qual` | `with_check` |
|---|---|---|---|---|---|
| 1 | `agents_insert` | agents | INSERT | — | `true` |
| 2 | `agents_read_all` | agents | SELECT | `true` | — |
| 3 | `agents_update_own` | agents | UPDATE | `true` | `true` |
| 4 | `notifs_insert` | notifs | INSERT | — | `true` |
| 5 | `notifs_read_all` | notifs | SELECT | `true` | — |
| 6 | `notifs_update` | notifs | UPDATE | `true` | `true` |
| 7 | `obs_insert` | observations | INSERT | — | `true` |
| 8 | `obs_read_all` | observations | SELECT | `true` | — |

### 1.2 Conséquence de cette configuration

En PostgreSQL, les politiques **PERMISSIVE** d'une même commande sont
combinées par un **OU logique**. Une seule politique `true` suffit donc à
ouvrir la table, et elle **neutralise** toute politique restrictive posée
ensuite. C'est pourquoi l'alignement ne se contente pas d'ajouter des
politiques : il **supprime** d'abord les anciennes.

| Table | Ce que `TO public` + `true` permettait |
|---|---|
| `agents` | lire tous les profils, **insérer un agent**, **promouvoir n'importe qui administrateur** (`update … set role='admin'`) |
| `observations` | lire toutes les observations, insérer n'importe quelle ligne |
| `notifs` | lire, insérer et modifier toutes les notifications |

Mesuré localement avant alignement (§5.1) : `anon` lit `observations` et
réussit `update public.agents set role = 'admin'`. **La fuite est confirmée,
pas supposée.**

### 1.3 Ce que l'audit ajoute

L'examen des privilèges (mission 4) a révélé une faille **indépendante de la
RLS** et non couverte par `001`→`011` :

```
authenticated = TRUNCATE sur agents, observations, notifs, observation_history
```

`TRUNCATE` n'est **pas** soumis à la RLS. Vérifié localement :

```
truncate table public.agents, public.observations,
               public.notifs, public.observation_history;
→ AUTORISÉ pour authenticated  →  0 ligne dans les 4 tables
```

Un simple agent pouvait donc effacer la totalité des données. La migration
**012** ferme cette brèche (section 4).

---

## 2. Anciennes politiques : liste exacte des suppressions

Toutes les suppressions sont faites par `005_secure_cleanup.sql`, **deux fois**
pour être sûr : explicitement par nom, puis par un balayage générique de
`pg_policies` (toute politique dont `qual` ou `with_check` vaut `true`).

| # | Politique | Table | Suppression | Portée de l'effet |
|---|---|---|---|---|
| 1 | `agents_insert` | agents | `drop policy if exists "agents_insert"` | plus aucune création d'agent par un client |
| 2 | `agents_read_all` | agents | `drop policy if exists "agents_read_all"` | plus de lecture globale des profils |
| 3 | `agents_update_own` | agents | `drop policy if exists "agents_update_own"` | **fin de l'escalade `role='admin'`** |
| 4 | `notifs_insert` | notifs | `drop policy if exists "notifs_insert"` | plus d'insertion de notifications par un client |
| 5 | `notifs_read_all` | notifs | `drop policy if exists "notifs_read_all"` | plus de lecture globale |
| 6 | `notifs_update` | notifs | `drop policy if exists "notifs_update"` | plus de modification globale |
| 7 | `obs_insert` | observations | `drop policy if exists "obs_insert"` | plus d'insertion libre |
| 8 | `obs_read_all` | observations | `drop policy if exists "obs_read_all"` | **plus aucune lecture publique** |

### 2.1 Cas particulier à connaître : `agents_update_own`

C'est le **seul nom réutilisé**. `005` supprime la version permissive puis
crée une politique du même nom, `TO authenticated`, avec :

```sql
using (auth_user_id = auth.uid())
with check (
  auth_user_id = auth.uid()
  and role = (select role from public.agents where auth_user_id = auth.uid())
  and auth_user_id = (select auth_user_id from public.agents where auth_user_id = auth.uid())
)
```

**Conséquence pour les contrôles :** vérifier la seule *présence* du nom
`agents_update_own` ne prouve rien. `verification-apres.sql` (§5b) et
`verifier-alignement.mjs` comparent donc la **définition** (`qual`,
`with_check`, `roles`), pas seulement le nom.

### 2.2 Balayage générique

```sql
for r in
  select tablename, policyname from pg_policies
  where schemaname = 'public'
    and tablename in ('agents','observations','notifs')
    and (qual = 'true' or with_check = 'true')
loop
  execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
end loop;
```

Toute politique permissive **non répertoriée** (nom inconnu, politique
ajoutée après l'audit) est donc supprimée. `011` refait le même balayage en
fin de script, avec la vérification « 0 politique permissive ».

---

## 3. Nouvelles politiques créées

Après alignement, `public` compte **13 politiques**, toutes `TO authenticated` :

| Table | Politique | Commande | Rôle |
|---|---|---|---|
| `agents` | `agents_read_own_or_admin` | SELECT | `auth_user_id = auth.uid() OR is_admin()` |
| `agents` | `agents_update_own` | UPDATE | `auth_user_id = auth.uid()`, avec contrôle du rôle inchangé |
| `observations` | `obs_read_own_or_admin` | SELECT | `agent_id = current_agent_id() OR is_admin()` |
| `observations` | `obs_insert_own` | INSERT | `agent_id = current_agent_id()` |
| `observations` | `obs_insert_admin` | INSERT | `is_admin()` |
| `observations` | `obs_update_admin` | UPDATE | `is_admin()` |
| `observations` | `obs_delete_admin` | DELETE | `is_admin()` |
| `notifs` | `notifs_read_own_or_admin` | SELECT | `is_admin()` ou destinataire via l'observation |
| `notifs` | `notifs_update_own` | UPDATE | destinataire uniquement |
| `notifs` | `notifs_update_admin` | UPDATE | `is_admin()` (marquer lu, A1) |
| `notifs` | `notifs_delete_admin` | DELETE | `is_admin()` |
| `observation_history` | `obs_history_system_insert` | INSERT | `with check (false)` — écriture réservée au trigger |
| `observation_history` | `obs_history_read_own_or_admin` | SELECT | `is_admin()` ou agent concerné |

Aucune politique sur `signalement_public_abus` : accès refusé à tous, la
seule écriture passe par la fonction `SECURITY DEFINER`.

### 3.1 Conformité au fonctionnement prévu

| Exigence | Politique(s) en charge | Vérifié |
|---|---|---|
| Formulaire `/signaler` sans compte opérateur | `creer_signalement_public()` (SECURITY DEFINER) + `obs_insert_*` réservées à `authenticated` | oui (§5.3) |
| Création uniquement via la RPC | aucun `INSERT` pour `anon` ; `anon` n'a que l'`EXECUTE` de la RPC | oui |
| Aucune lecture publique des observations | `obs_read_own_or_admin` `TO authenticated` ; aucun `SELECT` `anon` | oui |
| Admin réservé aux administrateurs authentifiés | `is_admin()` lit `agents.role` ; toutes les politiques d'écriture l'utilisent | oui |
| Aucune modification libre des agents | `agents_update_own` + `grant update (nom)` uniquement | oui |
| Aucune modification libre des notifications | `notifs_update_own` (destinataire) / `notifs_update_admin` | oui |

---

## 4. Privilèges SQL (indépendants de la RLS)

### 4.1-before / after

`TRUNCATE` et les séquences ne sont pas couverts par la RLS : ils sont donc
contrôlés séparément, dans la migration **012**.

```sql
revoke truncate on public.agents, public.observations, public.notifs,
                     public.observation_history, public.signalement_public_abus
from anon, authenticated;

revoke references, trigger on  -- mêmes tables
from anon, authenticated;

revoke all on all sequences in schema public from anon, authenticated;

revoke execute on function public.current_agent_id() from public;
revoke execute on function public.current_agent_id() from anon;
grant  execute on function public.current_agent_id() to authenticated;
```

### 4.2 Matrice des privilèges après alignement

**Tables** (`authenticated` / `anon`) :

| Table | `anon` | `authenticated` |
|---|---|---|
| `agents` | aucun | `SELECT`, `INSERT`, `DELETE`, `UPDATE(nom)` |
| `observations` | aucun | `SELECT`, `INSERT`, `UPDATE`, `DELETE` |
| `notifs` | aucun | `SELECT`, `INSERT`, `UPDATE` |
| `observation_history` | aucun | `SELECT` |
| `signalement_public_abus` | aucun | aucun |

**Séquences** :

| Séquence | `anon` | `authenticated` |
|---|---|---|
| `observations_numero_seq` | aucun | aucun |
| `notifs_statut_seq` | aucun | aucun |
| `observation_history_id_seq` | aucun | aucun |
| `signalement_public_abus_id_seq` | aucun | aucun |

**Fonctions** :

| Fonction | `anon` | `authenticated` |
|---|---|---|
| `creer_signalement_public()` | `EXECUTE` | `EXECUTE` |
| `admin_update_observation()` | — | `EXECUTE` |
| `admin_set_role()` | — | `EXECUTE` |
| `is_admin()` | — | `EXECUTE` |
| `current_agent_id()` | — | `EXECUTE` |

### 4.3 Pourquoi `authenticated` garde `INSERT`/`DELETE`

* `observations` : l'ajout manuel d'un signalement par l'admin passe par
  `saveObservation()` (`AdminApp.tsx:345`), donc par un `INSERT` PostgREST.
  La RLS (`obs_insert_own` / `obs_insert_admin`) limite cet `INSERT` au rôle
  admin ou à l'agent lui-même.
* `DELETE` : aucun appel client aujourd'hui, mais la politique
  `obs_delete_admin` existe ; le privilège est conservé pour ne pas modifier
  les règles d'accès administrateur sans justification (la suppression reste
  soumise à `is_admin()`).
* `agents` : `INSERT` est laissé au privilège mais **aucune politique
  d'`INSERT` n'existe** → toute insertion client est refusée par la RLS. Le
  seul chemin est le trigger `006` ou `service_role`.

---

## 5. Contrôles de sécurité de la RPC publique

`public.creer_signalement_public(text, text, text, text, text, text)` :

| Contrôle | Valeur | Emplacement |
|---|---|---|
| `SECURITY DEFINER` | oui | `011`, ligne 134 |
| `search_path` figé | `public, pg_temp` | ligne 135 |
| `row_security` | `off` (la fonction contourne la RLS, elle ne l'affaiblit pas) | ligne 136 |
| Droits | `revoke all from public, anon` puis `grant execute to anon, authenticated` | lignes 256‑259 |
| Type de problème | liste blanche de 9 valeurs | lignes 152‑156 |
| Zone | liste blanche de 6 valeurs | ligne 158 |
| Nom | ≤ 80 caractères | ligne 162 |
| Matricule | ≤ 40 caractères | ligne 166 |
| Commentaire | ≤ 600 caractères | ligne 170 |
| Photo | `^data:image/(jpeg\|png\|webp);base64,[A-Za-z0-9+/=]+$` | ligne 175 |
| Poids photo | ≤ 7 000 000 caractères (~5,2 Mo) | ligne 179 |
| Identité de l'agent | imposée (`agent_id = 'public'`), jamais fournie par le visiteur | lignes 240‑244 |
| `statut` / `priorite` | imposés (`nouvelle`, `normale`) | ligne 244 |
| Numéro de suivi | généré par le trigger `009`, jamais par le client | `obs_impose_agent` |
| Anti-abus | empreinte `md5(ip\|matricule\|nom)`, 20 envois / 10 min, purge > 24 h | lignes 187‑230 |
| `service_role` | jamais exposé au navigateur (`supabase.ts` n'utilise que `NEXT_PUBLIC_*`) | `src/lib/supabase.ts` |

### 5.1 Faiblesses de l'anti-abus (connues, non corrigées)

* `X-Forwarded-For` est fourni par la passerelle : si elle ne le réécrit pas,
  l'adresse est usurpatable et l'empreinte change à chaque requête.
* `md5` n'est pas salé : l'empreinte est réversible par force brute sur un
  espace réduit (IP + nom + matricule). C'est une donnée personnelle sous
  forme pseudonymisée.
* 20 envois / 10 min par empreinte ne protège pas d'une attaque distribuée
  (botnet) ; aucun CAPTCHA.

Ces trois points relèvent d'un choix d'exploitation, pas d'un défaut
d'alignement. Ils sont listés en §7.

---

## 6. Tests locaux

### 6.1 Vérificateur `bun run fix:verifier` — **114 contrôles, tous verts**

Les 78 contrôles ci-dessous concernent les politiques et les privilèges.
Les 36 autres (contrat transactionnel, persistance après `COMMIT`, variante
dry-run, rollback en cas d'anomalie, escalade de privilèges, accès Storage)
proviennent du contre-audit et sont détaillés dans
`docs/CONTRE-AUDIT-SUPABASE.md`.

| Bloc | Détail | Résultat |
|---|---|---|
| Référence | `schema.sql` seul → alignement → empreinte identique à `001..012` | OK ×3 |
| État de production | 8 politiques `true` recréées, fuite `anon` mesurée, alignement appliqué | OK ×4 |
| **Anciennes politiques** | 7 orphelines supprimées | OK |
| **Anciennes politiques** | `agents_update_own` redéfini de façon restrictive | OK |
| **Anciennes politiques** | aucune politique permissive résiduelle | OK |
| **Anciennes politiques** | `anon` ne lit plus `observations` après alignement | OK |
| **Politiques cibles** | jeu conforme par table, 0 manquante / 0 extra | OK ×5 |
| Idempotence | deuxième exécution sans erreur | OK |
| Données | observation + agent antérieurs préservés | OK ×2 |
| `anon` | lecture / insertion / modification / notifs / registre refusés | OK ×5 |
| QR Code | dépôt avec et sans identité, sans photo | OK ×2 |
| QR Code | refus type / zone / photo invalides | OK ×3 |
| Identité | agent technique, n° de suivi, statut imposés | OK ×3 |
| Administration | admin voit tout, agent isolé, agent voit son seul profil | OK ×3 |
| KPI | Total, Aujourd'hui, Cette semaine, Avec photo, Nouvelles, En cours + Clôturées | OK ×6 |
| Journal + notifications | création journalisée, 1 notification | OK ×2 |
| Privilèges `anon` | aucun SELECT/INSERT sur `observations`, `agents`, `notifs` | OK ×4 |
| Privilèges `authenticated` | SELECT `observations`, `notifs` | OK ×2 |
| **`TRUNCATE`** | aucun pour `anon` ni `authenticated`, sur 5 tables | OK ×10 |
| **Séquences** | aucun `USAGE` pour `anon` ni `authenticated`, sur 4 séquences | OK ×8 |
| **Comportemental** | `TRUNCATE` 4 tables refusé, `nextval` refusé (×2) | OK ×3 |
| Privilèges colonnes | `agents.nom` modifiable, `role` / `telephone` non | OK ×3 |
| Fonctions | RPC publique pour `anon` ; `admin_*` refusés ; `current_agent_id` fermé | OK ×5 |

### 6.2 Tests du projet

| Commande | Résultat |
|---|---|
| `bun typecheck` | ✅ |
| `bun lint` | ✅ 0 erreur, 1 avertissement préexistant (`<img>`, AdminApp.tsx:1005) |
| `bun run build` | ✅ 4 routes |
| `bun test` | ✅ 41/41 |
| `bun run test:rls` | ✅ 94 assertions |

### 6.3 Ce que les tests prouvent et ne prouvent pas

**Prouvé (localement, PostgreSQL 17) :** les 8 politiques sont supprimées, les
13 nouvelles existent avec les bonnes définitions, aucune permissive ne
subsiste, `anon` ne lit rien, `authenticated` ne peut plus `TRUNCATE`, les
séquences ne sont plus accessibles, la RPC reste utilisable par `anon`, les
données survivent, le script est rejouable.

**Non prouvé :** le comportement de l'instance Supabase (rôle du SQL Editor,
présence du schéma `storage`, publication Realtime, fournisseur SMS). Ces
points sont couverts par `diagnostic-avant.sql` et `verification-apres.sql`.

---

## 7. Risques résiduels

| # | Risque | Gravité | Traitement |
|---|---|---|---|
| R1 | `006` crée un trigger sur `auth.users` ; le rôle du SQL Editor doit le permettre | moyenne | à confirmer à l'exécution ; si refus, appliquer `006` avec un rôle propriétaire de `auth` |
| R2 | `010` est un no-op si le schéma `storage` est absent | faible | les photos restent en base64 dans `observations.photo` |
| R3 | OTP SMS non configuré | bloquant pour l'admin | à vérifier dans *Authentication → Providers → Phone* |
| R4 | Aucun administrateur après alignement | bloquant pour l'exploitation | étape explicite `agents.role='admin'` + `auth_user_id` avec données réelles |
| R5 | Empreinte anti-abus en `md5` non salé | faible (vie privée) | recommandé : HMAC avec secret serveur, ou hash tronqué |
| R6 | `X-Forwarded-For` usurpable si la passerelle ne le réécrit pas | faible | config passerelle / limiter la confiance à `x-real-ip` |
| R7 | 20 envois / 10 min, pas de CAPTCHA | faible | surveillance, puis CAPTCHA si abus |
| R8 | Photos en base64 (≤ 5,2 Mo/ligne) | faible (volume) | `010` prépare le bucket ; bascule ultérieure |
| R9 | Les *default privileges* redonneront `ALL` aux futures tables créées par `postgres` | moyenne | à rappeler dans chaque nouvelle migration ; `012` couvre l'existant |
| R10 | Privilège `MAINTAIN` conservé pour `authenticated` | négligeable | `ANALYZE`/`VACUUM` sans accès aux données |
| R11 | `agents.telephone` de l'agent technique = `qrcode@ecowatch.local` | négligeable | valeur non routée, aucun SMS possible |

---

## 8. Verdict

### VALIDÉ POUR EXÉCUTION SUPABASE — sous conditions

**Justification.** Les 8 politiques permissives sont supprimées
explicitement **et** par balayage générique ; les 13 politiques cibles sont
posées avec les bonnes définitions ; aucune politique permissive ne subsiste ;
la faille `TRUNCATE` — indépendante de la RLS et **non couverte par
`001`→`011`** — est identifiée, corrigée par `012` et vérifiée
comportementalement ; les privilèges sont réduits au strict nécessaire.

**Conditions :**

1. Sauvegarde de la base avant exécution.
2. `diagnostic-avant.sql` → vérifier que la liste §16 correspond bien à
   `001 -> … -> 012`.
3. `alignement-eco-watch.sql` en **une seule exécution** (transactionnel :
   tout ou rien).
4. `verification-apres.sql` → doit se terminer par `VERDICT: OK` et ne
   montrer **aucune** ligne `ECHEC` aux §5b, §6, §7, §7b.
5. Lier le premier administrateur avec ses données réelles, puis activer l'OTP
   SMS.
6. Validation métier sur deux téléphones (§6.3 ci-dessous).

**Ce qui n'est pas vérifié :** l'instance Supabase elle-même. Le verdict
d'exécution appartient à la personne qui lance les scripts et lit les
résultats.

### 8.1 Validation multi-téléphones

| Étape | Téléphone A (opérateur, sans compte) | Attendu |
|---|---|---|
| 1 | scanner le QR Code → `/signaler` | aucun login demandé |
| 2 | type + zone, puis *Envoyer* | écran de succès + n° `SCG-AAAAMMJJ-NNNNN` |
| 3 | noter le numéro | — |

| Étape | Téléphone B (administrateur) | Attendu |
|---|---|---|
| 4 | `/admin` → OTP | tableau de bord |
| 5 | KPI | Total +1, Aujourd'hui +1, Cette semaine +1, Nouvelles +1 |
| 6 | chercher le n° de suivi | la ligne apparaît avec type, zone, opérateur |
| 7 | ouvrir le détail → *Historique* | « Observation créée » |
| 8 | passer en *Action en cours* | Nouvelles −1, En cours +1 |
| 9 | cible A : second envoi | apparaît aussi dans l'admin |

**Confirmation que chaque observation apparaît dans l'administration :** le
parcours 2 → 6 le démontre. Localement, un signalement déposé par `anon` est
relu par un `authenticated` de rôle `admin` avec son numéro de suivi
(`fix:verifier`, « l'admin voit les 2 signalements »). En production, la
confirmation est l'étape 6 : si le numéro n'apparaît pas, la cause est l'une
des conditions 3 à 5 ci-dessus.

---

## 9. Fichiers

| Fichier | Nature |
|---|---|
| `supabase/migrations/012_durcissement_privileges.sql` | nouveau — `TRUNCATE`, séquences, `current_agent_id` |
| `supabase/fix/alignement-eco-watch.sql` | régénéré — **2315 lignes**, sha256 `04bc5ba2…` |
| `supabase/fix/alignement-eco-watch-dry-run.sql` | régénéré — variante `rollback;`, **2320 lignes**, sha256 `c965013b…` |
| `supabase/fix/diagnostic-avant.sql` | §18 ajouté (TRUNCATE, séquences) |
| `supabase/fix/verification-apres.sql` | §5b (8 politiques), §5c (inventaire), §7b (privilèges) |
| `supabase/fix/verifier-alignement.mjs` | **114 contrôles** (politiques, privilèges, `TRUNCATE`, Storage, dry-run) |
| `supabase/tests/run-rls-tests.mjs` | `012` ajoutée à la chaîne |
| `docs/AUDIT-RLS-ALIGNEMENT.md` | ce rapport |

Aucune donnée, aucune politique de production, aucun déploiement n'a été
modifié par cette mission.