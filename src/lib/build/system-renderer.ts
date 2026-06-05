/**
 * MMC System Explorer renderer.
 *
 * Takes a SpatialLayout and renders it in one of four MMC system styles:
 *   - traditional (stick-built baseline)
 *   - panelised (factory panels with visible seams)
 *   - volumetric (modular boxes)
 *   - printed (3D-printed concrete with layer striations)
 *
 * The core trick: we call buildFloorPlan3D() to get the base geometry, then
 * walk the resulting Group and re-style its meshes per system. System-specific
 * overlays (panel seams, module wireframes, print striations) are added on
 * top as additional children.
 */

import * as THREE from "three";
import { buildFloorPlan3D } from "./spatial";
import type { SpatialLayout, Wall, Point2D } from "./spatial/types";

// ----------------------------------------------------------------------------
// System catalogue
// ----------------------------------------------------------------------------

export type MMCSystem = "traditional" | "panelised" | "volumetric" | "printed";

export interface SystemSpec {
  id: MMCSystem;
  label: string;
  tagline: string;
  /** Accent colour for the UI card border, label chip, overlays. Hex string. */
  accent: string;
  /** Subtitle under the label (e.g. "factory panels"). */
  subtitle: string;
}

export const SYSTEM_SPECS: Record<MMCSystem, SystemSpec> = {
  traditional: {
    id: "traditional",
    label: "Traditional",
    subtitle: "built brick-by-brick on site",
    tagline: "How your design would be built the conventional way.",
    accent: "#a85b3a",
  },
  panelised: {
    id: "panelised",
    label: "Panelised",
    subtitle: "factory panels, tilt up on site",
    tagline: "Walls + floors + roof arrive flat-packed, lifted into place.",
    accent: "#8b5cf6",
  },
  volumetric: {
    id: "volumetric",
    label: "Volumetric",
    subtitle: "modular boxes, craned into place",
    tagline: "Fully-finished rooms built off-site, delivered and installed.",
    accent: "#f59e0b",
  },
  printed: {
    id: "printed",
    label: "3D-printed concrete",
    subtitle: "printed on site, layer by layer",
    tagline: "Walls extruded in concrete by a gantry printer on your slab.",
    accent: "#3b82f6",
  },
};

// ----------------------------------------------------------------------------
// Pros / cons data (indicative — to be replaced with MMC Build's real numbers)
// ----------------------------------------------------------------------------

export interface SystemMetrics {
  /** Cost delta vs traditional, e.g. "+5%" or "-12%". */
  capex_delta: string;
  /** Weeks from slab to lockup. */
  time_to_lockup_weeks: string;
  /** % reduction in on-site labour hours vs traditional. */
  onsite_labour_reduction: string;
  /** Transport / site access summary. */
  transport: string;
  /** Suitability flags / gotchas. */
  suitability: string[];
  /** Headline pros. */
  pros: string[];
  /** Headline cons. */
  cons: string[];
}

export const SYSTEM_METRICS: Record<MMCSystem, SystemMetrics> = {
  traditional: {
    capex_delta: "baseline",
    time_to_lockup_weeks: "20–24 weeks",
    onsite_labour_reduction: "—",
    transport: "Standard trade deliveries",
    suitability: ["Works on any site", "No crane required"],
    pros: ["Familiar trades", "Highest design flexibility", "No factory lead time"],
    cons: ["Slow build", "Weather-exposed", "Site labour intensive"],
  },
  panelised: {
    capex_delta: "+3% to +8%",
    time_to_lockup_weeks: "6–10 weeks",
    onsite_labour_reduction: "≈40%",
    transport: "Flat-pack truck delivery; small crane for lift",
    suitability: ["Suits standard suburban lots", "Truck access required"],
    pros: ["~60% faster to lockup", "Factory precision = less waste", "Lower weather risk"],
    cons: ["Less on-site design change once panels cut", "Truck access needed for delivery"],
  },
  volumetric: {
    capex_delta: "-5% to +5%",
    time_to_lockup_weeks: "2–4 weeks on site",
    onsite_labour_reduction: "≈70%",
    transport: "Heavy haulage + medium crane (modules up to 3m × 12m)",
    suitability: ["Flat sites preferred", "Crane swing access mandatory", "Module size limited by road transport"],
    pros: ["Fastest install", "Interiors completed in factory", "Lowest on-site disruption"],
    cons: ["Crane site access required", "Module dimensions constrain plan", "Higher transport cost"],
  },
  printed: {
    capex_delta: "+8% to +15%",
    time_to_lockup_weeks: "3–6 weeks (printing) + finishing",
    onsite_labour_reduction: "≈50%",
    transport: "Gantry printer setup on slab; concrete pump truck",
    suitability: ["Single-storey works best", "Slab + level pad required", "Council acceptance still emerging in AU"],
    pros: ["No formwork or framing", "Curves and complex shapes 'free'", "Thermal mass advantage"],
    cons: ["Limited storeys in AU regulation", "Still emerging tech", "Higher upfront cost"],
  },
};

