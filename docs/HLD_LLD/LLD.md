# Low-Level Design (LLD) — MMC Build Platform

> **Document type:** Implementation reference (living document)
> **Repo:** `mmcbuild-ai/mmcbuild-application`
> **Status:** `VERIFIED — 2026-06-30` (MMC Quote entry verified against deployed code)
> **Owner:** Dennis McMahon (technical lead)
> **Last updated:** 2026-06-30
> **Companion doc:** `docs/HLD.md` (architecture overview)

---

## How to read this document (verification convention)

This LLD describes **how each feature is actually implemented** — schemas, endpoints, jobs, and the logic/algorithms inside them. Same marker convention as the HLD:

| Marker | Meaning |
|---|---|
| `[A]` ASSERTED | Drafted from PRD / email / memory. **Not** checked against the codebase. |
| `[V]` VERIFIED | Confirmed against deployed code. Cites the file/path. |
| `[?]` GAP | Unknown or contested. Needs investigation. |

The MMC Quote entry below was drafted from a written description of intended behaviour, then **verified against the actual engine code on 2026-06-30** (read-only). Every rate, margin, and threshold has been matched to a constant/config/query or corrected. Where the code and the original draft disagreed, **the code is the source of truth** — the doc was updated to match and the correction noted.

---

## How to reuse this file as a template (portfolio-wide)

Each feature is documented with the **same block structure** (see §0 below). To add a feature: copy the block, fill it in as `[A]`, then verify. To reuse in another repo: copy this file, keep the block structure, replace the feature entries.

> **Keep-it-current convention (enforceable — Karthik Rao, 29 Jun 2026):** any feature PR that adds or changes a route, server action, Inngest function, schema, or the logic/constants inside a documented feature **must add or update that feature's LLD entry as part of its own Definition of Done.** A new feature lands its block as `[A]`; the same PR promotes the lines it implemented to `[V]` with file:line refs. A PR that changes a documented number without updating its LLD line is incomplete.

---

## 0. Feature entry template (copy this block per feature)

```markdown
## <Feature name>

**Module:** <MMC Comply | Build | Quote | Direct | Train | Billing>
**Status:** [A] / [V] / [?]

### Purpose
One paragraph: what this feature computes or does.

### Entry points
- Routes / server actions: `path` [A]
- Background jobs (Inngest): `fn-name` [A]

### Data model
- Tables / columns touched [A]
- Config / constants location [A]

### Core logic
Step-by-step. Put every magic number here and mark it [A] until verified.

### External calls
LLM / Stripe / etc. [A]

### Confidence / flags surfaced to user
How results are labelled, gated, or warned. [A]

### Verify (Claude Code)
- [ ] explicit checks to promote [A] → [V]
```

---

## 1. MMC Quote — cost engine

**Module:** MMC Quote
**Status:** `[V]` — verified 2026-06-30 against the deployed engine. Corrections noted inline.

### Purpose
`[V]` Produce a per-project cost estimate for an MMC (modular/manufactured) build, priced from **real market data** (the `cost_reference_rates` table) rather than AI estimates, with every rate labelled by confidence so users distinguish sourced rates from public-information extrapolations. *(Engine: `src/lib/quote/mmc-buildup.ts`; labelling: `src/lib/quote/source-label.ts`.)*

> Context: this engine replaced an earlier AI-estimate approach that produced impossible figures (e.g. a SIP option showing a **−194%** saving). The engine docstring (`mmc-buildup.ts:1-19`) confirms the rework: a factory module is bought as ONE supply rate per m² of gross floor area, computed deterministically, *"instead of asking the model to invent an `mmc_rate` per traditional trade (which produced nonsense — SIP −194%, pods −177%)."*

> **Which version is deployed (open question 3) — ANSWERED.** Two versions had been described: the quote's Stage-3 AI-material-mapping pipeline, and the Jun 2026 market-rate buildup. **The deployed engine is the market-rate buildup** (`computeMmcBuildup`), priced from the `cost_reference_rates` DB table — **not** the AI-material-mapping pipeline. The model is *not* asked to invent per-m² MMC rates; the MMC total is computed deterministically and the legacy per-trade values are nulled when a build-up exists.

