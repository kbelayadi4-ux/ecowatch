# Plan de test multi-téléphones — EcoWatch SCG

Ce plan décrit le test réel qui conditionne la mise en service. Il ne peut pas
être exécuté depuis un environnement d'intégration : il nécessite **deux
téléphones physiques** et **un ordinateur**, connectés à la même base Supabase.

**Statut : non exécuté.** Toute case cochée doit correspondre à une observation
réelle horodatée.

---

## 1. Préparation

### 1.1 Comptes

| Rôle | Appareil | Identifiant |
| --- | --- | --- |
| Agent A | Téléphone 1 | `A_TEL` (numéro fourni par SCG) |
| Agent B | Téléphone 2 | `B_TEL` (numéro fourni par SCG) |
| Administrateur | Ordinateur | `ADM_TEL` |

Vérifier avant de commencer :

```sql
select telephone, nom, role, auth_user_id
from public.agents
where telephone in ('A_TEL', 'B_TEL', 'ADM_TEL');
```

Attendu : 3 lignes, `auth_user_id` renseigné pour chacune, une seule ligne
`role = 'admin'`.

### 1.2 Application

- Ouvrir https://animated-kashata-2eeaea.netlify.app sur chaque appareil.
- Vérifier que la version déployée correspond au commit `73591f4`
  (icônes présentes, écran de connexion sans choix de rôle).

### 1.3 Repère de départ

```sql
select count(*) as observations_avant from public.observations;
select count(*) as notifs_avant from public.notifs;
```

Noter les deux valeurs : elles servent de base de comparaison.

---

## 2. Scénario

### Étape 1 — Connexion de l'agent A

1. Téléphone 1 : *Se connecter*.
2. Saisir `A_TEL`, valider.
3. Saisir le code SMS reçu.

**Attendu** : accès à l'écran agent (« Bonjour, \<nom\> »).

- [ ] Connexion réussie
- [ ] Nom affiché = nom de l'agent A
- [ ] Aucun message d'erreur

### Étape 2 — Connexion de l'agent B

Même procédure sur le téléphone 2 avec `B_TEL`.

- [ ] Connexion réussie
- [ ] Nom affiché = nom de l'agent B

### Étape 3 — Observation de l'agent A

1. Téléphone 1 : *Nouvelle Observation*.
2. Choisir un type (ex. « Fuite eau »).
3. Choisir une zone (ex. « Ciment »).
4. Ajouter un commentaire : `TEST PILOTE A`.
5. Ajouter une photo (appareil photo).
6. *Envoyer le signalement*.

**Attendu** : écran « Signalement envoyé ! ».

- [ ] Envoi confirmé
- [ ] Photo visible dans l'aperçu

### Étape 4 — Réception côté administrateur

1. Sur l'ordinateur, ouvrir l'application et se connecter en administrateur.
2. Ouvrir l'onglet *Alertes*.

**Attendu** : l'observation de l'agent A apparaît, avec son numéro de suivi
(`SCG-AAAAMMJJ-00001`), son type, sa zone, son nom et l'horodatage.

