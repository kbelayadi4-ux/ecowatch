# Audit de correspondance — dépôt GitHub ↔ base Supabase réelle

- **Branche** : `feat/supabase-auth` — **commit** : `e32e4cc`
- **Projet Supabase** : `ecowatch`
- **Migrations attendues** : `001` à `010` (dépôt uniquement)
- **Nature de l'audit** : lecture seule. Aucune migration appliquée, aucune donnée
  modifiée, aucun rôle changé, aucun déploiement.

> **Statut global : NON VÉRIFIÉ.** Le conteneur d'exécution n'a aucun accès à la base
> réelle (preuves au §1). Tous les contrôles ci-dessous portent la mention
> **NON VÉRIFIÉ** et sont accompagnés de la requête à exécuter manuellement.

---

## 1. Preuves de l'absence d'accès

| Vérification | Résultat |
|---|---|
| Variables d'environnement `SUPABASE_*` | absentes |
| Fichiers `.env` / `.env.local` | aucun |
| Client Supabase configuré dans le code | `src/lib/supabase.ts:3` attend `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (non fournis) |
| CLI Supabase (`~/.supabase`, `supabase`) | absent |
| Client `psql` | absent |
| Clé `service_role` | jamais lue ni affichée (exclusion explicite) |

**Conséquence** : impossible de lire `pg_policies`, `auth.users`, `storage.buckets`,
ni même de confirmer que les migrations 001→010 sont appliquées. Le script
`supabase/audit/audit-lecture-seule.sql` (39 requêtes SELECT, sections 0 à 16)
est le livrable à exécuter dans **Supabase → SQL Editor**.

---

## 2. État réel des migrations

| Attendu (dépôt) | Résultat réel | Statut | Risque | Action |
|---|---|---|---|---|
| Fichiers `001`–`010` présents | 10 fichiers sur `origin/feat/supabase-auth` | **Conforme** | faible | aucune |
| Migrations appliquées sur la base | inconnu | **NON VÉRIFIÉ** | élevé | `audit §1` puis comparaison des empreintes |
| Ordre d'application | inconnu | **NON VÉRIFIÉ** | élevé | `audit §1` (`select version, name from supabase_migrations.schema_migrations`) |

**Requête exacte (section 1) :**

```sql
select version, name, statements, applied_at
from supabase_migrations.schema_migrations
order by version;
```

> Une base où `009`/`010` ne sont pas appliquées reste **utilisable** (repli
> historique dans `saveObservation`) mais **sans suivi** : ni statut, ni priorité,
> ni photo Storage. C'est le point de blocage principal de la recette.

---

## 3. Sécurité

| Attendu | Résultat réel | Statut | Risque | Action |
|---|---|---|---|---|
| RLS active sur `agents`, `observations`, `notifs`, `observation_history` | inconnu | **NON VÉRIFIÉ** | critique | `audit §3c` (4 lignes à `true`) |
| Politiques permissives résiduelles (`using (true)` / `with check (true)`) | inconnu | **NON VÉRIFIÉ** | critique | `audit §3b` doit renvoyer **0 ligne** |
| `agents` : aucune politique d'INSERT | inconnu | **NON VÉRIFIÉ** | critique | `audit §3d` (`agents` = 0) |
| Fonctions `SECURITY DEFINER` avec `search_path` figé | 7 fonctions attendues | **NON VÉRIFIÉ** | élevé | `audit §4` / `§4b` |
| Privilèges `anon` / `authenticated` sur les tables | inconnu | **NON VÉRIFIÉ** | élevé | `audit §15` : `anon` ne doit avoir **aucun** droit d'écriture |
| Déclencheurs de sécurité (`trg_obs_*`, `on_auth_user_created`) | inconnu | **NON VÉRIFIÉ** | élevé | `audit §16b` |

**Requêtes exactes :**

```sql
-- RLS
select tablename, policyname, cmd, roles::text as roles, qual, with_check
from pg_policies where schemaname = 'public' order by tablename, cmd;

