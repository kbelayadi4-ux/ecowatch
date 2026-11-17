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

await ref.close();
await reel.close();

console.log(`\nRESULTAT: ${echecs === 0 ? "TOUT VERT" : `${echecs} echec(s)`}`);
process.exit(echecs === 0 ? 0 : 1);