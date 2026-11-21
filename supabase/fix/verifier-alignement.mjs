// ============================================================
// Verificateur du script d'alignement EcoWatch.
//
// 1. Construit une base PGlite reproduisant l'etat REEL constate
//    (schema.sql seul, aucune politique, aucune fonction).
// 2. Applique supabase/fix/alignement-eco-watch.sql.
// 3. Compare l'empreinte du schema obtenu a celle de la reference
//    (schema.sql + migrations 001..011).
// 4. Verifie le comportement securite : anon ne lit rien, anon peut
//    deposer un signalement, l'admin voit le signalement.
// 5. Rejoue le script une seconde fois (idempotence).
//
// Usage : bun run supabase/fix/verifier-alignement.mjs
// ============================================================
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const BOOTSTRAP = read("supabase/tests/run-rls-tests.mjs")
  .split("const BOOTSTRAP = `")[1]
  .split("`;")[0];

const MIGRATIONS = [
  "supabase/migrations/001_add_auth_link.sql",
  "supabase/migrations/002_auth_helpers.sql",
  "supabase/migrations/003_secure_rls.sql",
  "supabase/migrations/004_realtime.sql",
  "supabase/migrations/005_secure_cleanup.sql",
  "supabase/migrations/006_agent_signup_trigger.sql",
  "supabase/migrations/007_fix_admin_notifications.sql",
  "supabase/migrations/008_unify_admin_roles.sql",
  "supabase/migrations/009_suivi_observations.sql",
  "supabase/migrations/010_storage_photos.sql",
  "supabase/migrations/011_signalement_public.sql",
];

const ADMIN_UUID = "00000000-0000-0000-0000-0000000000aa";
const AGENT_UUID = "00000000-0000-0000-0000-0000000000bb";

let echecs = 0;
const ok = (condition, libelle, detail = "") => {
  if (condition) {
    console.log(`  OK   ${libelle}`);
  } else {
    echecs += 1;
    console.log(`  ECHEC ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
};

// Empreinte canonique du schema public + auth (storage non disponible
// dans PGlite).
async function empreinte(db) {
  const q = async (sql) => (await db.query(sql)).rows.map((r) => Object.values(r).join("|"));

  const blocs = [
    ["COLONNES", await q(`select table_name, column_name, data_type, is_nullable, coalesce(column_default,'')
                    from information_schema.columns
                    where table_schema='public'
                      and table_name in ('agents','observations','notifs','observation_history','signalement_public_abus')
                    order by 1,2`)],
    ["CONTRAINTES", await q(`select conrelid::regclass::text, conname, pg_get_constraintdef(oid)
                       from pg_constraint
                       where connamespace='public'::regnamespace
                         and conrelid::regclass::text in ('agents','observations','notifs','observation_history','signalement_public_abus')
                       order by 1,2`)],
    ["POLITIQUES", await q(`select tablename, policyname, cmd, coalesce(qual,'-'), coalesce(with_check,'-')
                      from pg_policies where schemaname='public' order by 1,2`)],
    ["FONCTIONS", await q(`select p.proname, pg_get_function_identity_arguments(p.oid), p.prosecdef,
                            coalesce(p.proconfig::text,'')
                     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                     where n.nspname='public' order by 1`)],
    ["TRIGGERS", await q(`select c.relname, t.tgname, pg_get_triggerdef(t.oid)
                    from pg_trigger t
                    join pg_class c on c.oid=t.tgrelid
                    join pg_namespace n on n.oid=c.relnamespace
                    where n.nspname in ('public','auth') and not t.tgisinternal
                    order by 1,2`)],
    ["INDEX", await q(`select tablename, indexname from pg_indexes where schemaname='public' order by 1,2`)],
    ["SEQUENCES", await q(`select sequencename from pg_sequences where schemaname='public' order by 1`)],
    ["RLS", await q(`select relname, relrowsecurity from pg_class c
               join pg_namespace n on n.oid=c.relnamespace
               where n.nspname='public' and c.relkind='r' order by 1`)],
  ];

  const lignes = [];
  for (const [label, valeurs] of blocs) {
    for (const v of valeurs) lignes.push(`${label} :: ${v}`);
  }
  return lignes.sort().join("\n");
}

async function base(sql) {
  const db = await PGlite.create();
  await db.exec(BOOTSTRAP);
  // Silhouette minimale du schema `storage` de Supabase : sans elle, la
  // migration 010 ne cree ni bucket ni politique et les controles sur les
  // photos ne vaudraient rien.
  await db.exec(`
    create schema if not exists storage;
    create table if not exists storage.buckets (
      id text primary key,
      name text,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text references storage.buckets(id),
      name text,
      owner uuid
    );
    create or replace function storage.foldername(text) returns text[]
    language sql immutable
    as $fn$
      select case when position('/' in $1) = 0 then array[]::text[]
                  else string_to_array(regexp_replace($1, '/[^/]*$', ''), '/')
             end;
    $fn$;
    grant usage on schema storage to anon, authenticated, service_role;
    grant all on storage.buckets, storage.objects to anon, authenticated, service_role;

    -- Comme dans Supabase : les tables Storage sont sous RLS. Sans cela,
    -- les politiques creees par la migration 010 ne seraient pas appliquees
    -- et les controles d'acces aux photos ne vaudraient rien.
    alter table storage.buckets enable row level security;
    alter table storage.objects enable row level security;
  `);
  await db.exec(sql);
  return db;
}

/**
 * Execute une requete sous un role donne, dans une transaction qui est
 * systematiquement annulee en cas d'erreur (aucun etat abortif residuel).
 */
async function sousRole(db, role, sql, claims) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role};`);
    if (claims) {
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [claims.sub]);
    }
    return tx.query(sql);
  });
}

