/**
 * Sheet decomposer — Tier 2 fallback for CAD doc-set DWGs.
 *
 * When CloudConvert converts a DWG that was authored as a model-space dump
 * (multiple paper-space layouts arranged as tiles in one big canvas), the
 * standard page-classifier sees one busy page and can't match any single
 * page-type. The classifier gives up; the floor-plan extractor returns null;
 * the 3D viewer hides. This is the Manor Homes / Row Homes / Studio Johnston
 * / SAHA failure mode.
 *
 * This module fixes that case by:
 *   1. Rendering the busy page at high resolution
 *   2. Asking Claude vision to identify each drawing tile + classify it
 *   3. Trying floor-plan candidates in order of confidence × area
 *   4. For each, cropping just that bbox region and running the extractor
 *      with an explicit "verify-then-extract or return error" prompt
 *   5. Returning the first crop that produces a viable extraction
 *
 * Cost: ~$0.05-$0.15 per DWG file (one bbox detection call + up to 6
 * verify+extract calls). Only runs when the standard classifier fails, so
 * adds zero cost to single-drawing council DA PDFs.
 *
 * Gated by ENABLE_SHEET_DECOMPOSITION feature flag — off by default until
 * validated against more file samples.
 */

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { pdf as pdfToImg } from "pdf-to-img";
import { extractJson } from "@/lib/ai/extract-json";
import type { SpatialLayout } from "./types";

const BBOX_DETECTOR_MODEL = "claude-sonnet-4-6";
const EXTRACTOR_MODEL = "claude-sonnet-4-6";
const FULL_RENDER_SCALE = 6.0;
const BBOX_INPUT_WIDTH = 2400;
const PAD_PCT = 2;
const MAX_CANDIDATES_TO_TRY = 6;
const MIN_VIABLE_WALLS = 4;
const MIN_VIABLE_ROOMS = 1;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return client;
}

export interface DrawingRegion {
  type:
    | "floor_plan_ground"
    | "floor_plan_upper"
    | "elevation_n"
    | "elevation_s"
    | "elevation_e"
    | "elevation_w"
    | "elevation_other"
    | "section"
    | "roof_plan"
    | "schedule"
    | "site_plan"
    | "cover"
    | "details"
    | "title_block"
    | "other";
  bbox: { x: number; y: number; w: number; h: number };
  title?: string;
  confidence: number;
  evidence?: string;
}

export interface SheetDecompositionResult {
  layout: SpatialLayout | null;
  attempts: Array<{
    candidate: DrawingRegion;
    outcome:
      | { kind: "rejected"; detectedAs: string }
      | { kind: "extracted"; walls: number; rooms: number; confidence: number }
      | { kind: "error"; message: string };
  }>;
  drawingsDetected: number;
  error?: string;
}

const BBOX_PROMPT = `You are looking at a single PDF page rendered from a DWG. The DWG was exported in MODEL SPACE — multiple paper-space sheets have been arranged as TILES in one big canvas. Each tile is one complete drawing.

YOUR JOB: locate each TILE on the canvas and classify what drawing it contains.

CRITICAL TYPE DISTINCTIONS — read carefully:

- floor_plan_ground / floor_plan_upper:
  * Top-down view of building INTERIOR
  * MUST show internal partition walls (parallel lines or single bold lines between rooms)
  * MUST show distinct rooms (labelled "Living", "Bedroom", "Kitchen", or similar) OR clear room divisions
  * Drawing extent stops at building external walls — does NOT show lot boundaries, streets, neighbouring lots
  * If a drawing shows JUST a filled building footprint with no visible internal walls, it is a SITE PLAN not a floor plan

- site_plan: building shown as solid filled footprint or simple outline; surrounding lot boundaries / streets / neighbours visible; no internal walls or room labels

- elevation_n / s / e / w / other: side view of building, tall rectangle with facade + roof line + ground line; windows/doors visible

- section: vertical slice through building, often with hatching, internal floor/ceiling heights

- roof_plan: top-down view of the roof itself (ridges, hips, gutters)
- schedule: TABLE of items (doors, windows, fixtures, finishes)
- details: small construction details (joinery, junctions, wall sections)
- cover / title_block: title page, sheet index, revision table
- other: anything else

IMPORTANT — only return drawings with confidence >= 0.7. Be conservative on floor_plan_* tags — if you're not certain you see internal walls + room labels, tag as site_plan or other.

Output ONLY valid JSON (no markdown fences):

{
  "drawings": [
    { "type": "floor_plan_ground", "bbox": {"x":12,"y":18,"w":24,"h":20}, "title": "GROUND FLOOR PLAN", "confidence": 0.95, "evidence": "internal walls visible, rooms labelled" }
  ]
}

bbox is in PERCENTAGES (0-100) with origin TOP-LEFT. Add 2-3% padding so dimension lines aren't cut.`;

