import { callVisionModel } from "@/lib/build/spatial/vision-call";
import { preparePdfBufferForVision } from "./pdf-vision-prep";

/**
 * Read the text off a plan by LOOKING at it, when the PDF has no text layer.
 *
 * WHY THIS EXISTS
 * A drawing exported from CAD is a picture of words: room names, dimensions and
 * the title block are drawn as line-work, not stored as characters. Text
 * extraction therefore returns nothing at all — not a little, nothing — and
 * every downstream feature that reads a plan (questionnaire pre-fill, Comply
 * retrieval, Quote) has no input. Karen's 36.9 MB DWG on 2026-08-04 produced
 * exactly zero chunks where a working PDF produces twenty-eight.
 *
 * Vision reads that picture fine. This is the second half of the fix:
 * `classifyIngestOutcome` stops us CLAIMING we read a file we didn't, and this
 * gives us a real chance of reading it.
 *
 * ⚠️ It runs ONLY when text extraction produced nothing. That ordering is the
 * cost control — a normal text PDF never reaches here — and it is also the
 * correctness argument: extracted text is exact, and vision transcription is a
 * model's reading. We prefer the exact one whenever it exists.
 *
 * Consumes the existing `plan_vision` route (`callVisionModel`) and the
 * existing oversize handling (`preparePdfBufferForVision`) rather than forking
 * either — the same plumbing Build already uses to pull 3D geometry off these
 * same drawings.
 */

/**
 * Marker the model returns when a page carries no legible text. Checked
 * explicitly so "there is nothing here" arrives as a fact rather than as an
 * empty string we would have to guess the meaning of.
 */
export const NO_LEGIBLE_TEXT = "NO_LEGIBLE_TEXT";

const SYSTEM_PROMPT = `You transcribe architectural and engineering drawings.

Return ONLY the text that is actually visible in the drawing. Transcribe it as
plain text, grouped the way it appears on the sheet: title block first, then
sheet/drawing names, then room names and their areas, then dimensions, then any
notes, legends or schedules.

Rules that matter more than completeness:
- Transcribe what is there. Never infer, complete, correct or expand anything.
  A half-legible room label is transcribed half-legible, not guessed.
- Do not describe the drawing, the geometry, or what the building appears to be.
  You are reading text off a page, not interpreting a design.
- Do not add headings, commentary, or apologies.
- If the page carries no legible text at all, reply with exactly ${NO_LEGIBLE_TEXT}
  and nothing else.`;

const USER_PROMPT =
  "Transcribe every piece of text visible in this drawing set, following the " +
  "rules exactly.";

export type VisionTextResult = { text: string } | { error: string };

/**
 * Attempt to transcribe a plan PDF's visible text.
 *
 * Never throws — a vision failure must leave the plan in the honest
 * `manual_review` state `classifyIngestOutcome` would have given it, not break
 * the ingestion run. Returns `{ error }` for every unusable outcome, including
 * the model reporting no legible text, so the caller has one thing to check.
 */
export async function readPlanTextViaVision(
  pdf: Buffer,
  label = "plan.pdf",
): Promise<VisionTextResult> {
  try {
    const prepared = await preparePdfBufferForVision(pdf, label);
    if (!prepared.withinCeiling) {
      // Degrade, don't fake: sending it would 400 or silently truncate.
      return {
        error:
          "PDF is still over the vision model's size ceiling after optimising",
      };
    }

    const result = await callVisionModel("plan_vision", {
      pdf: { data: prepared.buffer },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: USER_PROMPT }],
      temperature: 0,
      // A full architectural set's title block, room schedule and notes run
      // long. Too small a ceiling truncates mid-transcription, which reads as
      // a partial plan rather than as a failure.
      maxTokens: 8000,
    });

    const text = (result.text ?? "").trim();

    if (!text || text.includes(NO_LEGIBLE_TEXT)) {
      return { error: "the drawing carries no legible text" };
    }

    // A handful of characters is not a transcription — it is the model saying
    // something went wrong in a way the marker didn't catch. Treating it as
    // content would put a meaningless chunk into retrieval and let the plan
    // claim it was read.
    if (text.length < 40) {
      return { error: `vision returned too little text to be usable (${text.length} chars)` };
    }

    return { text };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "vision transcription failed",
    };
  }
}