/** Vrai si l'action echoue (permission refusee ou exception SQL). */
async function echoue(db, role, sql, claims) {
  try {
    await sousRole(db, role, sql, claims);
    return false;
  } catch {
    return true;
  }
}

const SCHEMA = read("supabase/schema.sql");
const ALIGNEMENT = read("supabase/fix/alignement-eco-watch.sql");
const DRY_RUN = read("supabase/fix/alignement-eco-watch-dry-run.sql");

// ------------------------------------------------------------
// 0. Contrat transactionnel des deux scripts
//    L'installateur ne doit contenir AUCUN rollback : sinon ce
//    serait un script de simulation deguise en installation.
// ------------------------------------------------------------
console.log("\nContrat transactionnel");

const compte = (texte, motif) => (texte.match(motif) ?? []).length;

const install = {
  begin: compte(ALIGNEMENT, /^\s*begin\s*;$/gim),
  commit: compte(ALIGNEMENT, /^\s*commit\s*;$/gim),
  rollback: compte(ALIGNEMENT, /^\s*rollback\s*;$/gim),
};
const simulation = {
  begin: compte(DRY_RUN, /^\s*begin\s*;$/gim),
  commit: compte(DRY_RUN, /^\s*commit\s*;$/gim),
  rollback: compte(DRY_RUN, /^\s*rollback\s*;$/gim),
};

ok(install.begin === 1, "installation : exactement un BEGIN", `${install.begin}`);
ok(install.commit === 1, "installation : exactement un COMMIT", `${install.commit}`);
ok(install.rollback === 0, "installation : aucun ROLLBACK (modifications conservees)", `${install.rollback}`);
ok(simulation.begin === 1, "dry-run : exactement un BEGIN", `${simulation.begin}`);
ok(simulation.rollback === 1, "dry-run : exactement un ROLLBACK", `${simulation.rollback}`);
ok(simulation.commit === 0, "dry-run : aucun COMMIT (aucune modification conservee)", `${simulation.commit}`);

