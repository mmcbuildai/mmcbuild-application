import { describe, it, expect } from "vitest";
import {
  findingMatchKey,
  computeCheckDelta,
  carryForwardWaivers,
} from "@/lib/comply/check-delta";

describe("findingMatchKey", () => {
  it("normalises ncc_section + category to lowercase and trims whitespace", () => {
    expect(
      findingMatchKey({ ncc_section: "  H2.2  ", category: "  Fire Safety  " })
    ).toBe("h2.2|fire safety");
  });

  it("treats case/whitespace variants of the same section+category as equal", () => {
    const a = findingMatchKey({ ncc_section: "P2.4.1", category: "Energy" });
    const b = findingMatchKey({ ncc_section: " p2.4.1 ", category: " ENERGY " });
    expect(a).toBe(b);
  });

  it("distinguishes different sections within the same category", () => {
    const a = findingMatchKey({ ncc_section: "H1.1", category: "structure" });
    const b = findingMatchKey({ ncc_section: "H1.2", category: "structure" });
    expect(a).not.toBe(b);
  });
});

describe("computeCheckDelta", () => {
  const parent = [
    { ncc_section: "H2.2", category: "fire", title: "Fire wall rating" },
    { ncc_section: "P2.4.1", category: "energy", title: "Insulation R-value" },
    { ncc_section: "D2.1", category: "access", title: "Ramp gradient" },
  ];

  it("classifies cleared, stillOpen and newlyIntroduced by section+category", () => {
    const child = [
      // P2.4.1/energy persists -> stillOpen
      { ncc_section: "P2.4.1", category: "energy", title: "Insulation (revised)" },
      // F1.1/waterproofing is new -> newlyIntroduced
      { ncc_section: "F1.1", category: "waterproofing", title: "Wet area membrane" },
    ];
    const delta = computeCheckDelta(parent, child);

    const keys = (arr: { ncc_section: string }[]) =>
      arr.map((f) => f.ncc_section).sort();

    expect(keys(delta.cleared)).toEqual(["D2.1", "H2.2"]);
    expect(keys(delta.stillOpen)).toEqual(["P2.4.1"]);
    expect(keys(delta.newlyIntroduced)).toEqual(["F1.1"]);
  });

  it("matches case/whitespace-insensitively across versions", () => {
    const child = [
      { ncc_section: " h2.2 ", category: " FIRE ", title: "Fire wall (still flagged)" },
    ];
    const delta = computeCheckDelta(parent, child);

    // h2.2/fire matches H2.2/fire -> stillOpen, not newlyIntroduced.
    expect(delta.stillOpen.map((f) => f.ncc_section)).toEqual([" h2.2 "]);
    expect(delta.newlyIntroduced).toHaveLength(0);
    // The other two parent items are cleared.
    expect(delta.cleared.map((f) => f.ncc_section).sort()).toEqual([
      "D2.1",
      "P2.4.1",
    ]);
  });

  it("clears everything when the child has no findings", () => {
    const delta = computeCheckDelta(parent, []);
    expect(delta.cleared).toHaveLength(3);
    expect(delta.stillOpen).toHaveLength(0);
    expect(delta.newlyIntroduced).toHaveLength(0);
  });

  it("treats all child findings as new when the parent was empty", () => {
    const child = [
      { ncc_section: "H2.2", category: "fire", title: "x" },
    ];
    const delta = computeCheckDelta([], child);
    expect(delta.newlyIntroduced).toHaveLength(1);
    expect(delta.cleared).toHaveLength(0);
    expect(delta.stillOpen).toHaveLength(0);
  });
});

describe("carryForwardWaivers", () => {
  const parentFindings = [
    {
      ncc_section: "H2.2",
      category: "fire",
      resolution_type: "waiver",
      waiver_reason: "Engineer sign-off on file",
      resolved_by: "profile-1",
    },
    {
      // Resolved via updated drawings — must NOT carry forward.
      ncc_section: "P2.4.1",
      category: "energy",
      resolution_type: "updated_drawings",
      waiver_reason: null,
      resolved_by: "profile-2",
    },
    {
      // Resolved via evidence — must NOT carry forward.
      ncc_section: "D2.1",
      category: "access",
      resolution_type: "evidence",
      waiver_reason: null,
      resolved_by: "profile-3",
    },
  ];

  it("carries a parent waiver onto the matching child finding with reason + resolver", () => {
    const child = [
      { id: "child-h22", ncc_section: "H2.2", category: "fire" },
      { id: "child-p241", ncc_section: "P2.4.1", category: "energy" },
    ];
    const result = carryForwardWaivers(parentFindings, child);

    expect(result).toEqual([
      {
        childFindingId: "child-h22",
        waiverReason: "Engineer sign-off on file",
        resolvedBy: "profile-1",
      },
    ]);
  });

  it("ignores parent findings resolved via updated_drawings or evidence", () => {
    const child = [
      { id: "child-p241", ncc_section: "P2.4.1", category: "energy" },
      { id: "child-d21", ncc_section: "D2.1", category: "access" },
    ];
    // Neither P2.4.1 (updated_drawings) nor D2.1 (evidence) is a waiver.
    expect(carryForwardWaivers(parentFindings, child)).toEqual([]);
  });

  it("matches case/whitespace-insensitively", () => {
    const child = [
      { id: "child-h22", ncc_section: " h2.2 ", category: " FIRE " },
    ];
    const result = carryForwardWaivers(parentFindings, child);
    expect(result).toHaveLength(1);
    expect(result[0].childFindingId).toBe("child-h22");
    expect(result[0].waiverReason).toBe("Engineer sign-off on file");
  });

  it("returns nothing when no child finding matches a waived parent", () => {
    const child = [
      { id: "child-x", ncc_section: "X9.9", category: "other" },
    ];
    expect(carryForwardWaivers(parentFindings, child)).toEqual([]);
  });

  it("returns nothing when there are no waived parents", () => {
    const noWaivers = parentFindings.filter(
      (f) => f.resolution_type !== "waiver"
    );
    const child = [{ id: "c", ncc_section: "H2.2", category: "fire" }];
    expect(carryForwardWaivers(noWaivers, child)).toEqual([]);
  });
});
