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
 *   1. Sending the PDF natively to Claude vision to identify each drawing
 *      tile's bounding box + classify it
 *   2. Filtering to floor-plan candidates, sorted by confidence × area
 *   3. For each candidate: cropping the PDF's CropBox to that bbox region
 *      using pdf-lib, then sending the cropped single-page PDF natively to
 *      Claude with a verify-then-extract prompt
 *   4. Returning the first crop that produces a viable extraction
 *
 * No local raster rendering — uses Anthropic's native PDF document content
 * type throughout. Aligns with the project's "prefer native API over bundle
 * workarounds" rule, which was locked in after multiple commits trying to
 * make pdfjs-dist/pdf-to-img/@napi-rs/canvas bundle correctly on Vercel.
 *
 * Cost: ~$0.05-$0.15 per DWG file (one bbox detection call + up to 6
 * verify+extract calls). Only runs when the standard classifier fails, so
 * adds zero cost to single-drawing council DA PDFs.
 *
 * Gated by ENABLE_SHEET_DECOMPOSITION feature flag.
 */

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { PDFDocument } from "pdf-lib";
import { extractJson } from "@/lib/ai/extract-json";
import type { SpatialLayout } from "./types";

const BBOX_DETECTOR_MODEL = "claude-sonnet-4-6";
const EXTRACTOR_MODEL = "claude-sonnet-4-6";
const PAD_PCT = 2;
// Capped at 2 (was 6) so the decomposer fits inside Vercel's ~60s edge
// connection-close window. Two highest-confidence candidates run in
// parallel; first to produce a viable layout wins.
const MAX_CANDIDATES_TO_TRY = 2;
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

bbox is in PERCENTAGES (0-100) of the PDF page, with origin TOP-LEFT. Add 2-3% padding so dimension lines aren't cut.`;

