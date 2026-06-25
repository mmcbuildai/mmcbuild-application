/**
 * Piece 3: Spatial JSON → Three.js 3D Geometry
 *
 * Converts the AI-extracted spatial layout into Three.js meshes for rendering.
 * Pure geometry — no AI needed here.
 */

import * as THREE from "three";
import ClipperLib from "clipper-lib";
import type {
  SpatialLayout,
  Wall,
  Room,
  Opening,
  Point2D,
} from "./types";

// Colour palette
const COLOURS = {
  wall_external: 0xb0b0b0,
  wall_internal: 0xd4d4d4,
  wall_party: 0xa0a0a0,
  floor: 0xf5f0e8,
  door: 0x8b6914,
  window: 0x87ceeb,
  ceiling: 0xfafafa,
  suggestion_highlight: 0x14b8a6, // teal-500
  roof_default: 0x3a3a3a, // Colorbond Monument-ish
};

// Cladding name → fallback hex (used when cladding is named but no colour given)
const CLADDING_COLOURS: Record<string, number> = {
  brick_veneer: 0xa85b3a,
  weatherboard: 0xe8dcc8,
  render: 0xece8e0,
  hebel: 0xd8d4cc,
  metal_cladding: 0x6b6b6b,
  fibre_cement: 0xc8c4bc,
  mixed: 0xb0b0b0,
};

