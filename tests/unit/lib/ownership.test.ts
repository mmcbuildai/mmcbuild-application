import { describe, it, expect, vi, beforeEach } from "vitest";

// SCRUM-343: the shared cross-tenant guard helper. Returns true only when the
// project exists AND belongs to the given org.

const mockDbFrom = vi.fn();
vi.mock("@/lib/supabase/db", () => ({ db: () => ({ from: mockDbFrom }) }));

import { projectBelongsToOrg } from "@/lib/auth/ownership";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockChain(result: { data: unknown }): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn().mockResolvedValue({ error: null, ...result }),
  };
  return chain;
}

beforeEach(() => vi.clearAllMocks());

describe("projectBelongsToOrg", () => {
  it("returns true when the project is in the given org", async () => {
    mockDbFrom.mockReturnValueOnce(mockChain({ data: { org_id: "org-1" } }));
    expect(await projectBelongsToOrg("proj-1", "org-1")).toBe(true);
  });

  it("returns false when the project is in another org", async () => {
    mockDbFrom.mockReturnValueOnce(mockChain({ data: { org_id: "org-2" } }));
    expect(await projectBelongsToOrg("proj-1", "org-1")).toBe(false);
  });

  it("returns false when the project does not exist", async () => {
    mockDbFrom.mockReturnValueOnce(mockChain({ data: null }));
    expect(await projectBelongsToOrg("missing", "org-1")).toBe(false);
  });
});