const positionCommit = ALIGNEMENT.lastIndexOf("\ncommit;");
const positionVerif = ALIGNEMENT.indexOf("VERIFICATION FINALE");
ok(
  positionVerif > 0 && positionCommit > positionVerif,
  "installation : la verification precede le COMMIT",
  `verif=${positionVerif} commit=${positionCommit}`,
);

// ------------------------------------------------------------
// 1. Reference : schema.sql + 001..011
// ------------------------------------------------------------
console.log("\nReference (schema.sql + 001..011)");
const ref = await base(SCHEMA);
for (const m of MIGRATIONS) {
  try {
    await ref.exec(read(m));
  } catch (e) {
    console.error(`  ECHEC application ${m}: ${e.message}`);
    process.exit(1);
  }
}
const empreinteRef = await empreinte(ref);

// ------------------------------------------------------------
// 2. Etat reel constate : schema.sql seul
// ------------------------------------------------------------
console.log("\nEtat reel (schema.sql seul) + alignement");
const reel = await base(SCHEMA);

const avantColonnes = (await reel.query(`select count(*)::int n from information_schema.columns
  where table_schema='public' and table_name='observations'`)).rows[0].n;
ok(avantColonnes === 10, "base de depart = schema.sql seul (10 colonnes sur observations)", `${avantColonnes}`);

try {
  await reel.exec(ALIGNEMENT);
  ok(true, "alignement-eco-watch.sql applique sans erreur");
} catch (e) {
  ok(false, "alignement-eco-watch.sql applique sans erreur", e.message);
  console.log(`\nRESULTAT: ${echecs} echec(s)`);
  process.exit(1);
}

const empreinteReel = await empreinte(reel);
ok(empreinteReel === empreinteRef, "schema obtenu identique a la reference 001..011");

if (empreinteReel !== empreinteRef) {
  const a = empreinteRef.split("\n");
  const b = empreinteReel.split("\n");
  for (const l of a.filter((x) => !b.includes(x)).slice(0, 15)) console.log(`       manquant : ${l}`);
  for (const l of b.filter((x) => !a.includes(x)).slice(0, 15)) console.log(`       en trop  : ${l}`);
}

// ------------------------------------------------------------
// 3. Idempotence
// ------------------------------------------------------------
try {
  await reel.exec(ALIGNEMENT);
  ok(true, "deuxieme execution sans erreur (idempotence)");
} catch (e) {
  ok(false, "deuxieme execution sans erreur (idempotence)", e.message);
}

// ------------------------------------------------------------
// 4. Donnees existantes preservees
// ------------------------------------------------------------
const avant = await base(`
  ${SCHEMA}
  insert into public.agents (id, telephone, nom, role)
  values ('a1', '22000001', 'Agent Historique', 'agent');

  insert into public.observations (id, agent_id, agent_nom, agent_telephone, type_probleme, zone, date_creation)
  values ('o1', 'a1', 'Agent Historique', '22000001', 'fuite_huile', 'cru', now());
`);

try {
  await avant.exec(ALIGNEMENT);
  const r = (await avant.query(
    `select numero_suivi, statut, priorite, maj_le is not null as maj from public.observations where id='o1'`,
  )).rows[0];
  ok(!!r.numero_suivi && r.statut === "nouvelle" && r.priorite === "normale" && r.maj,
    "observation anterieure conservee et completee",
    JSON.stringify(r));
} catch (e) {
  ok(false, "observation anterieure conservee et completee", e.message);
}
await avant.close();

const comptes = await base(`
  ${SCHEMA}
  insert into public.agents (id, telephone, nom, role)
  values ('a1', '22000001', 'Agent Historique', 'agent');
`);

try {
  await comptes.exec(ALIGNEMENT);
  const r = (await comptes.query(
    `select id, telephone, nom, role, auth_user_id from public.agents where id='a1'`,
  )).rows[0];
  ok(r && r.telephone === "22000001" && r.nom === "Agent Historique" && r.role === "agent" && r.auth_user_id === null,
    "agent anterieur inchange (auth_user_id reste vide)",
    JSON.stringify(r));
} catch (e) {
  ok(false, "agent anterieur inchange", e.message);
}
await comptes.close();

