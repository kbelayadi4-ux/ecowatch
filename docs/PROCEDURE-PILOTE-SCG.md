# Procédure de pilote — EcoWatch SCG

Document opératoire pour la mise en service du premier pilote :
deux agents sur deux téléphones, un administrateur sur ordinateur, une base
Supabase partagée.

**Branche applicative** : `feat/supabase-auth`
**Commit de référence** : `73591f4` (suivi des observations, photos, interface)
**Application** : https://animated-kashata-2eeaea.netlify.app

> **Avertissement** : ce document ne remplace pas la validation humaine. Aucune
> migration n'a été appliquée sur la base réelle, aucun déploiement n'a été
> déclenché. Les étapes marquées « À FAIRE » nécessitent votre intervention.

---

## 0. Vue d'ensemble

| Étape | Action | Responsable | Statut |
| --- | --- | --- | --- |
| 1 | Sauvegarde de la base | Vous | À faire |
| 2 | Audit lecture seule | Vous | À faire |
| 3 | Application des migrations 009 et 010 | Vous | À faire |
| 4 | Création du premier administrateur | Vous | À faire |
| 5 | Vérification des comptes agents | Vous | À faire |
| 6 | Déploiement Netlify (branche `feat/supabase-auth`) | Vous | À faire |
| 7 | Test multi-téléphones | Vous + 2 agents | À faire |
| 8 | Clôture du pilote | Vous | À faire |

---

## 1. Sauvegarde (obligatoire avant 009/010)

Supabase → *Database* → *Backups* → **créer un point de restauration** et noter
son horodatage.

Les migrations 009 et 010 n'écrasent aucune donnée : elles ajoutent des
colonnes, des index, une table d'historique et un bucket. La sauvegarde reste
une précaution standard.

---

## 2. Audit en lecture seule

Exécuter `supabase/audit/audit-lecture-seule.sql` dans le *SQL Editor* et
reporter les résultats dans `docs/CHECKLIST-SUPABASE.md`.

Points bloquants à vérifier avant d'aller plus loin :

- les migrations 005 à 008 sont bien présentes et uniques ;
- aucune politique RLS permissive (`using (true)`) ne subsiste ;
- `observations` possède bien `statut`, `priorite`, `assigne_a`, `echeance`
  **ou** la migration 009 n'a pas encore été appliquée (cas normal à ce stade) ;
- le bucket `photos` existe ou sera créé par 010.

---

## 3. Application des migrations

### 3.1 Ordre

| Ordre | Fichier | Objet |
| --- | --- | --- |
| 1 | `supabase/schema.sql` | Structure de base *(déjà appliquée)* |
| 2 | `001` → `008` | Auth, RLS, rôles *(déjà appliquées)* |
| 3 | **`009_suivi_observations.sql`** | Suivi : statut, priorité, affectation, échéance, historique, numéros de suivi |
| 4 | **`010_storage_photos.sql`** | Bucket privé `photos` |

**Ne jamais rejouer 005 à 008** : elles sont idempotentes mais sans intérêt, et
une réexécution masquerait un problème de migration non appliquée.

### 3.2 Mode opératoire

Pour chaque fichier :

1. Ouvrir *SQL Editor* → *New query*.
2. Coller le contenu **intégral** du fichier.
3. *Run*.
4. Lire le message final :
   - 009 → `NOTICE: 009: suivi operationnel (...)`
   - 010 → `NOTICE: 010: bucket photos pret (...)` ou
     `NOTICE: 010: verification ignoree (...)` selon l'environnement.
5. En cas d'erreur : **ne pas insister**, relever le message et vérifier la
   section 2 (audit) avant de recommencer.

### 3.3 Vérifications après application

```sql
-- Colonnes de suivi présentes
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'observations'
  and column_name in ('numero_suivi','statut','priorite','assigne_a','echeance',
                      'date_cloture','maj_le','photo_path')
order by column_name;

-- Table d'historique et politiques
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename in ('observation_history','observations')
order by tablename, policyname;

-- Numéros de suivi attribués
select count(*) as total,
       count(numero_suivi) as avec_numero,
       count(distinct numero_suivi) as distincts
from public.observations;

-- Bucket photos
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'photos';

-- Realtime
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' order by tablename;
```

Résultats attendus : 8 colonnes, politiques `obs_insert_admin` +
`obs_history_read_own_or_admin` présentes, `avec_numero = total = distincts`,
bucket `public = false` avec 5 Mo, publication contenant `observations`,
`notifs` et `observation_history`.

### 3.4 Retour arrière

Les migrations 009/010 sont **additives**. En cas de problème :

- **009** : les colonnes peuvent être conservées sans risque (l'application les
  ignore) ; pour un retour arrière complet, supprimer les objets dans l'ordre
  inverse (trigger, fonctions, table, colonnes) **après** sauvegarde.
- **010** : supprimer le bucket et ses politiques :
  ```sql
  delete from storage.objects where bucket_id = 'photos';  -- si vide, sinon pas de suppression
  delete from storage.buckets where id = 'photos';
  drop policy if exists "photos_read_own_or_admin" on storage.objects;
  drop policy if exists "photos_insert_own" on storage.objects;
  drop policy if exists "photos_update_admin" on storage.objects;
  drop policy if exists "photos_delete_admin" on storage.objects;
  ```
  Ne jamais supprimer un bucket contenant des photos sans les avoir exportées.

