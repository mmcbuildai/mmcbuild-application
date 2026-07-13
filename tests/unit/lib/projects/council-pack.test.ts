import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  slugify,
  buildPackReadme,
  assembleCouncilPackZip,
  type PackPart,
} from "@/lib/projects/council-pack";

// SCRUM-333 (Phase 1): the council pack zips the project's documents with a
// README manifest at the root.
describe("slugify", () => {
  it("produces a filesystem-safe slug", () => {
    expect(slugify("42 Smith Street Renovation")).toBe(
      "42-smith-street-renovation",
    );
    expect(slugify("  Lot 31 — Stage 2  ")).toBe("lot-31-stage-2");
  });

  it("falls back to 'project' for empty input", () => {
    expect(slugify("")).toBe("project");
    expect(slugify("   ")).toBe("project");
    expect(slugify("!!!")).toBe("project");
  });
});

describe("buildPackReadme", () => {
  it("lists every path and the compile time", () => {
    const readme = buildPackReadme(
      "42 Smith St",
      ["drawings/floor.pdf", "compliance-report.pdf"],
      "2026-07-13T00:00:00.000Z",
    );
    expect(readme).toContain("42 Smith St");
    expect(readme).toContain("2026-07-13T00:00:00.000Z");
    expect(readme).toContain("- drawings/floor.pdf");
    expect(readme).toContain("- compliance-report.pdf");
  });
});

describe("assembleCouncilPackZip", () => {
  it("packs every part plus a README and is re-readable", async () => {
    const parts: PackPart[] = [
      { path: "drawings/floor.pdf", bytes: new Uint8Array([1, 2, 3]) },
      { path: "certifications/frl.pdf", bytes: new Uint8Array([4, 5]) },
      { path: "compliance-report.pdf", bytes: new Uint8Array([6]) },
    ];
    const zipBytes = await assembleCouncilPackZip(
      "42 Smith St",
      parts,
      "2026-07-13T00:00:00.000Z",
    );

    const zip = await JSZip.loadAsync(zipBytes);
    // JSZip also materialises implicit folder entries ("drawings/", …); assert on
    // the actual file entries only.
    const fileNames = Object.keys(zip.files)
      .filter((k) => !zip.files[k].dir)
      .sort();
    expect(fileNames).toEqual([
      "README.txt",
      "certifications/frl.pdf",
      "compliance-report.pdf",
      "drawings/floor.pdf",
    ]);
    const floor = await zip.file("drawings/floor.pdf")!.async("uint8array");
    expect(Array.from(floor)).toEqual([1, 2, 3]);
    const readme = await zip.file("README.txt")!.async("string");
    expect(readme).toContain("drawings/floor.pdf");
  });
});