const VERIFY_EXTRACT_PROMPT = `You are analysing a single page from a PDF. The page has been cropped to show one drawing that was tagged as a potential floor plan, but VERIFY before extracting.

A real FLOOR PLAN has:
- Top-down view of building interior
- Internal partition walls visible (parallel lines between rooms)
- Room labels (Living, Bedroom, Kitchen, etc.) OR clear room divisions
- Extent stops at building external walls (NOT showing lot, streets, neighbouring properties)

If the page is anything else (site plan, elevation, schedule, detail, cover sheet), return:
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
 * Take a single-page source PDF and produce a new single-page PDF whose
 * CropBox restricts the visible region to the given bbox (expressed as
 * percentages of the source page with origin TOP-LEFT, matching Claude's
 * bbox detector output). PDF coordinate space is bottom-left origin, so
 * the y axis flips during conversion.
 *
 * Returns a base64-encoded PDF, or null if pdf-lib couldn't copy/save the
 * page (defensive — some CAD-exported PDFs have malformed page objects).
 */
async function cropPdfPageToBbox(
  sourcePdfBytes: Uint8Array,
  bbox: { x: number; y: number; w: number; h: number },
): Promise<string | null> {
  try {
    const sourceDoc = await PDFDocument.load(sourcePdfBytes, {
      ignoreEncryption: true,
    });
    const out = await PDFDocument.create();
    const [copied] = await out.copyPages(sourceDoc, [0]);
    out.addPage(copied);

    const { width: pageW, height: pageH } = copied.getSize();
    const padX = (PAD_PCT / 100) * pageW;
    const padY = (PAD_PCT / 100) * pageH;
    const cropX = Math.max(0, (bbox.x / 100) * pageW - padX);
    const cropW = Math.min(
      pageW - cropX,
      (bbox.w / 100) * pageW + 2 * padX,
    );
    // Flip y: PDF origin is bottom-left, bbox origin is top-left
    const topPt = (bbox.y / 100) * pageH;
    const heightPt = (bbox.h / 100) * pageH;
    const cropYBottom = Math.max(0, pageH - topPt - heightPt - padY);
    const cropH = Math.min(pageH - cropYBottom, heightPt + 2 * padY);

    copied.setCropBox(cropX, cropYBottom, cropW, cropH);
    copied.setMediaBox(cropX, cropYBottom, cropW, cropH);

    const bytes = await out.save();
    return Buffer.from(bytes).toString("base64");
  } catch (err) {
    console.error("[cropPdfPageToBbox] failed:", err);
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
  const anthropic = getClient();
  const attempts: SheetDecompositionResult["attempts"] = [];
  const pdfBase64 = pdfBuffer.toString("base64");
  const sourceBytes = new Uint8Array(pdfBuffer);

  // 1. Bbox detection — send the PDF natively to Claude (no local raster)
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
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64,
              },
            },
            {
              type: "text",
              text: "Identify all drawing tiles on this PDF page. Be conservative on floor_plan_*. Return ONLY JSON.",
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

  // 2. Filter to floor-plan candidates, sort by confidence × area
  let candidates = drawings
    .filter(
      (d) => d.type === "floor_plan_ground" || d.type === "floor_plan_upper",
    )
    .sort((a, b) => {
      const confDiff = b.confidence - a.confidence;
      if (Math.abs(confDiff) > 0.02) return confDiff;
      return b.bbox.w * b.bbox.h - a.bbox.w * a.bbox.h;
    });

  // Last-resort fallback: if the detector found nothing it called a floor
  // plan (or nothing at all), synthesize a single whole-page candidate and
  // let the verify-extract pass have a go at the entire page. The standard
  // extractor already failed on the whole page with its own prompt, but the
  // decomposer's verify-extract prompt is more focused, so it sometimes
  // recovers cases like SAHA's Row Homes DWG where the rasterized model
  // space doesn't look like a tile grid.
  if (candidates.length === 0) {
    candidates = [
      {
        type: "floor_plan_ground",
        bbox: { x: 0, y: 0, w: 100, h: 100 },
        title: "whole-page fallback",
        confidence: 0.4,
        evidence: "synthesized — bbox detector found no floor-plan candidates",
      },
    ];
  }

  // 3. Run verify-extract on the top candidates IN PARALLEL so the
  // decomposer total latency is max(per-candidate) rather than sum(...).
  // Sequential would push us over the Vercel edge connection-close window.
  // Extended thinking is dropped on verify-extract — it's a simpler task
  // than bbox detection and not worth the latency.
  const picks = candidates.slice(0, MAX_CANDIDATES_TO_TRY);

  type CandidateAttempt = SheetDecompositionResult["attempts"][number];
  type CandidateResolution = {
    attempt: CandidateAttempt;
    viable: SpatialLayout | null;
  };

  async function runCandidate(
    pick: DrawingRegion,
  ): Promise<CandidateResolution> {
    const croppedPdfBase64 = await cropPdfPageToBbox(sourceBytes, pick.bbox);
    if (!croppedPdfBase64) {
      return {
        attempt: {
          candidate: pick,
          outcome: { kind: "error", message: "pdf-lib crop failed" },
        },
        viable: null,
      };
    }

    try {
      const resp = await anthropic.messages.create({
        model: EXTRACTOR_MODEL,
        max_tokens: 8192,
        system: VERIFY_EXTRACT_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: croppedPdfBase64,
                },
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
      >(text.text);

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

  const settled = await Promise.allSettled(picks.map(runCandidate));
  let winning: SpatialLayout | null = null;
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === "fulfilled") {
      attempts.push(r.value.attempt);
      if (!winning && r.value.viable) winning = r.value.viable;
    } else {
      attempts.push({
        candidate: picks[i],
        outcome: {
          kind: "error",
          message: r.reason instanceof Error ? r.reason.message : String(r.reason),
        },
      });
    }
  }

  if (winning) {
    return { layout: winning, attempts, drawingsDetected: drawings.length };
  }

  return {
    layout: null,
    attempts,
    drawingsDetected: drawings.length,
    error: `Tried ${attempts.length}/${candidates.length} candidates, none produced a viable floor plan`,
  };
}
