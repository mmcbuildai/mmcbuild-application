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
 *   1. Rasterising the PDF page to a HIGH-RESOLUTION PNG (CloudConvert, 300 DPI)
 *   2. Sending the raster to Claude vision to locate + classify each drawing
 *      tile's bounding box
 *   3. Filtering to floor-plan candidates, sorted by confidence × area
 *   4. For each candidate: cropping the high-res raster to that bbox with sharp,
 *      then sending the cropped PNG to Claude with a verify-then-extract prompt
 *   5. Returning the first crop that produces a viable extraction
 *
 * WHY RASTER, NOT NATIVE PDF: an earlier version sent the PDF natively and
 * cropped via pdf-lib's CropBox. That fails because the CloudConvert-rendered
 * model-space dump is a single small page (~800×600pt) with 30+ tiles — each
 * tile is ~100px, and pdf-lib cropping adds NO resolution. At that scale Claude
 * literally cannot read internal walls: on Manor Homes it tagged the house
 * floor plans as "bus interior layouts" and found zero floor-plan candidates.
 * Rendering at 300 DPI (→ ~3300×2500) then cropping makes every tile legible.
 *
 * Rasterisation is done via CloudConvert (a hard dependency of this pipeline
 * already) rather than a local rasteriser (pdf-to-img / @napi-rs/canvas), which
 * has a documented history of failing to bundle on Vercel — the original reason
 * this module avoided raster. CloudConvert (server-side) + sharp (reliable
 * native, used by Next image optimisation) keeps every step Vercel-safe.
 *
 * Cost: ~$0.06-$0.18 per DWG file (one PDF→PNG conversion + one bbox detection
 * call + up to MAX_CANDIDATES_TO_TRY verify+extract calls). Only runs when the
 * standard classifier fails, so adds zero cost to single-drawing council DA PDFs.
 *
 * Gated by ENABLE_SHEET_DECOMPOSITION feature flag (on by default; set to
 * "false" to disable).
 */

import "server-only";
import sharp from "sharp";
import { extractJson } from "@/lib/ai/extract-json";
import { rasterizePdfToPng } from "@/lib/plans/dwg-converter";
import { callVisionModel } from "./vision-call";
import type { SpatialLayout } from "./types";

const PAD_PCT = 2;
// 450 DPI on a typical ~800pt-wide CloudConvert page → ~5000px raster. At 300
// DPI (~3300px) the per-tile detail was too low and the verify-extract pass
// downgraded genuine floor plans to "site_plan" because internal walls blurred;
// ~5000px matches the scale-6 render that reliably extracted Manor Homes.
const RASTER_DPI = 450;
// Candidates tried (in parallel) by the verify-extract pass. Extraction runs
// inside an Inngest step with the full 300s Vercel invocation budget (not the
// old ~60s edge connection-close window), so we can afford to try several of
// the detected floor-plan tiles. They run concurrently, so wall-clock is
// ~max(per-candidate), not the sum.
const MAX_CANDIDATES_TO_TRY = 10;
// Candidates are tried in parallel chunks of this size — enough concurrency to
// be fast, capped so we don't fire 10 vision calls at once (rate limits).
const CANDIDATE_CHUNK_SIZE = 5;
const MIN_VIABLE_WALLS = 4;
const MIN_VIABLE_ROOMS = 1;


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

const BBOX_PROMPT = `You are looking at a high-resolution image rendered from a DWG. The DWG was exported in MODEL SPACE — multiple paper-space sheets have been arranged as TILES in one big canvas. Each tile is one complete drawing.

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

bbox is in PERCENTAGES (0-100) of the image, with origin TOP-LEFT. Add 2-3% padding so dimension lines aren't cut.`;

