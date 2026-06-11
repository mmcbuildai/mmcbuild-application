/**
 * Extract JSON from LLM responses that may contain markdown fences,
 * explanatory text, or partial JSON.
 */

/**
 * Why a non-JSON model response is a CONTENT failure, not a parse bug.
 *
 * When the model is handed a blank/unreadable document it correctly responds
 * with prose ("I'm sorry, I cannot provide the analysis without the plan…")
 * instead of JSON. The old code threw a generic `Failed to extract JSON`,
 * masking the real cause (no usable plan reached the model) behind an opaque
 * parser error — the same class of masking the `provider-errors.ts`
 * "Karen incident" fix removed at the provider layer. This typed error carries
 * the real reason so callers surface an honest, actionable message and persist
 * it to the job row, rather than a misleading stack trace.
 *
 * The raw text is kept for SERVER-SIDE logs only; `userMessage` is the neutral,
 * end-user-safe copy.
 */
export type ModelNonJsonReason = "refusal" | "empty" | "unparseable";

const REFUSAL_USER_MESSAGE =
  "The plan couldn't be read from your file — please re-upload a clear plan " +
  "and try again.";
const EMPTY_USER_MESSAGE =
  "The plan couldn't be read from your file — it produced no readable " +
  "content. Please re-upload a clear plan and try again.";
const UNPARSEABLE_USER_MESSAGE =
  "We couldn't interpret the plan analysis. Please try again, or re-upload a " +
  "clearer plan.";

export class ModelNonJsonResponseError extends Error {
  /** Raw model text — server-side logs only, never shown to end users. */
  readonly rawText: string;
  /** Machine-readable category for logs/branching. */
  readonly reason: ModelNonJsonReason;
  /** Neutral, end-user-safe copy. */
  readonly userMessage: string;

  constructor(reason: ModelNonJsonReason, rawText: string) {
    super(
      `Model returned a non-JSON ${reason} response. First 200 chars: ${rawText.slice(0, 200)}`,
    );
    this.name = "ModelNonJsonResponseError";
    this.reason = reason;
    this.rawText = rawText;
    this.userMessage =
      reason === "empty"
        ? EMPTY_USER_MESSAGE
        : reason === "refusal"
          ? REFUSAL_USER_MESSAGE
          : UNPARSEABLE_USER_MESSAGE;
  }
}

/**
 * Conservative reason detection for a response that produced no JSON:
 * empty/whitespace → "empty"; a recognisable refusal/clarification → "refusal";
 * anything else → "unparseable".
 */
function classifyNonJson(text: string): ModelNonJsonReason {
  if (!text || text.trim().length === 0) return "empty";
  const lower = text.toLowerCase();
  const refusalMarkers = [
    "i'm sorry",
    "i cannot",
    "i can't",
    "please upload",
    "please provide",
    "without the",
    "i don't have",
  ];
  if (refusalMarkers.some((m) => lower.includes(m))) return "refusal";
  return "unparseable";
}

export function extractJson<T>(text: string): T {
  // Try direct parse first
  try {
    return JSON.parse(text) as T;
  } catch {
    // Continue to extraction strategies
  }

  // Try extracting from markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T;
    } catch {
      // Continue
    }
  }

  // Try finding JSON object or array in the text
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]) as T;
    } catch {
      // Try fixing common issues: trailing commas
      const cleaned = jsonMatch[1]
        .replace(/,\s*([\]}])/g, "$1")
        .replace(/'/g, '"');
      try {
        return JSON.parse(cleaned) as T;
      } catch {
        // Continue
      }
    }
  }

  // All strategies failed. Throw a TYPED error that distinguishes a model
  // refusal/empty/prose response (a content/input failure) from a genuine
  // parse bug, so callers can branch on `reason` and surface an honest message.
  throw new ModelNonJsonResponseError(classifyNonJson(text), text);
}