### Entry points `[V]`
- Server action: **`src/app/(dashboard)/quote/actions.ts` → `requestCostEstimation(projectId, planId, region?)`** (lines 7–59). Auth-gates via `supabase.auth.getUser()` (13–19), inserts a `cost_estimates` row with `status: "queued"` (32–43), fires the Inngest event `cost/estimation.requested` (50–56), returns `{ estimateId }`. **Does not compute inline.**
- Background job (Inngest): **`src/lib/inngest/functions/run-cost-estimation.ts`** — `inngest.createFunction({ id: "run-cost-estimation", … }, { event: "cost/estimation.requested" }, …)` (lines 50–57). *(Note: the function id is `run-cost-estimation`, not `run-cost-estimate` as the CLAUDE.md module map states.)*

### Data model `[V]`
- Rate table: **`cost_reference_rates`** (keyed by `element`, owned by source_id `00000000-0000-0000-0000-000000000002`). Loaded by the Inngest step `load-mmc-rates` (`run-cost-estimation.ts:188-198`) into `mmcRateMap`. Seeded by migrations:
  - `supabase/migrations/00068_mmc_supplier_reference_rates.sql` — **28 rows** (incl. the `2175` module-supply row at line 38).
  - `supabase/migrations/00070_mmc_finished_benchmarks.sql` — **6 rows** (`mmc_finished_benchmark`). 28 + 6 = **34 rows** ("~34 real MMC rows").
  - `supabase/migrations/00069_rate_provenance_labels.sql` — renames the generic seed source to the data-gap label and stamps SIP/CLT/pod rows as data gaps.
- Output tables: `cost_estimates` + `cost_line_items` (`00018_cost_estimation.sql`, RLS-policied).
- Confidence/label field: a rate is "market-sourced" iff its **source name starts with `"Market Rate"`** (`source-label.ts:16-20`), which drives green vs. amber rendering.

### Core logic `[V]` — engine `computeMmcBuildup` (`src/lib/quote/mmc-buildup.ts`)

**Pricing model:** MMC cost is built up the way modular is *actually* priced — **one factory module rate per m² of GFA** plus **site works on top**, **not** trade-by-trade. The build-up is computed only when GFA is known (`buildupInputs.gfa > 0 ? computeMmcBuildup(...) : null`, `run-cost-estimation.ts:313-318`); the legacy per-trade sum is the fallback only when GFA is unknown.

1. **Volumetric module-supply rate — `[V]` $2,175/m²** (frame, walls, roof, insulation, fit-out, services rough-in). Confirmed: `MMC_FALLBACK_RATES.moduleSupply = 2175` (`mmc-buildup.ts:55`), unit `sqm`, added as `quantity = gfa` (130–136). This is the **fallback**; the live DB rate of the same value (`00068:38`) is authoritative — the engine prefers the DB rate and falls back to the constant (`mmc-buildup.ts:105-108`).
2. **Site works added on top — `[V]`**, each as its own disjoint line (138–192): install (`gfa × install`), transport (1 load), site crane (2 days), optional landscaping, **footings** (`const footings = Math.max(8, Math.round(gfa / 5.5))`, line 171), **service connections** (electric+NBN, water, electric fitout, 181–183), and **preliminaries & fees** (soil test, certification, council fees, warranty levy, workers-comp levy, logistics, site security, 186–192).
3. **Margin — `[V]` CORRECTED: a 20% builder margin, NOT a ±15% band.** The engine applies `MMC_MARGIN_RATE = 0.2` (`mmc-buildup.ts:51`): `const margin = Math.round(subtotal * MMC_MARGIN_RATE)` (194–195); **total = subtotal + margin** (205). The original draft's "±15% margin band" is **not** an engine band and `0.15` is not an engine constant — see the provenance note below for what ±15% actually is.
4. **The "±15%" — `[V]` it is a provenance / price-creep caveat on the sourced rate data, not an engine calculation.** It lives only as text in the rate source name (`"Market Rate (sourced 2026, +/-15%)"`), in `source_detail`, in the green badge label, and in the report disclaimer. The engine produces a **point estimate**, not a ±15% band.
5. **Reference points — `[V]` 6 finished-price references, $3,305–$4,083/m².** `00070_mmc_finished_benchmarks.sql:24-29`, all `state='NSW'`: panelised 2-bed 3571, 3-bed 3814, 3-bed/3-bath 3570, 2-bath 58m² **4083 (max)**, volumetric ~105m² **3305 (min)**, volumetric ~232m² 3944. **These are reference rows only** — the migration header states the engine prices via `computeMmcBuildup`, not these rows.
6. **Sanity benchmark — `[V]` CORRECTED.** A real unit test exists (`tests/unit/lib/quote/mmc-buildup.test.ts:24-31`): `computeMmcBuildup(93)` then `perSqm = total/93` asserted `> 2800` and `< 4200`, with the comment anchoring "~$3,500/m²". So the **93 m² sanity check is real in code, but the band is $2,800–$4,200/m² (~$3,500 anchor), not "~$3,300/m²."** The "$3,300" figure does not appear in code; the closest data point is the $3,305 volumetric *reference row* in `00070` — a different artifact from the engine output.

