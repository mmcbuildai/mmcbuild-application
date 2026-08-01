import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

// SCRUM-361 follow-up (Karen, 2026-08-01): with 3D rendering switched off for
// Go Live 1, the three geometry exports go with it — "Export 3D model", "Export
// to Revit" and "Export modified plan" are all built from the same
// spatial_layout whose accuracy is the reason 3D is hidden.
//
// Hiding the buttons is not enough. These URLs sit in browser history, download
// managers and any bookmark a beta tester made, so the routes themselves must
// refuse while the flag is off — and refuse BEFORE touching the database, so a
// switched-off export cannot be used to probe for report ids.

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

const { buildDae, buildIfc, buildDxf, subscriptionStatus } = vi.hoisted(() => ({
  buildDae: vi.fn(() => "<COLLADA/>"),
  buildIfc: vi.fn(() => "ISO-10303-21;"),
  buildDxf: vi.fn(() => ({ dxf: "0\nSECTION\n" })),
  subscriptionStatus: vi.fn(async () => ({ tier: "essential" })),
}));
vi.mock("@/lib/build/dae-exporter", () => ({ buildDaeFromLayout: buildDae }));
vi.mock("@/lib/build/ifc-exporter", () => ({ buildIfcFromLayout: buildIfc }));
vi.mock("@/lib/build/dxf-exporter", () => ({ buildDxfFromLayout: buildDxf }));
vi.mock("@/lib/stripe/subscription", () => ({
  getSubscriptionStatus: subscriptionStatus,
}));

import { GET as daeExport } from "@/app/api/build/report/[checkId]/dae/route";
import { GET as ifcExport } from "@/app/api/build/report/[checkId]/ifc/route";
import { GET as dxfExport } from "@/app/api/build/report/[checkId]/dxf/route";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockChain(result: { data: unknown; error?: unknown }): any {
  const payload = { error: null, ...result };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue(payload),
    then: (onFulfilled: (value: typeof payload) => unknown) =>
      Promise.resolve(payload).then(onFulfilled),
  };
  return chain;
}

const req = new Request("http://localhost/api/build/report/chk/dae");
const params = { params: Promise.resolve({ checkId: "chk" }) };

const original = process.env.NEXT_PUBLIC_3D_RENDERING_ENABLED;

/** A completed report owned by the caller's org, with geometry to export. */
function seedOwnedCompletedCheck() {
  mockServerFrom.mockReturnValue(mockChain({ data: { org_id: "org-1" } }));
  mockDbFrom
    .mockReturnValueOnce(
      mockChain({
        data: {
          id: "chk",
          status: "completed",
          project_id: "p",
          org_id: "org-1",
          spatial_layout: { walls: [{ id: "w1" }], rooms: [] },
        },
      }),
    )
    .mockReturnValue(mockChain({ data: { name: "Proj" } }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

afterAll(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_3D_RENDERING_ENABLED;
  else process.env.NEXT_PUBLIC_3D_RENDERING_ENABLED = original;
});

describe("geometry export routes — gated with the 3D render (SCRUM-361)", () => {
  describe("with 3D rendering switched OFF", () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_3D_RENDERING_ENABLED = "false";
    });

    it("refuses the 3D model (.dae) export without generating or reading anything", async () => {
      const res = await daeExport(req, params);

      expect(res.status).toBe(404);
      expect(buildDae).not.toHaveBeenCalled();
      expect(mockDbFrom).not.toHaveBeenCalled();
    });

    it("refuses the Revit (.ifc) export without generating or reading anything", async () => {
      const res = await ifcExport(req, params);

      expect(res.status).toBe(404);
      expect(buildIfc).not.toHaveBeenCalled();
      expect(mockDbFrom).not.toHaveBeenCalled();
    });

    it("refuses the modified-plan (.dxf) export without generating or reading anything", async () => {
      const res = await dxfExport(req, params);

      expect(res.status).toBe(404);
      expect(buildDxf).not.toHaveBeenCalled();
      expect(mockDbFrom).not.toHaveBeenCalled();
      // The paywall must not be consulted either — nothing is for sale here
      // while the export is switched off.
      expect(subscriptionStatus).not.toHaveBeenCalled();
    });

    it("explains why rather than 404ing silently", async () => {
      const res = await daeExport(req, params);
      const body = (await res.json()) as { error?: string };

      expect(body.error).toMatch(/temporarily unavailable/i);
    });
  });

  describe("with 3D rendering switched ON (the default)", () => {
    beforeEach(() => {
      delete process.env.NEXT_PUBLIC_3D_RENDERING_ENABLED;
    });

    it("still exports the 3D model, so the gate is reversible by env alone", async () => {
      seedOwnedCompletedCheck();

      const res = await daeExport(req, params);

      expect(res.status).toBe(200);
      expect(buildDae).toHaveBeenCalledTimes(1);
    });

    it("still exports the Revit model", async () => {
      seedOwnedCompletedCheck();

      const res = await ifcExport(req, params);

      expect(res.status).toBe(200);
      expect(buildIfc).toHaveBeenCalledTimes(1);
    });

    it("still exports the modified plan for a paid org", async () => {
      seedOwnedCompletedCheck();

      const res = await dxfExport(req, params);

      expect(res.status).toBe(200);
      expect(buildDxf).toHaveBeenCalledTimes(1);
    });
  });
});
