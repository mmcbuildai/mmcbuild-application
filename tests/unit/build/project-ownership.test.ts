import { describe, it, expect, vi, beforeEach } from "vitest";

// SCRUM-340 regression: requestDesignOptimisation + getDesignReport ran
// RLS-bypassing db() queries scoped only by a caller-supplied id, without
// asserting the project/check belongs to the caller's org. A foreign projectId
// leaked the other org's in-flight checkId (via the duplicate-run guard), and a
// foreign checkId returned the other org's design report. These tests pin the
// corrected cross-tenant isolation: a foreign id is rejected as "not found"
// with no side effects, and an owned id still works.

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

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: vi.fn() }),
}));

const mockInngestSend = vi.fn();
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  requestDesignOptimisation,
  getDesignReport,
} from "@/app/(dashboard)/build/actions";

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
  // profiles lookup on the server client → caller is in org-1
  mockServerFrom.mockReturnValue(
    mockChain({ data: { id: "prof-1", org_id: "org-1" } }),
  );
});

describe("requestDesignOptimisation — cross-tenant isolation (SCRUM-340)", () => {
  it("rejects a projectId owned by another org and fires no run", async () => {
    // ownership read → project belongs to org-2 (not the caller's org-1)
    mockDbFrom.mockReturnValueOnce(mockChain({ data: { org_id: "org-2" } }));

    const result = await requestDesignOptimisation("proj-foreign", "plan-1");

    expect(result).toEqual({ error: "Project not found" });
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it("rejects a projectId that does not exist", async () => {
    mockDbFrom.mockReturnValueOnce(mockChain({ data: null }));

    const result = await requestDesignOptimisation("proj-missing", "plan-1");

    expect(result).toEqual({ error: "Project not found" });
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it("proceeds for a project owned by the caller's org", async () => {
    mockDbFrom
      .mockReturnValueOnce(mockChain({ data: { org_id: "org-1" } })) // ownership: owned
      .mockReturnValueOnce(mockChain({ data: null })) // duplicate-run guard: none in flight
      .mockReturnValueOnce(mockChain({ data: { id: "check-1" } })); // insert → { id }
    mockInngestSend.mockResolvedValue({ ids: ["evt-1"] });

    const result = await requestDesignOptimisation("proj-1", "plan-1");

    expect(result).toEqual({ checkId: "check-1" });
    expect(mockInngestSend).toHaveBeenCalledTimes(1);
  });
});

describe("getDesignReport — cross-tenant isolation (SCRUM-340)", () => {
  it("returns not-found for a check owned by another org (no existence leak)", async () => {
    mockDbFrom.mockReturnValueOnce(
      mockChain({ data: { id: "check-1", org_id: "org-2", project_id: "p" } }),
    );

    const result = await getDesignReport("check-1");

    expect(result.error).toBe("Design check not found");
    expect(result.check).toBeNull();
  });

  it("returns the report for a check owned by the caller's org", async () => {
    mockDbFrom
      .mockReturnValueOnce(
        mockChain({ data: { id: "check-1", org_id: "org-1", project_id: "p" } }),
      )
      .mockReturnValueOnce(mockChain({ data: [{ id: "sugg-1" }] }));

    const result = await getDesignReport("check-1");

    expect(result.error).toBeUndefined();
    expect(result.check).toMatchObject({ id: "check-1", org_id: "org-1" });
    expect(result.suggestions).toEqual([{ id: "sugg-1" }]);
  });

  it("rejects an unauthenticated caller", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await getDesignReport("check-1");

    expect(result.error).toBe("Not authenticated");
    expect(result.check).toBeNull();
  });
});
