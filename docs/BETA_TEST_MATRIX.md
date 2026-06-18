# Beta Test Matrix — comprehensive coverage

> Framework from the beta day-1 call (Karthik): to be confident the product
> handles "whatever gets thrown at it", test across three dimensions —
> **file format × file size × plan type/complexity** — plus the **per-module
> flow** and the **insufficient-input** behaviour. This round validates the
> **flow / usability / navigation** (does it work, is it clear); a later round
> validates **data accuracy** (are the numbers/formulas right).

## The three input dimensions

| Dimension | Buckets |
|---|---|
| **1. File format** | `PDF` · `DWG/DXF` (CAD) · `Image` (JPG/PNG) — *(also accepted: RVT, SKP, DOCX — lower priority)* |
| **2. File size** | `< 15 MB` · `15–30 MB` · `> 30 MB` |
| **3. Plan type / complexity** | `Simple` (single sketch / 1 page) · `Standard` (single-storey architectural floor plan) · `Multi-storey` (2+ storeys, elevations + section) · `Full DA set` (10+ pages, all drawing types) |

Format (3) × Size (3) × Complexity (4) is the full grid. Karthik's ~27-combo
target = the high-value subset (3 × 3 × 3, dropping the rare combos). Aim for at
least **one plan per cell of format × size** and **one per complexity level**.

## Coverage grid — tick when tested (flow works end-to-end)

| Format ↓ \ Size → | < 15 MB | 15–30 MB | > 30 MB |
|---|---|---|---|
| **PDF** | ☐ | ☐ | ☐ (Gladesville ✓ ~37 MB) |
| **DWG/DXF** | ☐ | ☐ | ☐ (36.9 MB DWG ✓ earlier) |
| **Image (JPG/PNG)** | ☐ | ☐ | — (rare) |

| Complexity | Plan used | Comply | Build (3D) | Quote | Notes |
|---|---|---|---|---|---|
| Simple (1 page) | | ☐ | ☐ | ☐ | expect "insufficient info" if too sparse |
| Standard (single-storey) | | ☐ | ☐ | ☐ | |
| Multi-storey | | ☐ | ☐ | ☐ | check storeys + elevations + roof |
| Full DA set (10+ pp) | | ☐ | ☐ | ☐ | AI should pick the right pages |

## Per-module flow checklist (run for each plan above)

- **Comply** — upload → run check → NCC findings with cited clauses → export PDF.
- **Build** — run design optimisation → 3D model loads (walls + rooms + roof, not a shell) → suggestions relevant → download `.dae`/PDF.
- **Quote** — run cost estimate → completes in reasonable time → **all categories populated** (no empty sections) → traditional vs MMC breakdown → export.
- **Direct** — search trades by state/category → open a profile → enquiry form.
- **Train** — start a module → complete a lesson → progress tracked.

## Expected-outcome rules (not just "it ran")

1. **Insufficient input** → a clear *"this plan doesn't have enough information…"* message that says **what's missing**, NOT a junk result or a silent empty model (Karen).
2. **Unreadable / 0-geometry** → *"couldn't read this plan — re-upload a clearer floor plan"* (guarded in the extractor), not an empty box.
3. **3D completeness** → walls ≥ rooms (a real layout), a sensible roof (not a flat box on a pitched house), correct storey count.
4. **Quote completeness** → no category returns 0 items; total looks plausible.
5. **Status honesty** → a run that produced output shows as complete (not stuck "processing"); a failed run offers an explicit re-run.

## Device / responsiveness (real hardware — Karen/Michael)

Run the **whole tester flow** on a real **iPhone (Safari)** and a real
**Android (Chrome)**, plus a laptop:
- Magic-link sign-in works on mobile mail apps (check spam).
- `/beta` checklist, create-project, and each module are usable one-thumb; nothing overflows the screen.
- The 3D viewer responds to touch (pinch-zoom, rotate).
- Report pages (dense cost/finding data) are readable, not cramped/cut-off.
- Touch targets are tappable (≥44 px); text ≥16 px (no zoom-on-focus).

## Notes
- Format/size already partly proven: a 36.9 MB DWG and the ~37 MB Gladesville PDF both ran. The gaps to fill are the **small/medium sizes**, **images**, and the **simple** and **full-DA-set** complexity ends.
- Log each failure with the plan + the exact error so we can bucket "won't support" vs "should support but broke".