-- Politiques permissives résiduelles (attendu : 0 ligne)
select tablename, policyname, qual, with_check
from pg_policies
where schemaname = 'public'
  and (qual = 'true' or with_check = 'true');

-- RLS activee (attendu : true pour les 4 tables)
select c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' order by c.relname;

-- Fonctions definer + search_path
select p.proname, p.prosecdef, p.proconfig
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
order by p.proname;

-- Privilèges
select table_name, grantee, string_agg(distinct privilege_type, ', ' order by privilege_type)
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by table_name, grantee order by table_name, grantee;
```

---

## 4. Fonctionnalités 009

| Objet attendu | Résultat réel | Statut | Risque | Action |
|---|---|---|---|---|
| `observations.numero_suivi` | inconnu | **NON VÉRIFIÉ** | élevé | `audit §2c` |
| `statut`, `priorite`, `assigne_a`, `echeance`, `date_cloture`, `maj_le`, `photo_path` | inconnu | **NON VÉRIFIÉ** | élevé | `audit §2c` (7 colonnes attendues) |
| `observation_history` (table + RLS) | inconnu | **NON VÉRIFIÉ** | élevé | `audit §2d`, `§3c` |
| `admin_update_observation(...)` | inconnu | **NON VÉRIFIÉ** | élevé | `audit §16` |
| `trg_obs_impose_agent` | inconnu | **NON VÉRIFIÉ** | critique | `audit §16b` |
| `trg_obs_journal` | inconnu | **NON VÉRIFIÉ** | élevé | `audit §16b` |
| `trg_obs_notifie_statut` | inconnu | **NON VÉRIFIÉ** | moyen | `audit §16b` |
| Séquences `observations_numero_seq` / `notifs_statut_seq` | inconnu | **NON VÉRIFIÉ** | élevé | `audit §2` |

**Requête exacte (section 2c) :**

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'observations'
  and column_name in ('numero_suivi','statut','priorite','assigne_a',
                      'echeance','date_cloture','maj_le','photo_path')
order by column_name;
```

**Comparaison fine du corps des fonctions** (`audit §16`) — l'empreinte md5 obtenue
doit correspondre au fichier du dépôt :

```sql
select p.proname, md5(pg_get_functiondef(p.oid)) as empreinte_md5
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('admin_set_role','admin_update_observation','obs_impose_agent')
order by p.proname;
```

---

## 5. Fonctionnalités 010 (Storage)

| Attendu | Résultat réel | Statut | Risque | Action |
|---|---|---|---|---|
| Bucket `photos` existant | inconnu | **NON VÉRIFIÉ** | élevé | `audit §11` |
| `public = false` | inconnu | **NON VÉRIFIÉ** | critique | `audit §11` |
| `file_size_limit = 5242880` (5 Mo) | inconnu | **NON VÉRIFIÉ** | moyen | `audit §11` |
| `allowed_mime_types` = jpeg/png/webp | inconnu | **NON VÉRIFIÉ** | moyen | `audit §11` |
| 4 politiques (`read_own_or_admin`, `insert_own`, `update_admin`, `delete_admin`) | inconnu | **NON VÉRIFIÉ** | élevé | `audit §11b` |
| Accès propriétaire + admin | inconnu | **NON VÉRIFIÉ** | élevé | `audit §11b` |

**Requête exacte :**

```sql
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'photos';

select policyname, cmd, roles::text, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;
```

---

## 6. Realtime

| Attendu dans `supabase_realtime` | Résultat réel | Statut | Risque | Action |
|---|---|---|---|---|
| `public.observations` | inconnu | **NON VÉRIFIÉ** | élevé | `audit §10` |
| `public.notifs` | inconnu | **NON VÉRIFIÉ** | moyen | `audit §10` |
| `public.observation_history` | inconnu | **NON VÉRIFIÉ** | moyen | `audit §10` |
| `replica identity = full` sur `observations`, `notifs` | inconnu | **NON VÉRIFIÉ** | élevé | `audit §10b` |