const VERIFY_EXTRACT_PROMPT = `You are analysing a cropped image from a CAD drawing set. The image was tagged as a potential floor plan but VERIFY before extracting.

A real FLOOR PLAN has:
- Top-down view of building interior
- Internal partition walls visible (parallel lines between rooms)
- Room labels (Living, Bedroom, Kitchen, etc.) OR clear room divisions
- Extent stops at building external walls (NOT showing lot, streets, neighbouring properties)

If the image is anything else (site plan, elevation, schedule, detail, cover sheet), return:
{"error":"not_a_floor_plan","detected":"site_plan|elevation|schedule|details|cover|other"}

If it IS a floor plan, extract:
{
  "walls": [{"id":"w1","start":{"x":0,"y":0},"end":{"x":6,"y":0},"thickness":0.09,"type":"external","material":"timber_frame"}],
  "rooms": [{"id":"r1","name":"Living","polygon":[{"x":0,"y":0},{"x":6,"y":0},{"x":6,"y":4},{"x":0,"y":4}],"area_m2":24,"floor_level":0,"type":"living"}],
  "openings": [{"id":"o1","type":"door","position":{"x":3,"y":0},"width":0.82,"height":2.04,"wall_id":"w1"}],
  "bounds":{"min":{"x":0,"y":0},"max":{"x":12,"y":10},"width":12,"depth":10},
  "wall_height":2.4,
  "storeys":1,
  "confidence":0.8,
  "notes":"..."
}

Trace EVERY wall segment — don't skip internal partitions. External walls form a closed perimeter loop. Use metres. Return ONLY JSON.`;

/**
 * Decompose a multi-drawing CAD sheet into individual drawings and extract
 * a SpatialLayout from the first floor-plan candidate that verifies.
 *
 * @param pdfBuffer - The CloudConvert-rendered PDF of a model-space DWG dump
 * @returns SheetDecompositionResult including the layout (if found) and
 *          per-candidate attempt log for debugging
 */