### External calls `[V]`
- The build-up itself is **deterministic — no LLM call** for MMC pricing (this is the whole point of the rework). The model is used elsewhere in `run-cost-estimation` for the traditional/baseline costing context, but MMC totals are computed in `computeMmcBuildup`. Persistence is to Supabase (`cost_estimates` / `cost_line_items`).

### Confidence / flags surfaced to user `[V]`
- **Market rates** (source name starts with `"Market Rate"`): badge **`"Market rate (±15%)"`**, `market: true` (`source-label.ts:36`) → rendered **green** (`components/quote/line-item-card.tsx:51-60` `bg-green-100 text-green-700`; legend in `components/quote/cost-report.tsx:179-199`).
- **Data-gap rates**: full label **`"Extrapolated from public information (data gap)"`** (`source-label.ts:27`), badge `"Extrapolated (data gap)"`, `market: false` (line 37) → rendered **amber** (`line-item-card.tsx:55`, `cost-report.tsx:181-182`).
- The build-up's own lines are stamped `rate_source_name: "Market Rate (sourced 2026, +/-15%)"` (`run-cost-estimation.ts:389-393`) so they render green.

### Known data gaps (inputs owned by Karen, not code) `[V]`
1. **SIP / panelised / CLT / bathroom-pod** — stamped as data gaps in `00069_rate_provenance_labels.sql:20-27` (`source_detail = 'Extrapolated from public information - DATA GAP. Confirm an actual market rate.'`) → render amber. **Flagged, not hidden, not silently substituted.**
2. **3D-printed construction** — **no code artifact** (no rate row, no handler). Handled out-of-band (Karen flag-back / Jira), not in code.
3. **NSW-specific rates** — current sourced site-works rates carry a **NSW loading-factor caveat** documented as prose in the migration header (`00068:13-15`), not as a code constant. Needs real figures or a sign-off on a loading factor.

### Verify (status after 2026-06-30 pass)
- [x] `[V]` Module-supply base rate `$2,175/m²` — `MMC_FALLBACK_RATES.moduleSupply = 2175` (`mmc-buildup.ts:55`) + DB `00068:38`, unit `sqm`.
- [x] `[V]` **Margin CORRECTED** — engine applies a **20% builder margin** (`MMC_MARGIN_RATE = 0.2`, `mmc-buildup.ts:51`), not a ±15% band. ±15% is a provenance caveat on sourced data only.
- [x] `[V]` Site-works components (footings `gfa/5.5`, service connections, preliminaries) added as disjoint lines (`mmc-buildup.ts:138-192`).
- [x] `[V]` 6 reference points, `$3,305–$4,083/m²`, in `00070_mmc_finished_benchmarks.sql:24-29` (reference rows, not used by the engine).
- [x] `[V]` Green/amber labelling logic + exact strings (`source-label.ts:27,36,37`; rendered in `line-item-card.tsx` / `cost-report.tsx`).
- [x] `[V]` SIP/CLT/pod flagged as data gaps (`00069:20-27`); 3D-print absent from code; NSW loading-factor a prose caveat (`00068:13-15`).
- [x] `[V]` **Benchmark CORRECTED** — 93 m² test exists (`mmc-buildup.test.ts:24-31`) but asserts `$2,800–$4,200/m²` (~$3,500 anchor), not "~$3,300/m²".
- [x] `[V]` Quoting runs as the Inngest job **`run-cost-estimation`** (not `run-cost-estimate`), dispatched from `quote/actions.ts:50`.