function parseHexColour(hex: string | undefined, fallback: number): number {
  if (!hex) return fallback;
  const cleaned = hex.replace("#", "").trim();
  if (cleaned.length !== 6) return fallback;
  const parsed = parseInt(cleaned, 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Room type → floor colour
const ROOM_COLOURS: Record<string, number> = {
  living: 0xf5f0e8,
  bedroom: 0xe8edf5,
  bathroom: 0xe0f0f0,
  ensuite: 0xe0f0f0,
  kitchen: 0xf5ede0,
  laundry: 0xe8e8f0,
  garage: 0xe0e0e0,
  hallway: 0xf0f0f0,
  entry: 0xf0ece0,
  study: 0xedf0e8,
  dining: 0xf5ede0,
  alfresco: 0xe8f0e0,
  default: 0xf5f0e8,
};

function wallLength(wall: Wall): number {
  return Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
}

function wallAngle(wall: Wall): number {
  return Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);
}

function wallMidpoint(wall: Wall): Point2D {
  return {
    x: (wall.start.x + wall.end.x) / 2,
    y: (wall.start.y + wall.end.y) / 2,
  };
}

/**
 * Build a single wall mesh (extruded rectangle).
 *
 * Resolves colour for external walls in priority order:
 *   1. wall.exterior_colour (hex)
 *   2. layout.materials.wall_colour (hex)
 *   3. CLADDING_COLOURS[wall.cladding ?? layout.materials.wall_default]
 *   4. COLOURS.wall_external default
 *
 * Internal and party walls always use the plain palette colour.
 */
function buildWall(
  wall: Wall,
  defaultHeight: number,
  layoutMaterials?: SpatialLayout["materials"],
  baseElevation = 0,
): THREE.Mesh {
  const length = wallLength(wall);
  const thickness = wall.thickness || 0.09;
  const height = wall.height_m && wall.height_m > 0 ? wall.height_m : defaultHeight;
  const geometry = new THREE.BoxGeometry(length, height, thickness);

  let colour: number;
  if (wall.type === "external") {
    const explicitHex = wall.exterior_colour ?? layoutMaterials?.wall_colour;
    if (explicitHex) {
      colour = parseHexColour(explicitHex, COLOURS.wall_external);
    } else {
      const cladding = wall.cladding ?? layoutMaterials?.wall_default;
      colour = (cladding && CLADDING_COLOURS[cladding]) || COLOURS.wall_external;
    }
  } else {
    const colourKey = `wall_${wall.type}` as keyof typeof COLOURS;
    colour = COLOURS[colourKey] || COLOURS.wall_internal;
  }

  const material = new THREE.MeshStandardMaterial({
    color: colour,
    roughness: 0.8,
    metalness: 0.1,
  });

  const mesh = new THREE.Mesh(geometry, material);
  const mid = wallMidpoint(wall);
  const angle = wallAngle(wall);

  mesh.position.set(mid.x, baseElevation + height / 2, mid.y);
  mesh.rotation.y = -angle;

  mesh.userData = { type: "wall", wallId: wall.id, material: wall.material, storey: wall.storey ?? 0 };
  return mesh;
}

/**
 * Build a floor polygon for a room.
 */
function buildFloor(room: Room, baseElevation = 0): THREE.Mesh {
  if (room.polygon.length < 3) {
    // Fallback: create a small placeholder
    const geo = new THREE.PlaneGeometry(1, 1);
    const placeholder = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: 0xf5f0e8 }),
    );
    placeholder.position.y = baseElevation + 0.01;
    return placeholder;
  }

  const shape = new THREE.Shape();
  shape.moveTo(room.polygon[0].x, room.polygon[0].y);
  for (let i = 1; i < room.polygon.length; i++) {
    shape.lineTo(room.polygon[i].x, room.polygon[i].y);
  }
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);
  const colour = ROOM_COLOURS[room.type || "default"] || ROOM_COLOURS.default;
  const material = new THREE.MeshStandardMaterial({
    color: colour,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  // Rotate to lay flat (shape is in XY, we need XZ)
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = baseElevation + 0.01; // sit on this storey's slab, just above to avoid z-fighting

  mesh.userData = { type: "floor", roomId: room.id, roomName: room.name, storey: room.floor_level ?? 0 };
  return mesh;
}

/**
 * Build an opening (door or window) as a coloured box cut into the wall.
 */
function buildOpening(
  opening: Opening,
  wallHeight: number,
  walls: Wall[],
  baseElevation = 0,
): THREE.Mesh | null {
  // Find the parent wall to determine position and rotation
  const wall = walls.find((w) => w.id === opening.wall_id);
  if (!wall) {
    // Position at the opening's coordinates if no wall reference
    const height = opening.height || (opening.type === "window" ? 1.2 : 2.04);
    const sillHeight = opening.sill_height || (opening.type === "window" ? 0.9 : 0);
    const geometry = new THREE.BoxGeometry(opening.width, height, 0.15);
    const colour = opening.type === "window" ? COLOURS.window : COLOURS.door;
    const material = new THREE.MeshStandardMaterial({
      color: colour,
      roughness: 0.5,
      transparent: opening.type === "window",
      opacity: opening.type === "window" ? 0.4 : 0.8,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(opening.position.x, baseElevation + sillHeight + height / 2, opening.position.y);
    mesh.userData = { type: "opening", openingType: opening.type, openingId: opening.id };
    return mesh;
  }

  const angle = wallAngle(wall);
  const height = opening.height || (opening.type === "window" ? 1.2 : 2.04);
  const sillHeight = opening.sill_height || (opening.type === "window" ? 0.9 : 0);
  const thickness = (wall.thickness || 0.09) + 0.02; // slightly thicker than wall to show through

  const geometry = new THREE.BoxGeometry(opening.width, height, thickness);
  const colour = opening.type === "window" ? COLOURS.window : COLOURS.door;
  const material = new THREE.MeshStandardMaterial({
    color: colour,
    roughness: 0.3,
    transparent: opening.type === "window",
    opacity: opening.type === "window" ? 0.4 : 0.8,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(opening.position.x, baseElevation + sillHeight + height / 2, opening.position.y);
  mesh.rotation.y = -angle;

  mesh.userData = { type: "opening", openingType: opening.type, openingId: opening.id };
  return mesh;
}

/**
 * Trace external walls into an ordered closed polygon (the building
 * perimeter). Walks the wall list, chaining each wall's endpoint to the
 * next wall whose start (or end) matches within tolerance. Returns null
 * if the chain can't be closed (e.g. walls have gaps or aren't a single
 * connected loop).
 *
 * Used so the roof footprint matches the actual building outline rather
 * than the bounding box. Bounding-box-shaped roofs look wrong on
 * L-shapes, T-shapes, and any plan with an open deck or jutting garage.
 */
function computePerimeterPolygon(walls: Wall[]): Point2D[] | null {
  const externals = walls.filter((w) => w.type === "external");
  if (externals.length < 3) return null;

  const tol = 0.05; // 5 cm endpoint match tolerance
  const samePoint = (a: Point2D, b: Point2D) =>
    Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol;

  const polygon: Point2D[] = [];
  const used = new Set<string>();

  const first = externals[0];
  polygon.push(first.start);
  polygon.push(first.end);
  used.add(first.id);

  while (used.size < externals.length) {
    const last = polygon[polygon.length - 1];
    const next = externals.find(
      (w) =>
        !used.has(w.id) && (samePoint(w.start, last) || samePoint(w.end, last)),
    );
    if (!next) break;
    used.add(next.id);
    polygon.push(samePoint(next.start, last) ? next.end : next.start);
  }

  // Drop duplicate closing vertex
  if (polygon.length > 2 && samePoint(polygon[0], polygon[polygon.length - 1])) {
    polygon.pop();
  }

  return polygon.length >= 3 ? polygon : null;
}

/**
 * Build a roof mesh based on the SpatialLayout.roof spec.
 *
 * Primary path: extracts the perimeter polygon from external walls and
 * builds the roof to follow the actual building outline. Pitched forms
 * (gable, hip, mansard, complex) use the v3 inset-ring algorithm which
 * produces a hipped-everywhere silhouette on any polygon footprint —
 * rectangles, L-shapes, T-shapes — instead of a flat-topped slab.
 * Flat and skillion use simpler shape-specific builders.
 *
 * Fallback path: if the perimeter polygon can't be computed (walls don't
 * form a closed loop), falls back to bounding-box-based roof shapes
 * (kept as buildFlatRoof / buildGableRoof / etc).
 *
 * Coordinate system: same as walls — x = right, z = depth (mapped from
 * layout y). baseHeight = top of the wall where the roof starts.
 *
 * v3.x backlog: gable preservation (straight end-wall ridges) currently
 * renders as a hip — needs a per-edge "is gable end" flag passed to the
 * inset builder so those edges hold their original height instead of
 * collapsing inward.
 */
function buildRoof(
  layout: SpatialLayout,
  baseHeight: number,
): THREE.Object3D | null {
  const roof = layout.roof;
  if (!roof) return null;

  const pitchRad = Math.max(0, (roof.pitch_deg ?? 22.5)) * (Math.PI / 180);
  const eave = Math.max(0, roof.eave_overhang_m ?? 0);

  const colour = parseHexColour(
    roof.colour ?? layout.materials?.roof_colour,
    COLOURS.roof_default,
  );
  const material = new THREE.MeshStandardMaterial({
    color: colour,
    roughness: 0.6,
    metalness: 0.2,
    side: THREE.DoubleSide,
  });

  const form = roof.form ?? "gable";

  // Primary path: polygon-based roof following the wall outline. On a
  // multi-storey building only the TOP storey's external walls define the
  // roof footprint — feeding every storey's walls in would chain two
  // overlapping loops and corrupt the perimeter trace.
  const top = topStoreyIndex(layout);
  const topStoreyWalls = layout.walls.filter((w) => (w.storey ?? 0) === top);
  const roofWalls =
    topStoreyWalls.filter((w) => w.type === "external").length >= 3
      ? topStoreyWalls
      : layout.walls;
  const polygon = computePerimeterPolygon(roofWalls);
  if (polygon) {
    return buildRoofFromPolygon(polygon, form, pitchRad, eave, baseHeight, material);
  }

  // Fallback: bounding-box-based roof shapes (kept for plans where the
  // external wall list doesn't form a closed loop).
  const minX = layout.bounds.min.x - eave;
  const maxX = layout.bounds.max.x + eave;
  const minY = layout.bounds.min.y - eave;
  const maxY = layout.bounds.max.y + eave;

  switch (form) {
    case "flat":
      return buildFlatRoof(minX, maxX, minY, maxY, baseHeight, material);
    case "skillion":
      return buildSkillionRoof(minX, maxX, minY, maxY, baseHeight, pitchRad, material);
    case "hip":
      return buildHipRoof(minX, maxX, minY, maxY, baseHeight, pitchRad, material);
    case "mansard":
    case "complex":
    case "gable":
    default:
      return buildGableRoof(minX, maxX, minY, maxY, baseHeight, pitchRad, material);
  }
}

/**
 * Dispatch perimeter-polygon roofs by form. Flat → thin slab extrusion;
 * skillion → bounding-box wedge from polygon extent; everything pitched
 * → inset-ring algorithm.
 */
function buildRoofFromPolygon(
  polygon: Point2D[],
  form: string,
  pitchRad: number,
  eave: number,
  baseHeight: number,
  material: THREE.Material,
): THREE.Mesh {
  // Expand polygon outward by eave overhang so the roof oversails the
  // walls. Pure passthrough when eave is 0 or expansion fails.
  const footprint = eave > 0 ? expandPolygon(polygon, eave) ?? polygon : polygon;

  if (form === "flat") {
    return buildFlatSlabFromPolygon(footprint, baseHeight, material);
  }

  if (form === "skillion") {
    // Skillion needs a directional ridge that isn't well-defined on an
    // arbitrary polygon. Use the polygon's bounding box as the wedge
    // frame; visually correct on rectangles, approximate elsewhere.
    const xs = footprint.map((p) => p.x);
    const ys = footprint.map((p) => p.y);
    return buildSkillionRoof(
      Math.min(...xs), Math.max(...xs),
      Math.min(...ys), Math.max(...ys),
      baseHeight, pitchRad, material,
    );
  }

  return buildPitchedRoofFromPolygon(footprint, pitchRad, baseHeight, material, form);
}

/**
 * Flat slab extrusion over the perimeter polygon. ~150mm thick.
 */
function buildFlatSlabFromPolygon(
  polygon: Point2D[],
  baseHeight: number,
  material: THREE.Material,
): THREE.Mesh {
  const thickness = 0.15;

  const shape = new THREE.Shape();
  shape.moveTo(polygon[0].x, polygon[0].y);
  for (let i = 1; i < polygon.length; i++) {
    shape.lineTo(polygon[i].x, polygon[i].y);
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = baseHeight + thickness;
  mesh.userData = { type: "roof", form: "flat", footprint: "polygon" };
  return mesh;
}

/**
 * Inset-ring pitched roof on an arbitrary polygon footprint.
 *
 * Walks the polygon inward in fixed steps using clipper-lib's polygon
 * offset, stacks each inset ring at a height proportional to its inset
 * distance × tan(pitch), and stitches consecutive rings into a
 * BufferGeometry. The result is a "hipped everywhere" pitched roof that
 * follows the building's actual outline — works for rectangles, L-shapes,
 * T-shapes, and courtyards.
 *
 * Algorithm reference: project memory `project_roof_v3_plan_clipper_inset`.
 * Topology-change handling (when an inset ring has fewer vertices than the
 * one outside it) falls back to nearest-vertex stitching rather than
 * straight-skeleton bisector computation.
 */
function buildPitchedRoofFromPolygon(
  polygon: Point2D[],
  pitchRad: number,
  baseHeight: number,
  material: THREE.Material,
  form: string,
): THREE.Mesh {
  const SCALE = 1000; // 1mm clipper precision
  const INSET_STEP_M = 0.1; // 100mm per ring — ~30-50 rings on a typical house
  const MAX_RINGS = 200; // safety against pathological inputs

  // clipper expects CCW outer polygons for negative-offset shrink.
  const orientedPoly = ensureCCW(polygon);
  const clipperPath = orientedPoly.map((p) => ({
    X: Math.round(p.x * SCALE),
    Y: Math.round(p.y * SCALE),
  }));

  type Ring = { points: Point2D[]; height: number };
  const rings: Ring[] = [{ points: orientedPoly, height: baseHeight }];

  // Offset from the ORIGINAL polygon at increasing distances each iteration
  // (more numerically stable than re-offsetting the previous solution).
  for (let i = 1; i <= MAX_RINGS; i++) {
    const co = new ClipperLib.ClipperOffset();
    co.AddPath(clipperPath, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
    const solution: { X: number; Y: number }[][] = [];
    co.Execute(solution, -i * INSET_STEP_M * SCALE);

    if (solution.length === 0) break;

    // If the offset split the polygon (rare for residential plans, common
    // for thin courtyards), keep the largest piece. We lose the smaller
    // ridge segment — acceptable tradeoff for v3.
    let best = solution[0];
    let bestArea = Math.abs(ClipperLib.Clipper.Area(best));
    for (let j = 1; j < solution.length; j++) {
      const a = Math.abs(ClipperLib.Clipper.Area(solution[j]));
      if (a > bestArea) {
        best = solution[j];
        bestArea = a;
      }
    }
    if (best.length < 3) break;

    const insetPoly = best.map((p) => ({ x: p.X / SCALE, y: p.Y / SCALE }));
    const height = baseHeight + i * INSET_STEP_M * Math.tan(pitchRad);
    rings.push({ points: insetPoly, height });
  }

  // Build buffer geometry: side faces between consecutive rings + cap on
  // top of the smallest ring.
  const positions: number[] = [];
  const indices: number[] = [];
  const ringStarts: number[] = [];

  for (const ring of rings) {
    ringStarts.push(positions.length / 3);
    for (const p of ring.points) {
      // World coords: x → x, ring height → y (up), layout y → z (depth)
      positions.push(p.x, ring.height, p.y);
    }
  }

  for (let r = 0; r < rings.length - 1; r++) {
    const outer = rings[r].points;
    const inner = rings[r + 1].points;
    const outerStart = ringStarts[r];
    const innerStart = ringStarts[r + 1];
    appendSkirtFaces(indices, outer, inner, outerStart, innerStart);
  }

  // Cap the topmost ring with a triangle fan from its first vertex.
  const topRing = rings[rings.length - 1].points;
  const topStart = ringStarts[ringStarts.length - 1];
  if (topRing.length >= 3) {
    for (let i = 1; i < topRing.length - 1; i++) {
      indices.push(topStart, topStart + i, topStart + i + 1);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();

  const mesh = new THREE.Mesh(geom, material);
  mesh.userData = {
    type: "roof",
    form,
    footprint: "polygon",
    algorithm: "clipper_inset",
    rings: rings.length,
  };
  return mesh;
}

/** Build skirt triangles between two consecutive rings. When vertex
 *  counts match we connect i-th to i-th; otherwise each outer edge
 *  finds its nearest inner vertices. */
function appendSkirtFaces(
  indices: number[],
  outer: Point2D[],
  inner: Point2D[],
  outerStart: number,
  innerStart: number,
): void {
  if (outer.length === inner.length) {
    const n = outer.length;
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      const o0 = outerStart + i;
      const o1 = outerStart + i2;
      const in0 = innerStart + i;
      const in1 = innerStart + i2;
      indices.push(o0, o1, in1);
      indices.push(o0, in1, in0);
    }
    return;
  }

  // Topology changed (inset collapsed at least one edge). For each outer
  // edge, attach it to its nearest inner vertex/vertices.
  for (let i = 0; i < outer.length; i++) {
    const i2 = (i + 1) % outer.length;
    const o0 = outerStart + i;
    const o1 = outerStart + i2;
    const p0 = outer[i];
    const p1 = outer[i2];
    const j0 = nearestVertexIndex(p0, inner);
    const j1 = nearestVertexIndex(p1, inner);
    const in0 = innerStart + j0;
    const in1 = innerStart + j1;
    indices.push(o0, o1, in1);
    if (j0 !== j1) indices.push(o0, in1, in0);
  }
}

function nearestVertexIndex(p: Point2D, candidates: Point2D[]): number {
  let bestIdx = 0;
  let bestDistSq = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const dx = candidates[i].x - p.x;
    const dy = candidates[i].y - p.y;
    const d = dx * dx + dy * dy;
    if (d < bestDistSq) {
      bestDistSq = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/** Signed area > 0 in our XY coord system corresponds to one winding
 *  direction; we normalise the polygon so clipper's negative offset
 *  reliably shrinks rather than expanding. */
function ensureCCW(polygon: Point2D[]): Point2D[] {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    sum += (b.x - a.x) * (b.y + a.y);
  }
  return sum > 0 ? polygon.slice().reverse() : polygon;
}

/** Expand the polygon outward by `distance` metres (used to add eave
 *  overhang). Returns null if clipper can't produce a valid expansion. */
function expandPolygon(polygon: Point2D[], distance: number): Point2D[] | null {
  if (distance <= 0) return polygon;
  const SCALE = 1000;
  const oriented = ensureCCW(polygon);
  const path = oriented.map((p) => ({
    X: Math.round(p.x * SCALE),
    Y: Math.round(p.y * SCALE),
  }));
  const co = new ClipperLib.ClipperOffset();
  co.AddPath(path, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
  const solution: { X: number; Y: number }[][] = [];
  co.Execute(solution, distance * SCALE);
  if (solution.length === 0) return null;
  // Pick the largest expanded ring.
  let best = solution[0];
  let bestArea = Math.abs(ClipperLib.Clipper.Area(best));
  for (let j = 1; j < solution.length; j++) {
    const a = Math.abs(ClipperLib.Clipper.Area(solution[j]));
    if (a > bestArea) {
      best = solution[j];
      bestArea = a;
    }
  }
  if (best.length < 3) return null;
  return best.map((p) => ({ x: p.X / SCALE, y: p.Y / SCALE }));
}

function buildFlatRoof(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  baseHeight: number,
  material: THREE.Material,
): THREE.Mesh {
  const W = maxX - minX;
  const D = maxY - minY;
  const thickness = 0.15;
  const geometry = new THREE.BoxGeometry(W, thickness, D);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set((minX + maxX) / 2, baseHeight + thickness / 2, (minY + maxY) / 2);
  mesh.userData = { type: "roof", form: "flat" };
  return mesh;
}

function buildSkillionRoof(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  baseHeight: number,
  pitchRad: number,
  material: THREE.Material,
): THREE.Mesh {
  // Wedge: low edge at minY (front), high edge at maxY (back)
  const D = maxY - minY;
  const ridgeHeight = baseHeight + D * Math.tan(pitchRad);

  // 8 vertices for a wedge (prism with sloped top)
  const verts = new Float32Array([
    // bottom 4 (at baseHeight)
    minX, baseHeight, minY,  // 0
    maxX, baseHeight, minY,  // 1
    maxX, baseHeight, maxY,  // 2
    minX, baseHeight, maxY,  // 3
    // top 4 — front edge at baseHeight, back edge at ridgeHeight
    minX, baseHeight, minY,        // 4 (=0, front-bottom = front-top)
    maxX, baseHeight, minY,        // 5 (=1)
    maxX, ridgeHeight, maxY,       // 6
    minX, ridgeHeight, maxY,       // 7
  ]);

  // Triangles (CCW from outside)
  const idx = [
    // sloped top
    4, 6, 5,  4, 7, 6,
    // front (vertical, at minY — zero-height triangles, skip if degenerate)
    // back (rectangle at maxY, from baseHeight to ridgeHeight)
    3, 2, 6,  3, 6, 7,
    // left (triangle at minX)
    0, 3, 7,  0, 7, 4,
    // right (triangle at maxX)
    1, 5, 6,  1, 6, 2,
    // bottom (so interior view doesn't see through)
    0, 1, 2,  0, 2, 3,
  ];

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  geom.setIndex(idx);
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, material);
  mesh.userData = { type: "roof", form: "skillion" };
  return mesh;
}

function buildGableRoof(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  baseHeight: number,
  pitchRad: number,
  material: THREE.Material,
): THREE.Mesh {
  const W = maxX - minX;
  const D = maxY - minY;
  // Ridge runs along the longer axis
  const ridgeAlongX = W >= D;
  const span = Math.min(W, D); // shorter span = rafter run
  const ridgeHeight = baseHeight + (span / 2) * Math.tan(pitchRad);

  let verts: Float32Array;
  let idx: number[];

  if (ridgeAlongX) {
    // Ridge runs east-west at y = (minY + maxY) / 2
    const midY = (minY + maxY) / 2;
    verts = new Float32Array([
      minX, baseHeight, minY,  // 0 — front-left-bottom
      maxX, baseHeight, minY,  // 1 — front-right-bottom
      maxX, baseHeight, maxY,  // 2 — back-right-bottom
      minX, baseHeight, maxY,  // 3 — back-left-bottom
      minX, ridgeHeight, midY, // 4 — left ridge end
      maxX, ridgeHeight, midY, // 5 — right ridge end
    ]);
    idx = [
      // front slope (0,1,5,4)
      0, 1, 5,  0, 5, 4,
      // back slope (3,2,5,4) — note normal direction
      3, 4, 5,  3, 5, 2,
      // left gable triangle (0,4,3)
      0, 4, 3,
      // right gable triangle (1,2,5)
      1, 2, 5,
      // bottom
      0, 1, 2,  0, 2, 3,
    ];
  } else {
    // Ridge runs north-south at x = (minX + maxX) / 2
    const midX = (minX + maxX) / 2;
    verts = new Float32Array([
      minX, baseHeight, minY,  // 0
      maxX, baseHeight, minY,  // 1
      maxX, baseHeight, maxY,  // 2
      minX, baseHeight, maxY,  // 3
      midX, ridgeHeight, minY, // 4 — front ridge end
      midX, ridgeHeight, maxY, // 5 — back ridge end
    ]);
    idx = [
      // left slope (0,4,5,3)
      0, 4, 5,  0, 5, 3,
      // right slope (1,2,5,4)
      1, 5, 4,  1, 2, 5,
      // front gable triangle (0,1,4)
      0, 1, 4,
      // back gable triangle (3,5,2)
      3, 5, 2,
      // bottom
      0, 1, 2,  0, 2, 3,
    ];
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  geom.setIndex(idx);
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, material);
  mesh.userData = { type: "roof", form: "gable" };
  return mesh;
}

function buildHipRoof(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  baseHeight: number,
  pitchRad: number,
  material: THREE.Material,
): THREE.Mesh {
  const W = maxX - minX;
  const D = maxY - minY;
  const span = Math.min(W, D);
  const ridgeHeight = baseHeight + (span / 2) * Math.tan(pitchRad);

  // Hip with ridge: shorter axis collapses to apex line, longer axis has ridge.
  // Ridge length = longer - shorter (so the two ends are equal-pitch hips).
  let r1x: number, r1z: number, r2x: number, r2z: number;
  if (W >= D) {
    // Ridge runs east-west, centred on Y
    const midY = (minY + maxY) / 2;
    const ridgeLen = W - D;
    const cx = (minX + maxX) / 2;
    r1x = cx - ridgeLen / 2;
    r1z = midY;
    r2x = cx + ridgeLen / 2;
    r2z = midY;
  } else {
    // Ridge runs north-south, centred on X
    const midX = (minX + maxX) / 2;
    const ridgeLen = D - W;
    const cz = (minY + maxY) / 2;
    r1x = midX;
    r1z = cz - ridgeLen / 2;
    r2x = midX;
    r2z = cz + ridgeLen / 2;
  }

  const verts = new Float32Array([
    minX, baseHeight, minY,    // 0
    maxX, baseHeight, minY,    // 1
    maxX, baseHeight, maxY,    // 2
    minX, baseHeight, maxY,    // 3
    r1x,  ridgeHeight, r1z,    // 4 — ridge end 1 (front or left)
    r2x,  ridgeHeight, r2z,    // 5 — ridge end 2 (back or right)
  ]);

  // Four slopes meeting at the ridge / apex line:
  // For W >= D (ridge east-west, r1 left, r2 right):
  //   front slope: 0,1,5,4 (but 4 is leftish, 5 rightish — need to orient)
  // For W < D, the ridge runs N-S
  // Triangulation that works for both: define the four hip planes connecting
  // each footprint edge to the ridge segment.
  let idx: number[];
  if (W >= D) {
    // Ridge horizontal (along X), r1 at left, r2 at right
    idx = [
      // front slope (along minY edge): 0,1 -> 5,4 (front edge to ridge)
      0, 1, 5,  0, 5, 4,
      // back slope (along maxY edge): 3,2 -> 5,4
      3, 4, 5,  3, 5, 2,
      // left hip (triangle from 0,3 to ridge end 4)
      0, 4, 3,
      // right hip (triangle from 1,2 to ridge end 5)
      1, 2, 5,
      // bottom
      0, 1, 2,  0, 2, 3,
    ];
  } else {
    // Ridge vertical (along Z), r1 at front (min y), r2 at back (max y)
    idx = [
      // left slope (along minX edge): 0,3 -> 5,4
      0, 4, 5,  0, 5, 3,
      // right slope (along maxX edge): 1,2 -> 5,4
      1, 5, 4,  1, 2, 5,
      // front hip (triangle from 0,1 to ridge end 4)
      0, 1, 4,
      // back hip (triangle from 3,5,2)
      3, 5, 2,
      // bottom
      0, 1, 2,  0, 2, 3,
    ];
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  geom.setIndex(idx);
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, material);
  mesh.userData = { type: "roof", form: "hip" };
  return mesh;
}

/**
 * Build a ground plane.
 */
function buildGround(bounds: SpatialLayout["bounds"]): THREE.Mesh {
  const padding = 2;
  const width = bounds.width + padding * 2;
  const depth = bounds.depth + padding * 2;
  const geometry = new THREE.PlaneGeometry(width, depth);
  const material = new THREE.MeshStandardMaterial({
    color: 0xe8e8e0,
    roughness: 1,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(bounds.width / 2, 0, bounds.depth / 2);
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Build a highlight overlay for a suggestion affecting specific walls.
 */
export function buildSuggestionHighlight(
  wallIds: string[],
  layout: SpatialLayout,
  colour: number = COLOURS.suggestion_highlight
): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: colour,
    transparent: true,
    opacity: 0.35,
    roughness: 0.5,
    side: THREE.DoubleSide,
  });

  for (const wallId of wallIds) {
    const wall = layout.walls.find((w) => w.id === wallId);
    if (!wall) continue;

    const storey = wall.storey ?? 0;
    const base = storeyBaseElevation(layout, storey);
    const height =
      wall.height_m && wall.height_m > 0
        ? wall.height_m
        : storeyHeight(layout, storey);
    const length = wallLength(wall);
    const thickness = (wall.thickness || 0.09) + 0.05;
    const geometry = new THREE.BoxGeometry(length, height + 0.1, thickness);
    const mesh = new THREE.Mesh(geometry, material);
    const mid = wallMidpoint(wall);
    const angle = wallAngle(wall);
    mesh.position.set(mid.x, base + height / 2, mid.y);
    mesh.rotation.y = -angle;
    group.add(mesh);
  }

  return group;
}

/**
 * Public storey helpers for renderers (floor-selector UI, room-label
 * elevation). Re-exported through ./index alongside buildFloorPlan3D.
 */
export function getStoreyBaseElevation(layout: SpatialLayout, storey: number): number {
  return storeyBaseElevation(layout, storey);
}

export function getTopStoreyIndex(layout: SpatialLayout): number {
  return topStoreyIndex(layout);
}

/** Inter-floor slab/structure gap between one storey's ceiling and the next
 *  storey's floor (metres). Kept consistent with the elevation maths below. */
const SLAB_THICKNESS = 0.2;

/**
 * Floor-to-ceiling height (m) for a given storey. Prefers the matching
 * `storey_details[]` entry, then falls back to `layout.wall_height`, then 2.4.
 */
function storeyHeight(layout: SpatialLayout, storey: number): number {
  const sd = layout.storey_details?.find((s) => s.level === storey);
  if (sd?.floor_to_ceiling_m && sd.floor_to_ceiling_m > 0) {
    return sd.floor_to_ceiling_m;
  }
  return layout.wall_height || 2.4;
}

/**
 * Y elevation (m) at which `storey`'s floor sits — the cumulative height of
 * every storey below it plus an inter-floor slab gap per level. Ground
 * (storey 0) sits at 0. This is what stacks upper floors above lower ones
 * instead of extruding everything from the ground as a single tall box.
 */
function storeyBaseElevation(layout: SpatialLayout, storey: number): number {
  let base = 0;
  for (let s = 0; s < storey; s++) {
    base += storeyHeight(layout, s) + SLAB_THICKNESS;
  }
  return base;
}

/**
 * Highest storey index actually present — derived from the walls/rooms (which
 * carry the real storey tags) as well as the declared `storeys` count, so the
 * roof lands on the top storey even if `storeys`/`storey_details` are stale.
 */
function topStoreyIndex(layout: SpatialLayout): number {
  let top = (layout.storeys ?? 1) - 1;
  for (const w of layout.walls) top = Math.max(top, w.storey ?? 0);
  for (const r of layout.rooms) top = Math.max(top, r.floor_level ?? 0);
  return Math.max(0, top);
}

/**
 * Y elevation (m) of the top of the building — where the roof starts. Equals
 * the top storey's base elevation plus its own floor-to-ceiling height. For a
 * single-storey layout this is just the wall height.
 */
function roofBaseHeight(layout: SpatialLayout): number {
  const top = topStoreyIndex(layout);
  return storeyBaseElevation(layout, top) + storeyHeight(layout, top);
}

export interface BuildFloorPlanOptions {
  /**
   * When set, render only the walls/rooms/openings on this storey index
   * (0 = ground). The roof is included only when this equals the top storey.
   * `null`/undefined renders every storey stacked (the default).
   */
  storeyFilter?: number | null;
}

/**
 * Main entry point: build complete 3D scene from spatial layout.
 *
 * Order: ground → floors → walls → openings → roof. Each wall/floor/opening
 * is placed at its storey's base elevation (storeyBaseElevation) and extruded
 * to that storey's own floor-to-ceiling height, so multi-storey plans render
 * as stacked floors rather than one tall box. The roof sits on top of the
 * topmost storey (roofBaseHeight). Per-wall `wall.height_m` still overrides.
 */
export function buildFloorPlan3D(
  layout: SpatialLayout,
  options: BuildFloorPlanOptions = {},
): THREE.Group {
  const group = new THREE.Group();
  const filter = options.storeyFilter ?? null;
  const top = topStoreyIndex(layout);

  // Ground plane
  group.add(buildGround(layout.bounds));

  // Room floors — each on its storey's slab
  for (const room of layout.rooms) {
    const storey = room.floor_level ?? 0;
    if (filter !== null && storey !== filter) continue;
    group.add(buildFloor(room, storeyBaseElevation(layout, storey)));
  }

  // Walls — extrude to the storey height, lifted to the storey's base.
  // Pass materials so external walls can pick up cladding colour.
  for (const wall of layout.walls) {
    const storey = wall.storey ?? 0;
    if (filter !== null && storey !== filter) continue;
    group.add(
      buildWall(
        wall,
        storeyHeight(layout, storey),
        layout.materials,
        storeyBaseElevation(layout, storey),
      ),
    );
  }

  // Openings (doors and windows) — follow their parent wall's storey
  for (const opening of layout.openings) {
    const parentWall = layout.walls.find((w) => w.id === opening.wall_id);
    const storey = parentWall?.storey ?? 0;
    if (filter !== null && storey !== filter) continue;
    const mesh = buildOpening(
      opening,
      storeyHeight(layout, storey),
      layout.walls,
      storeyBaseElevation(layout, storey),
    );
    if (mesh) group.add(mesh);
  }

  // Roof (if present) — sits on top of the top storey. Skipped when a lower
  // storey is isolated so the cutaway view isn't capped by the roof.
  if (filter === null || filter === top) {
    const roof = buildRoof(layout, roofBaseHeight(layout));
    if (roof) group.add(roof);
  }

  // Centre the model on origin for easier camera positioning
  const centreX = layout.bounds.width / 2;
  const centreZ = layout.bounds.depth / 2;
  group.position.set(-centreX, 0, -centreZ);

  return group;
}
