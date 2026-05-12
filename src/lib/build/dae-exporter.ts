/**
 * COLLADA (.dae) export of a Build optimisation report.
 *
 * Takes the AI-extracted SpatialLayout plus the user's Pursuing/Considering
 * decisions and emits a COLLADA 1.4.1 file that opens natively in SketchUp,
 * Revit, Rhino, Blender, etc.
 *
 * Quality bar: preview / massing. Walls are extruded boxes. Openings are
 * coloured markers ON the wall surface (NOT real cutouts). Suggestion
 * decisions tint the affected walls so the architect can immediately see
 * the optimised plan in their own tool.
 *
 * Coordinate system:
 *   X/Y: metres, floor plan (matches SpatialLayout)
 *   Z:   metres up. Declared as Z_UP in the COLLADA asset block.
 *
 * Not a full BIM hand-off. SCRUM-53 polished version (real cutouts,
 * SketchUp Components, per-product textures) is the follow-up.
 */

import type {
  SpatialLayout,
  Wall,
  Room,
  Opening,
  Point2D,
} from "@/lib/build/spatial/types";

export type SuggestionDecision =
  | "pursuing"
  | "considering"
  | "rejected"
  | "undecided";

export interface DaeSuggestion {
  id: string;
  technology_category: string;
  suggested_alternative: string;
  affected_wall_ids: string[] | null;
  affected_room_ids: string[] | null;
  decision: SuggestionDecision | null;
}

export interface DaeExportInput {
  layout: SpatialLayout;
  suggestions: DaeSuggestion[];
  projectName: string;
  reportId: string;
}

// ---------------------------------------------------------------------------
// Material palette
// ---------------------------------------------------------------------------

interface MaterialDef {
  id: string;
  name: string;
  /** RGBA 0..1 */
  diffuse: [number, number, number, number];
}

const MATERIALS: Record<string, MaterialDef> = {
  // Wall original materials (architect-recognisable names)
  Original_TimberFrame: {
    id: "mat_timber",
    name: "Original_TimberFrame",
    diffuse: [0.78, 0.62, 0.42, 1],
  },
  Original_BrickVeneer: {
    id: "mat_brick",
    name: "Original_BrickVeneer",
    diffuse: [0.68, 0.36, 0.28, 1],
  },
  Original_DoubleBrick: {
    id: "mat_double_brick",
    name: "Original_DoubleBrick",
    diffuse: [0.6, 0.3, 0.24, 1],
  },
  Original_Hebel: {
    id: "mat_hebel",
    name: "Original_Hebel",
    diffuse: [0.92, 0.9, 0.84, 1],
  },
  Original_SIPPanel: {
    id: "mat_sip",
    name: "Original_SIPPanel",
    diffuse: [0.95, 0.95, 0.92, 1],
  },
  Original_CLT: {
    id: "mat_clt",
    name: "Original_CLT",
    diffuse: [0.82, 0.66, 0.42, 1],
  },
  Original_SteelFrame: {
    id: "mat_steel",
    name: "Original_SteelFrame",
    diffuse: [0.62, 0.66, 0.7, 1],
  },
  Original_Unknown: {
    id: "mat_unknown",
    name: "Original_Unknown",
    diffuse: [0.75, 0.75, 0.75, 1],
  },
  // Suggestion-decision tints (override original material colour on affected walls)
  Suggested_Pursuing: {
    id: "mat_pursuing",
    name: "Suggested_Pursuing",
    diffuse: [0.13, 0.7, 0.62, 1], // teal
  },
  Suggested_Considering: {
    id: "mat_considering",
    name: "Suggested_Considering",
    diffuse: [0.95, 0.78, 0.2, 1], // amber
  },
  // Floor + opening markers
  Floor: { id: "mat_floor", name: "Floor", diffuse: [0.94, 0.94, 0.9, 1] },
  Opening_Door: {
    id: "mat_door",
    name: "Opening_Door",
    diffuse: [0.45, 0.28, 0.18, 1],
  },
  Opening_Window: {
    id: "mat_window",
    name: "Opening_Window",
    diffuse: [0.35, 0.6, 0.8, 0.6],
  },
};