### Corrections summary (this entry)
- **±15% margin band → 20% builder margin** (`MMC_MARGIN_RATE = 0.2`). ±15% is a sourced-rate provenance caveat, not an engine band.
- **93 m² → ~$3,300/m² → test asserts $2,800–$4,200/m²** (comment anchors ~$3,500/m²); "$3,300" is not in code (closest = the $3,305 reference row).
- **Inngest function `run-cost-estimate` → `run-cost-estimation`.**
- Confirmed unchanged: $2,175/m² base, 6 references $3,305–$4,083/m², green/amber strings, whole-module (not per-trade) model, data-gap flagging.

### 1a. MMC Quote — multi-supplier comparison (SCRUM-172)

**Status:** `NEW — 2026-07-17`. A **self-contained** surface alongside the whole-plan cost engine (§1) — it does **not** modify `cost_estimates` / `run-cost-estimation`.

**`[V]` Value:** Karen (2026-05-01): "choose three different people who do precast concrete and give me a quote for each." A builder picks up to **3 suppliers** (`MAX_SUPPLIERS_PER_COMPONENT`, `src/lib/quote/supplier-comparison.ts`) for one MMC component (technology category) and gets **parallel-priced rows** with a delta-vs-lowest + a PDF.

- **Data model** (`supabase/migrations/00083_supplier_quote_comparisons.sql`): `supplier_quote_comparisons` (one run per project+category, `status` queued/processing/completed/error, `region`, `summary`) + `supplier_quote_variants` (one row per selected `supplier_products` product; denormalised supplier/product identity captured at request time; AI-filled `estimated_total`/`unit_rate`/`quantity`/`confidence`/`notes` + derived `delta_vs_lowest_pct`/`is_lowest`). Both RLS org-scoped via `get_user_org_id()`.
- **Supplier source:** the approved+active `supplier_products` marketplace (00079) — **any** approved supplier, not just the Growth-Partner featured tier (this is a builder comparison tool, not sponsored placement).
- **Server actions** (`src/app/(dashboard)/quote/supplier-actions.ts`, all org-guarded): `getSupplierComparisonOptions` (categories with ≥1 product), `requestSupplierComparison` (Zod-validated, ≤3 cap, project-ownership + per-(project,category) duplicate-run guard, seeds variants, fires event), `getSupplierComparison` / `getProjectSupplierComparisons` (org-scoped reads).
- **Background job:** `src/lib/inngest/functions/run-supplier-comparison.ts` — event `quote/supplier-comparison.requested`. **Fans out one `callModel("cost_primary")` price-call per (component × supplier)** (`SUPPLIER_QUOTE_PROMPT`), computes deltas via the pure `computeVariantDeltas`, writes a `SUPPLIER_COMPARISON_SUMMARY_PROMPT` summary. Honest-error discipline: a failed price-call degrades to an unpriced row (never a fake figure); `onFailure` + try/catch mark the run `error` so the UI stops polling. Registered in `src/app/api/inngest/route.ts`.
- **UI:** `SupplierComparisonPanel` (picker, 44px toggle cards, ≤3) on the Quote project page → result route `/quote/[projectId]/suppliers/[comparisonId]` (`SupplierComparisonResult` polls until done, parallel columns, lowest highlighted). **PDF** (parallel columns, delta-vs-lowest, lowest column green): `src/lib/quote/supplier-comparison-pdf.ts` served from `/api/quote/supplier-comparison/[comparisonId]`.
- **Tests:** `tests/unit/lib/quote/supplier-comparison.test.ts` (TC-QUOTE-001..006 — delta/lowest math, ties, unpriced rows, ≤3 cap).

---

## 2. MMC Direct — supplier compliance documents (SCRUM-175)

**Status:** `NEW — 2026-07-17`. **Module:** MMC Direct.

**`[V]` Value:** Karen — "when I bring on board all of my suppliers, I actually can get their compliance documentation and upload that … so we can have only the compliant products." Suppliers can now upload compliance docs (CodeMark certs, NCC reports, datasheets), an operator verifies them, and verified + unexpired docs surface publicly + in Build.

