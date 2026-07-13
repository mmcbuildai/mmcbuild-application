// SCRUM-331 (b): append the remediated ("mediated") drawings to the exported
// Comply report so the export reflects the CURRENT design, not just the original
// analysis. The base compliance report is produced by jsPDF
// (generateCompliancePdf); here we take those bytes and, using pdf-lib, append
// the drawings a contributor uploaded to resolve each finding — images as a
// fitted page, PDFs by copying their pages. Anything we can't render (e.g. a DWG)
// is listed on a manifest page rather than silently dropped (degrade, don't
// fake).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from "pdf-lib";

/** How an attachment can be embedded into the report PDF. */
export type AttachmentKind = "image-png" | "image-jpg" | "pdf" | "unsupported";

/**
 * Classify a remediation attachment by filename extension, falling back to the
 * stored content-type. Pure — unit-tested. Only PNG/JPEG images and PDFs can be
 * rendered into the report; everything else (DWG, DOCX, …) is "unsupported" and
 * gets listed, not embedded.
 */
export function classifyAttachment(
  fileName: string,
  contentType?: string | null,
): AttachmentKind {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  const ct = (contentType ?? "").toLowerCase();
  if (ext === "png" || ct === "image/png") return "image-png";
  if (ext === "jpg" || ext === "jpeg" || ct === "image/jpeg" || ct === "image/jpg")
    return "image-jpg";
  if (ext === "pdf" || ct === "application/pdf") return "pdf";
  return "unsupported";
}

/** A remediated drawing to append, already downloaded to bytes. */
export interface DrawingAttachment {
  /** The finding this drawing resolved (used in the caption). */
  findingTitle: string;
  fileName: string;
  bytes: Uint8Array;
  contentType?: string | null;
}

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;

/**
 * Append the remediated drawings to an existing compliance-report PDF and return
 * the merged bytes. Never throws for a single bad attachment — a file that fails
 * to embed is recorded on the manifest instead, so a real submission pack is
 * never silently short a drawing.
 */
export async function appendRemediationDrawings(
  basePdfBytes: Uint8Array | ArrayBuffer,
  attachments: DrawingAttachment[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(basePdfBytes);
  if (attachments.length === 0) return doc.save();

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Section divider + manifest of every attachment (rendered or not).
  drawManifestPage(doc, bold, font, attachments);

  for (const att of attachments) {
    const kind = classifyAttachment(att.fileName, att.contentType);
    try {
      if (kind === "image-png" || kind === "image-jpg") {
        const image =
          kind === "image-png"
            ? await doc.embedPng(att.bytes)
            : await doc.embedJpg(att.bytes);
        drawImagePage(doc, bold, font, att, image);
      } else if (kind === "pdf") {
        await appendPdfPages(doc, bold, font, att);
      } else {
        // Unsupported (e.g. DWG) — the manifest already lists it; add a note page
        // so the reader knows the native file exists but couldn't be rendered.
        drawNotePage(
          doc,
          bold,
          font,
          att,
          "This drawing is in a format that can't be embedded in the PDF (e.g. DWG). The native file is attached to the finding in MMC Comply.",
        );
      }
    } catch {
      // Corrupt/oversized/unreadable — never fail the whole export for one file.
      drawNotePage(
        doc,
        bold,
        font,
        att,
        "This drawing could not be embedded (the file may be corrupt or in an unexpected format). The native file is attached to the finding in MMC Comply.",
      );
    }
  }

  return doc.save();
}

function drawManifestPage(
  doc: PDFDocument,
  bold: PDFFont,
  font: PDFFont,
  attachments: DrawingAttachment[],
) {
  const page = doc.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN;
  page.drawText("Remediated Drawings", { x: MARGIN, y, size: 18, font: bold });
  y -= 26;
  page.drawText(
    "The following updated drawings were provided to resolve the findings in this report.",
    { x: MARGIN, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) },
  );
  y -= 28;
  attachments.forEach((att, i) => {
    if (y < MARGIN + 40) {
      y = A4.height - MARGIN;
      doc.addPage([A4.width, A4.height]);
    }
    const line = `${i + 1}. ${att.fileName}`;
    page.drawText(truncate(line, 90), { x: MARGIN, y, size: 11, font: bold });
    y -= 15;
    page.drawText(truncate(`Resolves: ${att.findingTitle}`, 95), {
      x: MARGIN + 12,
      y,
      size: 9,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });
    y -= 22;
  });
}

function drawImagePage(
  doc: PDFDocument,
  bold: PDFFont,
  font: PDFFont,
  att: DrawingAttachment,
  image: PDFImage,
) {
  const page = doc.addPage([A4.width, A4.height]);
  const captionH = drawCaption(page, bold, font, att);
  const availW = A4.width - MARGIN * 2;
  const availH = A4.height - MARGIN - captionH - MARGIN;
  const scale = Math.min(availW / image.width, availH / image.height, 1);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawImage(image, {
    x: MARGIN + (availW - w) / 2,
    y: A4.height - MARGIN - captionH - h,
    width: w,
    height: h,
  });
}

async function appendPdfPages(
  doc: PDFDocument,
  bold: PDFFont,
  font: PDFFont,
  att: DrawingAttachment,
) {
  // Caption page, then the source PDF's own pages copied verbatim.
  const captionPage = doc.addPage([A4.width, A4.height]);
  drawCaption(captionPage, bold, font, att);
  const src = await PDFDocument.load(att.bytes);
  const pages = await doc.copyPages(src, src.getPageIndices());
  pages.forEach((p) => doc.addPage(p));
}

function drawNotePage(
  doc: PDFDocument,
  bold: PDFFont,
  font: PDFFont,
  att: DrawingAttachment,
  note: string,
) {
  const page = doc.addPage([A4.width, A4.height]);
  const captionH = drawCaption(page, bold, font, att);
  wrapText(note, 90).forEach((line, i) => {
    page.drawText(line, {
      x: MARGIN,
      y: A4.height - MARGIN - captionH - 16 - i * 14,
      size: 10,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
  });
}

/** Draw the finding/file caption at the top of a page; return its height. */
function drawCaption(
  page: ReturnType<PDFDocument["addPage"]>,
  bold: PDFFont,
  font: PDFFont,
  att: DrawingAttachment,
): number {
  let y = A4.height - MARGIN;
  page.drawText(truncate(att.fileName, 80), { x: MARGIN, y, size: 12, font: bold });
  y -= 15;
  page.drawText(truncate(`Resolves: ${att.findingTitle}`, 95), {
    x: MARGIN,
    y,
    size: 9,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });
  return MARGIN + 15 + 12; // top margin + two lines
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if ((current + " " + w).trim().length > maxChars) {
      if (current) lines.push(current);
      current = w;
    } else {
      current = (current + " " + w).trim();
    }
  }
  if (current) lines.push(current);
  return lines;
}