// ------------------------------------------------------------
// 5. Securite : role anonyme
// ------------------------------------------------------------
console.log("\nSecurite — role anon");

ok(
  await echoue(reel, "anon", `select count(*) from public.observations`),
  "anon ne peut pas lire observations (permission refusee)",
);

ok(
  await echoue(
    reel,
    "anon",
    `insert into public.observations (id, agent_id, agent_nom, agent_telephone, type_probleme, zone)
     values ('x', 'public', 'x', 'x', 'autre', 'usine')`,
  ),
  "anon ne peut pas inserer directement dans observations",
);

ok(
  await echoue(reel, "anon", `update public.observations set statut = 'cloturee'`),
  "anon ne peut pas modifier observations",
);

ok(
  await echoue(reel, "anon", `select count(*) from public.notifs`),
  "anon ne peut pas lire les notifications",
);

ok(
  await echoue(reel, "anon", `select count(*) from public.signalement_public_abus`),
  "anon ne peut pas lire le registre anti-abus",
);

// ------------------------------------------------------------
// 6. Parcours public (QR Code)
// ------------------------------------------------------------
console.log("\nParcours public (QR Code)");

await reel.exec(`
  insert into public.agents (id, telephone, nom, role, auth_user_id)
  values ('adm1', '22000001', 'Admin Test', 'admin', '${ADMIN_UUID}');
  insert into public.agents (id, telephone, nom, role, auth_user_id)
  values ('agt1', '22000002', 'Agent Test', 'agent', '${AGENT_UUID}');
`);

let signalement = null;
try {
  const r = await sousRole(
    reel,
    "anon",
    `select public.creer_signalement_public(
       'fuite_huile', 'ciment', 'Opérateur Test', 'MAT-1',
       'Fuite sous la cuve 3', null
     ) as resultat`,
  );
  signalement = r.rows[0]?.resultat;
  ok(signalement?.ok === true, "anon peut deposer un signalement via la RPC", JSON.stringify(signalement));
} catch (e) {
  ok(false, "anon peut deposer un signalement via la RPC", e.message);
}

let sansPhoto = null;
try {
  const r = await sousRole(
    reel,
    "anon",
    `select public.creer_signalement_public('fuite_eau', 'cru', null, null, null, null) as resultat`,
  );
  sansPhoto = r.rows[0]?.resultat;
  ok(sansPhoto?.ok === true, "signalement sans nom, sans matricule, sans photo", JSON.stringify(sansPhoto));
} catch (e) {
  ok(false, "signalement sans nom, sans matricule, sans photo", e.message);
}

ok(
  await echoue(reel, "anon", `select public.creer_signalement_public('type_inconnu', 'ciment', null, null, null, null)`),
  "type de probleme inconnu refuse par la base",
);

ok(
  await echoue(reel, "anon", `select public.creer_signalement_public('fuite_huile', 'zone_inconnue', null, null, null, null)`),
  "zone inconnue refusee par la base",
);

ok(
  await echoue(
    reel,
    "anon",
    `select public.creer_signalement_public('fuite_huile', 'ciment', null, null, null, 'data:text/html;base64,AAAA')`,
  ),
  "photo non base64 refusee par la base",
);

// ------------------------------------------------------------
// 7. Identite imposee par la base
// ------------------------------------------------------------
const obsPublique = (await reel.query(
  `select id, numero_suivi, agent_id, agent_nom, operateur_nom, statut, priorite
   from public.observations order by date_creation`,
)).rows;

ok(
  obsPublique.length === 2 &&
    obsPublique.every((o) => o.agent_id === "public" && o.agent_nom === "Signalement public (QR Code)"),
  "signalements rattaches a l'agent technique public",
  JSON.stringify(obsPublique.map((o) => [o.id, o.agent_id, o.agent_nom])),
);

