import { describe, it, expect } from "vitest";
import type { SpatialLayout, Wall } from "@/lib/build/spatial/types";
import {
  buildDxfFromLayout,
  computeWallChanges,
  MMC_WALL_THICKNESS_M,
  type DxfSuggestion,
} from "@/lib/build/dxf-exporter";

function wall(id: string, over: Partial<Wall> = {}): Wall {
  return {
    id,
    start: { x: 0, y: 0 },
    end: { x: 5, y: 0 },
    thickness: 0.09,
    type: "external",
    ...over,
  };
}

function layout(walls: Wall[]): SpatialLayout {
  return {
    rooms: [],
    walls,
    openings: [],
    bounds: { min: { x: 0, y: 0 }, max: { x: 5, y: 5 }, width: 5, depth: 5 },
    storeys: 1,
    wall_height: 2.4,
    confidence: 1,
  };
}

function sug(over: Partial<DxfSuggestion> = {}): DxfSuggestion {
  return {
    id: "s1",
    technology_category: "sip_panels",
    suggested_alternative: "Convert external walls to SIP panels",
    affected_wall_ids: ["w1"],
    decision: "pursuing",
    ...over,
  };
}

describe("computeWallChanges", () => {
  it("records a pursued SIP change at the SIP thickness", () => {
    const changes = computeWallChanges(layout([wall("w1")]), [sug()]);
    expect(changes.get("w1")?.newThickness).toBe(MMC_WALL_THICKNESS_M.sip_panels);
    expect(changes.get("w1")?.system).toBe("sip_panels");
  });

  it("ignores non-pursuing decisions", () => {
    for (const d of ["considering", "rejected", "undecided", null] as const) {
      expect(computeWallChanges(layout([wall("w1")]), [sug({ decision: d })]).size).toBe(0);
    }
  });

  it("ignores systems that don't change a wall footprint (roof, pods)", () => {
    expect(computeWallChanges(layout([wall("w1")]), [sug({ technology_category: "prefab_roof_trusses" })]).size).toBe(0);
    expect(computeWallChanges(layout([wall("w1")]), [sug({ technology_category: "modular_pods" })]).size).toBe(0);
  });

  it("skips wall ids that aren't in the layout", () => {
    expect(computeWallChanges(layout([wall("w1")]), [sug({ affected_wall_ids: ["nope"] })]).size).toBe(0);
  });

  it("skips a no-op change (same thickness)", () => {
    // SIP is 0.15 — a wall already at 0.15 is unchanged.
    expect(computeWallChanges(layout([wall("w1", { thickness: 0.15 })]), [sug()]).size).toBe(0);
  });

  it("first pursued change per wall wins", () => {
    const changes = computeWallChanges(layout([wall("w1")]), [
      sug({ id: "s1", technology_category: "sip_panels", affected_wall_ids: ["w1"] }),
      sug({ id: "s2", technology_category: "clt_mass_timber", affected_wall_ids: ["w1"] }),
    ]);
    expect(changes.get("w1")?.system).toBe("sip_panels");
  });
});

describe("buildDxfFromLayout", () => {
  it("emits a structurally valid DXF (SECTION…EOF, layers, dashed linetype)", () => {
    const { dxf } = buildDxfFromLayout({ layout: layout([wall("w1")]), suggestions: [] });
    expect(dxf.startsWith("0\nSECTION")).toBe(true);
    expect(dxf.trimEnd().endsWith("EOF")).toBe(true);
    expect(dxf).toContain("UNCHANGED");
    expect(dxf).toContain("SOURCE_OVERLAY");
    expect(dxf).toContain("CHANGES");
    expect(dxf).toContain("DASHED");
    expect(dxf).toContain("LINE");
  });

  it("draws an unchanged wall on the UNCHANGED layer only", () => {
    const { dxf, changedWallCount, totalWallCount } = buildDxfFromLayout({
      layout: layout([wall("w1")]),
      suggestions: [],
    });
    expect(changedWallCount).toBe(0);
    expect(totalWallCount).toBe(1);
    // The only entity lines reference UNCHANGED, never CHANGES-entity assignment.
    const entityLayerLines = dxf.split("\n").filter((_, i, arr) => arr[i - 1] === "8");
    expect(entityLayerLines.every((l) => l === "UNCHANGED")).toBe(true);
  });

  it("draws a pursued change as dotted original (SOURCE_OVERLAY) + solid new (CHANGES) — the AC case", () => {
    const { dxf, changedWallCount } = buildDxfFromLayout({
      layout: layout([wall("w1", { thickness: 0.09 })]),
      suggestions: [sug()], // convert w1 to SIP
    });
    expect(changedWallCount).toBe(1);
    const entityLayers = new Set(
      dxf.split("\n").filter((_, i, arr) => arr[i - 1] === "8"),
    );
    expect(entityLayers.has("SOURCE_OVERLAY")).toBe(true);
    expect(entityLayers.has("CHANGES")).toBe(true);
    // Unchanged layer not used when the only wall changed.
    expect(entityLayers.has("UNCHANGED")).toBe(false);
  });

  it("handles a mix of changed and unchanged walls", () => {
    const { changedWallCount, totalWallCount } = buildDxfFromLayout({
      layout: layout([wall("w1"), wall("w2", { start: { x: 0, y: 0 }, end: { x: 0, y: 5 } })]),
      suggestions: [sug({ affected_wall_ids: ["w1"] })],
    });
    expect(totalWallCount).toBe(2);
    expect(changedWallCount).toBe(1);
  });

  it("skips degenerate zero-length walls without crashing", () => {
    const { dxf } = buildDxfFromLayout({
      layout: layout([wall("w1", { end: { x: 0, y: 0 } })]),
      suggestions: [],
    });
    expect(dxf).toContain("EOF");
  });
});