// ----------------------------------------------------------------------------
// Material palettes per system
// ----------------------------------------------------------------------------

interface SystemPalette {
  externalWall: number;
  internalWall: number;
  roof: number;
  ground: number;
  overlay: number;
}

const PALETTES: Record<MMCSystem, SystemPalette> = {
  traditional: {
    externalWall: 0xb0704a, // warm terracotta brick — clearly "masonry"
    internalWall: 0xe6e2dc,
    roof: 0x6b4632, // terracotta-tile brown
    ground: 0xe8e4dc,
    overlay: 0xa85b3a,
  },
  panelised: {
    externalWall: 0xf2efe9, // crisp factory-white panel
    internalWall: 0xf0ece6,
    roof: 0x55585c, // cool grey metal
    ground: 0xe8e4dc,
    overlay: 0x7c4dff, // strong violet seams
  },
  volumetric: {
    externalWall: 0xb9c4cf, // cool steel module skin
    internalWall: 0xc9d2da,
    roof: 0x4a5560,
    ground: 0xe8e4dc,
    overlay: 0xf59e0b, // amber module edges
  },
  printed: {
    externalWall: 0xbcae98, // raw concrete grey-beige
    internalWall: 0xc8bda8,
    roof: 0x3f3a33,
    ground: 0xe4e0d8,
    overlay: 0x2563eb, // blue
  },
};

// ----------------------------------------------------------------------------
// Helpers — re-implemented locally to avoid touching the existing geometry.ts
// ----------------------------------------------------------------------------

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

// ----------------------------------------------------------------------------
// Per-system overlays
// ----------------------------------------------------------------------------

const PANEL_WIDTH_M = 2.4; // AU-standard structural panel width

/**
 * Panel expression for the panelised system: every external wall is read as a
 * row of flat-pack panels. We draw VERTICAL seams at panel-width intervals plus
 * HORIZONTAL rails at the base, mid and head of the wall, so the wall clearly
 * reads as discrete factory panels rather than a continuous surface.
 */
function buildPanelSeams(
  layout: SpatialLayout,
  wallHeight: number,
): THREE.Group {
  const group = new THREE.Group();
  const seamMaterial = new THREE.MeshBasicMaterial({
    color: 0x3a3a40,
    transparent: true,
    opacity: 0.85,
  });
  const SEAM_W = 0.05; // visible groove width

  for (const wall of layout.walls) {
    if (wall.type !== "external") continue;
    const len = wallLength(wall);
    if (len < PANEL_WIDTH_M * 0.5) continue;

    const angle = wallAngle(wall);
    const mid = wallMidpoint(wall);
    const wallH = wall.height_m && wall.height_m > 0 ? wall.height_m : wallHeight;
    const seamThickness = (wall.thickness || 0.09) + 0.04;
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);

    // Vertical panel joints every PANEL_WIDTH_M
    const seamCount = Math.max(1, Math.round(len / PANEL_WIDTH_M));
    const seamSpacing = len / seamCount;
    for (let i = 1; i < seamCount; i++) {
      const t = i * seamSpacing - len / 2;
      const geo = new THREE.BoxGeometry(SEAM_W, wallH * 0.98, seamThickness);
      const seam = new THREE.Mesh(geo, seamMaterial);
      seam.position.set(mid.x + dirX * t, wallH / 2, mid.y + dirZ * t);
      seam.rotation.y = -angle;
      group.add(seam);
    }

    // Horizontal rails (base / mid / head) — a thin strip spanning the wall.
    for (const yFrac of [0.02, 0.5, 0.98]) {
      const geo = new THREE.BoxGeometry(len, SEAM_W, seamThickness);
      const rail = new THREE.Mesh(geo, seamMaterial);
      rail.position.set(mid.x, wallH * yFrac, mid.y);
      rail.rotation.y = -angle;
      group.add(rail);
    }
  }

  return group;
}

/**
 * Module boxes — the volumetric system is read as a set of fully-formed boxes
 * craned into place. We divide the footprint into ≈MODULE_W × MODULE_D cells
 * and render each as a SOLID shaded box, slightly inset so a visible gap (the
 * inter-module joint) shows between neighbours, with a bold accent edge frame.
 * This reads unmistakably as "transportable boxes", not a continuous shell.
 */
