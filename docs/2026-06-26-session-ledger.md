# Session ledger — 2026-06-26 (multi-storey 3D, classifier, questionnaire prefill)

> Handoff for the session holding the meeting-notes task. Combine this with the
> 20-/25-June meeting notes to update Jira (client-visible SCRUM board — DRAFT +
> Dennis approves before posting, per `feedback_client_comms_approval`).
> Full technical detail in memory `project_multistorey_3d_and_questionnaire_enrichment`.

## What shipped & where

- **PR #52 — MERGED to `main` (squash `28882ab`), CI green.** Branch commits:
  `56eaf4ae` multi-storey · `a0d4ffb` big-PDF optimise · `2b2d3de` prefill gate ·
  `e26750f` strong-layout prefill · `d1da61b` per-page classifier · `605f0c3` CI
  fix + honest label. **Deployed to prod** (extraction runs in Inngest = prod code).
- **`feat/design-extraction-cache` — NOT merged** (scaffold only, `90f28fb`).
- **No DB migration in #52.** Cache migration `00066` is on the unmerged cache branch.

---

## Tasks raised → action taken → status

### 1. Build 3D only rendered a single storey (origin: "where do I drop WikiHouse")
- **Action:** multi-storey extraction (read every floor-plan page, tag storeys, centre-align upper floors), geometry stacking (each storey at its base elevation), 3D floor selector (Ground/First/All). `geometry.ts`, `full-house-extractor.ts`, `plan-viewer-3d.tsx`.
- **Found:** WikiHouse Microhouse is unusable as a sample (CNC kit, no 2D floor plan); NSW Housing Pattern Book has no single-storey designs. The real fix was the renderer, not finding a single-storey plan.
- **Status:** SHIPPED · ⏳ VERIFY IN PROD.

### 2. Questionnaire not pre-filling from the design (fields blank despite data on plans)
- **Action (several rounds):** read the strong spatial layout into the prefill (was only reading the weak on-upload attrs); derive floor area, ceiling height, wet-area count, building height, upper-floor area, **door/corridor widths** from geometry; auto-derive redundant fields (has_stairs, attached_dwelling, heating); Construction Type helper + hide for Class 1/10; honest "ground floor only" floor-area label. `questionnaire-prefill.ts`, `questionnaire-form.tsx`, `projects/actions.ts`, `compliance-system.ts`.
- **Status:** SHIPPED · ⏳ VERIFY IN PROD.

### 3. Prefill RACE — fields showed "Fill in yourself" though the data was extracted
- **Cause:** gate capped the wait at 90s but a 32MB plan's extraction takes ~2m40s → form mounted empty, late data ignored.
- **Action:** gate now WAITS for extraction to confirm complete (progress bar + staged commentary), 3-state status, late-arriving prefill applied to untouched fields, manual escape + backstop so it never traps. `questionnaire-prefill-gate.tsx`.
- **Status:** SHIPPED · ⏳ VERIFY IN PROD.

### 4. Large plans failed extraction
- **33MB+ degraded read:** the on-upload attribute extractor had no size guard/optimise (only the 3D path did). **Action:** shared `pdf-vision-prep.ts` (CloudConvert optimise + 32MB guard), consumed by both ingestion entry points.
- **70-page set returned null layout:** classifier scanned only the first 15 pages. **Action:** see #5.
- **Status:** SHIPPED · ⏳ VERIFY IN PROD.

### 5. Multi-storey/extraction never fired on real plans — the CLASSIFIER (keystone)
- **Cause:** one Sonnet call labelling ≤15 pages mislabelled upper floor plans as "other" (→ only ground extracted, GFA halved) and capped at 15 pages.
- **Action:** **per-page classifier** (one focused call/page, title-block first, parallel) + deeper scan (15→30 first pass, 2nd pass to 60 when no floor plan found) + "other" added as fallback candidate. `page-classifier.ts`, `full-house-extractor.ts`.
- **Status:** SHIPPED · ⏳ VERIFY IN PROD (the make-or-break test).

### 6. Content-addressed extraction cache ("extract once, reuse forever" — beta reuse)
- **Action:** scaffolded — migration `00066` `design_extractions` (keyed by content-hash + extractor_version, cross-org), `design-extraction-cache.ts` service (hash, lookup/store, getCachedDesignForPlan), EXTRACTOR_VERSION. On `feat/design-extraction-cache`.
- **Status:** SCAFFOLD ONLY · ❌ Phase 3 (rewire consumers, derive questionnaire attrs from cache) NOT done; needs rebase onto main; migration 00066 NOT applied to prod.

