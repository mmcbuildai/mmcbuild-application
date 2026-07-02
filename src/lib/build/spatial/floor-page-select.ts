import type { PageTypeClassification } from "./page-classifier";

/**
 * Pure floor-page / storey selection — no server-only deps, so it is unit
 * testable in isolation (the full extractor pulls in `server-only`).
 */

export interface FloorPagePlan {
  pageNumber: number;
  /** Storey index — 0 = ground, 1 = first, ... */
  storey: number;
}

/**
 * Choose which floor-plan pages to extract and their storey indices.
 *
 * A sheet with MULTIPLE ground-floor plans is a multi-unit / multi-adaptation
 * set (e.g. an NSW pattern book), where the several `floor_plan_upper` pages are
 * alternate UNITS at the same level — NOT stacked storeys. Treating each upper
 * page as its own storey stacked a phantom multi-storey tower with the roof
 * floating above an empty gap, and reported storeys=3+ for a 2-storey design
 * (Karen, SCRUM-312, on the NSW pattern book sample). So:
 *   - multi-unit sheet (≥2 ground plans) → take ONE coherent representative
 *     dwelling: the first ground + a single first floor.
 *   - single-dwelling set → allow genuine stacking, but cap at a realistic
 *     residential maximum (2 upper storeys) so classifier noise on a busy sheet
 *     can't invent extra storeys.
 * The `overridePage` (test-3d page picker) forces a single ground extraction.
 */
export function selectFloorPages(
  classifications: PageTypeClassification[],
  fallbackPage: number | null,
  overridePage?: number | null,
): FloorPagePlan[] {
  if (overridePage) return [{ pageNumber: overridePage, storey: 0 }];

  const groundPages = classifications
    .filter((c) => c.type === "floor_plan_ground")
    .map((c) => c.pageNumber);
  const upperPages = classifications
    .filter((c) => c.type === "floor_plan_upper")
    .map((c) => c.pageNumber)
    .sort((a, b) => a - b);

  const maxUpperStoreys = groundPages.length >= 2 ? 1 : 2;
  const cappedUppers = upperPages.slice(0, maxUpperStoreys);

  const ordered: number[] = [];
  const groundPage = groundPages[0] ?? null;
  if (groundPage != null) ordered.push(groundPage);
  for (const up of cappedUppers) if (!ordered.includes(up)) ordered.push(up);
  if (ordered.length === 0 && fallbackPage != null) ordered.push(fallbackPage);

  return ordered.map((pageNumber, i) => ({ pageNumber, storey: i }));
}
