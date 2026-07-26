# Database migrations — how they reach production (SCRUM-233)

**Target state:** every schema change reaches production through `supabase db push`, so a migration
that is committed but not applied is impossible.

**Current state:** migrations have been applied to production **by hand** (pooler / SQL editor)
since the beginning, so production's CLI ledger does not know about them. This document is the
one-time fix and the standing rule that replaces the manual path.

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

## The one-time fix

### Step 1 — verify what production actually has

```bash
node scripts/migration-baseline.mjs verify
```

Probes each migration's tables/columns through PostgREST with the service-role key (read-only) and
classifies every file as `applied`, `MISSING`, or `unverifiable`. `unverifiable` means the
migration only creates policies, functions, or data — there is no object a REST probe can see, so
it is reported honestly rather than assumed to have passed.

Result as of 2026-07-27: **58 confirmed applied, 25 unverifiable, 1 MISSING (`00075`).**

### Step 2 — apply the missing migration

`00075` must land **before** baselining. Baselining it would record it as applied and it would
never run. Apply it via the pooler:

```
host  aws-1-ap-southeast-2.pooler.supabase.com:5432
user  postgres.lztzyfeivpsbqbsfzctw
db    postgres
```

Then re-run `verify` and confirm `00075` reports `applied`.

### Step 3 — baseline the ledger

```bash
node scripts/migration-baseline.mjs plan
```

Prints idempotent SQL (`insert … on conflict do nothing`) registering all 84 versions, plus the
equivalent `supabase migration repair --status applied …` form. It refuses to proceed while
anything is `MISSING`. Run the SQL through the same pooler connection.

### Step 4 — prove push is now a no-op

```bash
supabase link --project-ref lztzyfeivpsbqbsfzctw
cat supabase/.temp/project-ref     # MUST read lztzyfeivpsbqbsfzctw before any push
supabase db push --dry-run          # expect: no migrations to apply
```

The ref check is not ceremony. The portfolio runs three separate live Supabase instances and the
CLI's cached ref has pointed at the wrong one before; a migration pushed to the wrong live database
does not necessarily error, it just lands in the wrong place.

---

## The standing rule, once baselined

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
4. **Push, don't paste:**
   ```bash
   supabase db push
   ```
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
