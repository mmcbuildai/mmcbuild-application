import { describe, it, expect, vi, beforeEach } from "vitest";

// SCRUM-342 regression (SCRUM-340 class): the report download routes
// (api/comply/report, api/quote/report, api/build/report[/dae/dxf]) loaded the
// check/estimate by a caller-supplied id via RLS-bypassing db()/admin, checked
// only that SOMEONE was logged in, and returned another org's compliance PDF /
// financial cost report / build geometry. They must assert the record's org_id
// equals the caller's, returning 404 on mismatch (no existence leak).

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

const mockDbFrom = vi.fn();
vi.mock("@/lib/supabase/db", () => ({ db: () => ({ from: mockDbFrom }) }));

// Report generators — mocked so a foreign-org request can assert they are NEVER
// reached, and so the heavy PDF/DOCX libs aren't imported. Spies live in
// vi.hoisted so the (hoisted) vi.mock factories can reference them.
const { genCompliancePdf, genComplianceDocx, genCostPdf, genBuildPdf } = vi.hoisted(
  () => ({
    genCompliancePdf: vi.fn(() => new Uint8Array([1, 2, 3])),
    genComplianceDocx: vi.fn(),
    genCostPdf: vi.fn(() => new Uint8Array([1])),
    genBuildPdf: vi.fn(() => new Uint8Array([1])),
  }),
);
vi.mock("@/lib/comply/report-pdf", () => ({ generateCompliancePdf: genCompliancePdf }));
vi.mock("@/lib/comply/report-docx", () => ({ generateComplianceDocx: genComplianceDocx }));
vi.mock("@/lib/quote/report-pdf", () => ({ generateCostPdf: genCostPdf }));
vi.mock("@/lib/quote/report-docx", () => ({ generateCostDocx: vi.fn() }));
vi.mock("@/lib/quote/totals", () => ({
  computeCostTotals: () => ({ traditional: 0, mmc: 0, savingsPct: 0 }),
}));
vi.mock("@/lib/build/report-pdf", () => ({ generateBuildPdf: genBuildPdf }));
vi.mock("@/lib/build/report-docx", () => ({ generateBuildDocx: vi.fn() }));

import { GET as complyReport } from "@/app/api/comply/report/[checkId]/route";
import { GET as quoteReport } from "@/app/api/quote/report/[estimateId]/route";
import { GET as buildReport } from "@/app/api/build/report/[checkId]/route";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockChain(result: { data: unknown; error?: unknown }): any {
  const payload = { error: null, ...result };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue(payload),
    then: (onFulfilled: (value: typeof payload) => unknown) =>
      Promise.resolve(payload).then(onFulfilled),
  };
  return chain;
}

const req = new Request("http://localhost/api/report/x");

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  // caller resolves to org-1
  mockServerFrom.mockReturnValue(mockChain({ data: { org_id: "org-1" } }));
});

describe("api/comply/report/[checkId] — cross-tenant isolation (SCRUM-342)", () => {
  it("returns 404 for a check owned by another org and never generates a report", async () => {
    mockAdminFrom.mockReturnValueOnce(
      mockChain({
        data: { id: "chk", org_id: "org-2", project_id: "p", status: "completed" },
      }),
    );

    const res = await complyReport(req, {
      params: Promise.resolve({ checkId: "chk" }),
    });

    expect(res.status).toBe(404);
    expect(genCompliancePdf).not.toHaveBeenCalled();
    expect(genComplianceDocx).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await complyReport(req, {
      params: Promise.resolve({ checkId: "chk" }),
    });

    expect(res.status).toBe(401);
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("generates the report for a check owned by the caller's org", async () => {
    mockAdminFrom
      .mockReturnValueOnce(
        mockChain({
          data: {
            id: "chk",
            org_id: "org-1",
            project_id: "p",
            status: "completed",
            summary: "s",
            overall_risk: "low",
            completed_at: null,
          },
        }),
      ) // check
      .mockReturnValueOnce(mockChain({ data: { name: "Proj", address: null } })) // project
      .mockReturnValueOnce(mockChain({ data: [] })); // findings
    mockDbFrom.mockReturnValueOnce(mockChain({ data: { version_number: 1 } })); // report_versions

    const res = await complyReport(req, {
      params: Promise.resolve({ checkId: "chk" }),
    });

    expect(res.status).toBe(200);
    expect(genCompliancePdf).toHaveBeenCalledTimes(1);
  });
});

describe("api/quote/report/[estimateId] — cross-tenant isolation (SCRUM-342)", () => {
  it("returns 404 for an estimate owned by another org and never generates a report", async () => {
    mockDbFrom.mockReturnValueOnce(
      mockChain({
        data: {
          id: "est",
          org_id: "org-2",
          project_id: "p",
          status: "completed",
        },
      }),
    );

    const res = await quoteReport(req, {
      params: Promise.resolve({ estimateId: "est" }),
    });

    expect(res.status).toBe(404);
    expect(genCostPdf).not.toHaveBeenCalled();
  });
});

describe("api/build/report/[checkId] — cross-tenant isolation (SCRUM-342)", () => {
  it("returns 404 for a check owned by another org and never generates a report", async () => {
    mockDbFrom.mockReturnValueOnce(
      mockChain({
        data: {
          id: "chk",
          org_id: "org-2",
          project_id: "p",
          status: "completed",
        },
      }),
    );

    const res = await buildReport(req, {
      params: Promise.resolve({ checkId: "chk" }),
    });

    expect(res.status).toBe(404);
    expect(genBuildPdf).not.toHaveBeenCalled();
  });
});
