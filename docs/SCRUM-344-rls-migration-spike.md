# SCRUM-344 Spike — Migrate tenant reads from service-role `db()` to the RLS-scoped client

> **Status:** Spike complete (2026-07-10). **Recommendation: SCOPED-GO** — a phased,
> read-first migration of the request-scoped dashboard call sites, gated behind a
> policy-gap-fill pass; **NO-GO on a blanket swap**. Plus **one security fix to do
> regardless of the migration decision** (§5).
> **Companion to:** SCRUM-340/342 (the cross-tenant leaks, fixed) and SCRUM-343 (the
> CI gate that now prevents recurrence).

## 1. The question

The codebase does almost all DB access through `db()` (= `createAdminClient()` cast to
`any`) or `createAdminClient()` directly — a **service-role** client that **bypasses
Row-Level Security**. It then re-implements tenant isolation *by hand* in app code
(the SCRUM-340/342 pattern). The spike asks: should tenant reads/writes move onto the
**RLS-scoped `createClient()`** so Postgres enforces isolation, and how big is that?

The manual pattern RLS would replace (`comply/actions.ts`):
```ts
const admin = createAdminClient();
const { data: ownerProject } = await admin.from("projects").select("org_id").eq("id", projectId).single();
if (!ownerProject || ownerProject.org_id !== profile.org_id) return { error: "Project not found" };
```
This is exactly what `SELECT ... WHERE org_id = get_user_org_id()` does automatically.

## 2. What the evidence says

**RLS already exists and is largely sound.** All 23 tenant tables are `ENABLE ROW LEVEL
SECURITY`; the parent tables (`projects`, `plans`, `compliance_checks`, `cost_estimates`,
`design_checks`, `project_*`, `org_rate_overrides`, `rd_*`, `enrollments`, `certificates`)
carry `org_id = get_user_org_id()` policies. **No target table is RLS-off or
RLS-on-with-no-policy.**

**`get_user_org_id()` returns the single ACTIVE org** (migration `00059`):
```sql
SELECT COALESCE(
  (SELECT org_id FROM user_active_org WHERE user_id = auth.uid()),
  (SELECT org_id FROM profiles WHERE user_id = auth.uid() LIMIT 1));
```
So an RLS client sees **only the active org's rows** — which is the *desired* isolation for
tenant data. The org switcher stays safe (`organisation_members` SELECT allows
`user_id = auth.uid()`, independent of active org).

**TypeScript friction is mostly obsolete.** The `db.ts` "tables not yet in generated types"
comment is stale — `types.ts` already types **23 of 25** target tables, and `createClient()`
is already `createServerClient<Database>`. Swapping a typed table from `db()` to
`createClient()` adds little friction. (Still untyped: `organisation_members`,
`user_active_org`, `test_3d_jobs`, `leads`, `marketplace_estimate_tokens` — need a
`gen types` re-run or a cast.)

## 3. Sizing — why NO-GO on a blanket swap

Of ~512 `db()`/`createAdminClient` occurrences (imports inflate the count; ~fewer distinct sites):

