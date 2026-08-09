import { describe, it, expect, vi, beforeEach } from "vitest";
import { PDFDocument } from "pdf-lib";

/**
 * The per-sheet transcription path.
 *
 * These tests exist because the first cut of this module sent a whole plan set
 * as ONE document with ONE output budget, and every way that fails is a
 * PARTIAL read being recorded as a complete one — the same defect as the
 * "ready" bug it was written to fix, one layer down. Each test below pins one
 * of those failures shut.
 *
 * Only the model call is mocked. The PDF splitting is real pdf-lib on real
 * multi-page documents, because "does a sheet actually come out as its own
 * document" is the half that cannot be asserted against a stub.
 */

const mockCallVisionModel = vi.fn();
vi.mock("@/lib/build/spatial/vision-call", () => ({
  callVisionModel: (...a: unknown[]) => mockCallVisionModel(...a),
}));

// Pass the buffer straight through: size handling has its own tests
// (pdf-vision-prep.test.ts), and stubbing it here keeps these tests about
// transcription rather than about CloudConvert.
const mockPrepare = vi.fn();
vi.mock("@/lib/plans/pdf-vision-prep", () => ({
  preparePdfBufferForVision: (...a: unknown[]) => mockPrepare(...a),
}));

const { readPlanTextViaVision, NO_LEGIBLE_TEXT, MAX_TRANSCRIBED_PAGES } =
  await import("@/lib/plans/vision-text-fallback");

const SHEET_TEXT =
  "TITLE BLOCK\nProject: Terraces 01\nBEDROOM 1  3200 x 3600\nLIVING 4200 x 5100";

/** A real, parseable, N-page PDF — the thing the splitter actually has to cope with. */
async function makePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage([595, 842]);
  return Buffer.from(await doc.save());
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrepare.mockImplementation(async (buffer: Buffer) => ({
    buffer,
    optimised: false,
    withinCeiling: true,
  }));
  mockCallVisionModel.mockResolvedValue({ text: SHEET_TEXT });
});

describe("readPlanTextViaVision — one call per sheet, not one per set", () => {
  it("transcribes every sheet of a multi-sheet set", async () => {
    const result = await readPlanTextViaVision(await makePdf(3), "set.pdf");

    expect(mockCallVisionModel).toHaveBeenCalledTimes(3);
    expect(result).not.toHaveProperty("error");
    const text = (result as { text: string }).text;
    expect(text).toContain("--- Sheet 1 of 3 ---");
    expect(text).toContain("--- Sheet 3 of 3 ---");
    expect(text).toContain("BEDROOM 1  3200 x 3600");
  });

  it("gives each sheet its own output budget rather than sharing one", async () => {
    // The whole reason for splitting: a shared budget truncates a long set
    // mid-transcription and the result still passes every other guard.
    await readPlanTextViaVision(await makePdf(2), "set.pdf");
    const budgets = mockCallVisionModel.mock.calls.map(
      (c) => (c[1] as { maxTokens: number }).maxTokens,
    );
    expect(budgets).toHaveLength(2);
    expect(budgets.every((b) => b > 0)).toBe(true);
  });

  it("keeps the sheets it read when ONE sheet is blank", async () => {
    // A whole-document marker check threw away the entire set if any single
    // sheet came back NO_LEGIBLE_TEXT. Eleven good sheets lost to one blank.
    mockCallVisionModel
      .mockResolvedValueOnce({ text: SHEET_TEXT })
      .mockResolvedValueOnce({ text: NO_LEGIBLE_TEXT })
      .mockResolvedValueOnce({ text: SHEET_TEXT });

    const result = await readPlanTextViaVision(await makePdf(3), "set.pdf");

    expect(result).not.toHaveProperty("error");
    const text = (result as { text: string }).text;
    expect(text).toContain("--- Sheet 1 of 3 ---");
    expect(text).toContain("--- Sheet 3 of 3 ---");
    expect(text).not.toContain("--- Sheet 2 of 3 ---");
  });

  it("reports failure only when NO sheet carried legible text", async () => {
    mockCallVisionModel.mockResolvedValue({ text: NO_LEGIBLE_TEXT });
    const result = await readPlanTextViaVision(await makePdf(3), "set.pdf");
    expect(result).toEqual({ error: "the drawing carries no legible text" });
  });

  it("keeps going when one sheet fails outright", async () => {
    // One malformed page object must not cost the set — CAD-exported PDFs
    // ship them routinely.
    mockCallVisionModel
      .mockRejectedValueOnce(new Error("provider 503"))
      .mockResolvedValue({ text: SHEET_TEXT });

    const result = await readPlanTextViaVision(await makePdf(3), "set.pdf");
    expect(result).not.toHaveProperty("error");
    expect((result as { text: string }).text).toContain("--- Sheet 2 of 3 ---");
  });

  it("caps the sheets it reads, and does not read past the cap", async () => {
    await readPlanTextViaVision(await makePdf(MAX_TRANSCRIBED_PAGES + 3), "big.pdf");
    expect(mockCallVisionModel).toHaveBeenCalledTimes(MAX_TRANSCRIBED_PAGES);
  });

  it("says a transcription was cut short instead of storing it as complete", async () => {
    mockCallVisionModel.mockResolvedValue({
      text: SHEET_TEXT,
      stopReason: "max_tokens",
    });
    const result = await readPlanTextViaVision(await makePdf(2), "set.pdf");
    expect(result).toHaveProperty("truncated", true);
  });

  it("does not claim truncation when the model finished", async () => {
    const result = await readPlanTextViaVision(await makePdf(2), "set.pdf");
    expect(result).not.toHaveProperty("truncated");
  });
});

describe("readPlanTextViaVision — the single-sheet and unparseable paths", () => {
  it("sends a one-sheet PDF whole rather than re-saving it", async () => {
    const result = await readPlanTextViaVision(await makePdf(1), "one.pdf");
    expect(mockCallVisionModel).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ text: SHEET_TEXT });
  });

  it("still tries a PDF pdf-lib cannot parse — the model is more forgiving", async () => {
    // Refusing here would lose files that read perfectly well; pdf-lib is
    // stricter about structure than the model is about pictures.
    const result = await readPlanTextViaVision(Buffer.from("not a pdf"), "odd.pdf");
    expect(mockCallVisionModel).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ text: SHEET_TEXT });
  });

  it("never throws — a vision outage must not break ingestion", async () => {
    mockCallVisionModel.mockRejectedValue(new Error("provider 503"));
    const result = await readPlanTextViaVision(Buffer.from("not a pdf"), "odd.pdf");
    expect(result).toEqual({ error: "provider 503" });
  });
});
