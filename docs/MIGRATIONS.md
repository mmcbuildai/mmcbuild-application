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
4. **Apply from GitHub, not from a laptop.** **Actions → "Apply migrations (production)"** — leave
   the confirm box empty for a dry run, type `apply` to push. It reads the password from the
   `SUPABASE_DB_PASSWORD` secret and verifies afterwards. Nobody needs to hold, paste or rotate the
   credential. Manual by design (not on merge): a migration is not reversible by re-running CI, so
   merging code and changing the database stay two decisions.
5. **Expect a red build between merge and apply.** `Production schema drift` fails while a merged
   migration is unapplied. That is the gate working — apply, and it goes green.

The local `supabase db push --db-url "...pooler...:5432/postgres"` path still works and is the
fallback if the workflow is unavailable. Port **5432** (session mode) — 6543 authenticates and then
dies on `prepared statement "lrupsc_1_0" already exists`. The pooler also rejects a *correct*
password with `28P01` intermittently (seen four times in a row, then fine), so retry before
concluding it was rotated.

---

## For anyone with production database access

The Supabase project lives in MMC's own account, so more people can reach the SQL editor and the
dashboard than can merge a pull request. This section is for all of them.

**The request: don't change schema or policies in the dashboard or SQL editor.**

Not a process preference — it is the specific thing that produced the problem below.

**What happened.** Production accumulated **51** `storage.objects` policies while the repo described
**19**. Nobody did anything unreasonable: policies were tightened directly on the live database
during an incident, which was the fast and sensible thing to do at the time, and the change was
never written back into a migration. The cost surfaced later and twice over — a rebuild from the
repo alone would have shipped a wide-open storage layer, and a role gate that existed only in
production locked every beta tester out of uploads through two client demos before anyone could see
why (SCRUM-319, and again in SCRUM-359).

The same shape, from the other direction: `00075` and `00081` were written, reviewed and merged, and
never applied. `00075` left the stuck-job reaper failing on every cron run for three weeks, so a
bug fix that had "shipped" was never actually live.

**So the rule is simply that the repo and production must never disagree**, in either direction.

1. Every schema or policy change starts as a migration file in the repo — even a one-line policy
   tweak.
2. It reaches production through **Actions → "Apply migrations (production)"**. You don't need the
   database password; that is deliberate, and it removes most reasons to open the SQL editor.
3. **If an emergency hand-fix is genuinely unavoidable** — and sometimes it is — the fix is not
   finished until an idempotent migration describing it exists in the repo, the same day. Write it
   while you still remember what you changed.
4. **Read the green build accurately.** CI now catches a merged-but-unapplied migration and a
   missing table or column, on every merge and daily. It does **not** yet detect a policy edited
   directly in the dashboard — that check does not exist yet. So a green build is not evidence that
   production matches the repo where policies are concerned.

If you are unsure whether something counts, it is cheaper to ask than to reconcile it later: the
reconciliation above took a day and produced four tickets.