### 7. CI red on #52
- **Action:** stubbed `server-only` in `design-optimisation-onfailure.test.ts` (pre-existing broken test). 230 tests green.
- **Status:** DONE.

### 8. Infrastructure insight (drove the merge decision)
- **Found:** Inngest functions execute PRODUCTION code, not preview — so extraction fixes (multi-storey, classifier, big-PDF) cannot be tested on a Vercel preview. Confirmed live (preview upload classified 15 pages = old code). This is why #52 was merged to prod to test.
- Also: the `Inngest Sync` workflow PUTs `/api/inngest` on Production-deploy-success to re-register functions (the Vercel→Inngest auto-sync is unreliable).

---

## Jira (created/updated 2026-06-26, board = MMC Build / SCRUM)
- Delivered: **SCRUM-311** (Comply prefill), **SCRUM-312** (multi-storey + classifier) — marked `[Delivered]`, awaiting move to Done.
- Open follow-ups: **SCRUM-313** (re-stock samples), **SCRUM-314** (Comply report labelling), **SCRUM-315** (extraction cache), **SCRUM-316** (>32MB Gladesville), **SCRUM-317** (wind-class default), **SCRUM-318** (construction_type "Type C" default).
- Resolution comments: **SCRUM-309**, **SCRUM-282**, **SCRUM-307**.
- NOT on the SCRUM board: `@caistech/pdf-vision-prep` (cais-shared-services session); 25-June meeting action-items (meeting-notes session).

## OPEN / NOT YET RESOLVED (priority order)

1. **✅ RESOLVED — PROD-VERIFIED end-to-end** (Dennis, 2026-06-26):
   - **Project setup / multi-storey / classifier / prefill**: fresh TH01 (v11) upload "went through very well."
   - **Comply**: full check ran cleanly (~9 min, 12 domains; **did NOT hang on Section J / energy** — Karen's old timeout did not recur). Report generated & reviewed (`Downloads/mmc-comply-th01-v11-test-v1.pdf`): 122 findings, correct NCC refs + assigned roles + remediation actions, multi-storey context flowed through, Overall = Critical Risk (expected for a not-for-construction pattern-book design). Dennis: "looks good."
2. **Re-stock the beta sample picker** (`sample-designs.ts` + `seed-sample-designs.mjs --apply`) — now UNBLOCKED (TH01 renders correctly in prod).
   - **Comply minor follow-ups (new, from the v11 report):** (a) "Accessibility" domain labelled **NCC Volume 1** for a Class 1a — should be Volume Two (ties to meeting-note NCC volume-selection item #1); (b) possible domain overlap — both "Accessibility" and "Livable Housing Design (H8)" present (double-counting H8?).
3. **Cache Phase 3** — rebase `feat/design-extraction-cache` onto main, wire consumers (3D / optimisation / Comply prefill) onto `getCachedDesignForPlan`, derive questionnaire attrs from the cached strong layout; apply migration `00066` to prod.
4. **`@caistech/pdf-vision-prep`** — extract the optimise+guard into cais-shared-services (inject the optimiser, vendor-agnostic). HANDED to a separate session (Dennis opening it).
5. **Gladesville-class plans (>32MB after optimise)** — needs page-split-before-the-size-guard re-architecture; NOT built.
6. **wind_classification region-derived default** — not built (AS 4055 site class ≠ AS 1170.2 region from address; needs terrain judgment).
7. **Compliance template `construction_type` "Type C" default** — flagged: wrong-direction (least-stringent) for an unspecified Class 2+. NOT changed (compliance logic).

---

## Cross-session handoffs
- **Meeting notes:** 20-June = transcribed + action items extracted (`docs/2026-06-20-meeting-notes.md`). **25-June (`MMCBUILD ZOOM/`) = transcribed but action items NOT yet extracted** — held by the other session.
- **Jira:** client-visible SCRUM board; this session touches the meeting-note item *"fields not pre-populating from the uploaded design"* (extended/completed) plus new extraction-reliability work. DRAFT updates, Dennis approves before posting.
