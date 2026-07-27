# Database migrations — how they reach production (SCRUM-233)

**Status: DONE 2026-07-27.** The ledger is baselined, `00075` is applied, and
`supabase db push --dry-run` against production reports **"Remote database is up to date."**
Push is now the required path — see *The standing rule* below. The history in the next two
sections is kept because it explains why the rule exists.

**Target state:** every schema change reaches production through `supabase db push`, so a migration
that is committed but not applied is impossible.

**Former state:** migrations were applied to production **by hand** (pooler / SQL editor) from the
beginning, so production's CLI ledger did not know about them.

---

## Why the manual path has to go

The CLI decides what to apply by diffing local filenames against
`supabase_migrations.schema_migrations` in the target database. Because every migration here was
applied by hand, that ledger is empty or partial — so a naive `supabase db push` tries to replay
the whole set from `00001`. That is the real reason every previous session's note says *"db push is
unsafe on this repo"*, and it was true.

But avoiding push cost more than it saved: **a migration can be merged to `main` and simply never
reach production, with nothing anywhere that detects it.** Two confirmed instances:

| Migration | What happened |
|---|---|
| `00081_professionals_contact_name` | Never applied. Blocked SCRUM-238 for weeks; found 2026-07-17 while debugging something else. |
| `00075_test_3d_jobs_updated_at_heartbeat` | Never applied. Found 2026-07-27. See below — this one is still live. |

`00075` is the clearest argument for the change. The stuck-job reaper
(`src/lib/inngest/functions/reap-stuck-jobs.ts:87`) filters on `.lt("updated_at", cutoff)` against
`test_3d_jobs`, and that column does not exist in production. So every cron run fails with
PostgREST `42703`, logs `[reapStuckJobs] test_3d_jobs sweep failed`, and returns 0. Two live
consequences: Build-3D ghost jobs are **never reaped** (the "4 found 2026-06-27" problem is back),
and the SCRUM-309 false-reap fix that `00075` exists to deliver **has never been live**. The code
shipped; the schema did not; nothing noticed for three weeks.

---

## The one-time fix — completed 2026-07-27

All four steps below have been executed against production. They are documented as a runbook
because the same sequence applies to any other environment (or a restored copy) that starts with an
empty ledger.

### Step 1 — verify what production actually has ✅

```bash
node scripts/migration-baseline.mjs verify
```

Classifies every file as `applied`, `MISSING`, or `DRIFT`, using **two independent signals**:

1. **Production's migration ledger** (`supabase_migrations.schema_migrations`), read through the
   `public.applied_migration_versions()` function added in `20260727120000`. This is authoritative
   for *"was this migration ever applied"* and covers **every** migration regardless of contents.
   A file whose version is absent from the ledger is `MISSING` — merged but never pushed.
2. **Object probes** — the migration's tables/columns through PostgREST with the service-role key
   (read-only). A migration in the ledger whose object is *not* there is `DRIFT`: the ledger is
   lying, most likely a bad baseline entry or something dropped by hand.

The two are kept separate because the ledger records *registration*, not presence — this repo's
ledger was baselined by marking 84 hand-applied migrations as applied without re-running them. And
`DRIFT` needs a different fix from `MISSING`: pushing again will not help, because the CLI skips
anything already in the ledger.

> **Historical note.** Until `20260727120000` the ledger was unreachable (PostgREST exposes only
> `public`), so the gate had object probes alone and reported policy/function/data-only migrations
> as `unverifiable` — **27 of 86**, including every storage-policy migration. CI stayed green
> whether or not those had been applied. First run, 2026-07-27: *58 applied, 25 unverifiable, 1
> MISSING (`00075`)*. The ledger signal closes that blind spot; nothing is `unverifiable` now.

### Step 2 — apply the missing migration ✅

`00075` had to land **before** baselining. Baselining it would have recorded it as applied and it
would never have run. Applied via the pooler:

