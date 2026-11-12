// Harnais de test local des migrations EcoWatch.
// Utilise PGlite (PostgreSQL 17 compile en WASM) pour executer reellement
// schema.sql + migrations 001..006 + les tests RLS, sans base distante.
//
// Usage : bun run supabase/tests/run-rls-tests.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const BOOTSTRAP = `
  create role anon;
  create role authenticated;
  create role service_role;
  create role supabase_auth_admin;

  create schema if not exists auth;

  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    phone text unique,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );

  create or replace function auth.uid() returns uuid
  language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

  create or replace function auth.jwt() returns jsonb
  language sql stable
  as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;

  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated, service_role;

  -- Privilèges par defaut faconnés sur ceux de Supabase : les objets crees
  -- ensuite dans public sont accessibles a authenticated, sauf revocation ulterieure.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

  -- Supabase publie l'evenement Realtime via cette publication.
  do $$ begin create publication supabase_realtime; exception when duplicate_object then null; end $$;
`;

const PRE_FILES = [
  "supabase/schema.sql",
  "supabase/migrations/001_add_auth_link.sql",
  "supabase/migrations/002_auth_helpers.sql",
  "supabase/migrations/003_secure_rls.sql",
];

const POST_FILES = [
  "supabase/migrations/004_realtime.sql",
  "supabase/migrations/005_secure_cleanup.sql",
  "supabase/migrations/006_agent_signup_trigger.sql",
];

const notices = [];
const db = await PGlite.create();
// PGlite expose les notices via une option de requete, pas via un event.
const origExec = db.exec.bind(db);
db.exec = (sql, opts) =>
  origExec(sql, { ...(opts ?? {}), onNotice: (n) => { if (n.message) notices.push(n.message); } });

async function run(label, sql) {
  try {
    await db.exec(sql);
    console.log(`  ok  ${label}`);
    return true;
  } catch (e) {
    console.error(`  FAIL ${label}\n       ${e.message ?? e}`);
    return false;
  }
}

async function applyAll(files) {
  for (const f of files) {
    const ok = await run(f, read(f));
    if (!ok) {
      console.error(`\nMigration en echec: ${f}`);
      process.exit(1);
    }
  }
}

console.log("Bootstrap...");
await run("roles + schéma auth", BOOTSTRAP);

await applyAll(PRE_FILES);

// ------------------------------------------------------------
// Demonstration : avant 005, la RLS est contournee.
// On mesure ce qu'un agent A voit reellement.
// ------------------------------------------------------------
const seed = `
  insert into public.agents (id, auth_user_id, telephone, nom, role) values
    ('a1', '00000000-0000-0000-0000-0000000000a1', '11111111', 'Agent A', 'agent'),
    ('a2', '00000000-0000-0000-0000-0000000000a2', '22222222', 'Agent B', 'agent')
  on conflict (id) do nothing;

  insert into public.observations (id, agent_id, agent_nom, agent_telephone, type_probleme, zone, date_creation) values
    ('o1', 'a1', 'Agent A', '11111111', 'fuite_huile', 'cru', now()),
    ('o2', 'a2', 'Agent B', '22222222', 'fuite_eau', 'ciment', now())
  on conflict (id) do nothing;
`;
await run("fixtures de demonstration", seed);

// Rejoue l'etat de production constate par l'audit : schema.sql d'origine
// deployait des politiques permissives qui neutralisaient la RLS.
await run(
  "rejeu des politiques permissives d origine",
  `drop policy if exists "legacy_obs_read_all" on public.observations;
   create policy "legacy_obs_read_all" on public.observations for select using (true);`
);

async function countVisible(uid) {
  let out = null;
  const claims = JSON.stringify({ sub: uid, app_metadata: { role: "agent" } });
  await db.transaction(async (tx) => {
    await tx.exec("set local role authenticated;");
    await tx.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
    const r = await tx.query("select count(*)::int as n from public.observations");
    out = r.rows[0].n;
  });
  return out;
}

const beforeCount = await countVisible("00000000-0000-0000-0000-0000000000a1");
console.log(
  `  avant 005 : agent A voit ${beforeCount} observation(s) (attendu 2 = fuite RLS)`
);

await applyAll(POST_FILES);

const afterCount = await countVisible("00000000-0000-0000-0000-0000000000a1");
console.log(
  `  apres 005  : agent A voit ${afterCount} observation(s) (attendu 1 = isolement correct)`
);

const isolationOk = beforeCount === 2 && afterCount === 1;
if (!isolationOk) {
  console.error("\nECHEC: la migration 005 n'a pas retabli l'isolement des donnees");
  process.exit(1);
}

await run(
  "nettoyage des fixtures de demonstration",
  `delete from public.observations where id in ('o1','o2');
   delete from public.agents where id in ('a1','a2');`
);

const testSql = read("supabase/tests/rls_security.test.sql");
const ok = await run("supabase/tests/rls_security.test.sql", testSql);

const results = notices.filter((n) => /^(OK|ECHEC)/.test(n));
for (const r of results) console.log(`       ${r}`);

await db.close();

if (!ok) {
  console.error("\nRESULTAT: ECHEC");
  process.exit(1);
}
console.log(`\nRESULTAT: ${results.length} assertions vertes, isolement RLS retabli`);