const VERIFY_EXTRACT_PROMPT = `You are looking at an image cropped to a single architectural drawing tile that has ALREADY been identified as a floor plan. Your job is to EXTRACT its spatial layout — default to extracting, not rejecting.

A floor plan is a top-down view with internal partition walls and rooms. The tile may show one dwelling or several units side by side — extract every wall and room you can see across the whole tile. Faint or thin lines still count as walls; small unlabelled spaces still count as rooms.

ONLY return a rejection if the image contains NO floor plan whatsoever — i.e. it is purely an elevation (side/facade view), a vertical section, a schedule/table, a cover/title sheet, or a bare site outline with no internal room divisions at all. In that case return:
{"error":"not_a_floor_plan","detected":"elevation|section|schedule|cover|site_plan|other"}

Otherwise (the normal case) extract:
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

/** Intersection-over-union of two percentage bboxes (origin top-left). */
function bboxIoU(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): number {
  const ix = Math.max(a.x, b.x);
  const iy = Math.max(a.y, b.y);
  const ix2 = Math.min(a.x + a.w, b.x + b.w);
  const iy2 = Math.min(a.y + a.h, b.y + b.h);
  const iw = Math.max(0, ix2 - ix);
  const ih = Math.max(0, iy2 - iy);
  const inter = iw * ih;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Drop near-duplicate candidates (the detector sometimes emits the same tile
 * twice). Keeps the first occurrence of any cluster of overlapping bboxes;
 * input must already be sorted best-first so the kept one is the strongest.
 */
function dedupeCandidates(cands: DrawingRegion[]): DrawingRegion[] {
  const kept: DrawingRegion[] = [];
  for (const c of cands) {
    if (!kept.some((k) => bboxIoU(k.bbox, c.bbox) > 0.5)) kept.push(c);
  }
  return kept;
}

/**
 * Crop a region (expressed as percentages of the source image, origin TOP-LEFT,
 * matching Claude's bbox output) out of a high-resolution PNG using sharp, with
 * PAD_PCT padding so dimension lines aren't clipped. Returns a base64 JPEG, or
 * null if the crop region is degenerate / sharp fails.
 */
async function cropRasterToBbox(
  raster: Buffer,
  width: number,
  height: number,
  bbox: { x: number; y: number; w: number; h: number },
): Promise<string | null> {
  try {
    const left = Math.max(0, Math.floor(((bbox.x - PAD_PCT) / 100) * width));
    const top = Math.max(0, Math.floor(((bbox.y - PAD_PCT) / 100) * height));
    const cropW = Math.min(
      width - left,
      Math.ceil(((bbox.w + 2 * PAD_PCT) / 100) * width),
    );
    const cropH = Math.min(
      height - top,
      Math.ceil(((bbox.h + 2 * PAD_PCT) / 100) * height),
    );
    if (cropW < 8 || cropH < 8) return null;

    const out = await sharp(raster)
      .extract({ left, top, width: cropW, height: cropH })
      .jpeg({ quality: 90 })
      .toBuffer();
    return out.toString("base64");
  } catch (err) {
    console.error("[cropRasterToBbox] failed:", err);
    return null;
  }
}

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
  const attempts: SheetDecompositionResult["attempts"] = [];

  // 1. Rasterise the PDF to a high-resolution PNG (Vercel-safe, server-side).
  const raster = await rasterizePdfToPng(pdfBuffer, RASTER_DPI);
  if ("error" in raster) {
    return {
      layout: null,
      attempts,
      drawingsDetected: 0,
      error: `PDF rasterisation failed: ${raster.error}`,
    };
  }
  const rasterBuf = raster.buffer;
  let rasterW: number;
  let rasterH: number;
  try {
    const meta = await sharp(rasterBuf).metadata();
    rasterW = meta.width ?? 0;
    rasterH = meta.height ?? 0;
    if (!rasterW || !rasterH) throw new Error("zero dimensions");
  } catch (err) {
    return {
      layout: null,
      attempts,
      drawingsDetected: 0,
      error: `Raster metadata read failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 2. Bbox detection — send a downscaled JPEG of the raster (Claude caps image
  // inputs at ~1568px on the long edge anyway, so a full-res send is wasted
  // bytes; detection works off the overall layout, not fine detail).
  let drawings: DrawingRegion[] = [];
  try {
    const detectJpeg = await sharp(rasterBuf).jpeg({ quality: 85 }).toBuffer();
    // Routed through callVisionModel → Claude first, GPT-4o fallback (SCRUM-290).
    const resp = await callVisionModel("plan_vision", {
      system: BBOX_PROMPT,
      messages: [
        {
          role: "user",
          content:
            "Identify all drawing tiles in this image. Be conservative on floor_plan_*. Return ONLY JSON.",
        },
      ],
      images: [{ data: detectJpeg, mimeType: "image/jpeg" }],
      thinkingBudget: 4096,
      maxTokens: 6000,
    });
    if (resp.text) {
      const parsed = extractJson<{ drawings: DrawingRegion[] }>(resp.text);
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

  // 3. Filter to floor-plan candidates, sort by confidence × area, dedupe
  let candidates = dedupeCandidates(
    drawings
      .filter(
        (d) => d.type === "floor_plan_ground" || d.type === "floor_plan_upper",
      )
      .sort((a, b) => {
        const confDiff = b.confidence - a.confidence;
        if (Math.abs(confDiff) > 0.02) return confDiff;
        return b.bbox.w * b.bbox.h - a.bbox.w * a.bbox.h;
      }),
  );

  // Last-resort fallback: if the detector found nothing it called a floor
  // plan, synthesize a single whole-image candidate and let the verify-extract
  // pass have a go at the entire raster.
  if (candidates.length === 0) {
    candidates = [
      {
        type: "floor_plan_ground",
        bbox: { x: 0, y: 0, w: 100, h: 100 },
        title: "whole-image fallback",
        confidence: 0.4,
        evidence: "synthesized — bbox detector found no floor-plan candidates",
      },
    ];
  }

  // 4. Run verify-extract on the candidates, cropped out of the HIGH-RES raster
  // (sharp) so each drawing is legible. Tried in parallel chunks: enough
  // candidates that a viable floor plan is reliably found even when the
  // top-ranked tiles get rejected by the verifier (the consistency failure mode
  // — a real plan ranked below a small cap), while capping concurrency.
  const toTry = candidates.slice(0, MAX_CANDIDATES_TO_TRY);

  type CandidateResolution = {
    attempt: SheetDecompositionResult["attempts"][number];
    viable: SpatialLayout | null;
  };

  async function runCandidate(
    pick: DrawingRegion,
  ): Promise<CandidateResolution> {
    const croppedBase64 = await cropRasterToBbox(
      rasterBuf,
      rasterW,
      rasterH,
      pick.bbox,
    );
    if (!croppedBase64) {
      return {
        attempt: {
          candidate: pick,
          outcome: { kind: "error", message: "sharp crop failed" },
        },
        viable: null,
      };
    }

    try {
      // Routed through callVisionModel → Claude first, GPT-4o fallback (SCRUM-290).
      const resp = await callVisionModel("plan_vision", {
        system: VERIFY_EXTRACT_PROMPT,
        messages: [
          {
            role: "user",
            content:
              "Verify floor plan + extract, or return not_a_floor_plan error. ONLY JSON.",
          },
        ],
        images: [
          { data: Buffer.from(croppedBase64, "base64"), mimeType: "image/jpeg" },
        ],
        maxTokens: 8192,
      });
      if (!resp.text) {
        return {
          attempt: {
            candidate: pick,
            outcome: { kind: "error", message: "no text response" },
          },
          viable: null,
        };
      }
      const parsed = extractJson<
        | { error: string; detected: string }
        | (SpatialLayout & { error?: undefined })
      >(resp.text);

      if (!parsed) {
        return {
          attempt: {
            candidate: pick,
            outcome: { kind: "error", message: "JSON parse failed" },
          },
          viable: null,
        };
      }
      if ("error" in parsed && parsed.error) {
        return {
          attempt: {
            candidate: pick,
            outcome: {
              kind: "rejected",
              detectedAs: (parsed as { detected: string }).detected,
            },
          },
          viable: null,
        };
      }

      const layout = parsed as SpatialLayout;
      const w = layout.walls?.length || 0;
      const r = layout.rooms?.length || 0;
      const viable =
        w >= MIN_VIABLE_WALLS && r >= MIN_VIABLE_ROOMS ? layout : null;

      return {
        attempt: {
          candidate: pick,
          outcome: {
            kind: "extracted",
            walls: w,
            rooms: r,
            confidence: layout.confidence ?? 0,
          },
        },
        viable,
      };
    } catch (err) {
      return {
        attempt: {
          candidate: pick,
          outcome: {
            kind: "error",
            message: err instanceof Error ? err.message : String(err),
          },
        },
        viable: null,
      };
    }
  }

  const viableLayouts: SpatialLayout[] = [];
  for (let start = 0; start < toTry.length; start += CANDIDATE_CHUNK_SIZE) {
    const chunk = toTry.slice(start, start + CANDIDATE_CHUNK_SIZE);
    const settled = await Promise.allSettled(chunk.map(runCandidate));
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      if (r.status === "fulfilled") {
        attempts.push(r.value.attempt);
        if (r.value.viable) viableLayouts.push(r.value.viable);
      } else {
        attempts.push({
          candidate: chunk[i],
          outcome: {
            kind: "error",
            message:
              r.reason instanceof Error ? r.reason.message : String(r.reason),
          },
        });
      }
    }
    // Stop as soon as a chunk yields any viable layout — no need to spend
    // calls on the remaining tiles.
    if (viableLayouts.length > 0) break;
  }

  if (viableLayouts.length > 0) {
    // Pick the richest plan (most walls + rooms) among the viable ones — the
    // fullest floor plan rather than just whichever resolved first.
    const winning = viableLayouts.sort(
      (a, b) =>
        (b.walls?.length ?? 0) +
        (b.rooms?.length ?? 0) -
        ((a.walls?.length ?? 0) + (a.rooms?.length ?? 0)),
    )[0];
    return { layout: winning, attempts, drawingsDetected: drawings.length };
  }

  return {
    layout: null,
    attempts,
    drawingsDetected: drawings.length,
    error: `Tried ${attempts.length}/${candidates.length} candidates, none produced a viable floor plan`,
  };
}
