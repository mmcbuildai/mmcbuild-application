/**
 * Export the modified plan as a DXF (SCRUM-173).
 *
 * Karen (2026-05-01): let users export the plan WITH their pursued MMC changes
 * applied — original geometry shown dotted, the modified geometry solid, so the
 * change (and its effect on setbacks / site coverage) is visible.
 *
 * Today Build only exports the suggestion REPORT (PDF/Word). This produces the
 * modified PLAN as a DXF (the interchange format every CAD tool reads — the repo
 * already parses DXF via `dxf-parser`, but there is no writer, so we emit a
 * minimal, universally-compatible AutoCAD R12 ASCII DXF by hand — no new
 * dependency, same "no-fork" discipline as the DAE exporter).
 *
 * Geometry: the spatial layout stores walls as straight segments with a
 * thickness (there are no arcs — the extractor already straightens curved walls),
 * so the representable change is wall THICKNESS per chosen MMC system (SIP ~150mm,
 * CLT ~120mm, etc.). Every wall a user is *pursuing* a change on is drawn twice:
 * its original footprint on a dotted SOURCE_OVERLAY layer and its new footprint
 * on a solid CHANGES layer; unchanged walls sit on a solid UNCHANGED layer. If a
 * future extractor emits arc geometry, the same dotted-original / solid-new
 * treatment applies unchanged.
 *
 * Pure — no I/O — so it is fully unit-testable.
 */

import type { SpatialLayout, Wall, Point2D } from "@/lib/build/spatial/types";

export interface DxfSuggestion {
  id: string;
  technology_category: string;
  suggested_alternative: string;
  affected_wall_ids: string[] | null;
  decision: "undecided" | "pursuing" | "considering" | "rejected" | null;
}

/**
 * Typical constructed wall thickness (metres) per MMC system. Used to redraw a
 * pursued wall at its new build-up. Roof/pod systems don't change a wall
 * footprint (0 = no wall change).
 */
export const MMC_WALL_THICKNESS_M: Record<string, number> = {
  sip_panels: 0.15,
  clt_mass_timber: 0.12,
  prefabricated_wall_panels: 0.12,
  precast_concrete: 0.15,
  steel_framing: 0.09,
  hybrid_systems: 0.12,
  modular_pods: 0, // interior pods — no external wall footprint change
  prefab_roof_trusses: 0, // roof — no wall footprint change
};

export interface WallChange {
  wallId: string;
  newThickness: number;
  system: string;
}

/**
 * Resolve which walls change and to what thickness, from the PURSUING suggestions
 * only. First pursued change per wall wins (deterministic by suggestion order).
 * Only walls that exist in the layout and whose system actually changes a wall
 * footprint (non-zero, and different from the current thickness) are included.
 */
export function computeWallChanges(
  layout: SpatialLayout,
  suggestions: DxfSuggestion[],
): Map<string, WallChange> {
  const wallById = new Map(layout.walls.map((w) => [w.id, w]));
  const changes = new Map<string, WallChange>();

  for (const s of suggestions) {
    if (s.decision !== "pursuing") continue;
    const newThickness = MMC_WALL_THICKNESS_M[s.technology_category];
    if (!newThickness || newThickness <= 0) continue;

    for (const wallId of s.affected_wall_ids ?? []) {
      if (changes.has(wallId)) continue; // first pursued change wins
      const wall = wallById.get(wallId);
      if (!wall) continue;
      // Skip a no-op (same thickness within 1mm).
      if (Math.abs(wall.thickness - newThickness) < 0.001) continue;
      changes.set(wallId, {
        wallId,
        newThickness,
        system: s.technology_category,
      });
    }
  }

  return changes;
}

// --- DXF primitives -------------------------------------------------------

function fmt(n: number): string {
  // DXF reals: trim to a sane precision, avoid exponent notation.
  return (Math.round(n * 1e6) / 1e6).toString();
}