**Requête exacte :**

```sql
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' order by tablename;

select c.relname, c.relreplident
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' order by c.relname;
```

---

## 7. Agents et comptes Auth

| Attendu | Résultat réel | Statut | Risque | Action |
|---|---|---|---|---|
| `agents.auth_user_id` renseigné | inconnu | **NON VÉRIFIÉ** | élevé | `audit §7` (attendu : 0 ligne) |
| Chaque agent correspond à un `auth.users` | inconnu | **NON VÉRIFIÉ** | élevé | `audit §7b` |
| Aucun `auth.users` sans profil agent | inconnu | **NON VÉRIFIÉ** | moyen | `audit §7c` |
| Aucun doublon de liaison | inconnu | **NON VÉRIFIÉ** | élevé | `audit §7d` (attendu : 0 ligne) |
| Au moins un `role = 'admin'` | inconnu | **NON VÉRIFIÉ** | critique | `audit §8` |
| Cohérence `agents.role` ↔ `app_metadata.role` | inconnu | **NON VÉRIFIÉ** | faible (cache) | `audit §8b` (divergence tolérée) |

**Requêtes exactes :**

```sql
select count(*) as agents_sans_auth from public.agents where auth_user_id is null;

select a.telephone, a.role, a.auth_user_id, u.phone as auth_phone
from public.agents a left join auth.users u on u.id = a.auth_user_id
order by a.role, a.telephone;

select auth_user_id, count(*) from public.agents
where auth_user_id is not null group by auth_user_id having count(*) > 1;

select count(*) as admins from public.agents where role = 'admin';

select a.telephone, a.role as role_agent, u.raw_app_meta_data ->> 'role' as role_cache
from public.agents a left join auth.users u on u.id = a.auth_user_id
where a.auth_user_id is not null
  and coalesce(u.raw_app_meta_data ->> 'role', '') <> a.role;
```

---

## 8. Tableau de décision — préparation à la recette multi-téléphones

| # | Pré-requis | Statut | Bloquant |
|---|---|---|---|
| 1 | Dépôt à jour (`e32e4cc` poussé, `main` intact) | **Conforme** | non |
| 2 | Migrations 001→010 appliquées sur Supabase | **NON VÉRIFIÉ** | **oui** |
| 3 | RLS active, 0 politique permissive résiduelle | **NON VÉRIFIÉ** | **oui** |
| 4 | Objets 009 (colonnes, historique, RPC, triggers) | **NON VÉRIFIÉ** | **oui** |
| 5 | Bucket `photos` privé + 4 politiques | **NON VÉRIFIÉ** | **oui** |
| 6 | Realtime sur 3 tables + replica identity full | **NON VÉRIFIÉ** | non (dégradation) |
| 7 | Comptes agents liés à `auth.users`, ≥ 1 admin | **NON VÉRIFIÉ** | **oui** |
| 8 | Suite de tests (`75` RLS + `18` unitaires, build) | **Conforme** | non |

**Verdict : NON PRÊT tant que les lignes 2 à 5 et 7 ne sont pas confirmées.**
La recette multi-téléphones ne peut être lancée qu'après exécution de
`supabase/audit/audit-lecture-seule.sql` et validation des quatre points bloquants.

### Ordre d'exécution recommandé

1. Supabase → SQL Editor → coller `supabase/audit/audit-lecture-seule.sql` → Run.
2. Relever les sections 1, 3b, 3c, 3d, 11, 11b, 10, 10b, 7, 7d, 8.
3. Comparer les empreintes md5 de la section 16 avec les fichiers `008`/`009`.
4. Corriger uniquement les écarts constatés (hors périmètre de cet audit).
5. Relancer l'audit jusqu'à obtention de 0 écart.