| Bucket | Share | Files | Verdict |
|---|---|---|---|
| **MUST stay service-role** — Inngest jobs (~115), webhooks/token endpoints (~29), auth/profile bootstrap (~11), cross-org & operator tooling (~40: global beta-activity, public directory, Stripe reconcile, admin/*) | **~55%** | ~40 | **Out of scope** — no user session, or deliberately cross-org |
| **RLS-migratable** — request-scoped tenant reads/writes in `app/(dashboard)/**` actions + pages | **~45%** | **~20** | **Candidate** (sub-gated below) |

Inngest functions and webhooks have **no cookie-borne session** — they *cannot* use the RLS
client, ever. That alone fixes ~145 occurrences as permanent service-role.

## 4. The migratable slice is read-first, and write paths are blocked by policy gaps

Within the ~20 candidate files:
- **Reads (SELECT):** clean for the ~15 parent org-scoped tables — this is the bulk of the win
  and directly retires the SCRUM-342 manual checks.
- **Writes (INSERT/UPDATE/DELETE):** work for parent tables, but **blocked** for child/append
  tables until policies are added. Under RLS a verb with **no policy is deny-all**, so these
  would start failing:
  - **No UPDATE/DELETE policy:** `compliance_findings`, `cost_line_items`, `design_suggestions`
    (child tables, no `org_id` column — scoped via a join today; written by the service-role job
    with `INSERT WITH CHECK(true)`).
  - **No DELETE policy:** `compliance_checks`, `cost_estimates`, `design_checks`,
    `project_certifications`, `questionnaire_responses`, `rd_experiments`.

So a write-path migration **requires a policy-gap-fill migration first** (add scoped
UPDATE/DELETE policies mirroring the SELECT predicate). Reads don't need it.

## 5. ⚠️ Security finding — fix regardless of the migration (independent of SCRUM-344)

`knowledge_bases` and `knowledge_documents` carry, alongside their scoped SELECT policies, an
**open `FOR ALL USING (true) WITH CHECK (true)`** policy (migration `00003_knowledge_bases.sql`,
named "System can manage KBs" / "System can manage KB docs"). That means **at the database
layer these two tables have ZERO tenant isolation** — any authenticated RLS-client query can
read or write every org's KB rows.

- **Current practical exposure is low** because Phase B (SCRUM-343) added app-layer
  `assertKbInScope`/`assertDocInScope` checks, and the app reads these via service-role today.
- **But** the RLS policy itself is wide open, so the moment any code touches these tables via
  the RLS client (exactly what this migration proposes), isolation silently disappears.
- **Recommended:** a small migration replacing the two `FOR ALL USING(true)` policies with
  scoped ones (`scope='system' OR org_id = get_user_org_id()` for read; org-scoped for write),
  matching the SELECT policy already present. ~1 migration file, idempotent. **Do this whether
  or not the broader migration proceeds** — it closes a latent DB-layer hole.

## 6. Recommendation

**SCOPED-GO**, in this order — each a separate PR:

1. **KB policy fix (do now, standalone).** Replace the two `FOR ALL USING(true)` KB policies
   with org/scope-scoped ones (§5). Closes a real latent hole; not gated on anything.
2. **Policy-gap-fill migration.** Add the missing scoped UPDATE/DELETE (and non-`true` INSERT)
   policies to the child/check tables (§4) so RLS is complete before any write path moves.
3. **Read-path migration (phased, ~20 files).** Move request-scoped tenant **SELECTs** in
   `app/(dashboard)/**` from `db()`/`admin` to `createClient()`, deleting the now-redundant
   SCRUM-342 manual org checks as each is covered by RLS. One module per PR (comply → build →
   quote → projects → settings), each with a foreign-org regression test proving RLS blocks it.
4. **Write-path migration (optional, after 2+3).** Move writes once the policies exist.

**NO-GO** on: a blanket swap (the service-role client is correct and required for ~55% of
sites), and moving **any** write path before step 2.

**Why SCOPED, not full-GO:** the marginal *security* value is now lower than when the class was
open — Phase A fixed every known leak and the SCRUM-343 CI gate makes recurrence fail-closed at
build time. The RLS migration's value is now **defence-in-depth + deleting hand-written
isolation code**, not "the only thing standing between orgs." That makes it a *good, steady
refactor* to pay down over time, not an urgent big-bang. The active-org semantics
(single-org-per-request) must be confirmed acceptable for each migrated flow — the existing
manual checks already assume it, so most flows are already active-org-bound.

## 7. Effort estimate

| Step | Size | Risk |
|---|---|---|
| 1. KB policy fix | ~0.5 day (1 migration + verify) | Low |
| 2. Policy-gap-fill | ~1 day (1 migration, ~10 policies, golden RLS test) | Low–med (must not over-restrict existing job writes — jobs use service-role so RLS doesn't apply to them; safe) |
| 3. Read-path migration | ~1 day per module × ~5 modules, incremental | Med (per-flow active-org verification + regression tests) |
| 4. Write-path (optional) | ~2–3 days | Med |

Steps 1–2 are cheap and high-value (esp. #1). Step 3 is the real investment and is best done
incrementally alongside other work in each module, not as one PR.

## 8. Canonical sources

`src/lib/supabase/{db,admin,server}.ts`, `supabase/migrations/00059_get_user_org_id_active.sql`,
`supabase/migrations/00003_knowledge_bases.sql` (the open FOR-ALL policies),
`00017_design_optimisation.sql` + `00018_cost_estimation.sql` (missing DELETE policies),
`src/app/(dashboard)/comply/actions.ts` (the manual-isolation pattern RLS replaces).
