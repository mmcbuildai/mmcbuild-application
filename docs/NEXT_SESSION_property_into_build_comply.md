# NEXT SESSION — Feed the captured property dataset into Build + Comply

> **Status:** OPEN / not started. This is the flagged **larger, separate build** that follows the
> 2026-07-05 property-services *capture* work (PR #87, merged). Capture is done; **consumption** is not.
> **Tier:** REGULATED — compliance logic must be correct, not convenient. Read `~/.claude/CLAUDE.md` + this repo's CLAUDE.md first.

---

## What is already true (done 2026-07-05, PR #87 merged)

MMC now **captures and stores** the full canonical property-services dataset per project:
- `projects.property_profile` (JSONB) — the **entire `PropertyProfile`**: `zoning` (code/name/minimumLotSize/
  **maximumHeight**/**maximumHeightStoreys**/**setbacks**/**permittedUses[]**/subdivisionPermitted/**modularProvisions**),
  `environment` (wind/climate/**bal**), **`terrain`** (**buildability**/**slopePercent**/elevation/fall),
  **`overlays[]`** (bushfire/flood/heritage/… each with `requirements[]`/`requiresReport`), `subdivision`, `lot`.
- `projects.lot_size_sqm` — denormalised.
- `project_site_intel.overlays` — the **real overlays** (previously hardcoded `{}`).
- Written on create / update / rederive in `src/app/(dashboard)/projects/actions.ts` via `deriveSiteIntel`
  (`src/lib/site-intel/index.ts`, which returns `overlays`, `lot_size_sqm`, `slope_percent`, `buildability`, and the full `profile`).

**So the data is in the row.** Nothing below needs a new derive or a new migration — it's all read-side.

---

## The gap (confirmed 2026-07-05)

- **Build (`src/app/(dashboard)/build/**`, `src/lib/build/**`) has ZERO authoritative property references.**
  The design / optimisation / 3D pipeline never reads `property_profile`, `overlays`, `terrain`, or the zoning
  envelope. (The lone `setback` string in `src/lib/build/spatial/page-classifier.ts` is a plan-reading keyword,
  not a data read.)
- **Comply only EXTRACTS site facts FROM the uploaded plan** (`src/lib/inngest/functions/extract-design-attributes.ts`
  reads BAL/setbacks/boundaries off the drawing) — it does **not** cross-check them against the authoritative
  `property_profile`. So a plan that states the wrong BAL/height/setback, or ignores a flood/heritage overlay,
  is not caught against ground truth.

---

## The build (scope)

Feed the three authoritative field-groups into the two modules as **ground truth**, engine-first-with-fallback
(mirror the F2K-Checkpoint `councilRules` pattern shipped in the sibling `412f47fc` — read the profile, prefer it,
degrade gracefully when a field is absent):

1. **Overlays → Comply flags + Build constraints.**
   - Comply: for each authoritative overlay (bushfire BAL, flood, heritage, acid-sulfate, airport), assert the plan
     addresses its `requirements[]`; raise a compliance exception when the plan omits an overlay the site carries.
   - Build: surface overlays as hard design constraints (e.g. BAL-FZ construction standard, flood floor-level).
2. **Zoning envelope → Build design bounds + Comply cross-check.**
   - `maximumHeight`/`maximumHeightStoreys`, `setbacks` (front/side/rear), `permittedUses[]`, `minimumLotSize`,
     `modularProvisions` become the **bounds** the Build optimiser designs within, and the values Comply checks the
     plan against (plan height > zone max → exception).
3. **Terrain → Build constructability + Comply.**
   - `buildability`/`slopePercent`/fall drive foundation/earthworks assumptions in Build and a constructability
     note in Comply.

**Integration points:**
- `src/app/(dashboard)/build/actions.ts` + `src/lib/build/optimisation-gate.ts` (⚠️ see note) + the spatial/design
  pipeline (`src/lib/build/spatial/**`) — inject the zoning envelope + terrain + overlays.
- `src/app/(dashboard)/comply/actions.ts` + `src/lib/inngest/functions/run-compliance-check` — add an
  authoritative-vs-plan reconciliation step reading `projects.property_profile`.
- Read the profile via the `db()`/`createClient()` helpers; select `property_profile, lot_size_sqm` on the project.

**Why it's a larger, separate build (not the capture PR):** this touches the REGULATED compliance-check logic and
the design/optimisation pipeline (geometry bounds, foundation rules, exception generation) — it needs its own PRD,
test coverage (a regression test per new compliance rule per the repo standard), and a `/review` pass. It is
**not** data plumbing; it changes what Comply flags and what Build designs.

---

## ⚠️ Concurrency note

As of 2026-07-05 a **concurrent session** has **uncommitted** work in this repo's Build module:
`src/lib/build/optimisation-gate.ts` (new) + `tests/unit/optimisation-gate.test.ts` (new) + edits to
`build/[projectId]/page.tsx`, `system-preview-panel.tsx`, `system-select-chips.tsx`. **Rebase / reconcile
with that work before touching Build** — `optimisation-gate.ts` is a likely injection point for the zoning-envelope
bounds, so coordinate rather than clobber. `git add <specific files>`, never `-A`.

## Verification when done
- A project with an authoritative overlay whose plan omits it → Comply raises an exception (regression test).
- A plan exceeding the zone `maximumHeight` → Comply flags it against ground truth.
- Build's design bounds reflect `setbacks`/`maximumHeight`; terrain drives the foundation assumption.
- `npx tsc --noEmit` clean; `pnpm test` green; run `/review` (REGULATED).

_Related: memory `project_property_services_utilisation`; sibling pattern `F2K-Checkpoint councilRules` (`412f47fc`)._
