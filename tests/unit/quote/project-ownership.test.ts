import { describe, it, expect, vi, beforeEach } from "vitest";

// SCRUM-340 regression: requestCostEstimation + getCostReport ran RLS-bypassing
// db() queries scoped only by a caller-supplied id, without asserting the
// project/estimate belongs to the caller's org. A foreign projectId leaked the
// other org's in-flight estimateId (via the duplicate-run guard), and a foreign
// estimateId returned the other org's cost report. These tests pin the
// corrected cross-tenant isolation.

const mockGetUser = vi.fn();
const mockServerFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockServerFrom,
  }),
}));

const mockDbFrom = vi.fn();
vi.mock("@/lib/supabase/db", () => ({ db: () => ({ from: mockDbFrom }) }));

const mockInngestSend = vi.fn();
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
}));

import {
  requestCostEstimation,
  getCostReport,
  getProjectCostEstimates,
} from "@/app/(dashboard)/quote/actions";

// Thenable query-builder mock (mirrors the Supabase chain shape).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockChain(result: { data: unknown; error?: unknown }): any {
  const payload = { error: null, ...result };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue(payload),
    maybeSingle: vi.fn().mockResolvedValue(payload),
    then: (onFulfilled: (value: typeof payload) => unknown) =>
      Promise.resolve(payload).then(onFulfilled),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mockServerFrom.mockReturnValue(
    mockChain({ data: { id: "prof-1", org_id: "org-1" } }),
  );
});

describe("requestCostEstimation — cross-tenant isolation (SCRUM-340)", () => {
  it("rejects a projectId owned by another org and fires no run", async () => {
    mockDbFrom.mockReturnValueOnce(mockChain({ data: { org_id: "org-2" } }));

    const result = await requestCostEstimation("proj-foreign", "plan-1");

    expect(result).toEqual({ error: "Project not found" });
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it("proceeds for a project owned by the caller's org", async () => {
    mockDbFrom
      .mockReturnValueOnce(mockChain({ data: { org_id: "org-1" } })) // ownership: owned
      .mockReturnValueOnce(mockChain({ data: null })) // duplicate-run guard: none
      .mockReturnValueOnce(mockChain({ data: { id: "est-1" } })); // insert → { id }
    mockInngestSend.mockResolvedValue({ ids: ["evt-1"] });

    const result = await requestCostEstimation("proj-1", "plan-1");

    expect(result).toEqual({ estimateId: "est-1" });
    expect(mockInngestSend).toHaveBeenCalledTimes(1);
  });
});

describe("getCostReport — cross-tenant isolation (SCRUM-340)", () => {
  it("returns not-found for an estimate owned by another org", async () => {
    mockDbFrom.mockReturnValueOnce(
      mockChain({ data: { id: "est-1", org_id: "org-2", project_id: "p" } }),
    );

    const result = await getCostReport("est-1");

    expect(result.error).toBe("Cost estimate not found");
    expect(result.estimate).toBeNull();
  });

  it("returns the report for an estimate owned by the caller's org", async () => {
    mockDbFrom
      .mockReturnValueOnce(
        mockChain({ data: { id: "est-1", org_id: "org-1", project_id: "p" } }),
      )
      .mockReturnValueOnce(mockChain({ data: [{ id: "li-1" }] }));

    const result = await getCostReport("est-1");

    expect(result.error).toBeUndefined();
    expect(result.estimate).toMatchObject({ id: "est-1", org_id: "org-1" });
    expect(result.lineItems).toEqual([{ id: "li-1" }]);
  });

  it("rejects an unauthenticated caller", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await getCostReport("est-1");

    expect(result.error).toBe("Not authenticated");
    expect(result.estimate).toBeNull();
  });
});

describe("getProjectCostEstimates — cross-tenant isolation (SCRUM-340)", () => {
  it("scopes the query to the caller's org", async () => {
    const chain = mockChain({ data: [{ id: "est-1" }] });
    mockDbFrom.mockReturnValueOnce(chain);

    const result = await getProjectCostEstimates("proj-1");

    expect(result).toEqual([{ id: "est-1" }]);
    expect(chain.eq).toHaveBeenCalledWith("org_id", "org-1");
    expect(chain.eq).toHaveBeenCalledWith("project_id", "proj-1");
  });

  it("returns [] for an unauthenticated caller without querying", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await getProjectCostEstimates("proj-1");

    expect(result).toEqual([]);
    expect(mockDbFrom).not.toHaveBeenCalled();
  });
});
