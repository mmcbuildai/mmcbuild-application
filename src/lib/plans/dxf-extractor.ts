/**
 * DXF parser → structured layer / entity / annotation data.
 *
 * Used by the plan ingestion pipeline after DWG → DXF conversion. The output
 * is stored in plans.extracted_layers and consumed by downstream features
 * (3D vectoring, questionnaire auto-fill, compliance auto-derivation).
 */

import DxfParser from "dxf-parser";
import type { SpatialLayout, Wall } from "@/lib/build/spatial/types";

export interface LayerSummary {
  /** Layer name as defined in the CAD file (e.g. "Walls", "A-WALL", "Doors"). */
  name: string;
  /** Total entities on this layer. */
  entityCount: number;
  /** Breakdown by entity type — LINE / POLYLINE / TEXT / INSERT etc. */
  entityTypes: Record<string, number>;
}

export interface BlockReference {
  /** Block name (e.g. "DOOR_1000", "WIN_2400", "TOILET"). */
  name: string;
  /** Number of insertions of this block in the drawing. */
  count: number;
  /** Layer the insertions sit on, when consistent. */
  layer?: string;
}

export interface ExtractedLayers {
  layers: LayerSummary[];
  /** All TEXT / MTEXT contents concatenated, deduped, trimmed. */
  textAnnotations: string[];
  blocks: BlockReference[];
  /** Best-effort counts of common building elements derived from blocks/layers. */
  derived: {
    likelyDoorCount: number | null;
    likelyWindowCount: number | null;
    likelyRoomCount: number | null;
  };
  /** Total entity count across the drawing — sanity metric. */
  totalEntities: number;
}

interface DxfPoint {
  x: number;
  y: number;
  z?: number;
}

interface DxfEntity {
  type: string;
  layer?: string;
  text?: string;
  name?: string;
  /** LINE entities — DXF Point3D in drawing units. */
  startPoint?: DxfPoint;
  endPoint?: DxfPoint;
  /** LWPOLYLINE / POLYLINE vertices in drawing units. */
  vertices?: DxfPoint[];
  /** Whether the polyline forms a closed loop. */
  shape?: boolean;
}

interface DxfDocument {
  entities?: DxfEntity[];
  header?: { $INSUNITS?: number };
  tables?: {
    layer?: {
      layers?: Record<string, { name?: string }>;
    };
  };
}

const DOOR_BLOCK_RE = /\b(door|dr|d-?\d{3,4})\b/i;
const WINDOW_BLOCK_RE = /\b(window|win|wd|w-?\d{3,4})\b/i;
const ROOM_LABEL_RE =
  /^(bed(?:room)?|bath(?:room)?|kitchen|living|dining|study|office|laundry|wc|toilet|garage|hall|entry|pantry|ensuite|robe|wir|family|rumpus|theatre|alfresco|porch|deck|stair|landing|void)/i;

export function extractLayersFromDxf(dxfBuffer: Buffer): ExtractedLayers | null {
  const parser = new DxfParser();
  const text = dxfBuffer.toString("utf-8");

  let parsed: DxfDocument;
  try {
    parsed = parser.parseSync(text) as unknown as DxfDocument;
  } catch (err) {
    console.error("[dxf-extractor] parseSync failed:", err);
    return null;
  }

  const entities = parsed.entities ?? [];

  // 1. Per-layer aggregation
  const layerMap = new Map<string, LayerSummary>();
  const declaredLayers = parsed.tables?.layer?.layers ?? {};
  for (const layer of Object.values(declaredLayers)) {
    const name = layer?.name;
    if (name && !layerMap.has(name)) {
      layerMap.set(name, { name, entityCount: 0, entityTypes: {} });
    }
  }

  for (const ent of entities) {
    const layerName = ent.layer ?? "0";
    let summary = layerMap.get(layerName);
    if (!summary) {
      summary = { name: layerName, entityCount: 0, entityTypes: {} };
      layerMap.set(layerName, summary);
    }
    summary.entityCount++;
    summary.entityTypes[ent.type] = (summary.entityTypes[ent.type] ?? 0) + 1;
  }

  // 2. Text annotations (TEXT + MTEXT)
  const annotationSet = new Set<string>();
  for (const ent of entities) {
    if ((ent.type === "TEXT" || ent.type === "MTEXT") && typeof ent.text === "string") {
      const trimmed = ent.text.trim();
      if (trimmed) annotationSet.add(trimmed);
    }
  }
  const textAnnotations = Array.from(annotationSet);

  // 3. Block references (INSERT entities) — count by block name
  const blockMap = new Map<string, BlockReference>();
  for (const ent of entities) {
    if (ent.type === "INSERT" && ent.name) {
      const existing = blockMap.get(ent.name);
      if (existing) {
        existing.count++;
        if (existing.layer && existing.layer !== ent.layer) existing.layer = undefined;
      } else {
        blockMap.set(ent.name, { name: ent.name, count: 1, layer: ent.layer });
      }
    }
  }
  const blocks = Array.from(blockMap.values()).sort((a, b) => b.count - a.count);

  // 4. Derived counts (best-effort heuristics)
  const likelyDoorCount = countMatches(blocks, DOOR_BLOCK_RE);
  const likelyWindowCount = countMatches(blocks, WINDOW_BLOCK_RE);
  const likelyRoomCount = textAnnotations.filter((t) => ROOM_LABEL_RE.test(t)).length;

  return {
    layers: Array.from(layerMap.values()).sort((a, b) => b.entityCount - a.entityCount),
    textAnnotations,
    blocks,
    derived: {
      likelyDoorCount: likelyDoorCount > 0 ? likelyDoorCount : null,
      likelyWindowCount: likelyWindowCount > 0 ? likelyWindowCount : null,
      likelyRoomCount: likelyRoomCount > 0 ? likelyRoomCount : null,
    },
    totalEntities: entities.length,
  };
}

