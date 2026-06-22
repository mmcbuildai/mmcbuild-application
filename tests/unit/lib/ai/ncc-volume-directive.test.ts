import { describe, it, expect } from "vitest";
import { nccVolumeDirective } from "@/lib/ai/prompts/compliance-system";

describe("nccVolumeDirective", () => {
  it("routes Class 1 (houses) to Volume Two and tells the model to ignore Volume One", () => {
    const out = nccVolumeDirective("Class 1a");
    expect(out).toContain("NCC Volume Two");
    expect(out).toContain("ONLY against Volume Two");
    expect(out).toContain("do not apply");
    expect(out.toLowerCase()).toContain("class 1a");
  });

  it("routes Class 10 (sheds/structures) to Volume Two", () => {
    expect(nccVolumeDirective("Class 10a")).toContain("Volume Two");
  });

  it("routes Class 2 (apartments) to Volume One with an advisory caveat", () => {
    const out = nccVolumeDirective("Class 2");
    expect(out).toContain("NCC Volume One");
    expect(out).toContain("ADVISORY");
    expect(out).toContain("building surveyor");
  });

  it("routes Class 3 (boarding house / hotel) to Volume One", () => {
    expect(nccVolumeDirective("Class 3")).toContain("Volume One");
  });

  it("routes Class 9 (commercial) to Volume One", () => {
    expect(nccVolumeDirective("Class 9b")).toContain("Volume One");
  });

  it("defaults a blank/unknown classification to Volume Two (residential tool)", () => {
    expect(nccVolumeDirective("")).toContain("Volume Two");
    expect(nccVolumeDirective("Not specified")).toContain("Volume Two");
  });
});
