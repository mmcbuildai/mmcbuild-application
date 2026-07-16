/**
 * IFC (.ifc) export of a Build design — the Revit / BIM hand-off (SCRUM-53).
 *
 * Emits an IFC 2x3 STEP Physical File (ISO-10303-21) by hand off the AI-extracted
 * SpatialLayout — the same pure-string-builder pattern as dae-exporter.ts /
 * dxf-exporter.ts, so it runs in a plain serverless route with no native binary
 * or WASM. IFC is the industry-standard path INTO Revit: the user opens the .ifc
 * in Revit and saves it as a native .rvt (Revit cannot import .skp, and native
 * .rvt cannot be authored outside Revit — see docs/SCRUM-194-cad-export-feasibility.md).
 *
 * Scope (v1): walls as extruded swept solids (IfcWall) grouped by storey, and
 * room floors as IfcSlab. Openings are NOT yet cut as real IfcOpeningElement
 * voids (Phase 2). Units are SI metres, matching SpatialLayout.
 *
 * Coordinate system: SpatialLayout X/Y (metres) map to IFC world X/Y; storeys
 * are stacked in +Z at storey * wall_height. Z is up.
 *
 * NOTE: the Revit round-trip (open .ifc → save .rvt) is the human acceptance
 * gate — it must be confirmed by someone with Revit before this is signed off.
 */

import type { SpatialLayout, Wall, Room } from "@/lib/build/spatial/types";

export interface IfcExportInput {
  layout: SpatialLayout;
  projectName: string;
  reportId: string;
  /** Seconds since epoch for IfcOwnerHistory; injectable for deterministic tests. */
  timestampSeconds?: number;
}

const DEFAULT_WALL_HEIGHT_M = 2.4;
const DEFAULT_WALL_THICKNESS_M = 0.09;
const FLOOR_SLAB_THICKNESS_M = 0.15;

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** IFC REAL literal — always carries a decimal point. */
function r(n: number): string {
  return (Number.isFinite(n) ? n : 0).toFixed(6);
}

/** IFC STRING literal body (single quotes doubled, non-ASCII stripped). */
function s(str: string): string {
  return (str ?? "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/'/g, "''");
}

const IFC_GUID_CHARS =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

/**
 * Deterministic 22-character IFC GlobalId derived from a seed string. Encodes a
 * seed-hashed 128-bit value as base-64 over the IFC GUID alphabet (MSB first,
 * 22 digits — the top digit is 0..3). Deterministic so exports are reproducible
 * and unit-testable; uniqueness comes from the per-entity seed.
 */
function ifcGuid(seed: string): string {
  // 16 deterministic bytes from the seed (FNV-1a-ish expansion).
  const bytes: number[] = new Array(16).fill(0);
  let h = 0x811c9dc5;
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < seed.length; j++) {
      h ^= seed.charCodeAt(j) + i * 131;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    bytes[i] = h & 0xff;
  }
  // Big-endian base-256 → base-64, 22 digits.
  let num = bytes.slice();
  const digits: number[] = [];
  for (let d = 0; d < 22; d++) {
    let rem = 0;
    const q: number[] = [];
    for (let i = 0; i < num.length; i++) {
      const acc = rem * 256 + num[i];
      q.push(Math.floor(acc / 64));
      rem = acc % 64;
    }
    digits.push(rem);
    let k = 0;
    while (k < q.length - 1 && q[k] === 0) k++;
    num = q.slice(k);
  }
  digits.reverse();
  return digits.map((v) => IFC_GUID_CHARS[v]).join("");
}

// ---------------------------------------------------------------------------
// STEP writer — assigns sequential #ids, collects lines
// ---------------------------------------------------------------------------

class StepWriter {
  private id = 0;
  readonly lines: string[] = [];

