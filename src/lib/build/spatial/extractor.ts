/**
 * Piece 2: AI Vision Spatial Extraction
 *
 * Sends a floor plan image to Claude Vision and extracts structured spatial data
 * (walls, rooms, doors, windows with coordinates).
 *
 * This is the core R&D component — genuine technical uncertainty about whether
 * an LLM can accurately parse architectural floor plans into spatial coordinates.
 *
 * Note: Uses the Anthropic SDK directly (not via callModel) because vision
 * requires multi-part message content which the current router doesn't support.
 */

import { extractJson, ModelNonJsonResponseError } from "@/lib/ai/extract-json";
import { callVisionModel } from "./vision-call";
import type { AIFunction } from "@/lib/ai/models/registry";
import {
  MIN_READABLE_PLAN_BYTES,
  NO_READABLE_PLAN_MESSAGE,
  decodedBase64Bytes,
} from "@/lib/plans/file-kind";
import type {
  SpatialLayout,
  Roof,
  Storey,
  Materials,
} from "./types";

const SPATIAL_EXTRACTION_PROMPT = `You are an architectural plan analyser. Extract all spatial elements from this floor plan image as structured JSON.

INSTRUCTIONS:
1. Identify all rooms and their approximate boundaries as polygons (coordinates in metres from the bottom-left corner of the plan)
2. Identify all walls with start/end points and classify as external, internal, or party walls
3. Identify all openings (doors, windows, bifold doors, sliding doors, garage doors) with position and dimensions
4. Estimate the overall dimensions of the building footprint
5. If dimensions are annotated on the plan, use those. Otherwise estimate from proportions.
6. Use a consistent coordinate system with (0,0) at the bottom-left corner of the building footprint.

OUTPUT FORMAT — return ONLY valid JSON matching this schema:
{
  "rooms": [
    { "id": "r1", "name": "Living", "polygon": [{"x":0,"y":0},{"x":6,"y":0},{"x":6,"y":4},{"x":0,"y":4}], "area_m2": 24, "floor_level": 0, "type": "living" }
  ],
  "walls": [
    { "id": "w1", "start": {"x":0,"y":0}, "end": {"x":6,"y":0}, "thickness": 0.09, "type": "external", "material": "timber_frame" }
  ],
  "openings": [
    { "id": "o1", "type": "door", "position": {"x":3,"y":0}, "width": 0.82, "height": 2.04, "wall_id": "w1" },
    { "id": "o2", "type": "window", "position": {"x":1.5,"y":4}, "width": 1.2, "height": 1.2, "wall_id": "w3", "sill_height": 0.9 }
  ],
  "bounds": { "min": {"x":0,"y":0}, "max": {"x":12,"y":10}, "width": 12, "depth": 10 },
  "storeys": 1,
  "wall_height": 2.4,
  "confidence": 0.85,
  "notes": "Dimensions estimated from room labels. Garage wall thickness assumed 0.2m."
}

GUIDELINES:
- Use metric units (metres) for all dimensions
- Standard Australian residential wall heights: 2.4m (ground), 2.7m (if specified)
- Standard stud wall thickness: 0.09m (internal), 0.11m (external with cladding)
- Brick veneer: 0.27m total, double brick: 0.25m
- If you cannot determine exact coordinates, provide your best estimate and lower the confidence score
- Room types: living, bedroom, bathroom, kitchen, laundry, garage, hallway, entry, study, dining, ensuite, wir (walk-in-robe), pantry, alfresco, porch
- Wall materials if identifiable: timber_frame, brick_veneer, double_brick, hebel, sip_panel, clt, steel_frame`;

