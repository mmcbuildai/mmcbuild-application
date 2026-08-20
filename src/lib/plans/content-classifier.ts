import "server-only";
import { callModel } from "@/lib/ai/models/router";
import { extractJson } from "@/lib/ai/extract-json";
import { detectAiProviderUnavailable } from "@/lib/ai/provider-errors";

/**
 * "Is this actually a building plan?" — checked once per upload, on whatever
 * text ingestion already extracted (no extra vision call, no re-read of the
 * file).
 *
 * WHY THIS EXISTS
 * Sanitizing malformed characters (see chunkText's sanitizeForPostgresText)
 * stops ingestion CRASHING on a bad upload, but does nothing about the more
 * important case underneath it: a document that isn't a plan at all — e.g.
 * course homework, an unrelated report — uploaded by mistake. Without this
 * check, that upload "succeeds", gets embedded, and NCC compliance analysis
 * then runs against text that has nothing to do with a building — a silent
 * wrong answer, which is worse than the crash it replaces. Caught here,
 * before any embedding spend, with a message that tells the user what
 * actually happened instead of a generic processing failure.
 *
 * Deliberately FAILS OPEN: if the classifier call itself errors for a reason
 * OTHER than a provider outage (e.g. a JSON parse miss), this treats the
 * upload as a plan rather than blocking it — a false "not a plan" rejection
 * on a genuine upload is a worse failure than occasionally letting a
 * borderline document through. A provider outage is re-thrown so the caller
 * can report the real cause instead of a false rejection either way.
 */

const MAX_CHARS_TO_CLASSIFY = 4000;

const SYSTEM_PROMPT = `You are checking whether an uploaded document is a construction/architectural building plan — the kind of document NCC (National Construction Code) compliance analysis can be run against: floor plans, elevations, sections, site plans, specifications, or building schedules.

You will be shown text extracted from the start of the uploaded document. Decide whether it genuinely looks like building-plan documentation, or whether it's an unrelated document that was uploaded by mistake (e.g. a report, an assignment, an invoice, a random PDF).

Return ONLY this JSON object (no preamble, no markdown fences):
{ "isPlan": true, "reason": "" }
or
{ "isPlan": false, "reason": "<one plain-language sentence naming what this document actually looks like instead>" }

When genuinely unsure, prefer { "isPlan": true }  — this check exists to catch obviously wrong uploads, not to second-guess an unusual but real plan.`;

export interface PlanContentClassification {
  isPlan: boolean;
  reason: string;
}

export async function classifyPlanContent(
  extractedText: string,
): Promise<PlanContentClassification> {
  const sample = extractedText.slice(0, MAX_CHARS_TO_CLASSIFY).trim();

  // Nothing to judge — the "no content extracted" path (noContentMessage)
  // already covers this case with its own, more specific message.
  if (!sample) {
    return { isPlan: true, reason: "" };
  }

  try {
    const result = await callModel("plan_content_classify", {
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Extracted text:\n"""\n${sample}\n"""\n\nReturn ONLY the JSON object.`,
        },
      ],
      maxTokens: 200,
    });

    if (!result.text) return { isPlan: true, reason: "" };

    const parsed = extractJson<{ isPlan?: boolean; reason?: string }>(result.text);
    return {
      isPlan: parsed.isPlan !== false,
      reason: parsed.reason ?? "",
    };
  } catch (err) {
    const outage = detectAiProviderUnavailable(err);
    if (outage) throw outage;
    console.error("[content-classifier] classification failed, failing open:", err);
    return { isPlan: true, reason: "" };
  }
}

/**
 * The user-facing message when a document is rejected as not a plan. Named
 * and structured the same way as ingest-outcome.ts's noContentMessage:
 * state the cause, then what to do.
 */
export function notAPlanMessage(reason: string): string {
  const cause = reason
    ? `This looks like ${reason.replace(/\.$/, "")}, not a building plan.`
    : "This doesn't look like a building plan.";
  return (
    `${cause} Upload the architectural drawing (floor plans, elevations, or ` +
    `site plan) for this project, or contact us if you believe this is a mistake.`
  );
}