---

## 4. Création du premier administrateur

### 4.1 Prérequis

Le compte administrateur doit déjà exister dans `auth.users` (inscription via
l'application, ou création dans *Authentication → Users*). **Je ne choisis
jamais le numéro** : c'est vous qui fournissez le numéro **exactement tel qu'il
est enregistré** dans `public.agents`.

### 4.2 Étape 1 — vérifier que le compte existe

```sql
select a.id, a.telephone, a.nom, a.role, a.auth_user_id, u.phone as auth_phone
from public.agents a
left join auth.users u on u.id = a.auth_user_id
where a.telephone = 'NUMERO_A_COMPLETER';
```

- Si **0 ligne** : le compte n'existe pas → passer par l'inscription dans
  l'application, puis revenir ici.
- Si `auth_user_id is null` : le compte n'est pas relié → voir §4.5.
- Si `role = 'admin'` : rien à faire, l'administrateur existe déjà.

### 4.3 Étape 2 — vérifier l'identité

```sql
select id, phone, email, created_at, last_sign_in_at
from auth.users
where id = 'UUID_RECUPERE';
```

Confirmer que le numéro correspond bien à la personne (et non à un numéro de
test).

### 4.4 Étape 3 — promouvoir

**Cas nominal** (un administrateur existe déjà, ou l'opération est faite avec
les droits `postgres` / dashboard) :

```sql
update public.agents
   set role = 'admin'
 where telephone = 'NUMERO_A_COMPLETER'
   and role = 'agent';
```

Vérifier :

```sql
select telephone, role from public.agents where telephone = 'NUMERO_A_COMPLETER';
```

**Cas nominal** (depuis un compte déjà administrateur, application ou SQL) :

```sql
select public.admin_set_role('NUMERO_A_COMPLETER', 'admin');
```

`admin_set_role` refuse l'opération si l'appelant n'est pas administrateur et
refuse de rétrograder le dernier administrateur.

### 4.5 Si `auth_user_id` est null

Le compte Auth existe mais n'est pas relié :

```sql
update public.agents
   set auth_user_id = 'UUID_DU_COMPTE_AUTH'
 where telephone = 'NUMERO_A_COMPLETER'
   and auth_user_id is null;
```

Puis vérifier qu'aucun autre agent ne partage déjà cet `auth_user_id` :

```sql
select auth_user_id, count(*) from public.agents
group by auth_user_id having count(*) > 1;
```

### 4.6 Protection des autres comptes

- Ne jamais promouvoir un compte de test laissé en production : le rétrograder
  avant la mise en service.
- Toujours vérifier `count(*) from public.agents where role = 'admin'` : il doit
  rester **au moins 1** après toute rétrogradation.

---

## 5. Vérification des comptes agents

```sql
select id, telephone, nom, role, auth_user_id
from public.agents
order by role desc, telephone;
```

- Chaque agent du pilote doit avoir un `auth_user_id` renseigné.
- Les agents sans `auth_user_id` ne peuvent pas se connecter : les exclure du
  pilote ou les relier (§4.5).

---

## 6. Déploiement Netlify

**Aucun déploiement n'est déclenché par cette procédure.**

Configuration à vérifier dans Netlify :

| Élément | Valeur |
| --- | --- |
| Branche de production | `feat/supabase-auth` |
| Commande de build | `bun run build` |
| Répertoire de publication | `.next` (plugin Next.js) |
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé anonyme uniquement |

**État constaté le 13/11/2026** : le site répond en HTTP 200 mais sert une
version antérieure au commit `73591f4` (les icônes `icon-192.png` renvoient 404
alors qu'elles existent dans le dépôt). Un déploiement de la branche
`feat/supabase-auth` est donc nécessaire pour que le pilote utilise le code
final.

Après déploiement :

- [ ] La page d'accueil s'affiche.
- [ ] `/manifest.json` répond 200.
- [ ] `/icon-192.png` répond 200.
- [ ] Aucune erreur dans la console du navigateur.

---

## 7. Test multi-téléphones

Protocole détaillé : `docs/PLAN-TEST-MULTI-TELEPHONES.md`.

---

## 8. Clôture du pilote

- [ ] Les deux observations du test sont visibles côté administrateur.
- [ ] Les statuts ont été modifiés et visibles côté agents.
- [ ] Les photos sont accessibles.
- [ ] Les comptes de test sont nettoyés ou clairement identifiés.
- [ ] Le compte administrateur de production est en place.
- [ ] Le déploiement Netlify pointe bien sur `feat/supabase-auth`.

---

## 9. Escalade

| Symptôme | Action |
| --- | --- |
| Erreur `permission denied for table ...` | Vérifier les `grant` de la section 3 de l'audit ; rejouer uniquement la partie concernée de la migration. |
| Erreur `relation "observation_history" does not exist` | La migration 009 n'a pas été appliquée. |
| Erreur `bucket not found` | La migration 010 n'a pas été appliquée ou a échoué sur les privilèges. |
| Aucune donnée côté administrateur | Vérifier la RLS (`obs_read_own_or_admin`) et le rôle de l'administrateur. |
| OTP non reçu | Vérifier la configuration du fournisseur SMS dans Supabase. |
| Temps réel inactif | Vérifier la publication `supabase_realtime` et la présence de `REPLICA IDENTITY FULL`. |