function countMatches(blocks: BlockReference[], re: RegExp): number {
  return blocks.reduce((sum, b) => (re.test(b.name) ? sum + b.count : sum), 0);
}

/**
 * DXF $INSUNITS values → metres-per-unit conversion factor. Defaults to mm
 * (the de-facto Australian residential CAD unit) when the header is missing
 * or unitless. AutoCAD's MEASUREMENT system variable affects this if INSUNITS
 * is 0, but mm is the safest pragmatic default for the AU market.
 */
function unitFactorToMetres(insunits: number | undefined): number {
  switch (insunits) {
    case 1:
      return 0.0254; // inches
    case 2:
      return 0.3048; // feet
    case 4:
      return 0.001; // millimetres
    case 5:
      return 0.01; // centimetres
    case 6:
      return 1.0; // metres
    default:
      return 0.001; // unitless / unknown → assume millimetres
  }
}

// Architects use very different layer naming conventions. Studio Johnston
// uses /\bwall\b/; SAHA uses "2. Architecturals$0.05/0.1/0.15" with no
// "wall" string anywhere; AIA standard is "A-WALL-*"; some practices use
// "ARC-PARTITION" etc. Include layers that match any of the common
// wall-bearing patterns. Exclude annotation / dim / hatch / text / title
// layers so we don't pick up labels and leader lines as walls.
// Dropped word boundaries entirely — SAHA uses "Architecturals" (plural)
// which trailing-\b breaks. Substring match is sufficient because the
// EXCLUDE regex filters annotation/dim/text/etc. cases.
const WALL_LAYER_INCLUDE_RE =
  /(wall|a-?wall|partition|architectural|model[_-]?space|construct|building|footprint|outline)/i;
const WALL_LAYER_EXCLUDE_RE =
  /(annotation|dim|dimension|text|hatch|leader|title|legend|north|grid|axis|symbol|furniture|equipment|electrical|plumb|hydraulic|mechanical|fire)/i;
const MIN_WALL_LENGTH_M = 0.3; // segments shorter than 30cm are usually annotations or hatching, not real walls
const MAX_WALL_LENGTH_M = 50; // segments longer than 50m are usually titleblock/sheet borders, not walls

