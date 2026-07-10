import { describe, it, expect, vi, beforeEach } from "vitest";

// SCRUM-342 regression (SCRUM-340 class): comply/actions.ts had 12 exported
// actions that read/mutated compliance data by a caller-supplied id via
// RLS-bypassing admin with no org assert — several fully unauthenticated. These
// tests pin the corrected isolation for the finding-gate (authorizeFinding
// Resolution, shared by review/amend/send/share), the report + list + token
// readers, and the bulk update.

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

vi.mock("@/lib/inngest/client", () => ({ inngest: { send: vi.fn() } }));
vi.mock("@/lib/email/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/stripe/subscription", () => ({ checkAndIncrementUsage: vi.fn() }));
vi.mock("@/app/(dashboard)/projects/actions", () => ({ addProjectContributor: vi.fn() }));
vi.mock("@/app/(dashboard)/beta/actions", () => ({ markComplianceRechecked: vi.fn() }));

import {
  reviewFinding,
  getComplianceReport,
  getProjectChecks,
  getShareTokensForCheck,
  getWorkflowSummary,
  bulkReviewFindings,
} from "@/app/(dashboard)/comply/actions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockChain(result: { data: unknown; error?: unknown }): any {
  const payload = { error: null, ...result };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    not: vi.fn(() => chain),
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
  // caller: org-1, owner
  mockServerFrom.mockReturnValue(
    mockChain({ data: { id: "prof-1", org_id: "org-1", role: "owner" } }),
  );
});

describe("reviewFinding — finding org gate (SCRUM-342)", () => {
  it("rejects a finding whose parent check is in another org, without mutating", async () => {
    mockAdminFrom
      .mockReturnValueOnce(mockChain({ data: { id: "f1", check_id: "c1" } })) // finding
      .mockReturnValueOnce(mockChain({ data: { org_id: "org-2" } })); // parent check

    const result = await reviewFinding("f1", "accepted");

    expect(result).toEqual({ error: "Finding not found" });
    // finding + check reads only — never reached the update.
    expect(mockAdminFrom).toHaveBeenCalledTimes(2);
  });

  it("reviews a finding owned by the caller's org", async () => {
    mockAdminFrom
      .mockReturnValueOnce(mockChain({ data: { id: "f1", check_id: "c1" } })) // finding
      .mockReturnValueOnce(mockChain({ data: { org_id: "org-1" } })) // parent check
      .mockReturnValueOnce(mockChain({ data: null })) // update
      .mockReturnValueOnce(mockChain({ data: null })); // activity log

    const result = await reviewFinding("f1", "accepted");

    expect(result).toEqual({ success: true });
  });
});

describe("getComplianceReport — org gate (SCRUM-342)", () => {
  it("returns not-found for a check in another org", async () => {
    mockAdminFrom.mockReturnValueOnce(
      mockChain({ data: { id: "c1", org_id: "org-2" } }),
    );

    const result = await getComplianceReport("c1");

    expect(result).toEqual({ error: "Check not found" });
  });

  it("returns the report for a check in the caller's org", async () => {
    mockAdminFrom
      .mockReturnValueOnce(mockChain({ data: { id: "c1", org_id: "org-1" } })) // check
      .mockReturnValueOnce(mockChain({ data: [] })); // findings

    const result = await getComplianceReport("c1");

    expect(result).toHaveProperty("check");
    expect(result).toHaveProperty("findings");
  });
});

describe("getProjectChecks — auth + org scope (SCRUM-342)", () => {
  it("returns [] for an unauthenticated caller", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await getProjectChecks("proj-1");

    expect(result).toEqual([]);
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("scopes the query to the caller's org", async () => {
    const chain = mockChain({ data: [{ id: "c1" }] });
    mockAdminFrom.mockReturnValueOnce(chain);

    const result = await getProjectChecks("proj-1");

    expect(result).toEqual([{ id: "c1" }]);
    expect(chain.eq).toHaveBeenCalledWith("org_id", "org-1");
  });
});

describe("getShareTokensForCheck — auth + org gate (SCRUM-342)", () => {
  it("returns [] for a check in another org (contributor PII)", async () => {
    mockAdminFrom.mockReturnValueOnce(mockChain({ data: { org_id: "org-2" } }));

    const result = await getShareTokensForCheck("c1");

    expect(result).toEqual([]);
    // never reached the findings/token reads.
    expect(mockAdminFrom).toHaveBeenCalledTimes(1);
  });
});

describe("getWorkflowSummary — auth + org gate (SCRUM-342)", () => {
  it("returns the empty summary for a check in another org", async () => {
    mockAdminFrom.mockReturnValueOnce(mockChain({ data: { org_id: "org-2" } }));

    const result = await getWorkflowSummary("c1");

    expect(result).toEqual({
      total: 0,
      pending: 0,
      accepted: 0,
      amended: 0,
      rejected: 0,
      sent: 0,
    });
  });
});

describe("bulkReviewFindings — only mutates the caller's own findings (SCRUM-342)", () => {
  it("filters foreign findings out of the bulk update", async () => {
    const findingsChain = mockChain({
      data: [
        { id: "f1", check_id: "c1" },
        { id: "f2", check_id: "c2" },
      ],
    });
    const checksChain = mockChain({
      data: [
        { id: "c1", org_id: "org-1" }, // owned
        { id: "c2", org_id: "org-2" }, // foreign
      ],
    });
    const updateChain = mockChain({ data: null });
    const logChain = mockChain({ data: null });
    mockAdminFrom
      .mockReturnValueOnce(findingsChain) // select id, check_id
      .mockReturnValueOnce(checksChain) // select id, org_id
      .mockReturnValueOnce(updateChain) // update
      .mockReturnValue(logChain); // activity log insert(s)

    const result = await bulkReviewFindings(["f1", "f2"], "accepted");

    expect(result).toEqual({ success: true });
    // Only the owned finding (f1) is updated — f2 (org-2) is excluded.
    expect(updateChain.in).toHaveBeenCalledWith("id", ["f1"]);
  });

  it("returns an error when none of the findings are the caller's", async () => {
    mockAdminFrom
      .mockReturnValueOnce(mockChain({ data: [{ id: "f2", check_id: "c2" }] }))
      .mockReturnValueOnce(mockChain({ data: [{ id: "c2", org_id: "org-2" }] }));

    const result = await bulkReviewFindings(["f2"], "accepted");

    expect(result).toEqual({ error: "No findings found" });
  });
});
