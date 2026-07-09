# PRD — Feed the authoritative property dataset into Build + Comply

> **Status:** IMPLEMENTED (branch `feat/property-into-build-comply`). Follows the scoping doc
> `NEXT_SESSION_property_into_build_comply.md` and the capture work in PR #87.
> **Tier:** REGULATED — compliance logic is deterministic and conservative (see §4).

## 1. Problem

PR #87 made MMC **capture and store** the full authoritative `PropertyProfile` per project
(`projects.property_profile`: zoning envelope, planning overlays, terrain, environment). But nothing
**consumed** it:

- **Build** (Design Optimisation) read zero property data — it could suggest an MMC alternative that
  breaches the site's height/setback envelope or ignores a bushfire/flood overlay.
- **Comply** only extracted site facts *from the uploaded plan* — a plan that states the wrong
  height/BAL/setback, or silently omits a flood/heritage overlay the site actually carries, was never
  caught against ground truth.

## 2. Goal

Feed the authoritative fields into both modules as **ground truth**, engine-first-with-fallback: read
the profile, prefer it, degrade gracefully (zero findings / no constraints) when a field or the whole
profile is absent — the normal degraded case when property-services is unconfigured.

## 3. What shipped

### 3.1 Comply — deterministic plan-vs-register reconciliation
- **`src/lib/comply/property-reconciliation.ts`** (pure, unit-tested):
  - `reconcileAuthoritative({ profile, attrs, questionnaire }): ComplianceFinding[]` — a **no-AI**
    cross-check producing findings for: building **height** vs `zoning.maximumHeight`; **storeys** vs
    `maximumHeightStoreys`; **setbacks** vs `zoning.setbacks`; **BAL** adequacy (`environment.bal` vs
    the questionnaire); each **planning overlay** the site carries (bushfire/flood/heritage/…) with its
    `requirements[]`; **terrain** constructability; **lot size** vs `minimumLotSize`.
  - `buildAuthoritativeContext(profile): string` — a ground-truth block appended to the AI prompt so
    every NCC category also reasons against the register, not just the plan's claims.
- **Wiring** (`src/lib/inngest/functions/run-compliance-check.ts`): a new `load-authoritative-site-data`
  step loads `projects.property_profile` + `plans.design_attributes`; the context is appended to
  `fullContext`; a new best-effort `reconcile-authoritative-site-data` step inserts the deterministic
  findings into `compliance_findings` **before** the report-version snapshot, so they appear in the
  report, the open-items board, and the exported pack. Scope-aware on re-checks (only re-scoped
  categories are re-inserted; the rest carry forward from the parent → no loss, no duplication).

### 3.2 Build — authoritative design constraints
- **`src/lib/build/property-constraints.ts`** (pure, unit-tested): `buildDesignConstraints(profile)`
  emits a constraints block — height/setback envelope, `modularProvisions`, BAL→AS 3959, flood/heritage
  overlay guidance, terrain-tolerant foundation guidance.
- **Wiring** (`src/lib/inngest/functions/run-design-optimisation.ts`): a new `load-property-profile`
  step; the constraints are appended to the optimiser's system prompt so it designs **within** the
  envelope and honours overlays.

## 4. REGULATED design decisions (why it's conservative)

- **Only proves breaches it can prove.** `non_compliant` is asserted only where ground truth is
  decisive: a scalar plan value beyond a hard limit (height/storeys), a boundary distance below the
  *smallest* required setback (which mathematically proves at least one boundary is under its own
  requirement), or a design BAL below the site BAL. Everywhere compliance cannot be proven (e.g. a
  smallest setback that clears the minimum — the other boundaries are unknown), it emits an
  **advisory "confirm…"** rather than a false pass.
- **Measurement tolerances** (`TOL_HEIGHT_M = 0.3`, `TOL_SETBACK_M = 0.2`) prevent rounding noise from
  tripping a breach.
- **Severities** stay within the `finding_severity` DB enum (`compliant|advisory|non_compliant|critical`).
  **Category** stays within the existing `NccCategory` set so findings render in the report UI;
  `responsible_discipline` is set explicitly per finding for correct routing (building_surveyor for
  planning/siting, fire_engineer for bushfire, hydraulic_engineer for flood, geotechnical_engineer for
  terrain).
- **Degrade-don't-fake**: no profile → `reconcileAuthoritative` returns `[]` and
  `buildDesignConstraints`/`buildAuthoritativeContext` return `""`; the modules run exactly as before.
- **Best-effort insert**: the reconciliation step is wrapped so it can never fail the whole compliance
  run.

## 5. Known limitation (tracked, not deferred silently)

The **executive summary + `overall_risk`** are generated from the AI section results, not the DB
findings, so a `non_compliant` reconciliation finding shows in the findings list / open-items /
exported report but is **not yet reflected in the headline risk rollup**. A follow-up can fold the
reconciliation findings into the summary/risk computation. Everything a reviewer needs is present in
the findings themselves.

## 6. Tests
- `tests/unit/lib/comply/property-reconciliation.test.ts` (breach/within/advisory per rule, BAL
  normalisation, overlays, terrain, lot, severity-enum invariant, context builder).
- `tests/unit/lib/build/property-constraints.test.ts` (height/setback/BAL/overlay/terrain/modular lines,
  BAL-LOW exclusion, empty-profile fallback).
- Full suite: **306 passing**, `npx tsc --noEmit` clean.

## 7. Verification when reviewing
- A project whose register carries a flood/heritage overlay → Comply raises an advisory for it even if
  the plan never mentions it.
- A plan height above the zone `maximumHeight` → Comply non_compliant against ground truth.
- Build's optimisation prompt now carries the height/setback envelope + overlay + terrain constraints.
