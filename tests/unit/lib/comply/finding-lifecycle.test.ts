import { describe, it, expect } from "vitest";
import {
  computeFindingLifecycle,
  allFindingsConverged,
  unresolvedCount,
  type LifecycleInput,
} from "@/lib/comply/finding-lifecycle";

describe("computeFindingLifecycle", () => {
  it("returns 'open' for a fresh finding with no reply or resolution", () => {
    expect(computeFindingLifecycle({})).toBe("open");
    expect(
      computeFindingLifecycle({ remediation_status: "awaiting", responses: [] })
    ).toBe("open");
  });

  it("returns 'responded' when remediation_status moved off awaiting", () => {
    expect(computeFindingLifecycle({ remediation_status: "completed" })).toBe(
      "responded"
    );
    expect(computeFindingLifecycle({ remediation_status: "in_progress" })).toBe(
      "responded"
    );
  });

  it("returns 'responded' when a contributor response row exists", () => {
    expect(
      computeFindingLifecycle({ responses: [{ id: "r1" }] })
    ).toBe("responded");
  });

  it("returns 'resolved' when resolved_at is set via updated_drawings", () => {
    expect(
      computeFindingLifecycle({
        resolution_type: "updated_drawings",
        resolved_at: "2026-06-20T00:00:00Z",
      })
    ).toBe("resolved");
  });

  it("returns 'resolved' when resolved via evidence", () => {
    expect(
      computeFindingLifecycle({
        resolution_type: "evidence",
        resolved_at: "2026-06-20T00:00:00Z",
      })
    ).toBe("resolved");
  });

  it("returns 'waived' when resolution_type is waiver, regardless of response", () => {
    expect(
      computeFindingLifecycle({
        resolution_type: "waiver",
        resolved_at: "2026-06-20T00:00:00Z",
        remediation_status: "completed",
      })
    ).toBe("waived");
  });

  it("builder verdict wins over a contributor reply", () => {
    // A finding the contributor replied to AND the builder then resolved → resolved.
    expect(
      computeFindingLifecycle({
        remediation_status: "completed",
        responses: [{ id: "r1" }],
        resolution_type: "evidence",
        resolved_at: "2026-06-20T00:00:00Z",
      })
    ).toBe("resolved");
  });
});

describe("allFindingsConverged", () => {
  it("is false for an empty list (nothing to be ready about)", () => {
    expect(allFindingsConverged([])).toBe(false);
  });

  it("is false while any finding is open or responded", () => {
    const findings: LifecycleInput[] = [
      { resolution_type: "evidence", resolved_at: "2026-06-20T00:00:00Z" },
      { remediation_status: "completed" }, // responded, not resolved
    ];
    expect(allFindingsConverged(findings)).toBe(false);
  });

  it("is true once every finding is resolved or waived", () => {
    const findings: LifecycleInput[] = [
      { resolution_type: "updated_drawings", resolved_at: "2026-06-20T00:00:00Z" },
      { resolution_type: "waiver", resolved_at: "2026-06-20T00:00:00Z" },
    ];
    expect(allFindingsConverged(findings)).toBe(true);
  });
});

describe("unresolvedCount", () => {
  it("counts only open + responded findings", () => {
    const findings: LifecycleInput[] = [
      {}, // open
      { remediation_status: "completed" }, // responded
      { resolution_type: "evidence", resolved_at: "2026-06-20T00:00:00Z" }, // resolved
      { resolution_type: "waiver", resolved_at: "2026-06-20T00:00:00Z" }, // waived
    ];
    expect(unresolvedCount(findings)).toBe(2);
  });
});
