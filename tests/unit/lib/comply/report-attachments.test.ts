import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  classifyAttachment,
  appendRemediationDrawings,
  type DrawingAttachment,
} from "@/lib/comply/report-attachments";

// A valid 1x1 transparent PNG.
const PNG_1x1 = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  ),
);

async function makeSimplePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  return doc.save();
}

// SCRUM-331 (b): remediated drawings are appended to the exported Comply report.
// classifyAttachment decides how each file is embedded — the pure, testable core
// of that path. Images and PDFs render into the report; anything else is listed,
// not silently dropped.
describe("classifyAttachment", () => {
  it("classifies PNG by extension and content-type", () => {
    expect(classifyAttachment("plan.png")).toBe("image-png");
    expect(classifyAttachment("PLAN.PNG")).toBe("image-png");
    expect(classifyAttachment("noext", "image/png")).toBe("image-png");
  });

  it("classifies JPEG by extension and content-type", () => {
    expect(classifyAttachment("plan.jpg")).toBe("image-jpg");
    expect(classifyAttachment("plan.jpeg")).toBe("image-jpg");
    expect(classifyAttachment("scan.JPG")).toBe("image-jpg");
    expect(classifyAttachment("noext", "image/jpeg")).toBe("image-jpg");
  });

  it("classifies PDF by extension and content-type", () => {
    expect(classifyAttachment("revised-drawings.pdf")).toBe("pdf");
    expect(classifyAttachment("noext", "application/pdf")).toBe("pdf");
  });

  it("treats CAD and office formats as unsupported (listed, not embedded)", () => {
    expect(classifyAttachment("model.dwg")).toBe("unsupported");
    expect(classifyAttachment("model.dxf")).toBe("unsupported");
    expect(classifyAttachment("notes.docx")).toBe("unsupported");
    expect(classifyAttachment("archive.zip")).toBe("unsupported");
    expect(classifyAttachment("noextension")).toBe("unsupported");
  });

  it("prefers the extension but falls back to content-type", () => {
    // A .png extension wins even if content-type is generic.
    expect(classifyAttachment("plan.png", "application/octet-stream")).toBe(
      "image-png",
    );
    // No usable extension → content-type decides.
    expect(classifyAttachment("blob", "image/jpg")).toBe("image-jpg");
  });
});

describe("appendRemediationDrawings", () => {
  it("returns the base PDF unchanged when there are no attachments", async () => {
    const base = await makeSimplePdf(1);
    const out = await appendRemediationDrawings(base, []);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(1);
  });

  it("appends a manifest + a page per attachment, mixing images, PDFs and unsupported files", async () => {
    const base = await makeSimplePdf(1);
    const pdfAttachment = await makeSimplePdf(1);
    const attachments: DrawingAttachment[] = [
      { findingTitle: "Fire wall FRL", fileName: "revised-plan.png", bytes: PNG_1x1 },
      { findingTitle: "Setback", fileName: "revised-set.pdf", bytes: pdfAttachment },
      { findingTitle: "CAD model", fileName: "model.dwg", bytes: new Uint8Array([1, 2, 3]) },
    ];
    const out = await appendRemediationDrawings(base, attachments);
    const doc = await PDFDocument.load(out);
    // 1 base + 1 manifest + 1 (png page) + 2 (pdf caption + 1 copied page) + 1 (unsupported note) = 6
    expect(doc.getPageCount()).toBe(6);
  });

  it("degrades to a note page (never throws) when an image is corrupt", async () => {
    const base = await makeSimplePdf(1);
    const attachments: DrawingAttachment[] = [
      // Classified image-png by name, but the bytes are not a real PNG → embedPng
      // throws → caught → note page instead of failing the whole export.
      { findingTitle: "Bad", fileName: "corrupt.png", bytes: new Uint8Array([9, 9, 9]) },
    ];
    const out = await appendRemediationDrawings(base, attachments);
    const doc = await PDFDocument.load(out);
    // 1 base + 1 manifest + 1 note = 3
    expect(doc.getPageCount()).toBe(3);
  });
});
