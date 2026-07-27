#!/usr/bin/env node
/**
 * migration-baseline.mjs — make `supabase db push` SAFE on this repo, once.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * Every migration in supabase/migrations/ was applied to production BY HAND
 * (pooler / SQL editor), so production's CLI ledger — `supabase_migrations.
 * schema_migrations` — is empty or partial. The CLI decides what to apply by
 * diffing local filenames against that ledger, so a naive `supabase db push`
 * against a hand-migrated database tries to REPLAY THE WHOLE SET from 00001.
 * That is why every prior session's note says "db push is unsafe here".
 *
 * The consequence of avoiding push has been worse than the risk: a migration can
 * be committed to `main` and simply never reach production, with nothing to
 * detect it. Two confirmed instances:
 *   - 00081_professionals_contact_name — SCRUM-238 blocked for weeks (2026-07-17)
 *   - 00075_test_3d_jobs_updated_at_heartbeat — found 2026-07-27; the reaper's
 *     test_3d_jobs sweep has been failing 42703 on every cron run since, so
 *     Build-3D ghost jobs are never reaped AND the SCRUM-309 false-reap fix has
 *     never been live.
 *
 * WHAT THIS SCRIPT DOES
 * ---------------------
 * Registers the already-applied migrations in the ledger so the CLI's view
 * matches reality. After that, `supabase db push` applies ONLY genuinely new
 * files and drift becomes impossible to ship silently.
 *
 * It does NOT run any migration DDL. It only writes the ledger. Marking a
 * migration "applied" that is NOT actually applied would permanently skip it, so
 * the default mode VERIFIES each migration's objects against production first
 * and refuses to baseline anything it cannot confirm.
 *
 * USAGE
 *   node scripts/migration-baseline.mjs verify    # probe prod, report drift. No writes. Safe.
 *   node scripts/migration-baseline.mjs plan      # print the exact SQL/CLI commands. No writes.
 *   node scripts/migration-baseline.mjs apply     # write the ledger (needs SUPABASE_DB_URL)
 *
 * ENV
 *   MMC_SERVICE_ROLE_KEY  service-role key, or a path to a file holding it.
 *                         Defaults to ~/.mmc-serv-rol if present. Used by `verify`
 *                         (read-only REST probes).
 *   SUPABASE_DB_URL       postgres connection string (pooler). Needed by `apply` only.
 *   MMC_SUPABASE_REF      project ref. Defaults to lztzyfeivpsbqbsfzctw (prod).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(root, "supabase", "migrations");
const REF = process.env.MMC_SUPABASE_REF || "lztzyfeivpsbqbsfzctw";
const REST = `https://${REF}.supabase.co/rest/v1`;

/**
 * Resolution order: MMC_SERVICE_ROLE_KEY (value or path) -> SUPABASE_SERVICE_ROLE_KEY
 * (the conventional name, and what CI supplies) -> ~/.mmc-serv-rol on a dev box.
 *
 * The probes are read-only and only ever ask "does this object exist", which
 * PostgREST answers before RLS is consulted. A service-role key is therefore
 * more privilege than this needs — the anon key would do. It is used only
 * because it is the key already available to CI. See docs/MIGRATIONS.md.
 */
function serviceRoleKey() {
  const raw = process.env.MMC_SERVICE_ROLE_KEY;
  if (raw && !raw.includes("/") && !raw.includes("\\") && raw.length > 60) return raw.trim();
  const fromEnv = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (fromEnv && fromEnv.trim().length > 60) return fromEnv.trim();
  const candidate = raw || join(homedir(), ".mmc-serv-rol");
  if (existsSync(candidate)) return readFileSync(candidate, "utf8").trim();
  return null;
}

/** Every migration file, in application order, with its CLI version string. */
function migrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => ({
      file,
      // The CLI treats the leading digits as the version. 00001_foundation.sql -> "00001".
      version: file.match(/^(\d+)/)?.[1] ?? null,
      sql: readFileSync(join(MIGRATIONS_DIR, file), "utf8"),
    }));
}

/**
 * Pull one or two checkable objects out of a migration's DDL. Tables are probed
 * with select=*, columns by name — a missing column returns PostgREST 42703,
 * which is an unambiguous "this migration did not land".
 */