const MODULE_W = 3.6; // road-transportable module width
const MODULE_D = 6.0;
const MODULE_GAP = 0.18; // visible joint between modules

/** A single volumetric module's footprint + height, in layout coordinates. */
export interface ModulePlacement {
  /** Module centre X (layout space, 0..bounds.width). */
  cx: number;
  /** Module centre Z (layout space, 0..bounds.depth). */
  cz: number;
  /** Module width (inset by the inter-module gap). */
  w: number;
  /** Module depth (inset by the inter-module gap). */
  d: number;
  /** Module height incl. floor/ceiling cassette. */
  boxH: number;
}

/**
 * Compute the volumetric module grid for a layout — the same partitioning
 * buildModuleBoxes() renders, exposed so the build-sequence animation can place
 * and animate each module individually. Modules are ordered row-major.
 */
export function computeModulePlacements(
  layout: SpatialLayout,
  wallHeight: number,
): ModulePlacement[] {
  const { width, depth } = layout.bounds;
  // Longer side gets the long module dimension
  const cellW = width >= depth ? MODULE_D : MODULE_W;
  const cellD = width >= depth ? MODULE_W : MODULE_D;
  const cols = Math.max(1, Math.round(width / cellW));
  const rows = Math.max(1, Math.round(depth / cellD));
  const actualW = width / cols;
  const actualD = depth / rows;
  const boxH = wallHeight + 0.25;

  const placements: ModulePlacement[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      placements.push({
        cx: c * actualW + actualW / 2,
        cz: r * actualD + actualD / 2,
        w: actualW - MODULE_GAP,
        d: actualD - MODULE_GAP,
        boxH,
      });
    }
  }
  return placements;
}

function buildModuleBoxes(
  layout: SpatialLayout,
  wallHeight: number,
  skinColor: number,
  accent: number,
): THREE.Group {
  const group = new THREE.Group();
  const placements = computeModulePlacements(layout, wallHeight);

  const skinMaterial = new THREE.MeshStandardMaterial({
    color: skinColor,
    roughness: 0.6,
    metalness: 0.15,
    transparent: true,
    opacity: 0.5, // see the interior walls through the module skin
  });
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: accent,
    transparent: true,
    opacity: 0.95,
  });

  for (const p of placements) {
    const boxGeo = new THREE.BoxGeometry(p.w, p.boxH, p.d);
    const box = new THREE.Mesh(boxGeo, skinMaterial);
    box.position.set(p.cx, p.boxH / 2, p.cz);
    group.add(box);

    const frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(boxGeo),
      edgeMaterial,
    );
    frame.position.set(p.cx, p.boxH / 2, p.cz);
    group.add(frame);
  }

  return group;
}

/**
 * Procedural horizontal-stripe texture for 3D-printed walls. Generated once
 * per call; tiles vertically to match real-world layer height.
 */
let printTextureCache: THREE.CanvasTexture | null = null;
function getPrintLayerTexture(): THREE.CanvasTexture | null {
  if (printTextureCache) return printTextureCache;
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  // Base tone
  ctx.fillStyle = "#cfc8bc";
  ctx.fillRect(0, 0, 64, 64);
  // Horizontal stripes (≈4 visible per 64px = 4 print layers per 0.4m of wall)
  ctx.fillStyle = "#a89e8e";
  for (let y = 0; y < 64; y += 16) {
    ctx.fillRect(0, y, 64, 2);
  }
  // Subtle highlight
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  for (let y = 2; y < 64; y += 16) {
    ctx.fillRect(0, y, 64, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // Texture repeats: 1 tile = 0.4m of wall height, so 6 tiles per 2.4m wall.
  // Multiplied per-mesh below based on wall length.
  printTextureCache = tex;
  return tex;
}

/**
 * Print layer ridges — horizontal bands wrapped around every external wall at a
 * regular layer pitch, each protruding slightly proud of the wall face. Reads
 * as extruded concrete printed bead-by-bead. Geometry-level (not just texture)
 * so the striations survive at any zoom and on the silhouette.
 */
const PRINT_LAYER_PITCH_M = 0.18; // visible layer height

function buildPrintLayers(
  layout: SpatialLayout,
  wallHeight: number,
  color: number,
): THREE.Group {
  const group = new THREE.Group();
  const ridgeMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.95,
    metalness: 0.0,
  });

  for (const wall of layout.walls) {
    if (wall.type !== "external") continue;
    const len = wallLength(wall);
    if (len < 0.3) continue;
    const angle = wallAngle(wall);
    const mid = wallMidpoint(wall);
    const wallH = wall.height_m && wall.height_m > 0 ? wall.height_m : wallHeight;
    const thickness = (wall.thickness || 0.12) + 0.05; // proud of the face

    const layers = Math.max(2, Math.floor(wallH / PRINT_LAYER_PITCH_M));
    for (let i = 0; i < layers; i++) {
      // Alternate bands slightly taller so the ridges catch the light
      const bandH = PRINT_LAYER_PITCH_M * (i % 2 === 0 ? 0.6 : 0.4);
      const y = (i + 0.5) * (wallH / layers);
      const geo = new THREE.BoxGeometry(len, bandH, thickness);
      const ridge = new THREE.Mesh(geo, ridgeMaterial);
      ridge.position.set(mid.x, y, mid.y);
      ridge.rotation.y = -angle;
      group.add(ridge);
    }
  }

  return group;
}