ok(
  obsPublique.every((o) => /^SCG-\d{8}-\d{5}$/.test(o.numero_suivi ?? "")),
  "numero de suivi genere par la base",
  JSON.stringify(obsPublique.map((o) => o.numero_suivi)),
);

ok(
  obsPublique.every((o) => o.statut === "nouvelle" && o.priorite === "normale"),
  "statut et priorite imposes par la base (non fournis par le visiteur)",
);

// ------------------------------------------------------------
// 8. Administration : lecture et indicateurs
// ------------------------------------------------------------
console.log("\nAdministration et indicateurs");

let adminVoit = -1;
try {
  const r = await sousRole(reel, "authenticated", `select count(*)::int n from public.observations`, {
    sub: ADMIN_UUID,
  });
  adminVoit = r.rows[0].n;
} catch (e) {
  console.log(`       erreur lecture admin : ${e.message}`);
}
ok(adminVoit === 2, "l'admin voit les 2 signalements", `${adminVoit}`);

let agentVoit = -1;
try {
  const r = await sousRole(reel, "authenticated", `select count(*)::int n from public.observations`, {
    sub: AGENT_UUID,
  });
  agentVoit = r.rows[0].n;
} catch (e) {
  console.log(`       erreur lecture agent : ${e.message}`);
}
ok(agentVoit === 0, "un agent ne voit aucun signalement public (isolation RLS)", `${agentVoit}`);

let profils = -1;
try {
  const r = await sousRole(reel, "authenticated", `select count(*)::int n from public.agents`, {
    sub: AGENT_UUID,
  });
  profils = r.rows[0].n;
} catch (e) {
  console.log(`       erreur lecture agents : ${e.message}`);
}
ok(profils === 1, "un agent ne voit que son propre profil", `${profils}`);

const kpi = (await reel.query(`
  with j as (select (now() at time zone 'Africa/Tunis')::date as jour)
  select
    (select count(*)::int from public.observations) as total,
    (select count(*)::int from public.observations, j
      where (date_creation at time zone 'Africa/Tunis')::date = j.jour) as aujourdhui,
    (select count(*)::int from public.observations, j
      where (date_creation at time zone 'Africa/Tunis')::date >= j.jour - ((extract(dow from j.jour)::int + 6) % 7)) as cette_semaine,
    (select count(*)::int from public.observations where photo is not null or photo_path is not null) as avec_photo,
    (select count(*)::int from public.observations where statut = 'nouvelle') as nouvelles,
    (select count(*)::int from public.observations
      where statut in ('en_analyse','action_en_cours','attente_verification')) as en_cours,
    (select count(*)::int from public.observations where statut = 'cloturee') as cloturees
`)).rows[0];

ok(kpi.total === 2, "KPI Total = 2", `${kpi.total}`);
ok(kpi.aujourdhui === 2, "KPI Aujourd'hui = 2", `${kpi.aujourdhui}`);
ok(kpi.cette_semaine === 2, "KPI Cette semaine = 2", `${kpi.cette_semaine}`);
ok(kpi.avec_photo === 0, "KPI Avec photo = 0", `${kpi.avec_photo}`);
ok(kpi.nouvelles === 2, "KPI Nouvelles = 2", `${kpi.nouvelles}`);
ok(kpi.en_cours === 0 && kpi.cloturees === 0, "KPI En cours = 0 et Cloturees = 0", `${kpi.en_cours}/${kpi.cloturees}`);

// ------------------------------------------------------------
// 9. Journalisation et notifications
// ------------------------------------------------------------
const journal = (await reel.query(
  `select action, count(*)::int n from public.observation_history group by action order by action`,
)).rows;

ok(
  journal.some((j) => j.action === "creation" && j.n >= 2),
  "chaque signalement est journalise (action = creation)",
  JSON.stringify(journal),
);

const notifs = (await reel.query(`select count(*)::int n from public.notifs`)).rows[0].n;
ok(notifs === 2, "une notification creee par signalement", `${notifs}`);