```
host  aws-1-ap-southeast-2.pooler.supabase.com:5432
user  postgres.lztzyfeivpsbqbsfzctw
db    postgres
```

`psql` is not available in this environment; the SQL was executed with `psycopg2` in a single
committed transaction. Post-apply state: `test_3d_jobs.updated_at` exists, `NOT NULL`, default
`now()`; trigger `test_3d_jobs_updated_at` present; all 105 existing rows backfilled (0 null).
Re-running `verify` then reported **59 applied, 25 unverifiable, 0 MISSING**.

The reaper's filter was replayed read-only against production afterwards and now resolves instead
of returning `42703`.

### Step 3 — baseline the ledger ✅

```bash
node scripts/migration-baseline.mjs plan
```

Prints idempotent SQL (`insert … on conflict do nothing`) registering all 84 versions, plus the
equivalent `supabase migration repair --status applied …` form. It refuses to proceed while
anything is `MISSING`. Run the SQL through the same pooler connection.

`supabase_migrations.schema_migrations` did not exist at all beforehand — the script creates it.
Confirmed after: **84 rows**, `00001 foundation` … `00085 lesson_video`.

### Step 4 — prove push is a no-op ✅

**`supabase link` does not work on this project, and does not need to.** The CLI token at
`~/.supabase-token` belongs to the CAS Supabase account while this project lives in MMC's, so
`link` fails with *"account does not have the necessary privileges"*. That blocks the Management
API, not the database. Pass the connection directly instead:

```bash
supabase db push --db-url "postgresql://postgres.lztzyfeivpsbqbsfzctw:<password>@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres" --dry-run
# → Remote database is up to date.
```

Because `--db-url` names the target explicitly on every invocation, it also removes the
wrong-database hazard that the link-based flow carries: the portfolio runs three separate live
Supabase instances, the CLI's cached ref has pointed at the wrong one before, and a migration
pushed to the wrong live database does not necessarily error — it just lands in the wrong place.
With `--db-url` there is no cached ref to be stale. **Always eyeball the ref inside the URL before
pushing.**

Occasional `FATAL: password authentication failed` from the pooler on a correct password is a
transient Supavisor response; retry with a short backoff rather than concluding the credential is
wrong. (A *consistently* rejected password across hosts and ports is genuine — that is a rotated or
wrong-account credential.)

---

## The standing rule (in force from 2026-07-27)

1. **Create migrations with the CLI**, never by hand-numbering a file:
   ```bash
   supabase migration new short_description
   ```
   This produces a timestamped name (`20260727093000_short_description.sql`). Timestamps sort after
   the legacy `000NN` block, so ordering is preserved and no existing file needs renaming.
2. **Never edit an applied migration.** Fix forward with a new one.
3. **Migrations stay idempotent** (`if not exists`, `drop policy if exists` before `create policy`)
   — this repo has already been bitten by out-of-band production drift where a policy had been
   renamed, so a bare `create` silently no-ops. Migrations `00071`/`00072` are the pattern: drop
   *both* the repo-canonical and the drifted production name before recreating.
4. **Push, don't paste.** Use `--db-url` (see Step 4 — `supabase link` cannot authenticate against
   this project):
   ```bash
   supabase db push --db-url "postgresql://postgres.lztzyfeivpsbqbsfzctw:<password>@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres"
   ```
   Dry-run first. The password is **operator-provided** and is not stored on disk.
5. **Verify after every push**, because a green CLI is not proof the object exists:
   ```bash
   node scripts/migration-baseline.mjs verify
   ```

---

## Guardrail worth adding next

`migration-baseline.mjs verify` exits non-zero when production is missing a migration, so it can
run as a CI step against production on a schedule. That converts "someone remembers to check" into
"the build tells us" — which is the only reason `00075` sat undetected for three weeks. Wire it
into `.github/workflows/` alongside the existing `check:cross-tenant` gate.