  /** Emit `#id=body;` and return the `#id` reference. */
  add(body: string): string {
    this.id += 1;
    const ref = `#${this.id}`;
    this.lines.push(`${ref}=${body};`);
    return ref;
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function buildIfcFromLayout(input: IfcExportInput): string {
  const { layout, projectName, reportId } = input;
  const ts = input.timestampSeconds ?? Math.floor(Date.now() / 1000);
  const wallHeight =
    layout.wall_height > 0 ? layout.wall_height : DEFAULT_WALL_HEIGHT_M;

  const w = new StepWriter();

  // --- Shared geometry primitives (reused across the model) ---
  const originPt = w.add("IFCCARTESIANPOINT((0.,0.,0.))");
  const zAxis = w.add("IFCDIRECTION((0.,0.,1.))");
  const xAxis = w.add("IFCDIRECTION((1.,0.,0.))");
  const trueNorth = w.add("IFCDIRECTION((0.,1.))");
  const identity3D = w.add(
    `IFCAXIS2PLACEMENT3D(${originPt},${zAxis},${xAxis})`,
  );
  const worldPlacement = w.add(`IFCLOCALPLACEMENT($,${identity3D})`);

  // --- Units (SI metres) ---
  const lenUnit = w.add("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)");
  const areaUnit = w.add("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)");
  const volUnit = w.add("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)");
  const angleUnit = w.add("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)");
  const units = w.add(
    `IFCUNITASSIGNMENT((${lenUnit},${areaUnit},${volUnit},${angleUnit}))`,
  );

  // --- Representation context ---
  const context = w.add(
    `IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,${identity3D},${trueNorth})`,
  );

  // --- Owner history ---
  const person = w.add("IFCPERSON($,'MMC Build',$,$,$,$,$,$)");
  const org = w.add("IFCORGANIZATION($,'MMC Build',$,$,$)");
  const personOrg = w.add(`IFCPERSONANDORGANIZATION(${person},${org},$)`);
  const app = w.add(
    `IFCAPPLICATION(${org},'1.0','MMC Build','MMCBuild')`,
  );
  const owner = w.add(
    `IFCOWNERHISTORY(${personOrg},${app},$,.ADDED.,$,$,$,${ts})`,
  );

  // --- Spatial hierarchy: Project → Site → Building → Storeys ---
  const project = w.add(
    `IFCPROJECT('${ifcGuid("project-" + reportId)}',${owner},'${s(projectName)}',$,$,$,$,(${context}),${units})`,
  );

  const sitePlacement = w.add(
    `IFCLOCALPLACEMENT(${worldPlacement},${identity3D})`,
  );
  const site = w.add(
    `IFCSITE('${ifcGuid("site-" + reportId)}',${owner},'Site',$,$,${sitePlacement},$,$,.ELEMENT.,$,$,$,$,$)`,
  );
  const buildingPlacement = w.add(
    `IFCLOCALPLACEMENT(${sitePlacement},${identity3D})`,
  );
  const building = w.add(
    `IFCBUILDING('${ifcGuid("building-" + reportId)}',${owner},'${s(projectName)}',$,$,${buildingPlacement},$,$,.ELEMENT.,$,$,$)`,
  );

  // Which storeys exist? Union of declared count, wall storeys, room floors.
  const storeyIndices = new Set<number>([0]);
  for (let i = 0; i < Math.max(1, layout.storeys); i++) storeyIndices.add(i);
  for (const wall of layout.walls) storeyIndices.add(wall.storey ?? 0);
  for (const room of layout.rooms) storeyIndices.add(room.floor_level ?? 0);
  const storeyList = [...storeyIndices].sort((a, b) => a - b);

  const storeyPlacementByIndex = new Map<number, string>();
  const storeyRefByIndex = new Map<number, string>();
  for (const idx of storeyList) {
    const baseZ = idx * wallHeight;
    const storeyCS = w.add(
      `IFCAXIS2PLACEMENT3D(${w.add(`IFCCARTESIANPOINT((0.,0.,${r(baseZ)}))`)},${zAxis},${xAxis})`,
    );
    const placement = w.add(
      `IFCLOCALPLACEMENT(${buildingPlacement},${storeyCS})`,
    );
    const storey = w.add(
      `IFCBUILDINGSTOREY('${ifcGuid("storey-" + reportId + "-" + idx)}',${owner},'Level ${idx}',$,$,${placement},$,$,.ELEMENT.,${r(baseZ)})`,
    );
    storeyPlacementByIndex.set(idx, placement);
    storeyRefByIndex.set(idx, storey);
  }

  // --- Elements: walls + floor slabs, tracked per storey for containment ---
  const elementsByStorey = new Map<number, string[]>();
  const pushElement = (idx: number, ref: string) => {
    const arr = elementsByStorey.get(idx) ?? [];
    arr.push(ref);
    elementsByStorey.set(idx, arr);
  };

  for (const wall of layout.walls) {
    const storeyIdx = wall.storey ?? 0;
    const placement = storeyPlacementByIndex.get(storeyIdx);
    if (!placement) continue;
    const ref = emitWall(w, wall, layout, wallHeight, placement, {
      zAxis,
      xAxis,
      identity3D,
      context,
      owner,
      reportId,
    });
    if (ref) pushElement(storeyIdx, ref);
  }

  for (const room of layout.rooms) {
    const storeyIdx = room.floor_level ?? 0;
    const placement = storeyPlacementByIndex.get(storeyIdx);
    if (!placement) continue;
    const ref = emitFloorSlab(w, room, placement, {
      zAxis,
      xAxis,
      identity3D,
      context,
      owner,
      reportId,
    });
    if (ref) pushElement(storeyIdx, ref);
  }

  // --- Aggregation + containment relationships ---
  w.add(
    `IFCRELAGGREGATES('${ifcGuid("agg-proj-" + reportId)}',${owner},$,$,${project},(${site}))`,
  );
  w.add(
    `IFCRELAGGREGATES('${ifcGuid("agg-site-" + reportId)}',${owner},$,$,${site},(${building}))`,
  );
  const storeyRefs = storeyList
    .map((idx) => storeyRefByIndex.get(idx))
    .filter((x): x is string => Boolean(x));
  if (storeyRefs.length > 0) {
    w.add(
      `IFCRELAGGREGATES('${ifcGuid("agg-bldg-" + reportId)}',${owner},$,$,${building},(${storeyRefs.join(",")}))`,
    );
  }
  for (const idx of storeyList) {
    const els = elementsByStorey.get(idx);
    const storey = storeyRefByIndex.get(idx);
    if (!els || els.length === 0 || !storey) continue;
    w.add(
      `IFCRELCONTAINEDINSPATIALSTRUCTURE('${ifcGuid("contain-" + reportId + "-" + idx)}',${owner},$,$,(${els.join(",")}),${storey})`,
    );
  }

  return assembleStepFile(w.lines, projectName, reportId, ts);
}

// ---------------------------------------------------------------------------
// Element emitters
// ---------------------------------------------------------------------------

interface SharedRefs {
  zAxis: string;
  xAxis: string;
  identity3D: string;
  context: string;
  owner: string;
  reportId: string;
}

function emitWall(
  w: StepWriter,
  wall: Wall,
  layout: SpatialLayout,
  defaultHeight: number,
  storeyPlacement: string,
  shared: SharedRefs,
): string | null {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;

  const dirX = dx / len;
  const dirY = dy / len;
  const thickness = wall.thickness > 0 ? wall.thickness : DEFAULT_WALL_THICKNESS_M;
  const height = wall.height_m && wall.height_m > 0 ? wall.height_m : defaultHeight;

  // Wall local placement: origin at start, local +X along the wall run.
  const startPt = w.add(
    `IFCCARTESIANPOINT((${r(wall.start.x)},${r(wall.start.y)},0.))`,
  );
  const wallDir = w.add(`IFCDIRECTION((${r(dirX)},${r(dirY)},0.))`);
  const wallCS = w.add(
    `IFCAXIS2PLACEMENT3D(${startPt},${shared.zAxis},${wallDir})`,
  );
  const wallPlacement = w.add(
    `IFCLOCALPLACEMENT(${storeyPlacement},${wallCS})`,
  );

  // Rectangle profile: length along local X (offset so it spans 0..len), thickness along Y.
  const profileCentre = w.add(`IFCCARTESIANPOINT((${r(len / 2)},0.))`);
  const profileDir = w.add("IFCDIRECTION((1.,0.))");
  const profilePos = w.add(
    `IFCAXIS2PLACEMENT2D(${profileCentre},${profileDir})`,
  );
  const profile = w.add(
    `IFCRECTANGLEPROFILEDEF(.AREA.,$,${profilePos},${r(len)},${r(thickness)})`,
  );
  const solid = w.add(
    `IFCEXTRUDEDAREASOLID(${profile},${shared.identity3D},${shared.zAxis},${r(height)})`,
  );
  const shapeRep = w.add(
    `IFCSHAPEREPRESENTATION(${shared.context},'Body','SweptSolid',(${solid}))`,
  );
  const productShape = w.add(
    `IFCPRODUCTDEFINITIONSHAPE($,$,(${shapeRep}))`,
  );

  const label = `Wall ${wall.id}${wall.type ? ` (${wall.type})` : ""}`;
  return w.add(
    `IFCWALL('${ifcGuid("wall-" + shared.reportId + "-" + wall.id)}',${shared.owner},'${s(label)}',$,$,${wallPlacement},${productShape},$)`,
  );
}

function emitFloorSlab(
  w: StepWriter,
  room: Room,
  storeyPlacement: string,
  shared: SharedRefs,
): string | null {
  const poly = room.polygon;
  if (!poly || poly.length < 3) return null;

  // Closed polyline in plan coords (repeat first point to close).
  const ptRefs = poly.map((p) =>
    w.add(`IFCCARTESIANPOINT((${r(p.x)},${r(p.y)}))`),
  );
  ptRefs.push(ptRefs[0]);
  const polyline = w.add(`IFCPOLYLINE((${ptRefs.join(",")}))`);
  const profile = w.add(
    `IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${polyline})`,
  );

  // Slab sits just below the storey level (top face at z=0 of the storey).
  const slabBase = w.add(
    `IFCCARTESIANPOINT((0.,0.,${r(-FLOOR_SLAB_THICKNESS_M)}))`,
  );
  const slabCS = w.add(
    `IFCAXIS2PLACEMENT3D(${slabBase},${shared.zAxis},${shared.xAxis})`,
  );
  const solid = w.add(
    `IFCEXTRUDEDAREASOLID(${profile},${slabCS},${shared.zAxis},${r(FLOOR_SLAB_THICKNESS_M)})`,
  );
  const shapeRep = w.add(
    `IFCSHAPEREPRESENTATION(${shared.context},'Body','SweptSolid',(${solid}))`,
  );
  const productShape = w.add(
    `IFCPRODUCTDEFINITIONSHAPE($,$,(${shapeRep}))`,
  );
  const slabPlacement = w.add(
    `IFCLOCALPLACEMENT(${storeyPlacement},${shared.identity3D})`,
  );

  const label = `Floor: ${room.name || room.id}`;
  return w.add(
    `IFCSLAB('${ifcGuid("slab-" + shared.reportId + "-" + room.id)}',${shared.owner},'${s(label)}',$,$,${slabPlacement},${productShape},$,.FLOOR.)`,
  );
}

// ---------------------------------------------------------------------------
// STEP file envelope
// ---------------------------------------------------------------------------

function assembleStepFile(
  dataLines: string[],
  projectName: string,
  reportId: string,
  ts: number,
): string {
  const iso = new Date(ts * 1000).toISOString();
  const header = [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
    `FILE_NAME('mmc-build-${s(reportId)}.ifc','${iso}',(''),(''),'MMC Build','MMC Build','');`,
    "FILE_SCHEMA(('IFC2X3'));",
    "ENDSEC;",
    "DATA;",
  ];
  const footer = ["ENDSEC;", "END-ISO-10303-21;"];
  return [...header, ...dataLines, ...footer].join("\n") + "\n";
}