/** The rectangular footprint of a wall (centreline offset by ±thickness/2). */
function wallFootprint(start: Point2D, end: Point2D, thickness: number): Point2D[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return []; // degenerate
  const px = (-dy / len) * (thickness / 2);
  const py = (dx / len) * (thickness / 2);
  return [
    { x: start.x + px, y: start.y + py },
    { x: end.x + px, y: end.y + py },
    { x: end.x - px, y: end.y - py },
    { x: start.x - px, y: start.y - py },
  ];
}

/** Emit a closed polygon as individual LINE entities (max CAD compatibility). */
function polyToLines(pts: Point2D[], layer: string): string {
  if (pts.length < 2) return "";
  const out: string[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    out.push(
      "0", "LINE",
      "8", layer,
      "10", fmt(a.x), "20", fmt(a.y), "30", "0.0",
      "11", fmt(b.x), "21", fmt(b.y), "31", "0.0",
    );
  }
  return out.join("\n") + "\n";
}

const LAYER_UNCHANGED = "UNCHANGED";
const LAYER_SOURCE = "SOURCE_OVERLAY";
const LAYER_CHANGES = "CHANGES";

function header(): string {
  return [
    "0", "SECTION", "2", "HEADER",
    "9", "$ACADVER", "1", "AC1009",
    "9", "$INSUNITS", "70", "6", // 6 = metres
    "0", "ENDSEC",
  ].join("\n") + "\n";
}

function tables(): string {
  return [
    "0", "SECTION", "2", "TABLES",
    // Linetypes
    "0", "TABLE", "2", "LTYPE", "70", "2",
    "0", "LTYPE", "2", "CONTINUOUS", "70", "0", "3", "Solid line", "72", "65", "73", "0", "40", "0.0",
    "0", "LTYPE", "2", "DASHED", "70", "0", "3", "Dashed _ _ _", "72", "65", "73", "2", "40", "0.6", "49", "0.4", "49", "-0.2",
    "0", "ENDTAB",
    // Layers: name(2), flags(70), colour(62), linetype(6)
    "0", "TABLE", "2", "LAYER", "70", "3",
    "0", "LAYER", "2", LAYER_UNCHANGED, "70", "0", "62", "7", "6", "CONTINUOUS",
    "0", "LAYER", "2", LAYER_SOURCE, "70", "0", "62", "1", "6", "DASHED",
    "0", "LAYER", "2", LAYER_CHANGES, "70", "0", "62", "3", "6", "CONTINUOUS",
    "0", "ENDTAB",
    "0", "ENDSEC",
  ].join("\n") + "\n";
}

export interface DxfExportResult {
  dxf: string;
  changedWallCount: number;
  totalWallCount: number;
}

/**
 * Build the modified-plan DXF from the layout + pursued suggestions.
 * - Unchanged walls → solid, UNCHANGED layer.
 * - Each pursued-change wall → original footprint dotted (SOURCE_OVERLAY) +
 *   new-thickness footprint solid (CHANGES).
 */
export function buildDxfFromLayout(input: {
  layout: SpatialLayout;
  suggestions: DxfSuggestion[];
}): DxfExportResult {
  const { layout, suggestions } = input;
  const changes = computeWallChanges(layout, suggestions);

  const entities: string[] = [];
  for (const wall of layout.walls) {
    const change = changes.get(wall.id);
    if (!change) {
      entities.push(
        polyToLines(wallFootprint(wall.start, wall.end, wall.thickness), LAYER_UNCHANGED),
      );
      continue;
    }
    // Original (dotted) + new build-up (solid).
    entities.push(
      polyToLines(wallFootprint(wall.start, wall.end, wall.thickness), LAYER_SOURCE),
    );
    entities.push(
      polyToLines(wallFootprint(wall.start, wall.end, change.newThickness), LAYER_CHANGES),
    );
  }

  const dxf =
    header() +
    tables() +
    "0\nSECTION\n2\nENTITIES\n" +
    entities.join("") +
    "0\nENDSEC\n" +
    "0\nEOF\n";

  return {
    dxf,
    changedWallCount: changes.size,
    totalWallCount: layout.walls.length,
  };
}
