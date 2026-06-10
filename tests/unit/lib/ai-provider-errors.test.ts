import { describe, it, expect } from "vitest";
import {
  detectAiProviderUnavailable,
  aiUnavailableUserMessage,
  AiProviderUnavailableError,
} from "@/lib/ai/provider-errors";

/**
 * Regression cover for the 2026-06-10 Karen incident: an exhausted Anthropic
 * credit balance (HTTP 400 "Your credit balance is too low") was masked by the
 * 3D extractor as "no readable floor plan". These tests pin the classifier that
 * decides whether an error is a provider OUTAGE (surface honestly) vs an
 * ordinary error (handle normally).
 */
describe("detectAiProviderUnavailable", () => {
  it("flags the credit-balance 400 from the real incident as a billing outage", () => {
    // Shape matches the Anthropic SDK error logged in production.
    const err = Object.assign(new Error('400 {"type":"error",...}'), {
      status: 400,
      error: {
        type: "error",
        error: {
          type: "invalid_request_error",
          message:
            "Your credit balance is too low to access the Anthropic API. " +
            "Please go to Plans & Billing to upgrade or purchase credits.",
        },
      },
    });
    const outage = detectAiProviderUnavailable(err);
    expect(outage).toBeInstanceOf(AiProviderUnavailableError);
    expect(outage?.reason).toBe("billing");
    expect(outage?.status).toBe(400);
    expect(outage?.userMessage).toMatch(/temporarily unavailable/i);
    // The user message must NOT leak the raw billing detail.
    expect(outage?.userMessage).not.toMatch(/credit balance/i);
  });

  it("flags a revoked/invalid key (401/403) as an auth outage — covers the key swap", () => {
    expect(detectAiProviderUnavailable({ status: 401 })?.reason).toBe("auth");
    expect(detectAiProviderUnavailable({ status: 403 })?.reason).toBe("auth");
    expect(
      detectAiProviderUnavailable({
        message: "invalid x-api-key",
      })?.reason,
    ).toBe("auth");
  });

  it("flags OpenAI insufficient_quota as billing", () => {
    const err = {
      status: 429,
      error: { message: "You exceeded your current quota", code: "insufficient_quota" },
    };
    expect(detectAiProviderUnavailable(err)?.reason).toBe("billing");
  });

  it("flags rate limit (429) and overloaded (529) as transient", () => {
    expect(detectAiProviderUnavailable({ status: 429 })?.reason).toBe(
      "rate_limit",
    );
    expect(detectAiProviderUnavailable({ status: 529 })?.reason).toBe(
      "overloaded",
    );
    expect(
      detectAiProviderUnavailable({ status: 429 })?.userMessage,
    ).toMatch(/busy/i);
  });

  it("does NOT flag an ordinary 400 (bad request) as an outage", () => {
    const err = Object.assign(new Error("400 invalid_request"), {
      status: 400,
      error: { error: { message: "messages: at least one message is required" } },
    });
    expect(detectAiProviderUnavailable(err)).toBeNull();
  });

  it("does NOT flag a generic parse/null error as an outage", () => {
    expect(detectAiProviderUnavailable(new Error("Unexpected token in JSON"))).toBeNull();
    expect(detectAiProviderUnavailable(null)).toBeNull();
  });

  it("aiUnavailableUserMessage returns the message for outages, null otherwise", () => {
    expect(aiUnavailableUserMessage({ status: 402 })).toMatch(
      /temporarily unavailable/i,
    );
    expect(aiUnavailableUserMessage(new Error("boom"))).toBeNull();
    // Already-typed errors pass straight through.
    const typed = new AiProviderUnavailableError("billing", "x", 400, null);
    expect(aiUnavailableUserMessage(typed)).toBe(typed.userMessage);
  });
});