- **Data model** (`supabase/migrations/00084_supplier_compliance_documents.sql`): `supplier_compliance_documents` (professional_id, org_id, optional `product_id` tag, `doc_type`, title, file_url, `issued_at`, **`expires_at`**, `verified`/`verified_by`/`verified_at`, `reminder_sent_at`). RLS: public SELECT only when **`verified` AND (`expires_at` IS NULL OR `expires_at >= CURRENT_DATE`) AND supplier approved**; owning org sees all its own; INSERT forces `verified=false`. Files reuse the `directory-uploads` bucket (SCRUM-57 `FileUpload`).
- **"Supplier portal" = the trade dashboard.** There is **no supplier auth role** — a supplier is an org owning an approved `professionals` listing (`src/lib/auth/operator.ts` note). So the upload UI is a new **Compliance tab** on `/direct/dashboard` (`ComplianceDocumentsManager`), *not* a separate `/direct/portal` route (which would duplicate the ownership gate). Actions in `direct/actions.ts`: `getMyComplianceDocuments` / `addComplianceDocument` / `deleteComplianceDocument` (org-ownership checked; optional product tag must belong to the supplier).
- **Operator verification:** `admin/suppliers` page (operator-allowlist gated, `requireOperator`) gains a review queue (`SupplierComplianceReview`) driven by `getComplianceReviewQueue` + `setComplianceDocumentVerified` (sets `verified_by`/`verified_at`).
- **Public surface:** `getProfessionalProfile` returns `complianceDocuments` filtered by `isPubliclyVisible` (verified + not-expired); the public listing Documents tab shows a "Verified compliance documents" section. **Build:** `loadFeaturedProductsByCategory` flags suppliers with ≥1 verified/unexpired doc → a "Compliance verified" badge on featured products.
- **Expiry:** pure helpers `daysUntilExpiry`/`expiryStatus`/`isPubliclyVisible`/`needsExpiryReminder` (`src/lib/direct/compliance-docs.ts`, 30-day band). Daily Inngest cron `remind-compliance-expiry` emails the supplier 30 days before expiry (once, guarded by `reminder_sent_at`) via `sendEmail`.
- **Tests:** `tests/unit/lib/direct/compliance-docs.test.ts` (TC-DIRECT-175-001..008).

**Deviation from ticket:** ticket named a `/direct/portal/compliance-docs` route with "supplier-tier auth"; built as a Compliance tab on the existing trade dashboard because there is no supplier role in this codebase (a supplier owns an approved listing) and the dashboard already *is* the authenticated supplier surface. Same capability, consistent with the module's architecture.

---

## 3. MMC Train — per-lesson video upload (SCRUM-59)

**Status:** `NEW — 2026-07-17`. **Module:** MMC Train.

**`[V]` Value:** the ticket ("New training creation steps including video uploading facilities") — course/lesson **authoring already existed** (`train/admin/*`, `course-form`, `lesson-form`); the gap was **a video per lesson**. Authors can now upload a lesson video; enrolled users watch it above the written content.

- **Data model** (`supabase/migrations/00085_lesson_video.sql`): `lessons.video_url` + `lessons.video_file_name` columns; a new **public `training-videos` storage bucket** (500 MB `file_size_limit`, `video/mp4|webm|quicktime|x-m4v` allowed_mime_types) with authenticated-insert/update + public-select policies (mirrors `directory-uploads`, 00021).
- **Upload:** `VideoUpload` (`src/components/train/video-upload.tsx`) — client-side upload to `training-videos` under `${courseId}/…`, with type + size validation *before* upload via the pure `src/lib/train/video.ts` guards (`validateVideoFile`/`isAcceptedVideoType`/`isWithinVideoSizeLimit`, shared with the bucket limits). Wired into `LessonForm`.
- **Persistence:** `lessonSchema` + `createLesson`/`updateLesson` carry `video_url`/`video_file_name` (admin-gated, course-ownership checked — unchanged).
- **Playback:** `LessonViewer` renders a `<video controls>` above the markdown when `video_url` is set; the lesson page passes `lesson.video_url` (loader uses `select("*")`, so it flows automatically).
- **Tests:** `tests/unit/lib/train/video.test.ts` (TC-TRAIN-59-001..006).

**Note:** this is *manual* video upload. The separate HeyGen AI-avatar video idea (ticket comment, 2026-06-02) is out of scope — it needs a paid HeyGen account and is a distinct capability.

---

## 4. <next feature>

*Not yet documented. Copy the §0 template block to add MMC Comply (compliance pipeline + RAG retrieval), MMC Build (3D extraction + design optimisation), or Billing. Per the keep-it-current convention, the PR that next touches one of these should land its LLD block.*