// ------------------------------------------------------------
// 10. Privilèges : ce que chaque rôle peut réellement faire
//     (la RLS reste la frontière ; ces droits ne font que confirmer
//      qu'aucune lecture publique n'existe)
// ------------------------------------------------------------
const privilege = async (role, table, droit) => {
  const r = await reel.query(`select has_table_privilege($1, $2, $3) as v`, [
    role,
    `public.${table}`,
    droit,
  ]);
  return r.rows[0].v === true;
};

ok(!(await privilege("anon", "observations", "select")), "anon : aucun SELECT sur observations");
ok(!(await privilege("anon", "observations", "insert")), "anon : aucun INSERT sur observations");
ok(!(await privilege("anon", "agents", "select")), "anon : aucun SELECT sur agents");
ok(!(await privilege("anon", "notifs", "select")), "anon : aucun SELECT sur notifs");
ok(await privilege("authenticated", "observations", "select"), "authenticated : SELECT sur observations");
ok(await privilege("authenticated", "notifs", "select"), "authenticated : SELECT sur notifs");

const colonne = async (table, col, droit) => {
  const r = await reel.query(`select has_column_privilege('authenticated', $1, $2, $3) as v`, [
    `public.${table}`,
    col,
    droit,
  ]);
  return r.rows[0].v === true;
};

ok(await colonne("agents", "nom", "update"), "authenticated : peut modifier agents.nom");
ok(!(await colonne("agents", "role", "update")), "authenticated : ne peut pas modifier agents.role");
ok(!(await colonne("agents", "telephone", "update")), "authenticated : ne peut pas modifier agents.telephone");

const rpc = await reel.query(
  `select has_function_privilege('anon', 'public.creer_signalement_public(text,text,text,text,text,text)', 'execute') as v`,
);
ok(rpc.rows[0].v === true, "anon : peut appeler creer_signalement_public()");

const rpcAdmin = await reel.query(
  `select has_function_privilege('anon', 'public.admin_update_observation(text,text,text,text,timestamptz,text,boolean)', 'execute') as v`,
);
ok(rpcAdmin.rows[0].v === false, "anon : ne peut pas appeler admin_update_observation()");

// ------------------------------------------------------------
// 11. Escalade de privileges (tentatives reelles, pas seulement
//     des verifications de droits declares)
// ------------------------------------------------------------
console.log("\nEscalade de privileges — role authenticated non-admin");

/** Nombre de lignes reellement modifiees par une instruction DML (-1 si refus). */
async function modifie(db, role, sql, claims) {
  try {
    return await db.transaction(async (tx) => {
      await tx.exec(`set local role ${role};`);
      if (claims) {
        await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
        await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [claims.sub]);
      }
      const r = await tx.query(sql);
      return r.affectedRows ?? 0;
    });
  } catch {
    return -1;
  }
}

ok(
  await echoue(
    reel,
    "authenticated",
    `update public.agents set role = 'admin' where id = 'agt1'`,
    { sub: AGENT_UUID },
  ),
  "un agent ne peut pas se promouvoir administrateur (privilege refuse)",
);

ok(
  (await modifie(reel, "authenticated", `update public.agents set nom = 'Pirate' where id = 'adm1'`, {
    sub: AGENT_UUID,
  })) === 0,
  "un agent ne peut pas modifier le profil d'un autre",
);

ok(
  await echoue(
    reel,
    "authenticated",
    `insert into public.agents (id, telephone, nom, role)
     values ('intrus', '99999999', 'Intrus', 'admin')`,
    { sub: AGENT_UUID },
  ),
  "un agent ne peut pas creer un profil administrateur",
);

ok(
  (await modifie(reel, "authenticated", `update public.observations set statut = 'cloturee'`, {
    sub: AGENT_UUID,
  })) === 0,
  "un agent ne peut pas changer le statut d'une observation",
);

