/**
 * Piece 3: Spatial JSON → Three.js 3D Geometry
 *
 * Converts the AI-extracted spatial layout into Three.js meshes for rendering.
 * Pure geometry — no AI needed here.
 */

import * as THREE from "three";
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

  mesh.position.set(mid.x, height / 2, mid.y);
  mesh.rotation.y = -angle;

  mesh.userData = { type: "wall", wallId: wall.id, material: wall.material };
  return mesh;
}

/**
 * Build a floor polygon for a room.
 */
function buildFloor(room: Room): THREE.Mesh {
  if (room.polygon.length < 3) {
    // Fallback: create a small placeholder
    const geo = new THREE.PlaneGeometry(1, 1);
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xf5f0e8 }));
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
  mesh.position.y = 0.01; // slightly above ground to prevent z-fighting

  mesh.userData = { type: "floor", roomId: room.id, roomName: room.name };
  return mesh;
}

/**
 * Build an opening (door or window) as a coloured box cut into the wall.
 */
function buildOpening(opening: Opening, wallHeight: number, walls: Wall[]): THREE.Mesh | null {
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
    mesh.position.set(opening.position.x, sillHeight + height / 2, opening.position.y);
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
  mesh.position.set(opening.position.x, sillHeight + height / 2, opening.position.y);
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
 * builds the roof as a polygon extrusion that follows the actual building
 * outline. Height of the extrusion varies by roof form — flat gets a thin
 * slab, pitched forms extrude up to an approximated ridge height.
 *
 * Fallback path: if the perimeter polygon can't be computed (walls don't
 * form a closed loop), falls back to bounding-box-based roof shapes
 * (kept as buildFlatRoof / buildGableRoof / etc).
 *
 * Coordinate system: same as walls — x = right, z = depth (mapped from
 * layout y). baseHeight = top of the wall where the roof starts.
 *
 * TODO: true pitched roof on arbitrary polygons (gable ridge + hip
 * surfaces that follow the L-shape) is real CSG work — currently the
 * polygon path uses a flat-topped extrusion at the ridge height. The
 * footprint is correct; the silhouette doesn't show pitch lines yet.
 */
function buildRoof(
  layout: SpatialLayout,
  baseHeight: number,
): THREE.Object3D | null {
  const roof = layout.roof;
  if (!roof) return null;

  const pitchRad = Math.max(0, (roof.pitch_deg ?? 22.5)) * (Math.PI / 180);

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

  // Primary path: polygon-based roof following the wall outline.
  const polygon = computePerimeterPolygon(layout.walls);
  if (polygon) {
    return buildRoofFromPolygon(polygon, form, pitchRad, baseHeight, material);
  }

  // Fallback: bounding-box-based roof shapes (kept for plans where the
  // external wall list doesn't form a closed loop).
  const eave = Math.max(0, roof.eave_overhang_m ?? 0);
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
 * Build a roof as an extrusion of the perimeter polygon. Height varies
 * by roof form so steeper-pitched roofs visually sit taller above the
 * wall plate.
 */
function buildRoofFromPolygon(
  polygon: Point2D[],
  form: string,
  pitchRad: number,
  baseHeight: number,
  material: THREE.Material,
): THREE.Mesh {
  // Compute span for ridge-height estimate (used by pitched forms)
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const minSpan = Math.min(spanX, spanY);

  // Extrusion height: thin slab for flat, ~half-span × tan(pitch) for pitched
  // forms (approximates a roof block; true pitched gable/hip silhouette
  // on arbitrary polygons is a v2 refinement).
  let extrudeHeight: number;
  if (form === "flat") {
    extrudeHeight = 0.15;
  } else {
    extrudeHeight = Math.max(0.15, (minSpan / 2) * Math.tan(pitchRad));
  }

  const shape = new THREE.Shape();
  shape.moveTo(polygon[0].x, polygon[0].y);
  for (let i = 1; i < polygon.length; i++) {
    shape.lineTo(polygon[i].x, polygon[i].y);
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: extrudeHeight,
    bevelEnabled: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  // Rotate so the polygon (XY in shape space) lies on world XZ plane,
  // matching how buildFloor places room polygons. After this rotation the
  // extrusion direction (originally +Z) points along world -Y, so we
  // translate up by extrudeHeight to put the extrusion ABOVE baseHeight.
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = baseHeight + extrudeHeight;

  mesh.userData = { type: "roof", form, footprint: "polygon" };
  return mesh;
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
  walls: Wall[],
  wallHeight: number,
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
    const wall = walls.find((w) => w.id === wallId);
    if (!wall) continue;

    const length = wallLength(wall);
    const thickness = (wall.thickness || 0.09) + 0.05;
    const geometry = new THREE.BoxGeometry(length, wallHeight + 0.1, thickness);
    const mesh = new THREE.Mesh(geometry, material);
    const mid = wallMidpoint(wall);
    const angle = wallAngle(wall);
    mesh.position.set(mid.x, wallHeight / 2, mid.y);
    mesh.rotation.y = -angle;
    group.add(mesh);
  }

  return group;
}

/**
 * Compute total exterior wall height from optional storey_details.
 * Falls back to layout.wall_height (or 2.4) when storey_details is absent.
 * Used so a 2-storey building extrudes walls to the correct full height.
 */
function totalWallHeight(layout: SpatialLayout): number {
  if (layout.storey_details && layout.storey_details.length > 0) {
    const slabThickness = 0.2; // m between floors
    const total = layout.storey_details.reduce(
      (sum, s) => sum + (s.floor_to_ceiling_m || 2.4),
      0,
    );
    return total + slabThickness * (layout.storey_details.length - 1);
  }
  return layout.wall_height || 2.4;
}

/**
 * Main entry point: build complete 3D scene from spatial layout.
 *
 * Order: ground → floors → walls → openings → roof. Roof sits on top of
 * the tallest wall (totalWallHeight); each wall can override height via
 * wall.height_m.
 */
export function buildFloorPlan3D(layout: SpatialLayout): THREE.Group {
  const group = new THREE.Group();
  const wallHeight = totalWallHeight(layout);

  // Ground plane
  group.add(buildGround(layout.bounds));

  // Room floors
  for (const room of layout.rooms) {
    group.add(buildFloor(room));
  }

  // Walls — pass materials so external walls can pick up cladding colour
  for (const wall of layout.walls) {
    group.add(buildWall(wall, wallHeight, layout.materials));
  }

  // Openings (doors and windows)
  for (const opening of layout.openings) {
    const mesh = buildOpening(opening, wallHeight, layout.walls);
    if (mesh) group.add(mesh);
  }

  // Roof (if present) — sits on top of the wall height
  const roof = buildRoof(layout, wallHeight);
  if (roof) group.add(roof);

  // Centre the model on origin for easier camera positioning
  const centreX = layout.bounds.width / 2;
  const centreZ = layout.bounds.depth / 2;
  group.position.set(-centreX, 0, -centreZ);

  return group;
}
