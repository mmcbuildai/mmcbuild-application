/**
 * AI-provider availability errors.
 *
 * Distinguishes a provider-side OUTAGE (billing exhausted, revoked/invalid key,
 * rate limit, model overload) from "the model ran but couldn't do the task".
 * Without this distinction the pipeline silently masks an outage as a content
 * result — e.g. an exhausted Anthropic credit balance surfaced to the user as
 * "no readable floor plan found", stranding both the user and the operator
 * (the 2026-06-10 Karen incident: every Claude call returned HTTP 400 "Your
 * credit balance is too low" while the 3D extractor reported "no floor plan").
 *
 * Callers detect a provider-availability error and surface an HONEST, actionable
 * message ("the AI service is temporarily unavailable — try again shortly")
 * instead of pretending the input was the problem. The precise reason
 * (status + provider message) is preserved on the error for server-side logs;
 * only the neutral `userMessage` is shown to end users.
 */

/** User-facing copy — neutral on the internal cause (billing vs key vs load). */
const UNAVAILABLE_USER_MESSAGE =
  "The AI service that reads your plan is temporarily unavailable, so the 3D " +
  "model couldn't be generated. This is a service-side issue — not a problem " +
  "with your plan file. Please wait a few minutes and try again. If it keeps " +
  "happening, contact support.";

const BUSY_USER_MESSAGE =
  "The AI service that reads your plan is busy right now, so the 3D model " +
  "couldn't be generated. Please wait a minute and try again.";

export type AiUnavailableReason =
  | "billing"
  | "auth"
  | "rate_limit"
  | "overloaded";

export class AiProviderUnavailableError extends Error {
  /** Neutral, end-user-safe copy. */
  readonly userMessage: string;
  /** Machine-readable category for logs/branching. */
  readonly reason: AiUnavailableReason;
  /** Upstream HTTP status, when known. */
  readonly status?: number;

  constructor(
    reason: AiUnavailableReason,
    detail: string,
    status: number | undefined,
    cause: unknown,
  ) {
    super(`AI provider unavailable (${reason}, status ${status ?? "?"}): ${detail}`);
    this.name = "AiProviderUnavailableError";
    this.reason = reason;
    this.status = status;
    this.userMessage =
      reason === "rate_limit" || reason === "overloaded"
        ? BUSY_USER_MESSAGE
        : UNAVAILABLE_USER_MESSAGE;
    // Preserve the original error for log inspection without leaking it to users.
    (this as { cause?: unknown }).cause = cause;
  }
}

/** Best-effort HTTP status from an Anthropic/OpenAI SDK error or a fetch error. */
function readStatus(err: unknown): number | undefined {
  const e = err as { status?: unknown; response?: { status?: unknown } } | null;
  if (typeof e?.status === "number") return e.status;
  if (typeof e?.response?.status === "number") return e.response.status;
  return undefined;
}

/** Best-effort human-readable message from nested SDK error shapes. */
function readMessage(err: unknown): string {
  const e = err as
    | {
        message?: unknown;
        error?: { message?: unknown; error?: { message?: unknown } };
      }
    | null;
  return String(
    e?.error?.error?.message ??
      e?.error?.message ??
      e?.message ??
      err ??
      "",
  );
}

/**
 * Classify an unknown error as a provider-availability failure, or return null
 * if it is an ordinary error (a genuine bad request, parse failure, etc.) that
 * the caller should handle normally.
 *
 * Note: a bare HTTP 400 is NOT treated as an outage — only a 400 whose message
 * names a billing/quota problem is. This keeps genuine malformed-request bugs
 * from being mislabelled "service unavailable".
 */
export function detectAiProviderUnavailable(
  err: unknown,
): AiProviderUnavailableError | null {
  const status = readStatus(err);
  const detail = readMessage(err);
  const msg = detail.toLowerCase();

  const looksBilling =
    status === 402 ||
    msg.includes("credit balance") ||
    msg.includes("billing") ||
    msg.includes("quota") ||
    msg.includes("insufficient_quota") ||
    msg.includes("exceeded your current quota");
  if (looksBilling) {
    return new AiProviderUnavailableError("billing", detail, status, err);
  }

  const looksAuth =
    status === 401 ||
    status === 403 ||
    msg.includes("invalid x-api-key") ||
    msg.includes("invalid api key") ||
    msg.includes("incorrect api key") ||
    msg.includes("authentication");
  if (looksAuth) {
    return new AiProviderUnavailableError("auth", detail, status, err);
  }

  const looksOverloaded = status === 529 || msg.includes("overloaded");
  if (looksOverloaded) {
    return new AiProviderUnavailableError("overloaded", detail, status, err);
  }

  const looksRateLimited = status === 429 || msg.includes("rate limit");
  if (looksRateLimited) {
    return new AiProviderUnavailableError("rate_limit", detail, status, err);
  }

  return null;
}

/** Convenience: the user-facing message if `err` is an outage, else null. */
export function aiUnavailableUserMessage(err: unknown): string | null {
  if (err instanceof AiProviderUnavailableError) return err.userMessage;
  return detectAiProviderUnavailable(err)?.userMessage ?? null;
}