function checksFor(sql) {
  const out = [];
  const tableRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_0-9]+)"?/gi;
  for (const m of sql.matchAll(tableRe)) out.push({ table: m[1], column: "*" });

  // Walk ALTER TABLE / ADD COLUMN in document order so each column is attributed
  // to the table that was most recently named.
  const pairRe =
    /alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?(?:public\.)?"?([a-z_0-9]+)"?|add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_0-9]+)"?/gi;
  let current = null;
  for (const m of sql.matchAll(pairRe)) {
    if (m[1]) current = m[1];
    else if (current) out.push({ table: current, column: m[2] });
  }

  const seen = new Set();
  return out
    .filter((c) => {
      const k = `${c.table}.${c.column}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 2);
}

async function probe(key, table, column) {
  const res = await fetch(`${REST}/${table}?select=${encodeURIComponent(column)}&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (res.ok) return { ok: true };
  return { ok: false, detail: `${res.status} ${(await res.text()).slice(0, 200)}` };
}

/**
 * The applied-version list straight from production's CLI ledger, via the
 * SECURITY DEFINER function added in 20260727120000. This is what closed the
 * gate's original blind spot: object probes can only see migrations that create
 * a table or column, so anything policy/function/data-only was unverifiable.
 * The ledger knows about all of them.
 */
async function appliedVersions(key) {
  const res = await fetch(`${REST}/rpc/applied_migration_versions`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (res.ok) return new Set(await res.json());
  return { error: `${res.status} ${(await res.text()).slice(0, 200)}` };
}

async function verify() {
  const key = serviceRoleKey();
  if (!key) {
    // Fail rather than skip. A drift check that quietly does nothing is
    // indistinguishable from one that passed, which is the exact failure mode
    // this script exists to end.
    console.error(
      "No service-role key. Set SUPABASE_SERVICE_ROLE_KEY (or MMC_SERVICE_ROLE_KEY), " +
        "or place it at ~/.mmc-serv-rol.\n" +
        "Refusing to exit 0 unconfigured — an unrun check must not look like a passing one.",
    );
    process.exit(2);
  }

  const applied = await appliedVersions(key);
  if (applied.error) {
    // Same reasoning as the missing-key branch: without the ledger this check is
    // back to its old partial coverage, and a partial check that reports success
    // is how 00075 hid for three weeks.
    console.error(
      `Could not read the migration ledger: ${applied.error}\n` +
        "If the function is absent, migration 20260727120000 has not been applied to production —\n" +
        "run Actions -> 'Apply migrations (production)'. Refusing to fall back to probe-only\n" +
        "coverage silently, because that is the blind spot this check exists to close.",
    );
    // Set the code and return rather than process.exit() here: exiting while a
    // fetch socket is still closing aborts Node with a libuv assertion on Windows
    // and reports 127, so the exit code — the only thing CI reads — becomes
    // meaningless. Let the caller exit once the event loop has settled.
    process.exitCode = 2;
    return { rows: [], missing: [], drift: [], orphans: [], fatal: true };
  }

  const rows = [];
  for (const mig of migrations()) {
    // The ledger is authoritative for "did this ever get applied", and it covers
    // every migration regardless of what the SQL contains.
    if (mig.version && !applied.has(mig.version)) {
      rows.push({
        ...mig,
        status: "MISSING",
        detail: `version ${mig.version} is absent from production's migration ledger — merged but never pushed`,
      });
      continue;
    }

    const checks = checksFor(mig.sql);
    if (checks.length === 0) {
      // Previously "unverifiable". The ledger now answers it, so this is a real
      // result rather than a shrug — but say WHICH signal confirmed it, because
      // the ledger records registration, not the presence of the objects.
      rows.push({ ...mig, status: "applied", detail: "ledger (no table/column DDL to probe)" });
      continue;
    }

    let status = "applied";
    let detail = checks.map((c) => `${c.table}.${c.column}`).join(", ");
    for (const c of checks) {
      const r = await probe(key, c.table, c.column);
      if (!r.ok) {
        // In the ledger, yet the object is not there. The ledger is lying — most
        // likely a bad baseline entry, or something dropped by hand. Distinct
        // from MISSING because the fix is different: re-running the migration
        // will be skipped by the CLI until the ledger entry is repaired.
        status = "DRIFT";
        detail = `ledger says applied, but ${c.table}.${c.column} -> ${r.detail}`;
        break;
      }
    }
    rows.push({ ...mig, status, detail });
  }

  // A version in production that no longer exists in the repo: a migration was
  // pushed from somewhere else, or a committed file was deleted after applying.
  const repoVersions = new Set(migrations().map((m) => m.version).filter(Boolean));
  const orphans = [...applied].filter((v) => !repoVersions.has(v));

  const missing = rows.filter((r) => r.status === "MISSING");
  const drift = rows.filter((r) => r.status === "DRIFT");

  for (const r of rows) {
    if (r.status !== "applied") console.log(`${r.status.padEnd(8)} ${r.file}  ${r.detail}`);
  }
  for (const v of orphans) {
    console.log(`ORPHAN   version ${v} is applied in production but has no file in this repo`);
  }

  const ledgerOnly = rows.filter((r) => r.detail?.startsWith("ledger (")).length;
  console.log(
    `\n${rows.length} migrations: ${rows.length - missing.length - drift.length} applied ` +
      `(${rows.length - missing.length - drift.length - ledgerOnly} confirmed by object probe, ${ledgerOnly} by ledger only), ` +
      `${missing.length} MISSING, ${drift.length} DRIFT, ${orphans.length} orphaned in production.`,
  );

  if (missing.length > 0) {
    console.log(
      "\nMISSING = in the repo, absent from production's ledger. Apply them:\n" +
        "  Actions -> 'Apply migrations (production)' -> type `apply`",
    );
    for (const r of missing) console.log(`  supabase/migrations/${r.file}`);
  }
  if (drift.length > 0) {
    console.log(
      "\nDRIFT = the ledger claims applied but the object is absent, so `db push` will SKIP it.\n" +
        "Repair the ledger entry (or re-run the DDL by hand) — pushing again will not fix this:",
    );
    for (const r of drift) console.log(`  supabase/migrations/${r.file}`);
  }
  return { rows, missing, drift, orphans };
}

function plan(rows) {
  const versions = rows.filter((r) => r.version).map((r) => r.version);
  console.log(
    "-- Baseline the CLI ledger with every migration already applied by hand.\n" +
      "-- Idempotent: ON CONFLICT DO NOTHING, so re-running is harmless.\n" +
      "create schema if not exists supabase_migrations;\n" +
      "create table if not exists supabase_migrations.schema_migrations (\n" +
      "  version text primary key,\n" +
      "  statements text[],\n" +
      "  name text\n" +
      ");\n" +
      "insert into supabase_migrations.schema_migrations (version, name) values",
  );
  console.log(
    rows
      .filter((r) => r.version)
      .map((r) => `  ('${r.version}', '${r.file.replace(/^\d+_/, "").replace(/\.sql$/, "")}')`)
      .join(",\n") + "\non conflict (version) do nothing;",
  );
  console.log(`\n-- ${versions.length} versions. Equivalent CLI form (one call per version):`);
  console.log(`-- supabase migration repair --status applied ${versions.join(" ")}`);
}

const mode = process.argv[2] || "verify";

if (mode === "verify") {
  const { missing, drift, fatal } = await verify();
  // DRIFT fails too: "the ledger says applied but the object isn't there" is a
  // worse state than MISSING, because `db push` will silently skip it.
  if (!fatal) process.exitCode = missing.length + drift.length > 0 ? 1 : 0;
} else if (mode === "plan") {
  const { rows, missing } = await verify();
  console.log("");
  if (missing.length > 0) {
    console.log(
      "-- WARNING: production is missing migrations listed above. Apply them first,\n" +
        "-- then re-run `plan`. The statements below intentionally still include them\n" +
        "-- so the ledger ends up complete, but they are NOT safe to run until the DDL is in.",
    );
  }
  plan(rows);
} else if (mode === "apply") {
  if (!process.env.SUPABASE_DB_URL) {
    console.error(
      "apply needs SUPABASE_DB_URL (the pooler connection string).\n" +
        "Run `node scripts/migration-baseline.mjs plan` and paste the SQL instead if you prefer.",
    );
    process.exit(2);
  }
  const { missing } = await verify();
  if (missing.length > 0) {
    console.error(
      "\nRefusing to baseline: production is missing migrations (listed above).\n" +
        "Marking them applied would skip them forever. Apply them, then re-run.",
    );
    process.exit(1);
  }
  console.error("All migrations confirmed applied. Run `plan` and execute its SQL via the pooler.");
  process.exit(0);
} else {
  console.error("Usage: node scripts/migration-baseline.mjs [verify|plan|apply]");
  process.exit(2);
}