interface RawSegment {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

/**
 * Extract a SpatialLayout from a DXF buffer by reading LINE / LWPOLYLINE
 * entities on wall-named layers. MVP scope: walls only — no rooms, no
 * openings, no roof. The caller composes the rest of the layout (e.g.
 * default roof, default wall height) from elsewhere.
 *
 * @returns SpatialLayout with walls array, or null if no viable geometry
 *          could be found (file unparseable, no wall-layer entities, or
 *          extracted entities are below MIN_VIABLE thresholds).
 */
export function extractSpatialLayoutFromDxf(
  dxfBuffer: Buffer,
): SpatialLayout | null {
  const parser = new DxfParser();
  const text = dxfBuffer.toString("utf-8");

  let parsed: DxfDocument;
  try {
    parsed = parser.parseSync(text) as unknown as DxfDocument;
  } catch (err) {
    console.error("[extractSpatialLayoutFromDxf] parseSync failed:", err);
    return null;
  }

  const entities = parsed.entities ?? [];
  const unitFactor = unitFactorToMetres(parsed.header?.$INSUNITS);

  // 1. Filter to wall-bearing LINE + LWPOLYLINE / POLYLINE entities.
  // Layer must MATCH the wall-include regex AND NOT match the exclude regex.
  const segments: RawSegment[] = [];
  for (const ent of entities) {
    if (!ent.layer) continue;
    if (WALL_LAYER_EXCLUDE_RE.test(ent.layer)) continue;
    if (!WALL_LAYER_INCLUDE_RE.test(ent.layer)) continue;

    if (ent.type === "LINE" && ent.startPoint && ent.endPoint) {
      segments.push({
        start: { x: ent.startPoint.x, y: ent.startPoint.y },
        end: { x: ent.endPoint.x, y: ent.endPoint.y },
      });
      continue;
    }

    if (
      (ent.type === "LWPOLYLINE" || ent.type === "POLYLINE") &&
      Array.isArray(ent.vertices) &&
      ent.vertices.length >= 2
    ) {
      // Treat each adjacent vertex pair as a wall segment. If the polyline
      // is closed (shape=true), the last→first segment is also included.
      for (let i = 0; i < ent.vertices.length - 1; i++) {
        const a = ent.vertices[i];
        const b = ent.vertices[i + 1];
        segments.push({
          start: { x: a.x, y: a.y },
          end: { x: b.x, y: b.y },
        });
      }
      if (ent.shape && ent.vertices.length > 2) {
        const a = ent.vertices[ent.vertices.length - 1];
        const b = ent.vertices[0];
        segments.push({
          start: { x: a.x, y: a.y },
          end: { x: b.x, y: b.y },
        });
      }
    }
  }

  if (segments.length === 0) {
    console.log(
      "[extractSpatialLayoutFromDxf] no wall-layer entities matched",
    );
    return null;
  }

  // 2. Convert to metres + filter pathological segments
  const wallSegmentsM: RawSegment[] = [];
  for (const seg of segments) {
    const s = {
      x: seg.start.x * unitFactor,
      y: seg.start.y * unitFactor,
    };
    const e = {
      x: seg.end.x * unitFactor,
      y: seg.end.y * unitFactor,
    };
    const len = Math.hypot(e.x - s.x, e.y - s.y);
    if (len < MIN_WALL_LENGTH_M || len > MAX_WALL_LENGTH_M) continue;
    wallSegmentsM.push({ start: s, end: e });
  }

  if (wallSegmentsM.length < 4) {
    console.log(
      `[extractSpatialLayoutFromDxf] only ${wallSegmentsM.length} viable wall segments after filter — not enough for a layout`,
    );
    return null;
  }

  // 3. Compute bounds + normalise origin to (0,0)
  const xs = wallSegmentsM.flatMap((w) => [w.start.x, w.end.x]);
  const ys = wallSegmentsM.flatMap((w) => [w.start.y, w.end.y]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const depth = maxY - minY;

  // 4. Build Wall[] — naive classification: outermost segments = external,
  // rest = internal. Use a margin-of-bounds heuristic; refined later.
  const EXT_MARGIN_M = 0.5;
  const walls: Wall[] = wallSegmentsM.map((seg, i) => {
    const sx = seg.start.x - minX;
    const sy = seg.start.y - minY;
    const ex = seg.end.x - minX;
    const ey = seg.end.y - minY;
    const isExt =
      sx < EXT_MARGIN_M ||
      sy < EXT_MARGIN_M ||
      ex < EXT_MARGIN_M ||
      ey < EXT_MARGIN_M ||
      sx > width - EXT_MARGIN_M ||
      sy > depth - EXT_MARGIN_M ||
      ex > width - EXT_MARGIN_M ||
      ey > depth - EXT_MARGIN_M;
    return {
      id: `w${i + 1}`,
      start: { x: sx, y: sy },
      end: { x: ex, y: ey },
      thickness: isExt ? 0.11 : 0.09,
      type: isExt ? ("external" as const) : ("internal" as const),
      material: "timber_frame",
    };
  });

  return {
    walls,
    rooms: [],
    openings: [],
    bounds: {
      min: { x: 0, y: 0 },
      max: { x: width, y: depth },
      width,
      depth,
    },
    storeys: 1,
    wall_height: 2.4,
    confidence: 0.85,
    notes: `Extracted directly from DXF (walls only, ${walls.length} segments). Unit factor ${unitFactor} m/u from $INSUNITS=${parsed.header?.$INSUNITS ?? "missing"}.`,
  };
}

/**
 * Returns a flat text representation of the DXF — all annotations + a list of
 * layer/block names — suitable for chunking + embedding so the plan is
 * searchable by compliance retrieval the same way PDFs are.
 */
export function dxfToSearchableText(extracted: ExtractedLayers): string {
  const parts: string[] = [];
  parts.push("=== Building plan extracted from DXF ===");
  parts.push(`Total entities: ${extracted.totalEntities}`);
  parts.push("");
  parts.push("Layers:");
  for (const l of extracted.layers) {
    parts.push(
      `  - ${l.name} (${l.entityCount} entities: ${Object.entries(l.entityTypes)
        .map(([t, n]) => `${t}=${n}`)
        .join(", ")})`,
    );
  }
  parts.push("");
  if (extracted.blocks.length > 0) {
    parts.push("Block references:");
    for (const b of extracted.blocks.slice(0, 50)) {
      parts.push(`  - ${b.name} × ${b.count}${b.layer ? ` (layer: ${b.layer})` : ""}`);
    }
    parts.push("");
  }
  if (extracted.textAnnotations.length > 0) {
    parts.push("Text annotations:");
    for (const t of extracted.textAnnotations) {
      parts.push(`  - ${t}`);
    }
  }
  return parts.join("\n");
}
