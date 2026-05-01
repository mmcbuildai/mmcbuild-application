/**
 * DXF parser → structured layer / entity / annotation data.
 *
 * Used by the plan ingestion pipeline after DWG → DXF conversion. The output
 * is stored in plans.extracted_layers and consumed by downstream features
 * (3D vectoring, questionnaire auto-fill, compliance auto-derivation).
 */

import DxfParser from "dxf-parser";

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

interface DxfEntity {
  type: string;
  layer?: string;
  text?: string;
  name?: string;
}

interface DxfDocument {
  entities?: DxfEntity[];
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
