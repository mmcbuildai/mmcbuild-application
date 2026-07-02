import { describe, it, expect } from "vitest";
import { selectFloorPages } from "@/lib/build/spatial/floor-page-select";
import type { PageTypeClassification } from "@/lib/build/spatial/page-classifier";

/**
 * Storey-selection regression cover (SCRUM-312, 2026-07-01).
 *
 * Before this change every page classified `floor_plan_upper` became its own
 * stacked storey. On the NSW pattern-book sample — a CATALOGUE of several
 * 2-storey unit adaptations, each with its own first-floor page — that stacked
 * 4 alternate-unit uppers into a phantom 5-storey tower with the roof floating
 * above an empty gap, and reported storeys=3+ for a 2-storey design. A
 * multi-unit sheet (≥2 ground plans) must now collapse to ONE representative
 * dwelling; a single dwelling caps at a realistic residential max.
 */

function page(pageNumber: number, type: PageTypeClassification["type"]): PageTypeClassification {
  return { pageNumber, type, confidence: 0.9 };
}

describe("selectFloorPages", () => {
  it("collapses a multi-unit pattern book to one ground + one first floor", () => {
    // 5 unit adaptations, each ground + first — the TH01 shape.
    const classifications = [
      page(18, "floor_plan_ground"),
      page(19, "floor_plan_upper"),
      page(22, "floor_plan_ground"),
      page(23, "floor_plan_upper"),
      page(25, "floor_plan_ground"),
      page(26, "floor_plan_upper"),
      page(27, "floor_plan_ground"),
      page(29, "floor_plan_ground"),
      page(30, "floor_plan_upper"),
    ];
    const result = selectFloorPages(classifications, null);
    // Exactly two floors — a coherent 2-storey representative, not a tower.
    expect(result).toEqual([
      { pageNumber: 18, storey: 0 },
      { pageNumber: 19, storey: 1 },
    ]);
  });

  it("keeps a genuine single-dwelling 2-storey set", () => {
    const result = selectFloorPages(
      [page(3, "floor_plan_ground"), page(4, "floor_plan_upper")],
      null,
    );
    expect(result).toEqual([
      { pageNumber: 3, storey: 0 },
      { pageNumber: 4, storey: 1 },
    ]);
  });

  it("allows a genuine single-dwelling 3-storey set (ground + 2 uppers)", () => {
    const result = selectFloorPages(
      [
        page(3, "floor_plan_ground"),
        page(4, "floor_plan_upper"),
        page(5, "floor_plan_upper"),
      ],
      null,
    );
    expect(result.map((f) => f.storey)).toEqual([0, 1, 2]);
    expect(result.map((f) => f.pageNumber)).toEqual([3, 4, 5]);
  });

  it("caps classifier noise: a single dwelling never exceeds 2 upper storeys", () => {
    const result = selectFloorPages(
      [
        page(3, "floor_plan_ground"),
        page(4, "floor_plan_upper"),
        page(5, "floor_plan_upper"),
        page(6, "floor_plan_upper"),
        page(7, "floor_plan_upper"),
      ],
      null,
    );
    expect(result).toHaveLength(3); // ground + 2 uppers max
    expect(result.map((f) => f.pageNumber)).toEqual([3, 4, 5]);
  });

  it("an override forces a single ground-floor extraction", () => {
    const result = selectFloorPages(
      [page(18, "floor_plan_ground"), page(19, "floor_plan_upper")],
      null,
      12,
    );
    expect(result).toEqual([{ pageNumber: 12, storey: 0 }]);
  });

  it("falls back to the best-candidate page when no floor plan was classified", () => {
    const result = selectFloorPages([page(2, "cover"), page(3, "other")], 3);
    expect(result).toEqual([{ pageNumber: 3, storey: 0 }]);
  });

  it("uses upper pages as floors when there is no ground plan", () => {
    const result = selectFloorPages(
      [page(4, "floor_plan_upper"), page(5, "floor_plan_upper")],
      null,
    );
    // No ground → the (single-dwelling) cap of 2 uppers stand in as floors 0,1.
    expect(result).toEqual([
      { pageNumber: 4, storey: 0 },
      { pageNumber: 5, storey: 1 },
    ]);
  });
});
