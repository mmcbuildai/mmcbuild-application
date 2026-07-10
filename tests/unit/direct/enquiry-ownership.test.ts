import { describe, it, expect, vi, beforeEach } from "vitest";

// SCRUM-342 regression (SCRUM-340 class): markEnquiryRead updated a
// directory_enquiries row by a caller-supplied enquiryId via the RLS-bypassing
// db() helper, with no ownership check — any authenticated user could mark
// another org's enquiry as read. The recipient professional must belong to the
// caller's org.

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

vi.mock("@/lib/inngest/client", () => ({ inngest: { send: vi.fn() } }));

import { markEnquiryRead } from "@/app/(dashboard)/direct/actions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockChain(result: { data: unknown; error?: unknown }): any {
  const payload = { error: null, ...result };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: vi.fn(() => chain),
    update: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue(payload),
    then: (onFulfilled: (value: typeof payload) => unknown) =>
      Promise.resolve(payload).then(onFulfilled),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mockServerFrom.mockReturnValue(
    mockChain({
      data: { id: "prof-1", org_id: "org-1", full_name: "X", role: "member" },
    }),
  );
});

describe("markEnquiryRead — cross-tenant isolation (SCRUM-342)", () => {
  it("rejects an enquiry whose professional is in another org, without mutating", async () => {
    mockDbFrom
      .mockReturnValueOnce(mockChain({ data: { professional_id: "pro-1" } })) // enquiry
      .mockReturnValueOnce(mockChain({ data: { org_id: "org-2" } })); // professional

    const result = await markEnquiryRead("enq-foreign");

    expect(result).toEqual({ error: "Not authorised" });
    // enquiry + professional read only — never reached the update.
    expect(mockDbFrom).toHaveBeenCalledTimes(2);
  });

  it("marks the enquiry read when its professional belongs to the caller's org", async () => {
    mockDbFrom
      .mockReturnValueOnce(mockChain({ data: { professional_id: "pro-1" } })) // enquiry
      .mockReturnValueOnce(mockChain({ data: { org_id: "org-1" } })) // professional
      .mockReturnValueOnce(mockChain({ data: null })); // update

    const result = await markEnquiryRead("enq-own");

    expect(result).toEqual({ success: true });
    expect(mockDbFrom).toHaveBeenCalledTimes(3);
  });

  it("rejects an unauthenticated caller without touching the db", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await markEnquiryRead("enq-1");

    expect(result).toEqual({ error: "Not authenticated" });
    expect(mockDbFrom).not.toHaveBeenCalled();
  });
});