const PDF_NATIVE_EXTRACTION_PROMPT = `You are an architectural plan analyser. You are looking at a PDF building plan set that may have many pages (cover sheet, site plan, floor plans, elevations, sections, schedules, etc.).

YOUR JOB IS TWO STEPS IN ONE CALL:

1. Identify the page number (1-indexed) of the PRIMARY FLOOR PLAN — the page that best shows a top-down view of the building with rooms, walls, doors, and windows. If multiple floor plans exist (ground floor / first floor), pick the GROUND floor.

2. From that floor plan page, extract the spatial layout as structured JSON.

WALL EXTRACTION IS CRITICAL — READ THIS CAREFULLY:

The most common failure mode in this task is **under-extracting walls**. The model identifies room positions and labels but treats each room as a floating polygon, skipping the internal partition walls between adjacent rooms. This produces sparse 3D renders with floating rooms and gaps in the outline.

DO NOT do this. Instead:

- **Trace every wall line in the drawing.** Architectural plans show walls as parallel line pairs (thick walls) or single bold lines (thin walls). Every visible wall segment becomes a wall in the output.
- **Every room polygon edge must correspond to a wall segment.** If Room A and Room B share a boundary, there is a WALL between them — extract it. If a polygon edge is on the building perimeter, it is an EXTERNAL wall.
- **Expect 2-3× more walls than rooms.** A typical residential plan with 12 rooms has 25-40 wall segments. If your output has fewer walls than rooms, you have under-extracted — go back and find the missing partitions.
- **External walls form the perimeter** (continuous loop around the building footprint).
- **Internal walls** are partitions between rooms or short stub walls (e.g. wing walls, bulkheads).
- **Party walls** apply only to attached/duplex/dual-occupancy buildings on shared boundaries.

USE YOUR EXTENDED THINKING TO WORK SYSTEMATICALLY:

Before writing the final JSON, walk through this checklist in your thinking:

1. **Perimeter pass.** Trace the outer building outline as a continuous closed loop. List each external wall segment with its endpoints. The perimeter MUST close — the last endpoint of the last external wall MUST equal the first endpoint of the first external wall. If there is a gap, you missed a wall.

2. **Room-by-room partition pass.** For every room you identify, list each of its boundary edges. Each edge is either (a) an external wall already listed in step 1, or (b) an internal partition shared with another room, or (c) an internal partition forming a corridor. Add every (b) and (c) to the wall list. Two adjacent rooms share ONE wall — list it once.

3. **Stub-wall pass.** Look for short wall segments that don't fully partition a room: wing walls beside doors, bulkheads, kitchen islands, robe walls. Add each.

4. **Opening pass.** For each door, window, slider, bifold, garage door — locate it on its parent wall and link via wall_id.

5. **Self-check.** Count: rooms = R, walls = W. If W < 2×R, you have under-extracted. Return to step 2 and find the missing partitions before finalising. Do not output JSON with W < 2×R unless you have a specific reason (e.g. open-plan studio) and noted it in \`notes\`.

Only after all five passes complete in your thinking, write the final JSON output.

DATA FORMAT:

- Rooms as closed polygons with metres coordinates from the bottom-left corner of the building.
- Walls with start/end points — each wall is a single line segment. A long external wall with a window in it counts as ONE wall (the opening is a separate \`opening\` entry referring to the wall_id).
- Openings (doors, windows, bifold, sliding doors, garage doors) with position + dimensions, each linked to a \`wall_id\`.
- Overall building bounds + storey count + wall height.
- If dimensions are annotated on the plan, use them. Otherwise estimate from proportions and standard Australian residential conventions.

OUTPUT FORMAT — return ONLY valid JSON matching this schema:
{
  "detectedPage": 5,
  "totalPages": 35,
  "rooms": [
    { "id": "r1", "name": "Living", "polygon": [{"x":0,"y":0},{"x":6,"y":0},{"x":6,"y":4},{"x":0,"y":4}], "area_m2": 24, "floor_level": 0, "type": "living" }
  ],
  "walls": [
    { "id": "w1", "start": {"x":0,"y":0}, "end": {"x":6,"y":0}, "thickness": 0.09, "type": "external", "material": "timber_frame" }
  ],
  "openings": [
    { "id": "o1", "type": "door", "position": {"x":3,"y":0}, "width": 0.82, "height": 2.04, "wall_id": "w1" }
  ],
  "bounds": { "min": {"x":0,"y":0}, "max": {"x":12,"y":10}, "width": 12, "depth": 10 },
  "storeys": 1,
  "wall_height": 2.4,
  "confidence": 0.85,
  "notes": "Extracted from page 5 of 35. Dimensions taken from the plan annotations."
}

If you cannot find any floor plan in the PDF, return:
{ "detectedPage": null, "totalPages": <n>, "rooms": [], "walls": [], "openings": [], "bounds": {"min":{"x":0,"y":0},"max":{"x":0,"y":0},"width":0,"depth":0}, "storeys": 0, "wall_height": 0, "confidence": 0, "notes": "No floor plan found in inspected pages." }

GUIDELINES (same as image extraction):
- Metric units (metres) for all dimensions
- Standard Australian residential wall heights: 2.4m (ground), 2.7m (if specified)
- Standard stud wall thickness: 0.09m (internal), 0.11m (external with cladding)
- Brick veneer: 0.27m, double brick: 0.25m
- Room types: living, bedroom, bathroom, kitchen, laundry, garage, hallway, entry, study, dining, ensuite, wir, pantry, alfresco, porch
- Wall materials if identifiable: timber_frame, brick_veneer, double_brick, hebel, sip_panel, clt, steel_frame`;