function materialKeyForWall(wall: Wall): string {
  const m = (wall.material ?? "").toLowerCase();
  if (m.includes("sip")) return "Original_SIPPanel";
  if (m.includes("clt")) return "Original_CLT";
  if (m.includes("hebel")) return "Original_Hebel";
  if (m === "double_brick") return "Original_DoubleBrick";
  if (m.includes("brick")) return "Original_BrickVeneer";
  if (m.includes("steel")) return "Original_SteelFrame";
  if (m.includes("timber")) return "Original_TimberFrame";
  return "Original_Unknown";
}

function materialKeyForOpening(o: Opening): string {
  if (o.type === "window") return "Opening_Window";
  return "Opening_Door";
}

// ---------------------------------------------------------------------------
// Decision resolution
// ---------------------------------------------------------------------------

/**
 * For each wall id, find the strongest decision affecting it. Order:
 * pursuing > considering > rejected/undecided/none.
 */
function buildWallDecisionMap(
  suggestions: DaeSuggestion[],
): Map<string, "pursuing" | "considering"> {
  const rank: Record<string, number> = {
    pursuing: 2,
    considering: 1,
  };
  const map = new Map<string, "pursuing" | "considering">();
  for (const s of suggestions) {
    const dec = s.decision;
    if (dec !== "pursuing" && dec !== "considering") continue;
    for (const wid of s.affected_wall_ids ?? []) {
      const current = map.get(wid);
      if (!current || (rank[dec] ?? 0) > (rank[current] ?? 0)) {
        map.set(wid, dec);
      }
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Geometry primitives
// ---------------------------------------------------------------------------

interface Mesh {
  /** Flat array of vertex coords: [x,y,z, x,y,z, ...] */
  vertices: number[];
  /** Triangle indices into `vertices` (groups of 3) */
  triangles: number[];
  materialKey: string;
}

/**
 * Build a wall as an extruded thin box.
 * Wall runs from `start` to `end` on the X/Y floor plane, extruded up to
 * `height`. Thickness is perpendicular to the wall direction.
 */
function wallToMesh(wall: Wall, height: number, materialKey: string): Mesh {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    // Degenerate wall — return an empty mesh rather than NaN coords.
    return { vertices: [], triangles: [], materialKey };
  }
  // Perpendicular unit vector × half-thickness
  const px = (-dy / len) * (wall.thickness / 2);
  const py = (dx / len) * (wall.thickness / 2);

  // 8 corners of the box: 4 on the floor, 4 on the ceiling
  const v0: [number, number, number] = [wall.start.x - px, wall.start.y - py, 0];
  const v1: [number, number, number] = [wall.start.x + px, wall.start.y + py, 0];
  const v2: [number, number, number] = [wall.end.x + px, wall.end.y + py, 0];
  const v3: [number, number, number] = [wall.end.x - px, wall.end.y - py, 0];
  const v4: [number, number, number] = [wall.start.x - px, wall.start.y - py, height];
  const v5: [number, number, number] = [wall.start.x + px, wall.start.y + py, height];
  const v6: [number, number, number] = [wall.end.x + px, wall.end.y + py, height];
  const v7: [number, number, number] = [wall.end.x - px, wall.end.y - py, height];

  const vertices = [...v0, ...v1, ...v2, ...v3, ...v4, ...v5, ...v6, ...v7];
  // 12 triangles, 6 faces (consistent CCW winding when viewed from outside)
  const triangles = [
    // bottom
    0, 1, 2, 0, 2, 3,
    // top
    4, 6, 5, 4, 7, 6,
    // side a (start cap)
    0, 4, 5, 0, 5, 1,
    // side b (end cap)
    2, 6, 7, 2, 7, 3,
    // long side 1 (-perp)
    0, 3, 7, 0, 7, 4,
    // long side 2 (+perp)
    1, 5, 6, 1, 6, 2,
  ];
  return { vertices, triangles, materialKey };
}

/**
 * Triangulate a polygon via fan triangulation from vertex 0.
 * Works correctly for convex polygons and "nearly convex" rectilinear
 * room shapes. For genuinely concave rooms the fan can produce overlapping
 * triangles — acceptable for a preview-quality export.
 */
function roomToFloorMesh(room: Room): Mesh {
  const polygon = room.polygon;
  if (polygon.length < 3) {
    return { vertices: [], triangles: [], materialKey: "Floor" };
  }
  const vertices: number[] = [];
  for (const p of polygon) vertices.push(p.x, p.y, 0);
  const triangles: number[] = [];
  for (let i = 1; i < polygon.length - 1; i++) {
    triangles.push(0, i, i + 1);
  }
  return { vertices, triangles, materialKey: "Floor" };
}

/**
 * An opening is rendered as a small extruded marker on the floor plane at
 * `position`. We don't have orientation info from the schema except via
 * wall_id, so we orient the marker along the host wall when we can find
 * it; otherwise we draw an axis-aligned marker.
 */
function openingToMesh(
  opening: Opening,
  hostWall: Wall | undefined,
  defaultWallHeight: number,
): Mesh {
  const w = opening.width;
  const sill = opening.sill_height ?? 0;
  const top = sill + opening.height;
  const markerThickness = 0.12; // a bit thicker than typical walls so visible

  let dirX = 1;
  let dirY = 0;
  if (hostWall) {
    const dx = hostWall.end.x - hostWall.start.x;
    const dy = hostWall.end.y - hostWall.start.y;
    const len = Math.hypot(dx, dy);
    if (len > 1e-6) {
      dirX = dx / len;
      dirY = dy / len;
    }
  }
  const px = -dirY * (markerThickness / 2);
  const py = dirX * (markerThickness / 2);
  const ax = (dirX * w) / 2;
  const ay = (dirY * w) / 2;
  const cx = opening.position.x;
  const cy = opening.position.y;

  const v0: [number, number, number] = [cx - ax - px, cy - ay - py, sill];
  const v1: [number, number, number] = [cx - ax + px, cy - ay + py, sill];
  const v2: [number, number, number] = [cx + ax + px, cy + ay + py, sill];
  const v3: [number, number, number] = [cx + ax - px, cy + ay - py, sill];
  const v4: [number, number, number] = [cx - ax - px, cy - ay - py, top];
  const v5: [number, number, number] = [cx - ax + px, cy - ay + py, top];
  const v6: [number, number, number] = [cx + ax + px, cy + ay + py, top];
  const v7: [number, number, number] = [cx + ax - px, cy + ay - py, top];

  // Clamp top to default wall height + a fudge so we don't poke through the ceiling visibly
  const cap = defaultWallHeight + 0.02;
  if (top > cap) {
    v4[2] = cap;
    v5[2] = cap;
    v6[2] = cap;
    v7[2] = cap;
  }

  const vertices = [...v0, ...v1, ...v2, ...v3, ...v4, ...v5, ...v6, ...v7];
  const triangles = [
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 2, 6, 7, 2, 7, 3,
    0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2,
  ];
  return { vertices, triangles, materialKey: materialKeyForOpening(opening) };
}

// ---------------------------------------------------------------------------
// XML emission
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function num(n: number): string {
  return Number.isFinite(n) ? n.toFixed(6) : "0.000000";
}

interface NamedMesh {
  /** Unique node id, also used as geometry id */
  id: string;
  /** Human-readable label visible in SketchUp's outliner */
  label: string;
  mesh: Mesh;
}

function emitGeometry(nm: NamedMesh): string {
  const posCount = nm.mesh.vertices.length / 3;
  const triCount = nm.mesh.triangles.length / 3;
  if (posCount === 0 || triCount === 0) return "";

  const posArrayId = `${nm.id}-positions`;
  const verticesId = `${nm.id}-vertices`;
  const matSymbol = `${nm.id}-mat`;

  const posFloats = nm.mesh.vertices.map(num).join(" ");
  const triIdx = nm.mesh.triangles.join(" ");

  return `<geometry id="${nm.id}" name="${esc(nm.label)}">
  <mesh>
    <source id="${posArrayId}">
      <float_array id="${posArrayId}-array" count="${nm.mesh.vertices.length}">${posFloats}</float_array>
      <technique_common>
        <accessor source="#${posArrayId}-array" count="${posCount}" stride="3">
          <param name="X" type="float"/>
          <param name="Y" type="float"/>
          <param name="Z" type="float"/>
        </accessor>
      </technique_common>
    </source>
    <vertices id="${verticesId}">
      <input semantic="POSITION" source="#${posArrayId}"/>
    </vertices>
    <triangles material="${matSymbol}" count="${triCount}">
      <input semantic="VERTEX" source="#${verticesId}" offset="0"/>
      <p>${triIdx}</p>
    </triangles>
  </mesh>
</geometry>`;
}

function emitNode(nm: NamedMesh): string {
  if (nm.mesh.vertices.length === 0) return "";
  const mat = MATERIALS[nm.mesh.materialKey] ?? MATERIALS.Original_Unknown;
  const matSymbol = `${nm.id}-mat`;
  return `<node id="${nm.id}-node" name="${esc(nm.label)}">
  <instance_geometry url="#${nm.id}">
    <bind_material>
      <technique_common>
        <instance_material symbol="${matSymbol}" target="#${mat.id}"/>
      </technique_common>
    </bind_material>
  </instance_geometry>
</node>`;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function buildDaeFromLayout(input: DaeExportInput): string {
  const { layout, suggestions, projectName, reportId } = input;
  const wallHeight = layout.wall_height > 0 ? layout.wall_height : 2.4;
  const wallDecisions = buildWallDecisionMap(suggestions);
  const wallById = new Map<string, Wall>(layout.walls.map((w) => [w.id, w]));

  const items: NamedMesh[] = [];

  // Walls (suggestion decisions override the original material colour)
  for (const wall of layout.walls) {
    const decision = wallDecisions.get(wall.id);
    const matKey = decision
      ? decision === "pursuing"
        ? "Suggested_Pursuing"
        : "Suggested_Considering"
      : materialKeyForWall(wall);
    items.push({
      id: `wall_${wall.id}`,
      label: `Wall ${wall.id}${decision ? ` (${decision})` : ""}`,
      mesh: wallToMesh(wall, wallHeight, matKey),
    });
  }

  // Rooms (floor polygons)
  for (const room of layout.rooms) {
    items.push({
      id: `room_${room.id}`,
      label: `Room: ${room.name || room.id}`,
      mesh: roomToFloorMesh(room),
    });
  }

  // Openings
  for (const opening of layout.openings) {
    const host = opening.wall_id ? wallById.get(opening.wall_id) : undefined;
    items.push({
      id: `opening_${opening.id}`,
      label: `${opening.type} ${opening.id}`,
      mesh: openingToMesh(opening, host, wallHeight),
    });
  }

  // Walk the materials we actually used (saves bytes vs emitting all 14)
  const usedMaterialKeys = new Set(items.map((it) => it.mesh.materialKey));
  usedMaterialKeys.add("Floor"); // safety: rooms always need Floor
  const usedMaterials = [...usedMaterialKeys]
    .map((k) => MATERIALS[k])
    .filter((m): m is MaterialDef => Boolean(m));

  const now = new Date().toISOString();

  const libraryEffects = usedMaterials
    .map(
      (m) => `<effect id="${m.id}-effect">
  <profile_COMMON>
    <technique sid="common">
      <lambert>
        <diffuse><color sid="diffuse">${m.diffuse.map(num).join(" ")}</color></diffuse>
      </lambert>
    </technique>
  </profile_COMMON>
</effect>`,
    )
    .join("\n");

  const libraryMaterials = usedMaterials
    .map(
      (m) =>
        `<material id="${m.id}" name="${esc(m.name)}"><instance_effect url="#${m.id}-effect"/></material>`,
    )
    .join("\n");

  const libraryGeometries = items.map(emitGeometry).filter(Boolean).join("\n");
  const sceneNodes = items.map(emitNode).filter(Boolean).join("\n");

  // Pursuing/Considering counts for the asset comment (visible in SketchUp's
  // File > Model Info if the viewer surfaces <extra> blocks)
  const pursuing = suggestions.filter((s) => s.decision === "pursuing").length;
  const considering = suggestions.filter((s) => s.decision === "considering").length;

  return `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset>
    <contributor>
      <authoring_tool>MMC Build</authoring_tool>
      <comments>Project: ${esc(projectName)} | Report: ${esc(reportId)} | Pursuing: ${pursuing} | Considering: ${considering} | PREVIEW QUALITY - openings are markers, not real cutouts</comments>
    </contributor>
    <created>${now}</created>
    <modified>${now}</modified>
    <unit name="meter" meter="1"/>
    <up_axis>Z_UP</up_axis>
  </asset>
  <library_effects>
${libraryEffects}
  </library_effects>
  <library_materials>
${libraryMaterials}
  </library_materials>
  <library_geometries>
${libraryGeometries}
  </library_geometries>
  <library_visual_scenes>
    <visual_scene id="Scene" name="MMC Build optimised plan">
      <node id="building" name="${esc(projectName)}">
${sceneNodes}
      </node>
    </visual_scene>
  </library_visual_scenes>
  <scene><instance_visual_scene url="#Scene"/></scene>
</COLLADA>`;
}
