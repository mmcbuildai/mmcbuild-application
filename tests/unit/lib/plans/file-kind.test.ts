import { describe, expect, it } from "vitest";
import {
  detectPlanKind,
  contentTypeForKind,
  requiresPdfConversion,
  cloudConvertInputFormat,
  ACCEPTED_PLAN_EXTS,
} from "@/lib/plans/file-kind";

describe("detectPlanKind — by extension", () => {
  it.each([
    ["plan.pdf", "pdf"],
    ["plan.PDF", "pdf"],
    ["plan.jpg", "image"],
    ["plan.jpeg", "image"],
    ["plan.png", "image"],
    ["plan.webp", "image"],
    ["plan.dwg", "dwg"],
    ["plan.DWG", "dwg"],
    ["plan.rvt", "rvt"],
    ["plan.RVT", "rvt"],
    ["plan.skp", "skp"],
    ["plan.SKP", "skp"],
    ["plan.doc", "doc"],
    ["plan.docx", "doc"],
    ["plan.DOCX", "doc"],
  ])("%s -> %s", (name, expected) => {
    expect(detectPlanKind(name, null)).toBe(expected);
  });

  it("rejects unknown extensions", () => {
    expect(detectPlanKind("plan.zip", null)).toBeNull();
    expect(detectPlanKind("plan.exe", null)).toBeNull();
    expect(detectPlanKind("plan", null)).toBeNull();
  });
});

describe("detectPlanKind — by MIME type", () => {
  it("PDF mime overrides missing extension", () => {
    expect(detectPlanKind("blob", "application/pdf")).toBe("pdf");
  });

  it("Word docx MIME maps to doc", () => {
    expect(
      detectPlanKind(
        "blob",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe("doc");
  });

  it("legacy Word MIME maps to doc", () => {
    expect(detectPlanKind("blob", "application/msword")).toBe("doc");
  });
});

describe("requiresPdfConversion", () => {
  it("returns true for rvt/skp/doc (CloudConvert path)", () => {
    expect(requiresPdfConversion("rvt")).toBe(true);
    expect(requiresPdfConversion("skp")).toBe(true);
    expect(requiresPdfConversion("doc")).toBe(true);
  });

  it("returns false for pdf/image (native pipeline)", () => {
    expect(requiresPdfConversion("pdf")).toBe(false);
    expect(requiresPdfConversion("image")).toBe(false);
  });

  it("returns false for dwg (DWG has its own DXF path, not generic PDF conversion)", () => {
    expect(requiresPdfConversion("dwg")).toBe(false);
  });
});

describe("cloudConvertInputFormat", () => {
  it("returns the CloudConvert input_format value for each CAD/doc kind", () => {
    expect(cloudConvertInputFormat("dwg", "plan.dwg")).toBe("dwg");
    expect(cloudConvertInputFormat("rvt", "plan.rvt")).toBe("rvt");
    expect(cloudConvertInputFormat("skp", "plan.skp")).toBe("skp");
  });

  it("distinguishes legacy .doc from .docx for Word", () => {
    expect(cloudConvertInputFormat("doc", "plan.doc")).toBe("doc");
    expect(cloudConvertInputFormat("doc", "plan.docx")).toBe("docx");
  });

  it("returns null for kinds that bypass CloudConvert", () => {
    expect(cloudConvertInputFormat("pdf", "plan.pdf")).toBeNull();
    expect(cloudConvertInputFormat("image", "plan.png")).toBeNull();
  });
});

describe("contentTypeForKind", () => {
  it("returns format-correct MIME types for storage upload", () => {
    expect(contentTypeForKind("pdf", "plan.pdf")).toBe("application/pdf");
    expect(contentTypeForKind("dwg", "plan.dwg")).toBe("application/acad");
    expect(contentTypeForKind("rvt", "plan.rvt")).toBe("application/octet-stream");
    expect(contentTypeForKind("skp", "plan.skp")).toBe("application/vnd.sketchup.skp");
    expect(contentTypeForKind("doc", "plan.doc")).toBe("application/msword");
    expect(contentTypeForKind("doc", "plan.docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  it("image MIME selection follows the actual extension", () => {
    expect(contentTypeForKind("image", "plan.png")).toBe("image/png");
    expect(contentTypeForKind("image", "plan.webp")).toBe("image/webp");
    expect(contentTypeForKind("image", "plan.jpg")).toBe("image/jpeg");
    expect(contentTypeForKind("image", "plan.jpeg")).toBe("image/jpeg");
  });
});

describe("ACCEPTED_PLAN_EXTS", () => {
  it("includes every kind that detectPlanKind can return", () => {
    // Defensive: catches a kind being added without its extension being
    // wired into the accept attr (would silently break upload UI).
    const exts = new Set(ACCEPTED_PLAN_EXTS);
    expect(exts.has(".pdf")).toBe(true);
    expect(exts.has(".dwg")).toBe(true);
    expect(exts.has(".rvt")).toBe(true);
    expect(exts.has(".skp")).toBe(true);
    expect(exts.has(".doc")).toBe(true);
    expect(exts.has(".docx")).toBe(true);
  });
});