- [ ] Observation A visible
- [ ] Numéro de suivi présent
- [ ] Photo accessible (clic sur l'observation)

> Vérification complémentaire en base :
> ```sql
> select id, numero_suivi, agent_id, agent_nom, statut, priorite, photo_path, date_creation
> from public.observations order by date_creation desc limit 3;
> ```

### Étape 5 — Observation de l'agent B

1. Téléphone 2 : *Nouvelle Observation*.
2. Type, zone, commentaire `TEST PILOTE B`, photo.
3. Envoyer.

**Attendu** : envoi confirmé.

- [ ] Envoi confirmé

### Étape 6 — Réception côté administrateur (temps réel)

**Sans rafraîchir la page**, l'observation de l'agent B doit apparaître.

- [ ] Observation B visible sans rechargement
- [ ] Le compteur « Nouvelles » a augmenté

> Si l'observation n'apparaît qu'après *Actualiser*, le Realtime ne fonctionne
> pas : vérifier la publication `supabase_realtime` et la console du navigateur
> (erreurs WebSocket).

### Étape 7 — Photographies et autorisations

1. Cliquer sur l'observation A : la photo doit s'afficher.
2. Cliquer sur l'observation B : la photo doit s'afficher.
3. Téléphone 1 : ouvrir *Mes Signalements*, la photo de l'agent A doit
   s'afficher.
4. Téléphone 1 : vérifier que l'observation de l'agent B **n'apparaît pas**.

**Attendu** : chaque agent voit ses propres photos, l'administrateur voit tout.

- [ ] Photo A visible côté admin
- [ ] Photo B visible côté admin
- [ ] Photo A visible côté agent A
- [ ] Observation B invisible côté agent A

### Étape 8 — Changement de statut

1. Administrateur : ouvrir l'observation A.
2. Passer le statut à *En analyse*, puis *Action en cours*.
3. Affecter un responsable (agent B).
4. Définir une échéance (date + 3 jours).
5. Ajouter un commentaire : `Prise en charge`.

**Attendu** : message « Observation mise à jour ».

- [ ] Statut modifié
- [ ] Responsable affecté
- [ ] Échéance enregistrée
- [ ] Commentaire enregistré

### Étape 9 — Retour côté agent

1. Téléphone 1 : ouvrir *Mes Signalements*, actualiser (ou attendre le temps
   réel).
2. Ouvrir l'observation A.

**Attendu** : statut à jour, responsable, échéance, historique contenant les
changements.

- [ ] Statut à jour côté agent A
- [ ] Échéance affichée
- [ ] Historique visible (création, changements de statut, affectation)

### Étape 10 — Persistance après reconnexion

1. Téléphone 1 : *Sortir*, puis se reconnecter.
2. Ouvrir *Mes Signalements*.

**Attendu** : l'observation A est toujours présente.

- [ ] Observation A présente après reconnexion
- [ ] Observation B toujours absente pour l'agent A

3. Administrateur : *Actualiser* la page, puis *Sortir* et se reconnecter.

**Attendu** : les deux observations sont présentes.

- [ ] Observations A et B présentes après reconnexion

---

## 3. Contrôles en base après le test

```sql
-- 1. Les deux observations existent
select numero_suivi, agent_nom, type_probleme, zone, statut, priorite, assigne_a, echeance
from public.observations
order by date_creation desc
limit 2;

-- 2. L'historique est complet
select observation_identifiant, action, resume, auteur_nom, cree_le
from public.observation_history
order by cree_le desc
limit 10;

-- 3. Les notifications existent
select id, obs_id, agent_nom, lu, date_creation
from public.notifs
order by date_creation desc
limit 10;

-- 4. Les photos sont dans le bucket
select name, metadata ->> 'size' as taille, created_at
from storage.objects
where bucket_id = 'photos'
order by created_at desc
limit 5;

-- 5. Les compteurs ont augmenté
select (select count(*) from public.observations) as observations_apres,
       (select count(*) from public.notifs) as notifs_apres;
```

**Attendu** : `observations_apres = observations_avant + 2`,
`notifs_apres >= notifs_avant + 2`, 2 objets dans le bucket (si photos
téléversées).

---

## 4. Nettoyage après le test

Les observations de test doivent être supprimées **avant** la mise en service,
uniquement si elles ne doivent pas figurer dans les statistiques :

```sql
-- Lister d'abord, supprimer ensuite (jamais l'inverse)
select id, numero_suivi, agent_nom, commentaire from public.observations
where commentaire like 'TEST PILOTE%';

-- Puis, après vérification :
delete from public.observations where commentaire like 'TEST PILOTE%';
```

La suppression est réservée à l'administrateur (RLS `obs_delete_admin`) et
conserve une trace dans `observation_history` (action `suppression`).

---

## 5. Grille de résultat

| # | Test | Attendu | Observé | Statut |
| --- | --- | --- | --- | --- |
| 1 | Connexion agent A | Écran agent | | ☐ |
| 2 | Connexion agent B | Écran agent | | ☐ |
| 3 | Observation A | Envoi confirmé | | ☐ |
| 4 | Réception admin A | Visible | | ☐ |
| 5 | Observation B | Envoi confirmé | | ☐ |
| 6 | Réception admin B | Visible sans rechargement | | ☐ |
| 7 | Photos et cloisonnement | Conforme | | ☐ |
| 8 | Changement de statut | Appliqué | | ☐ |
| 9 | Retour agent | Statut et historique | | ☐ |
| 10 | Persistance | Données présentes | | ☐ |

**Verdict** : ☐ Conforme — ☐ Non conforme (préciser)

---

## 6. Preuves à conserver

- Capture d'écran de l'écran agent A après envoi.
- Capture d'écran du tableau de bord administrateur avec les 2 observations.
- Capture d'écran de l'historique côté agent.
- Export du résultat des requêtes SQL de la section 3.
- Horodatage et nom de l'opérateur.