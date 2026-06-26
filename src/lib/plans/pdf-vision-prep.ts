/**
 * Prepare an uploaded PDF for an Anthropic vision call.
 *
 * Anthropic rejects document blocks over a 32MB ceiling, and architectural plan
 * sets routinely run 30–37MB (mostly embedded hi-res renders). Sent raw, they
 * either 400 or come back as a degraded read (only a handful of fields). The fix
 * is a CloudConvert optimise pass for big PDFs before the model call, plus a
 * hard backstop when even the optimised file is still over the ceiling.
 *
 * THIS IS THE SINGLE HOME for that logic. Every PDF→vision INGESTION ENTRY POINT
 * consumes it so the size handling can't drift between paths:
 *   - run-test-3d-extraction  (the Build / 3D extraction path)
 *   - extract-design-attributes (the on-upload questionnaire-prefill path)
 * (Downstream callers — extractor / page-classifier / sheet-decomposer — run on
 * already-prepared, page-split PDFs and don't need this.)
 *
 * Portfolio note: this is a strong @caistech extraction candidate — every
 * document-vision product hits the same ceiling. See PR discussion 2026-06-26.
 */

import { optimizePdfViaCloudConvert } from "./dwg-converter";
import { ANTHROPIC_PDF_MAX_BYTES } from "./file-kind";

/**
 * PDFs over this size get a CloudConvert optimise pass before the vision call.
 * Below it the optimise cost/latency isn't worth it; above it we're heading
 * toward Anthropic's 32MB document ceiling and the worker-memory danger zone.
 */
export const OPTIMISE_PDF_THRESHOLD_BYTES = 20 * 1024 * 1024;

export interface PdfVisionPrepResult {
  /** The buffer to send to the vision model (optimised when it helped, else the original). */
  buffer: Buffer<ArrayBuffer>;
  /** True only when an optimise pass actually shrank the file. */
  optimised: boolean;
  /**
   * False when the buffer is STILL over Anthropic's 32MB ceiling after optimise.
   * The caller MUST skip the vision call in that case (sending it would 400 /
   * degrade) and degrade gracefully instead.
   */
  withinCeiling: boolean;
}

/** Normalise any Buffer to an ArrayBuffer-backed Buffer (the vision SDK's input type). */
function toArrayBufferBacked(buf: Buffer): Buffer<ArrayBuffer> {
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  return Buffer.from(ab);
}

/**
 * Best-effort: optimise an over-large PDF buffer so it fits the vision model's
 * size ceiling, and report whether it's now within the ceiling. Never throws —
 * on any optimise failure or no size win it returns the original buffer, and the
 * `withinCeiling` flag tells the caller whether it's safe to send.
 */
export async function preparePdfBufferForVision(
  buffer: Buffer,
  label = "plan.pdf",
): Promise<PdfVisionPrepResult> {
  let working: Buffer = buffer;
  let optimised = false;

  if (buffer.byteLength > OPTIMISE_PDF_THRESHOLD_BYTES) {
    console.log(
      `[pdf-vision-prep] PDF is ${Math.round(buffer.byteLength / 1024 / 1024)}MB — running CloudConvert optimise`,
    );
    const result = await optimizePdfViaCloudConvert(buffer, label);
    if ("error" in result) {
      console.error(
        `[pdf-vision-prep] optimise failed, using original: ${result.error}`,
      );
    } else if (result.buffer.length < buffer.length) {
      console.log(
        `[pdf-vision-prep] optimised ${Math.round(buffer.byteLength / 1024 / 1024)}MB → ${Math.round(result.buffer.length / 1024 / 1024)}MB`,
      );
      working = result.buffer;
      optimised = true;
    }
  }

  // Normalise to an ArrayBuffer-backed Buffer (the vision SDK's Buffer<ArrayBuffer>
  // input) regardless of how the source / CloudConvert buffer was allocated.
  const out = toArrayBufferBacked(working);
  return {
    buffer: out,
    optimised,
    withinCeiling: out.byteLength <= ANTHROPIC_PDF_MAX_BYTES,
  };
}