ok(
  (await modifie(reel, "authenticated", `delete from public.observations`, {
    sub: AGENT_UUID,
  })) === 0,
  "un agent ne peut pas supprimer une observation",
);

ok(
  (await modifie(reel, "authenticated", `update public.notifs set lu = true`, {
    sub: AGENT_UUID,
  })) === 0,
  "un agent ne peut pas marquer comme lues les notifications d'un autre",
);

ok(
  (await modifie(reel, "authenticated", `update public.observations set statut = 'cloturee'`, {
    sub: ADMIN_UUID,
  })) === 2,
  "l'administrateur peut modifier les observations",
);

ok(
  (await modifie(reel, "authenticated", `update public.agents set nom = 'Admin Test' where id = 'adm1'`, {
    sub: ADMIN_UUID,
  })) === 1,
  "l'administrateur peut modifier un profil",
);

// ------------------------------------------------------------
// 11b. Photographies (Storage) et registre anti-abus
// ------------------------------------------------------------
console.log("\nPhotographies et registre anti-abus");

const bucket = (await reel.query(
  `select public, file_size_limit, allowed_mime_types from storage.buckets where id='photos'`,
)).rows[0];

ok(!!bucket, "bucket photos cree");
ok(bucket?.public === false, "bucket photos prive (public = false)");
ok(
  bucket?.file_size_limit === 5 * 1024 * 1024,
  "bucket photos limite a 5 Mo",
  `${bucket?.file_size_limit}`,
);
ok(
  JSON.stringify(bucket?.allowed_mime_types) ===
    JSON.stringify(["image/jpeg", "image/png", "image/webp"]),
  "bucket photos limite aux formats JPEG, PNG, WebP",
  JSON.stringify(bucket?.allowed_mime_types),
);

await reel.exec(`
  insert into storage.objects (bucket_id, name) values ('photos', 'agt1/obs1.jpg');
  insert into storage.objects (bucket_id, name) values ('photos', 'adm1/obs2.jpg');
`);

const photosAgent = (await sousRole(reel, "authenticated", `select count(*)::int n from storage.objects`, {
  sub: AGENT_UUID,
})).rows[0].n;

ok(photosAgent === 1, "un agent ne lit que les photos de son dossier", `${photosAgent}`);

const photosAdmin = (await sousRole(reel, "authenticated", `select count(*)::int n from storage.objects`, {
  sub: ADMIN_UUID,
})).rows[0].n;

ok(photosAdmin === 2, "l'administrateur lit toutes les photos", `${photosAdmin}`);

let photosAnon = -1;
try {
  photosAnon = (await sousRole(reel, "anon", `select count(*)::int n from storage.objects`)).rows[0].n;
} catch {
  photosAnon = -1;
}
ok(photosAnon === 0, "le public ne lit aucune photo", `${photosAnon}`);

ok(
  await echoue(
    reel,
    "anon",
    `insert into storage.objects (bucket_id, name) values ('photos', 'intrus.jpg')`,
  ),
  "le public ne peut pas deposer de photo",
);

ok(
  !(await privilege("authenticated", "signalement_public_abus", "select")),
  "authenticated : aucun SELECT sur le registre anti-abus",
);

// ------------------------------------------------------------
// 12. Persistance apres COMMIT
//     Nouvelle transaction : les objets crees par le script doivent
//     subsister (une annulation posterieure prouverait l'inverse).
// ------------------------------------------------------------
console.log("\nPersistance apres COMMIT");

const apresCommit = (await reel.query(`
  select
    (select count(*)::int from information_schema.columns
      where table_schema='public' and table_name='observations'
        and column_name in ('statut','priorite','numero_suivi','operateur_nom','photo_path')) as colonnes_suivi,
    (select count(*)::int from information_schema.tables
      where table_schema='public' and table_name in ('observation_history','signalement_public_abus')) as tables_service,
    (select count(*)::int from public.observations) as observations
`)).rows[0];