// ----------------------------------------------------------------------------
// Material recolouring walker
// ----------------------------------------------------------------------------

/**
 * Walk the Group produced by buildFloorPlan3D and restyle each mesh per the
 * target system's palette.
 */
function restyleForSystem(group: THREE.Group, system: MMCSystem): void {
  const palette = PALETTES[system];

  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const ud = obj.userData;

    if (ud?.type === "wall") {
      // Recolour every wall with the system palette for visual coherence —
      // external vs internal is communicated by relative brightness.
      const newMat = new THREE.MeshStandardMaterial({
        color: palette.externalWall, // simplified; original code already
        // separates external vs internal — we override uniformly per system
        // for visual coherence
        roughness: 0.85,
        metalness: 0.05,
      });

      // System-specific material tweaks
      if (system === "printed") {
        const tex = getPrintLayerTexture();
        if (tex) {
          const cloned = tex.clone();
          cloned.needsUpdate = true;
          cloned.wrapS = THREE.RepeatWrapping;
          cloned.wrapT = THREE.RepeatWrapping;
          cloned.repeat.set(2, 6); // 6 vertical bands = 2.4m wall / 0.4m per band
          newMat.map = cloned;
          newMat.color.setHex(0xffffff); // let texture dominate
          newMat.roughness = 0.95;
        }
      }
      if (system === "panelised") {
        newMat.roughness = 0.75;
      }
      if (system === "volumetric") {
        newMat.color.setHex(palette.externalWall);
      }

      obj.material = newMat;
      return;
    }

    if (ud?.type === "floor") {
      // Slightly tint the floor to harmonise with the system palette
      if (obj.material instanceof THREE.MeshStandardMaterial) {
        const m = obj.material.clone();
        m.color.setHex(palette.ground);
        obj.material = m;
      }
      return;
    }

    if (ud?.type === "roof") {
      if (obj.material instanceof THREE.MeshStandardMaterial) {
        const m = obj.material.clone();
        m.color.setHex(palette.roof);
        m.roughness = 0.7;
        obj.material = m;
      }
      return;
    }

    if (ud?.type === "opening" && ud?.openingType === "window") {
      // Re-tint glass cooler in panelised/printed, warmer in traditional
      if (obj.material instanceof THREE.MeshStandardMaterial) {
        const m = obj.material.clone();
        m.color.setHex(system === "printed" ? 0x8aa8c4 : 0x9cb4d0);
        m.transparent = true;
        m.opacity = 0.45;
        obj.material = m;
      }
    }
  });
}

// ----------------------------------------------------------------------------
// Public entry point
// ----------------------------------------------------------------------------

/**
 * Build a 3D group for the given SpatialLayout rendered in the chosen
 * MMC system style. Returns a fresh Group every call (safe to render in
 * separate Canvas instances).
 */
export function buildFloorPlan3DForSystem(
  layout: SpatialLayout,
  system: MMCSystem,
): THREE.Group {
  const wallHeight = layout.wall_height || 2.4;

  // Start from the base geometry pipeline (gives us walls, roof, openings,
  // floors, ground — correctly centred)
  const group = buildFloorPlan3D(layout);

  // Recolour materials per system
  restyleForSystem(group, system);

  // Add system-specific overlays. They need to be centred the same way the
  // base group is — buildFloorPlan3D applies a `group.position.set(-cx, 0, -cz)`
  // translation as its final step, so overlays added as children are
  // automatically translated with the group.
  if (system === "panelised") {
    group.add(buildPanelSeams(layout, wallHeight));
  } else if (system === "volumetric") {
    group.add(
      buildModuleBoxes(
        layout,
        wallHeight,
        PALETTES.volumetric.externalWall,
        PALETTES.volumetric.overlay,
      ),
    );
  } else if (system === "printed") {
    group.add(buildPrintLayers(layout, wallHeight, PALETTES.printed.externalWall));
  }

  return group;
}