export async function decomposeSheetAndExtractFloorPlan(
  pdfBuffer: Buffer,
): Promise<SheetDecompositionResult> {
  const anthropic = getClient();
  const attempts: SheetDecompositionResult["attempts"] = [];

  // 1. Render at high resolution for cropping
  let fullPng: Buffer | null = null;
  try {
    const pages = await pdfToImg(pdfBuffer, { scale: FULL_RENDER_SCALE });
    for await (const img of pages) {
      fullPng = Buffer.from(img);
      break;
    }
  } catch (err) {
    return {
      layout: null,
      attempts,
      drawingsDetected: 0,
      error: `Page render failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!fullPng) {
    return { layout: null, attempts, drawingsDetected: 0, error: "No page rendered" };
  }

  const meta = await sharp(fullPng).metadata();
  if (!meta.width || !meta.height) {
    return { layout: null, attempts, drawingsDetected: 0, error: "Invalid page metadata" };
  }

  // 2. Downsample for bbox detection — Claude doesn't need 4800×3600 to find tiles
  const bboxInput = await sharp(fullPng)
    .resize(BBOX_INPUT_WIDTH, null, { fit: "inside" })
    .png()
    .toBuffer();

  // 3. Bbox detection call
  let drawings: DrawingRegion[] = [];
  try {
    const resp = await anthropic.messages.create({
      model: BBOX_DETECTOR_MODEL,
      max_tokens: 6000,
      thinking: { type: "enabled", budget_tokens: 4096 },
      system: BBOX_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: bboxInput.toString("base64") },
            },
            {
              type: "text",
              text: "Identify all drawing tiles. Be conservative on floor_plan_*. Return ONLY JSON.",
            },
          ],
        },
      ],
    });
    const text = resp.content.find((b) => b.type === "text");
    if (text && text.type === "text") {
      const parsed = extractJson<{ drawings: DrawingRegion[] }>(text.text);
      drawings = parsed?.drawings || [];
    }
  } catch (err) {
    return {
      layout: null,
      attempts,
      drawingsDetected: 0,
      error: `Bbox detection failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (drawings.length === 0) {
    return { layout: null, attempts, drawingsDetected: 0, error: "No drawing tiles detected" };
  }

  // 4. Filter to floor-plan candidates, sort by confidence × area
  const candidates = drawings
    .filter((d) => d.type === "floor_plan_ground" || d.type === "floor_plan_upper")
    .sort((a, b) => {
      const confDiff = b.confidence - a.confidence;
      if (Math.abs(confDiff) > 0.02) return confDiff;
      return b.bbox.w * b.bbox.h - a.bbox.w * a.bbox.h;
    });

  if (candidates.length === 0) {
    return {
      layout: null,
      attempts,
      drawingsDetected: drawings.length,
      error: "No floor-plan candidates among detected tiles",
    };
  }

  // 5. Iterate through candidates, return first that verifies + extracts
  for (let i = 0; i < Math.min(candidates.length, MAX_CANDIDATES_TO_TRY); i++) {
    const pick = candidates[i];
    const px = Math.max(0, Math.floor(((pick.bbox.x - PAD_PCT) / 100) * meta.width));
    const py = Math.max(0, Math.floor(((pick.bbox.y - PAD_PCT) / 100) * meta.height));
    const pw = Math.min(
      meta.width - px,
      Math.ceil(((pick.bbox.w + 2 * PAD_PCT) / 100) * meta.width),
    );
    const ph = Math.min(
      meta.height - py,
      Math.ceil(((pick.bbox.h + 2 * PAD_PCT) / 100) * meta.height),
    );

    let cropped: Buffer;
    try {
      cropped = await sharp(fullPng)
        .extract({ left: px, top: py, width: pw, height: ph })
        .png()
        .toBuffer();
    } catch (err) {
      attempts.push({
        candidate: pick,
        outcome: { kind: "error", message: `crop failed: ${err instanceof Error ? err.message : String(err)}` },
      });
      continue;
    }

    try {
      const resp = await anthropic.messages.create({
        model: EXTRACTOR_MODEL,
        max_tokens: 8192,
        thinking: { type: "enabled", budget_tokens: 4096 },
        system: VERIFY_EXTRACT_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: "image/png", data: cropped.toString("base64") },
              },
              {
                type: "text",
                text: "Verify floor plan + extract, or return not_a_floor_plan error. ONLY JSON.",
              },
            ],
          },
        ],
      });
      const text = resp.content.find((b) => b.type === "text");
      if (!text || text.type !== "text") {
        attempts.push({ candidate: pick, outcome: { kind: "error", message: "no text response" } });
        continue;
      }
      const parsed = extractJson<
        | { error: string; detected: string }
        | (SpatialLayout & { error?: undefined })
      >(text.text);

      if (!parsed) {
        attempts.push({ candidate: pick, outcome: { kind: "error", message: "JSON parse failed" } });
        continue;
      }
      if ("error" in parsed && parsed.error) {
        attempts.push({
          candidate: pick,
          outcome: { kind: "rejected", detectedAs: (parsed as { detected: string }).detected },
        });
        continue;
      }

      const layout = parsed as SpatialLayout;
      const w = layout.walls?.length || 0;
      const r = layout.rooms?.length || 0;

      attempts.push({
        candidate: pick,
        outcome: { kind: "extracted", walls: w, rooms: r, confidence: layout.confidence ?? 0 },
      });

      if (w >= MIN_VIABLE_WALLS && r >= MIN_VIABLE_ROOMS) {
        return {
          layout,
          attempts,
          drawingsDetected: drawings.length,
        };
      }
    } catch (err) {
      attempts.push({
        candidate: pick,
        outcome: { kind: "error", message: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  return {
    layout: null,
    attempts,
    drawingsDetected: drawings.length,
    error: `Tried ${attempts.length}/${candidates.length} candidates, none produced a viable floor plan`,
  };
}