ok(apresCommit.colonnes_suivi === 5, "colonnes de suivi toujours presentes apres COMMIT", `${apresCommit.colonnes_suivi}/5`);
ok(apresCommit.tables_service === 2, "tables de service toujours presentes apres COMMIT", `${apresCommit.tables_service}/2`);
ok(apresCommit.observations === 2, "signalements toujours presents apres COMMIT", `${apresCommit.observations}`);

// ------------------------------------------------------------
// 13. Variante dry-run : ROLLBACK, aucune modification conservee
// ------------------------------------------------------------
console.log("\nVariante dry-run (simulation annulee)");

const dry = await base(SCHEMA);
try {
  await dry.exec(DRY_RUN);
  ok(true, "alignement-eco-watch-dry-run.sql s'applique sans erreur");
} catch (e) {
  ok(false, "alignement-eco-watch-dry-run.sql s'applique sans erreur", e.message);
}

const apresDry = (await dry.query(`
  select
    (select count(*)::int from information_schema.columns
      where table_schema='public' and table_name='agents' and column_name='auth_user_id') as auth_user_id,
    (select count(*)::int from information_schema.columns
      where table_schema='public' and table_name='observations' and column_name='statut') as statut,
    (select count(*)::int from information_schema.tables
      where table_schema='public' and table_name='signalement_public_abus') as abus
`)).rows[0];

ok(apresDry.auth_user_id === 0, "dry-run : agents.auth_user_id non conserve (ROLLBACK)", `${apresDry.auth_user_id}`);
ok(apresDry.statut === 0, "dry-run : observations.statut non conserve (ROLLBACK)", `${apresDry.statut}`);
ok(apresDry.abus === 0, "dry-run : signalement_public_abus non conserve (ROLLBACK)", `${apresDry.abus}`);
await dry.close();

// ------------------------------------------------------------
// 14. Rollback effectif en cas d'anomalie
//     Une table de service preexistante mais de forme incorrecte
//     doit faire echouer la verification et TOUT annuler.
// ------------------------------------------------------------
console.log("\nRollback en cas d'anomalie");

const cas = await base(`
  ${SCHEMA}
  create table public.observation_history (id bigint primary key);
`);

let interruption = false;
try {
  await cas.exec(ALIGNEMENT);
} catch {
  interruption = true;
}
ok(interruption, "une verification en echec interrompt bien l'installation");

// PGlite n'annule pas automatiquement une transaction echouee : on la
// ferme explicitement avant de lire l'etat de la base.
try {
  await cas.exec("rollback;");
} catch {
  /* transaction deja fermee */
}

const apresEchec = (await cas.query(`
  select
    (select count(*)::int from information_schema.columns
      where table_schema='public' and table_name='agents' and column_name='auth_user_id') as auth_user_id,
    (select count(*)::int from information_schema.columns
      where table_schema='public' and table_name='observations' and column_name='statut') as statut,
    (select count(*)::int from information_schema.tables
      where table_schema='public' and table_name='signalement_public_abus') as abus,
    (select count(*)::int from information_schema.columns
      where table_schema='public' and table_name='observation_history') as colonnes_historique
`)).rows[0];

ok(apresEchec.auth_user_id === 0, "echec : agents.auth_user_id non applique (rollback)", `${apresEchec.auth_user_id}`);
ok(apresEchec.statut === 0, "echec : observations.statut non applique (rollback)", `${apresEchec.statut}`);
ok(apresEchec.abus === 0, "echec : signalement_public_abus non cree (rollback)", `${apresEchec.abus}`);
ok(
  apresEchec.colonnes_historique === 1,
  "echec : table preexistante laissee intacte (aucune destruction)",
  `${apresEchec.colonnes_historique}`,
);
await cas.close();

await ref.close();
await reel.close();

console.log(`\nRESULTAT: ${echecs === 0 ? "TOUT VERT" : `${echecs} echec(s)`}`);
process.exit(echecs === 0 ? 0 : 1);