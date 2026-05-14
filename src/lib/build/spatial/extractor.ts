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

import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "@/lib/ai/extract-json";
import type { SpatialLayout } from "./types";

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

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return client;
}

const PDF_NATIVE_EXTRACTION_PROMPT = `You are an architectural plan analyser. You are looking at a PDF building plan set that may have many pages (cover sheet, site plan, floor plans, elevations, sections, schedules, etc.).

YOUR JOB IS TWO STEPS IN ONE CALL:

1. Identify the page number (1-indexed) of the PRIMARY FLOOR PLAN — the page that best shows a top-down view of the building with rooms, walls, doors, and windows. If multiple floor plans exist (ground floor / first floor), pick the GROUND floor.

2. From that floor plan page, extract the spatial layout as structured JSON. Use the same rules as a normal architectural plan extraction:
   - Rooms as closed polygons with metres coordinates from the bottom-left corner of the building
   - Walls with start/end points classified as external | internal | party
   - Openings (doors, windows, bifold, sliding doors, garage doors) with position + dimensions
   - Overall building bounds + storey count + wall height
   - If dimensions are annotated, use them. Otherwise estimate from proportions.

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
  const contextBlock = options?.context
    ? `\n\nADDITIONAL CONTEXT FROM QUESTIONNAIRE:\n${options.context}`
    : "";

  const userText = options?.pageHint
    ? `Focus on PDF page ${options.pageHint}. Treat that page as the floor plan and extract its spatial layout. Set detectedPage to ${options.pageHint} in the response. Return only the JSON structure.`
    : "Find the primary floor plan page in this PDF and extract its spatial layout. Return only the JSON structure.";

  try {
    const anthropic = getClient();

    // Assistant prefill `{` forces Claude to continue the response as JSON
    // rather than starting with conversational preamble like "Looking at...".
    // The prefill is NOT echoed in response.content — we prepend it manually
    // before parsing.
    const PREFILL = "{";

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: PDF_NATIVE_EXTRACTION_PROMPT + contextBlock,
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
              text:
                userText +
                "\n\nRespond with ONLY the JSON object — no preamble, no explanation, no markdown fences. Start with { and end with }.",
            },
          ],
        },
        {
          role: "assistant",
          content: PREFILL,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return {
        layout: null,
        detectedPage: null,
        totalPages: null,
        error: "Model returned no text content",
      };
    }

    const fullText = PREFILL + textBlock.text;

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
  const contextBlock = context
    ? `\n\nADDITIONAL CONTEXT FROM QUESTIONNAIRE:\n${context}`
    : "";

  try {
    const anthropic = getClient();

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: SPATIAL_EXTRACTION_PROMPT + contextBlock,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: "Extract all spatial elements from this floor plan. Return only the JSON structure.",
            },
          ],
        },
      ],
    });

    // Extract text from response
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.error("Spatial extraction: no text response");
      return null;
    }

    // Parse the JSON response — handle markdown code fences
    let jsonStr = textBlock.text.trim();
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