export type PdfFloorPlanExtraction = {
  layout: SpatialLayout | null;
  detectedPage: number | null;
  totalPages: number | null;
  error?: string;
};

/**
 * Extract a floor plan from a multi-page PDF in a single Sonnet call,
 * using Anthropic's native PDF support. No local PDF rasterisation — the
 * model reads the PDF directly. Returns the spatial layout plus the
 * detected floor plan page number for diagnostic reporting.
 *
 * @param pdfBase64 - Base64-encoded PDF file (max 32 MB raw, 100 pages)
 * @param options.pageHint - If provided, focus the model on this 1-indexed page rather than auto-detecting
 * @param options.context - Optional questionnaire context to bias extraction
 */
export async function extractFloorPlanFromPdf(
  pdfBase64: string,
  options?: { pageHint?: number; context?: string },
): Promise<PdfFloorPlanExtraction> {
  // Input guard — never send the model a blank/near-empty document. An empty
  // payload makes Claude reply with prose ("please upload the plan"), which the
  // JSON parser then reports as an opaque "Failed to extract JSON". Fail fast
  // with the real reason, before any messages.create.
  const decodedBytes = decodedBase64Bytes(pdfBase64);
  if (decodedBytes < MIN_READABLE_PLAN_BYTES) {
    console.error(
      `[extractFloorPlanFromPdf] empty/near-empty plan input (${decodedBytes} bytes) — skipping model call`,
    );
    return {
      layout: null,
      detectedPage: null,
      totalPages: null,
      error: NO_READABLE_PLAN_MESSAGE,
    };
  }

  const contextBlock = options?.context
    ? `\n\nADDITIONAL CONTEXT FROM QUESTIONNAIRE:\n${options.context}`
    : "";

  const userText = options?.pageHint
    ? `Focus on PDF page ${options.pageHint}. Treat that page as the floor plan and extract its spatial layout. Set detectedPage to ${options.pageHint} in the response. Return only the JSON structure.`
    : "Find the primary floor plan page in this PDF and extract its spatial layout. Return only the JSON structure.";

  try {
    // Routed through callVisionModel → Claude first, GPT-4o fallback when
    // Claude is unavailable (SCRUM-290). Anthropic reads the PDF natively; the
    // GPT-4o leg rasterises pages (capped/​hinted) via the injected rasteriser.
    const result = await callVisionModel("plan_vision", {
      system: PDF_NATIVE_EXTRACTION_PROMPT + contextBlock,
      messages: [
        {
          role: "user",
          content:
            userText +
            "\n\nUse extended thinking to walk through the five-pass checklist before writing the JSON. The final assistant message must contain ONLY the JSON object — no preamble, no markdown fences. Start with { and end with }.",
        },
      ],
      pdf: { data: Buffer.from(pdfBase64, "base64") },
      pdfPageHint: options?.pageHint,
      thinkingBudget: 4000,
      maxTokens: 10000,
    });

    const fullText = result.text;
    if (!fullText) {
      return {
        layout: null,
        detectedPage: null,
        totalPages: null,
        error: "Model returned no text content",
      };
    }

    type PdfExtractionShape = {
      detectedPage: number | null;
      totalPages: number | null;
      rooms: SpatialLayout["rooms"];
      walls: SpatialLayout["walls"];
      openings: SpatialLayout["openings"];
      bounds: SpatialLayout["bounds"];
      storeys: number;
      wall_height: number;
      confidence: number;
      notes?: string;
    };

    let parsed: PdfExtractionShape;
    try {
      parsed = extractJson<PdfExtractionShape>(fullText);
    } catch (parseErr) {
      console.error(
        "[extractFloorPlanFromPdf] JSON parse failed. Response preview:",
        fullText.slice(0, 500),
      );
      // Branch on the typed error so the persisted reason reflects the REAL
      // cause — a model refusal/empty response (a content failure) vs genuinely
      // malformed JSON — rather than a generic "non-JSON response" for both.
      if (parseErr instanceof ModelNonJsonResponseError) {
        return {
          layout: null,
          detectedPage: null,
          totalPages: null,
          error: parseErr.userMessage,
        };
      }
      return {
        layout: null,
        detectedPage: null,
        totalPages: null,
        error: `Model returned non-JSON response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
      };
    }

    if (parsed.detectedPage == null || !parsed.rooms || !parsed.walls) {
      return {
        layout: null,
        detectedPage: parsed.detectedPage,
        totalPages: parsed.totalPages,
        error: parsed.notes ?? "No floor plan found in PDF",
      };
    }

    const layout: SpatialLayout = {
      rooms: parsed.rooms,
      walls: parsed.walls,
      openings: parsed.openings ?? [],
      bounds: parsed.bounds,
      storeys: parsed.storeys,
      wall_height: parsed.wall_height,
      confidence: parsed.confidence,
      notes: parsed.notes,
    };

    return {
      layout,
      detectedPage: parsed.detectedPage,
      totalPages: parsed.totalPages,
    };
  } catch (err) {
    console.error("[extractFloorPlanFromPdf] failed:", err);
    return {
      layout: null,
      detectedPage: null,
      totalPages: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Extract spatial layout from a floor plan image using Claude Vision.
 *
 * @param imageBase64 - Base64-encoded floor plan image (PNG/JPG)
 * @param mediaType - MIME type of the image
 * @param context - Optional context from questionnaire (e.g. building class, dimensions)
 * @returns Structured spatial layout or null if extraction fails
 */
export async function extractSpatialLayout(
  imageBase64: string,
  mediaType: "image/png" | "image/jpeg" = "image/png",
  context?: string
): Promise<SpatialLayout | null> {
  // Input guard — a blank/near-empty image makes the model ask for the plan
  // instead of returning JSON. Fail fast (null is this function's existing
  // failure shape) before any messages.create.
  const decodedBytes = decodedBase64Bytes(imageBase64);
  if (decodedBytes < MIN_READABLE_PLAN_BYTES) {
    console.error(
      `[extractSpatialLayout] empty/near-empty image input (${decodedBytes} bytes) — skipping model call`,
    );
    return null;
  }

  const contextBlock = context
    ? `\n\nADDITIONAL CONTEXT FROM QUESTIONNAIRE:\n${context}`
    : "";

  try {
    // Routed through callVisionModel → Claude first, GPT-4o fallback (SCRUM-290).
    // Image vision is provider-neutral (no rasterise needed).
    const result = await callVisionModel("plan_vision", {
      system: SPATIAL_EXTRACTION_PROMPT + contextBlock,
      messages: [
        {
          role: "user",
          content:
            "Extract all spatial elements from this floor plan. Return only the JSON structure.",
        },
      ],
      images: [{ data: Buffer.from(imageBase64, "base64"), mimeType: mediaType }],
      maxTokens: 8192,
    });

    // Parse the JSON response — handle markdown code fences
    let jsonStr = (result.text ?? "").trim();
    if (!jsonStr) {
      console.error("Spatial extraction: no text response");
      return null;
    }
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(jsonStr) as SpatialLayout;

    // Basic validation
    if (!parsed.rooms || !parsed.walls || !parsed.bounds) {
      console.error("Spatial extraction: missing required fields");
      return null;
    }

    return parsed;
  } catch (error) {
    console.error("Spatial extraction failed:", error);
    return null;
  }
}

// ============================================================================
// Per-page-type extractors for v2-v4 (elevations / sections / schedule).
// All consume the full PDF + a page hint and use extended thinking.
// ============================================================================

const ELEVATION_PROMPT = `You are an architectural plan analyser looking at a multi-page PDF. Focus on the page indicated by the user — it is an elevation drawing (a side view of the building).

Extract roof and exterior envelope data from this elevation.

WHAT TO LOOK FOR:

1. **Roof form** — from the silhouette:
   - "gable" = symmetric triangle with vertical end-walls
   - "hip" = pyramid-like, all sides slope toward ridge
   - "skillion" = single sloped plane
   - "flat" = horizontal top (pitch < 2 deg)
   - "mansard" = double-pitch (steep lower / shallow upper)
   - "complex" = combined / multiple roof forms

2. **Roof pitch** — angle in degrees. Common Australian residential:
   - Hip / gable: 22-30 deg
   - Skillion: 5-15 deg
   - Flat: 0-2 deg
   If annotated (e.g. "22.5°", "5°"), use the annotation. Otherwise estimate from the silhouette.

3. **Eave overhang** — horizontal projection of the roof beyond the wall face in metres. Typical 0.45-0.6m for Australian residential. 0 for parapet / box-eave designs.

4. **Wall height** — external wall height in metres (ground to wall plate). Typical 2.4m, 2.7m, or 3.0m. If multi-storey, the TOTAL height visible in this elevation.

5. **Cladding** — visible exterior material:
   - "brick_veneer" — brick pattern
   - "weatherboard" — horizontal timber boards
   - "render" — smooth painted surface (sometimes called "rendered" or "acrylic render")
   - "hebel" — large smooth panel joints
   - "metal_cladding" — corrugated or standing seam
   - "fibre_cement" — sheet cladding (e.g. Scyon)
   - "mixed" — multiple cladding types
   Note the dominant one.

6. **Roof material** — "colorbond" (sheet metal), "tile" (concrete or terracotta), "metal_deck", "membrane" (flat).

7. **Window frame** — "aluminium", "timber", "upvc" (rare in AUS).

8. **Cardinal direction** if labelled (N / S / E / W).

USE EXTENDED THINKING:
- Trace the roof silhouette first. Identify ridge line(s), eave lines, pitch angles.
- Identify cladding regions and dominant material.
- Read any annotations / labels (pitch, height, material schedules referenced).

OUTPUT FORMAT — return ONLY valid JSON:
{
  "pageNumber": 7,
  "cardinal": "N",
  "roof": {
    "form": "hip",
    "pitch_deg": 22.5,
    "eave_overhang_m": 0.6,
    "material": "colorbond",
    "colour": "#3a3a3a"
  },
  "external_wall_height_m": 2.7,
  "cladding": "brick_veneer",
  "cladding_colour": "#a85b3a",
  "window_frame": "aluminium",
  "confidence": 0.85,
  "notes": "Pitch annotated 22.5°. Brick veneer to lower 1.2m, weatherboard above."
}

If you cannot extract any roof or wall data from this page (e.g. wrong page type), return:
{ "pageNumber": <n>, "confidence": 0, "notes": "Page is not an elevation or unreadable" }

No preamble, no markdown fences — just the JSON.`;

const SECTION_PROMPT = `You are an architectural plan analyser looking at a multi-page PDF. Focus on the page indicated by the user — it is a SECTION drawing (a vertical slice through the building).

Extract storey heights and floor-to-ceiling dimensions.

WHAT TO LOOK FOR:

1. **Number of storeys** visible in the section.
2. **Floor-to-ceiling height** for each storey in metres. Common: 2.4m, 2.55m, 2.7m, 3.0m. If annotated, use the annotation.
3. **Floor-to-floor height** (slab to slab) — typically floor_to_ceiling + 0.2m for joists/slab.
4. **Ceiling type** per storey: "flat", "raked" (sloped), "vaulted" (cathedral).
5. **Ridge height** above wall top (for roof structure) — useful if elevations don't show pitch annotation.

USE EXTENDED THINKING:
- Read every dimension annotation. Section drawings are dimensioned more reliably than elevations.
- Identify slab levels, plate levels (top of wall), ridge level.
- Compute heights even if not annotated — section drawings usually use a consistent scale.

OUTPUT FORMAT — return ONLY valid JSON:
{
  "pageNumber": 12,
  "storeys": [
    { "id": "s0", "level": 0, "floor_to_ceiling_m": 2.7, "floor_height_m": 0, "ceiling_type": "flat" },
    { "id": "s1", "level": 1, "floor_to_ceiling_m": 2.55, "floor_height_m": 2.9, "ceiling_type": "raked" }
  ],
  "ridge_height_above_top_plate_m": 2.4,
  "confidence": 0.9,
  "notes": "Ground floor 2.7m, first floor 2.55m raked to ridge. Total height 8.4m to ridge."
}

If you cannot extract section data, return:
{ "pageNumber": <n>, "storeys": [], "confidence": 0, "notes": "Page is not a section or unreadable" }

No preamble — just the JSON.`;

const SCHEDULE_PROMPT = `You are an architectural plan analyser looking at a multi-page PDF. Focus on the page indicated by the user — it is a SCHEDULE OF FINISHES or materials schedule.

Extract default exterior material specifications.

WHAT TO LOOK FOR:

1. **External wall cladding** — what's specified as the default wall material.
2. **Wall colour** — Dulux / Resene / Taubmans colour name or hex if shown. Convert colour names to approximate hex if possible (e.g. "Monument" = #232a30, "Surfmist" = #e7e0d4).
3. **Roof material** — Colorbond, tile, etc.
4. **Roof colour** — Colorbond colour name (e.g. "Monument", "Woodland Grey", "Surfmist", "Basalt") with hex equivalent.
5. **Window frame** material and colour.

USE EXTENDED THINKING:
- Read every row of the schedule. Most schedules use a key-value table format.
- Identify Colorbond colour names — they map to specific hex codes. Approximate if not exact.

OUTPUT FORMAT — return ONLY valid JSON:
{
  "pageNumber": 15,
  "materials": {
    "wall_default": "brick_veneer",
    "wall_colour": "#a85b3a",
    "roof_material": "colorbond",
    "roof_colour": "#3a3a3a",
    "window_frame": "aluminium",
    "window_colour": "#232a30"
  },
  "confidence": 0.85,
  "notes": "Walls: Austral Bricks 'Burlesque' charcoal. Roof: Colorbond 'Monument'. Windows: Black anodised aluminium."
}

If page is not a schedule, return:
{ "pageNumber": <n>, "confidence": 0, "notes": "Page is not a schedule or unreadable" }

No preamble — just the JSON.`;

export type ElevationExtraction = {
  pageNumber: number;
  cardinal?: "N" | "S" | "E" | "W";
  roof?: Partial<Roof>;
  external_wall_height_m?: number;
  cladding?: string;
  cladding_colour?: string;
  window_frame?: string;
  confidence: number;
  notes?: string;
};

export type SectionExtraction = {
  pageNumber: number;
  storeys: Storey[];
  ridge_height_above_top_plate_m?: number;
  confidence: number;
  notes?: string;
};

export type ScheduleExtraction = {
  pageNumber: number;
  materials?: Materials;
  confidence: number;
  notes?: string;
};

type PagePartialConfig = {
  /** Router function → model tier + Claude→OpenAI fallback chain. Defaults to
   *  the cheap classifier tier (plan_page_classify: haiku → gpt-4o-mini). */
  fn?: AIFunction;
  /** Output token cap. Defaults to 4000. */
  maxTokens?: number;
  /** Optional extended-thinking budget (also raises max_tokens to fit). */
  thinkingBudget?: number;
};

/**
 * Generic per-page extractor — sends a single-page PDF and a task-specific
 * system prompt. Returns parsed JSON or null on failure.
 *
 * The orchestrator now passes a single-page PDF (not the full set), so most
 * tasks are tightly scoped. Haiku 4.5 is the default — fast enough to stay
 * inside Vercel's edge connection-close window. Callers can opt into Sonnet
 * + extended thinking for higher-stakes visual reasoning (e.g. elevation
 * roof-form detection).
 */
async function extractPagePartial<T>(
  pdfBase64: string,
  pageNumber: number,
  systemPrompt: string,
  config: PagePartialConfig = {},
): Promise<T | null> {
  const fn = config.fn ?? "plan_page_classify";
  const maxTokens = config.maxTokens ?? 4000;

  // Input guard — skip the model call when the per-page PDF is empty/unreadable
  // (e.g. a failed pdf-lib page split returned a near-zero-byte document).
  const decodedBytes = decodedBase64Bytes(pdfBase64);
  if (decodedBytes < MIN_READABLE_PLAN_BYTES) {
    console.error(
      `[extractPagePartial] empty/near-empty page input (${decodedBytes} bytes, page ${pageNumber}) — skipping model call`,
    );
    return null;
  }

  try {
    // Single-page PDF → routed through callVisionModel (Claude→GPT-4o fallback,
    // SCRUM-290). pdfPageHint=1 because the orchestrator already split this to
    // one page, so the OpenAI leg rasterises just that page.
    const result = await callVisionModel(fn, {
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `This PDF contains the architectural page to analyse (originally page ${pageNumber} of the source set). Return ONLY the JSON object — no preamble, no markdown fences.`,
        },
      ],
      pdf: { data: Buffer.from(pdfBase64, "base64") },
      pdfPageHint: 1,
      maxTokens,
      ...(config.thinkingBudget ? { thinkingBudget: config.thinkingBudget } : {}),
    });
    return result.text ? extractJson<T>(result.text) : null;
  } catch (err) {
    console.error("[extractPagePartial] failed:", err);
    return null;
  }
}

/**
 * Elevation extraction is the highest-stakes per-page task: it determines
 * roof.form, pitch, eaves, and exterior cladding — the bits that make the
 * 3D viewer look like an actual house. Haiku can't reliably read a roof
 * silhouette and infer "this is a gable at 22.5°"; that's real visual
 * reasoning. So elevation runs on Sonnet with extended thinking.
 *
 * Single-page PDF + 4000-token thinking budget = ~15-20s per call, parallel.
 */
export function extractElevation(
  pdfBase64: string,
  pageNumber: number,
): Promise<ElevationExtraction | null> {
  return extractPagePartial<ElevationExtraction>(
    pdfBase64,
    pageNumber,
    ELEVATION_PROMPT,
    {
      fn: "plan_vision",
      maxTokens: 8000,
      thinkingBudget: 4000,
    },
  );
}

export function extractSection(
  pdfBase64: string,
  pageNumber: number,
): Promise<SectionExtraction | null> {
  return extractPagePartial<SectionExtraction>(
    pdfBase64,
    pageNumber,
    SECTION_PROMPT,
  );
}

export function extractSchedule(
  pdfBase64: string,
  pageNumber: number,
): Promise<ScheduleExtraction | null> {
  return extractPagePartial<ScheduleExtraction>(
    pdfBase64,
    pageNumber,
    SCHEDULE_PROMPT,
  );
}
