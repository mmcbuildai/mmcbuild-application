import { describe, it, expect, vi, beforeEach } from "vitest";

// SCRUM-342 regression (SCRUM-340 class): projects/actions.ts read/wrote project
// child data by a caller-supplied projectId via RLS-bypassing admin with no org
// assert. The readers (site-intel/plans/questionnaire/certifications/
// contributors) were fully unauthenticated; addProjectContributor never verified
// the project belonged to the caller (the path comply.addContributorAndShare
// Finding relies on). These tests pin the corrected isolation.

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

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: vi.fn() } }));

import {
  getProjectContributors,
  addProjectContributor,
} from "@/app/(dashboard)/projects/actions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockChain(result: { data: unknown; error?: unknown }): any {
  const payload = { error: null, ...result };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue(payload),
    maybeSingle: vi.fn().mockResolvedValue(payload),
    then: (onFulfilled: (value: typeof payload) => unknown) =>
      Promise.resolve(payload).then(onFulfilled),
  };
  return chain;
}

const contributorData = {
  contact_name: "Jane Engineer",
  discipline: "structural",
  contact_email: "jane@example.com",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  // createClient-based profiles read (used by addProjectContributor)
  mockServerFrom.mockReturnValue(
    mockChain({ data: { id: "prof-1", org_id: "org-1" } }),
  );
});

describe("getProjectContributors — auth + org scope (SCRUM-342)", () => {
  it("scopes the query to the caller's org", async () => {
    const dataChain = mockChain({ data: [{ id: "contrib-1" }] });
    mockAdminFrom
      // getProfile() reads profiles via admin
      .mockReturnValueOnce(
        mockChain({ data: { id: "prof-1", org_id: "org-1", role: "owner" } }),
      )
      .mockReturnValueOnce(dataChain); // contributors query

    const result = await getProjectContributors("proj-1");

    expect(result).toEqual([{ id: "contrib-1" }]);
    expect(dataChain.eq).toHaveBeenCalledWith("org_id", "org-1");
  });

  it("rejects an unauthenticated caller", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await expect(getProjectContributors("proj-1")).rejects.toThrow(
      "Not authenticated",
    );
  });
});

describe("addProjectContributor — project ownership gate (SCRUM-342)", () => {
  it("rejects attaching a contributor to a project in another org, without inserting", async () => {
    mockAdminFrom.mockReturnValueOnce(
      mockChain({ data: { org_id: "org-2" } }), // ownership check: foreign
    );

    const result = await addProjectContributor("proj-foreign", contributorData);

    expect(result).toEqual({ error: "Project not found" });
    expect(mockAdminFrom).toHaveBeenCalledTimes(1); // never reached the insert
  });

  it("creates the contributor when the project belongs to the caller's org", async () => {
    mockAdminFrom
      .mockReturnValueOnce(mockChain({ data: { org_id: "org-1" } })) // ownership: owned
      .mockReturnValueOnce(mockChain({ data: { id: "contrib-1" } })); // insert

    const result = await addProjectContributor("proj-1", contributorData);

    expect(result).toEqual({ success: true, contributorId: "contrib-1" });
  });
});
