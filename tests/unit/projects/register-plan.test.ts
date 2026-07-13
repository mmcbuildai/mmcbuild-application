import { describe, it, expect, vi, beforeEach } from "vitest";

// SCRUM-235 regression: registerPlan used to swallow a failed Inngest send,
// leaving the plan stuck in "uploading" while returning { success: true }.
// These tests pin the corrected behaviour: on send failure the plan row is
// marked "error" and the caller receives an error (not a false success).

const mockGetUser = vi.fn();
const mockServerFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockServerFrom,
  }),
}));

const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockAdminFrom }),
}));

const mockInngestSend = vi.fn();
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { registerPlan } from "@/app/(dashboard)/projects/actions";

// Thenable query-builder mock (mirrors the Supabase chain shape).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockChain(result: { data: unknown; error?: unknown }): any {
  const payload = { error: null, ...result };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue(payload),
    maybeSingle: vi.fn().mockResolvedValue(payload),
    then: (onFulfilled: (value: typeof payload) => unknown) =>
      Promise.resolve(payload).then(onFulfilled),
  };
  return chain;
}

describe("registerPlan — Inngest send failure (SCRUM-235)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    // profiles lookup on the server client
    mockServerFrom.mockReturnValue(mockChain({ data: { id: "prof-1", org_id: "org-1" } }));
  });

  it("marks the plan errored and returns an error when the event send fails", async () => {
    const updateChain = mockChain({ data: null });
    mockAdminFrom
      .mockReturnValueOnce(mockChain({ data: null })) // current-version lookup: none (→ new version 1)
      .mockReturnValueOnce(mockChain({ data: { id: "plan-1" } })) // insert -> { id }
      .mockReturnValueOnce(updateChain); // fail-mark update

    mockInngestSend.mockRejectedValue(new Error("Inngest unreachable"));

    const result = await registerPlan("project-1", "plan.pdf", "org-1/project-1/plan.pdf", 1234);

    expect(result.error).toBeDefined();
    expect("success" in result).toBe(false);
    // The plan row must be moved to the "error" status, not left "uploading".
    expect(updateChain.update).toHaveBeenCalledWith({ status: "error" });
    expect(updateChain.eq).toHaveBeenCalledWith("id", "plan-1");
  });

  it("returns success when the event send succeeds", async () => {
    mockAdminFrom
      .mockReturnValueOnce(mockChain({ data: null })) // current-version lookup: none (→ new version 1)
      .mockReturnValueOnce(mockChain({ data: { id: "plan-2" } })); // insert -> { id }

    mockInngestSend.mockResolvedValue({ ids: ["evt-1"] });

    const result = await registerPlan("project-1", "plan.pdf", "org-1/project-1/plan.pdf", 1234);

    expect(result).toEqual({ success: true, planId: "plan-2" });
  });
});
