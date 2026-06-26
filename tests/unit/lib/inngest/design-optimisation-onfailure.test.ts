import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression (2026-06-16): run-design-optimisation had NO onFailure handler, so
// when a step threw (e.g. the model returned non-JSON → extractJson throws
// ModelNonJsonResponseError) and retries were exhausted, the design_checks row
// was left stuck at "processing" forever — the UI spins with no reason shown.
// A real run was found stuck this way. These tests pin the corrected behaviour:
// the in-flight check is moved to "error" with the REAL failure reason, and a
// later completed run for the same plan is never clobbered.

// Keep the module import cheap: stub the Inngest client (createFunction runs at
// module load) and the heavy/env-touching deps the function file imports.
// `server-only` throws outside an RSC context — the function file transitively
// imports it (via the spatial extractor), so stub it or the whole suite fails
// to import (the long-standing red CI check on this file).
vi.mock("server-only", () => ({}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: { createFunction: () => ({ id: "run-design-optimisation" }) },
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/supabase/db", () => ({ db: () => ({}) }));
vi.mock("@/lib/comply/retriever", () => ({ retrievePlanChunks: vi.fn() }));
vi.mock("@/lib/ai/models/router", () => ({ callModel: vi.fn() }));
vi.mock("@/lib/ai/extract-json", () => ({ extractJson: vi.fn() }));
vi.mock("@/lib/report-versions", () => ({ createReportVersion: vi.fn() }));
vi.mock("@/lib/ai/prompts/optimisation-system", () => ({
  OPTIMISATION_SYSTEM_PROMPT: "",
  OPTIMISATION_USER_PROMPT: () => "",
  OPTIMISATION_SUMMARY_PROMPT: () => "",
}));

import { recordDesignOptimisationFailure } from "@/lib/inngest/functions/run-design-optimisation";

// Thenable query-builder mock mirroring the Supabase chain shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockChain(result: { data: unknown; error?: unknown }): any {
  const payload = { error: null, ...result };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: vi.fn(() => chain),
    update: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue(payload),
    then: (onFulfilled: (value: typeof payload) => unknown) =>
      Promise.resolve(payload).then(onFulfilled),
  };
  return chain;
}

describe("recordDesignOptimisationFailure (stuck-processing regression)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks the in-flight check 'error' with the real reason", async () => {
    const selectChain = mockChain({ data: { id: "check-1" } }); // found in-flight
    const updateChain = mockChain({ data: null });
    const mockFrom = vi
      .fn()
      .mockReturnValueOnce(selectChain) // select in-flight check
      .mockReturnValueOnce(updateChain); // update -> error
    const admin = { from: mockFrom } as never;

    await recordDesignOptimisationFailure(
      admin,
      "project-1",
      "plan-1",
      "Model returned a non-JSON unparseable response."
    );

    // Only queued/processing rows are touched (never a completed run).
    expect(selectChain.in).toHaveBeenCalledWith("status", ["queued", "processing"]);
    // The row is moved to "error" carrying the real failure reason.
    expect(updateChain.update).toHaveBeenCalledWith({
      status: "error",
      summary: "Design optimisation failed: Model returned a non-JSON unparseable response.",
    });
    expect(updateChain.eq).toHaveBeenCalledWith("id", "check-1");
  });

  it("truncates very long failure messages to 500 chars", async () => {
    const selectChain = mockChain({ data: { id: "check-2" } });
    const updateChain = mockChain({ data: null });
    const admin = {
      from: vi.fn().mockReturnValueOnce(selectChain).mockReturnValueOnce(updateChain),
    } as never;

    await recordDesignOptimisationFailure(admin, "p", "pl", "x".repeat(900));

    const arg = updateChain.update.mock.calls[0][0] as { summary: string };
    expect(arg.summary).toBe(`Design optimisation failed: ${"x".repeat(500)}`);
  });

  it("does nothing when projectId/planId are missing", async () => {
    const mockFrom = vi.fn();
    const admin = { from: mockFrom } as never;

    await recordDesignOptimisationFailure(admin, undefined, "plan-1", "boom");
    await recordDesignOptimisationFailure(admin, "project-1", undefined, "boom");

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("no-ops when there is no in-flight check to mark (already completed)", async () => {
    const selectChain = mockChain({ data: null }); // nothing queued/processing
    const mockFrom = vi.fn().mockReturnValueOnce(selectChain);
    const admin = { from: mockFrom } as never;

    await recordDesignOptimisationFailure(admin, "project-1", "plan-1", "boom");

    // select happened, but no second .from() for an update.
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });
});
