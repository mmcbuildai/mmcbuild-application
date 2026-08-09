import { describe, it, expect, vi, beforeEach } from "vitest";
import { PDFDocument } from "pdf-lib";

/**
 * The per-sheet transcription path, and the tile escalation behind it.
 *
 * These tests exist because two successive versions of this module recorded a
 * PARTIAL or FAILED read as a successful one — the same defect as the "ready"
 * bug it was written to fix, one layer down each time. Each test below pins one
 * of those failures shut.
 *
 * Only the model call and the rasteriser are mocked. The PDF splitting is real
 * pdf-lib on real multi-page documents, because "does a sheet come out as its
 * own document" cannot be asserted against a stub.
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

// Rasterisation is CloudConvert + sharp; its own arithmetic is tested in
// raster-tiles.test.ts. Here we care only about WHEN it is reached.
const mockRasterise = vi.fn();
vi.mock("@/lib/plans/raster-tiles", () => ({
  rasterisePageToTiles: (...a: unknown[]) => mockRasterise(...a),
}));

const { readPlanTextViaVision, NO_LEGIBLE_TEXT, MAX_TRANSCRIBED_PAGES, MAX_ESCALATED_PAGES } =
  await import("@/lib/plans/vision-text-fallback");

const SHEET_TEXT =
  "TITLE BLOCK\nProject: Terraces 01\nBEDROOM 1  3200 x 3600\nLIVING 4200 x 5100";
const TILE_TEXT =
  "BEDROOM 1  3200 x 3600\nENSUITE 1800 x 2400\nSCALE 1:100 @ A1  DRAWING A-201";

/** A real, parseable, N-page PDF — the thing the splitter actually has to cope with. */
async function makePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage([595, 842]);
  return Buffer.from(await doc.save());
}

/** A believable tiling result: 2x2 grid of JPEG tiles. */
function tiles(n = 4) {
  return {
    tiles: Array.from({ length: n }, (_, i) => ({
      data: Buffer.from(`tile${i}`),
      mimeType: "image/jpeg" as const,
      row: Math.floor(i / 2) + 1,
      col: (i % 2) + 1,
    })),
    width: 5000,
    height: 3500,
    rows: 2,
    cols: 2,
    coarse: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrepare.mockImplementation(async (buffer: Buffer) => ({
    buffer,
    optimised: false,
    withinCeiling: true,
  }));
  mockCallVisionModel.mockResolvedValue({ text: SHEET_TEXT });
  mockRasterise.mockResolvedValue(tiles());
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

  it("keeps the sheets it read when ONE sheet is blank", async () => {
    // A whole-document marker check threw away the entire set if any single
    // sheet came back NO_LEGIBLE_TEXT. Eleven good sheets lost to one blank.
    mockCallVisionModel
      .mockResolvedValueOnce({ text: SHEET_TEXT })
      .mockResolvedValueOnce({ text: NO_LEGIBLE_TEXT })
      .mockResolvedValueOnce({ text: SHEET_TEXT });
    mockRasterise.mockResolvedValue({ error: "no raster in this test" });

    const result = await readPlanTextViaVision(await makePdf(3), "set.pdf");

    expect(result).not.toHaveProperty("error");
    const text = (result as { text: string }).text;
    expect(text).toContain("--- Sheet 1 of 3 ---");
    expect(text).toContain("--- Sheet 3 of 3 ---");
  });

  it("keeps going when one sheet fails outright", async () => {
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

describe("readPlanTextViaVision — re-reads a blank sheet in tiles", () => {
  it("escalates to tiles when a whole sheet reads blank, and uses the tile text", async () => {
    // THE Karen case: the sheet is covered in text, but scaled to fit it is
    // illegible, so the whole-page read returns the no-legible-text marker.
    mockCallVisionModel
      .mockResolvedValueOnce({ text: NO_LEGIBLE_TEXT }) // whole sheet
      .mockResolvedValue({ text: TILE_TEXT }); // each tile

    const result = await readPlanTextViaVision(await makePdf(1), "sheet.pdf");

    expect(mockRasterise).toHaveBeenCalledTimes(1);
    expect(result).not.toHaveProperty("error");
    expect((result as { text: string }).text).toContain("ENSUITE 1800 x 2400");
  });

  it("sends tiles as IMAGES, not as a PDF", async () => {
    // The whole point of rasterising: a PDF page goes back through the same
    // downscale that lost the text in the first place.
    mockCallVisionModel
      .mockResolvedValueOnce({ text: NO_LEGIBLE_TEXT })
      .mockResolvedValue({ text: TILE_TEXT });

    await readPlanTextViaVision(await makePdf(1), "sheet.pdf");

    const tileCall = mockCallVisionModel.mock.calls[1][1] as {
      images?: { mimeType: string }[];
      pdf?: unknown;
    };
    expect(tileCall.images?.[0].mimeType).toBe("image/jpeg");
    expect(tileCall.pdf).toBeUndefined();
  });

  it("does NOT rasterise when the page already read fine", async () => {
    // Escalation costs a CloudConvert job plus a call per tile. It must only
    // ever run where the cheap path failed.
    await readPlanTextViaVision(await makePdf(2), "set.pdf");
    expect(mockRasterise).not.toHaveBeenCalled();
  });

  it("reports a blank drawing only when the TILES are blank too", async () => {
    mockCallVisionModel.mockResolvedValue({ text: NO_LEGIBLE_TEXT });
    const result = await readPlanTextViaVision(await makePdf(3), "set.pdf");
    expect(mockRasterise).toHaveBeenCalled();
    expect(result).toEqual({ error: "the drawing carries no legible text" });
  });

  it("reports a rasterise failure as itself, not as an empty drawing", async () => {
    // Degrade honestly: "we couldn't render it" and "there's nothing on it"
    // are different facts and lead to different fixes.
    mockCallVisionModel.mockResolvedValue({ text: NO_LEGIBLE_TEXT });
    mockRasterise.mockResolvedValue({ error: "CloudConvert timed out" });

    const result = await readPlanTextViaVision(await makePdf(1), "sheet.pdf");
    expect((result as { error: string }).error).toContain("CloudConvert timed out");
  });

  it("bounds how many blank sheets it re-reads", async () => {
    mockCallVisionModel.mockResolvedValue({ text: NO_LEGIBLE_TEXT });
    await readPlanTextViaVision(await makePdf(MAX_ESCALATED_PAGES + 4), "set.pdf");
    expect(mockRasterise).toHaveBeenCalledTimes(MAX_ESCALATED_PAGES);
  });

  it("survives a tile that throws, keeping the tiles that read", async () => {
    mockCallVisionModel
      .mockResolvedValueOnce({ text: NO_LEGIBLE_TEXT })
      .mockRejectedValueOnce(new Error("provider 503"))
      .mockResolvedValue({ text: TILE_TEXT });

    const result = await readPlanTextViaVision(await makePdf(1), "sheet.pdf");
    expect(result).not.toHaveProperty("error");
    expect((result as { text: string }).text).toContain("ENSUITE 1800 x 2400");
  });
});

describe("readPlanTextViaVision — the single-sheet and unparseable paths", () => {
  it("sends a one-sheet PDF whole rather than re-saving it", async () => {
    const result = await readPlanTextViaVision(await makePdf(1), "one.pdf");
    expect(mockCallVisionModel).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ text: SHEET_TEXT });
  });

  it("still tries a PDF pdf-lib cannot parse — the model is more forgiving", async () => {
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
