// Runs supabase/migrations in order inside PGlite (WASM Postgres + PostGIS), then each
// supabase/tests/*.sql file in a fresh database. A test fails by raising an exception.
// Supabase-specific pieces (auth schema, API roles, realtime publication) are shimmed.
// Usage: node scripts/test-sql.mjs [test-name-filter]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { postgis } from "@electric-sql/pglite-postgis";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "supabase", "migrations");
const testsDir = path.join(root, "supabase", "tests");
const filter = process.argv[2] ?? "";

const supabaseShim = `
create schema if not exists auth;
create schema if not exists extensions;
set search_path = "$user", public, extensions;
do $$ begin execute format('alter database %I set search_path = "$user", public, extensions', current_database()); end $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant anon, authenticated, service_role to current_user;
grant usage on schema public, auth, extensions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
-- Same definitions as Supabase: legacy per-claim settings first, then the claims JSON.
create function auth.uid() returns uuid language sql stable
  as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create function auth.role() returns text language sql stable
  as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $$;
create function auth.jwt() returns jsonb language sql stable
  as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant execute on all functions in schema auth to anon, authenticated, service_role;
create publication supabase_realtime;
`;

// Helpers available to tests: act as a user (role + auth.uid()) or reset to the superuser.
const testHelpers = `
create schema if not exists qa;
create function qa.login(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(user_id::text, ''), true);
  perform set_config('request.jwt.claim.role', case when user_id is null then 'anon' else 'authenticated' end, true);
  execute format('set local role %I', case when user_id is null then 'anon' else 'authenticated' end);
end $$;
create function qa.logout() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
create function qa.assert(condition boolean, message text) returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception 'FAIL: %', message; end if;
end $$;
grant usage on schema qa to anon, authenticated, service_role;
grant execute on all functions in schema qa to anon, authenticated, service_role;
`;

let baseImage;
async function freshDatabase() {
  // Build the migrated database once, then clone it from a data-directory dump per test.
  if (baseImage) return cloneBase();
  const db = await PGlite.create({ extensions: { postgis, pg_trgm } });
  await db.exec(supabaseShim);
  for (const file of fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    try {
      await db.exec(fs.readFileSync(path.join(migrationsDir, file), "utf8"));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${error.message}`);
    }
  }
  await db.exec(testHelpers);
  baseImage = await db.dumpDataDir("none");
  await db.close();
  return cloneBase();
}

async function cloneBase() {
  const db = await PGlite.create({ loadDataDir: baseImage, extensions: { postgis, pg_trgm } });
  await db.exec('set search_path = "$user", public, extensions');
  return db;
}

const tests = fs.readdirSync(testsDir).filter((name) => name.endsWith(".sql") && name.includes(filter)).sort();
let failures = 0;
console.log(`Applying migrations and running ${tests.length} SQL test file(s) in PGlite`);
for (const file of tests) {
  const started = Date.now();
  let db;
  try {
    db = await freshDatabase();
    await db.exec(fs.readFileSync(path.join(testsDir, file), "utf8"));
    console.log(`PASS ${file} (${Date.now() - started} ms)`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${file}: ${error.message}`);
  } finally {
    await db?.close();
  }
}
console.log(failures ? `SQL_TESTS_FAILED ${failures}` : "SQL_TESTS_PASSED");
process.exitCode = failures ? 1 : 0;
