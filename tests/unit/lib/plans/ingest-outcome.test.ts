import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  classifyIngestOutcome,
  noContentMessage,
  type IngestOutcome,
} from "@/lib/plans/ingest-outcome";

// SCRUM-316 follow-up (Karen, 2026-08-04).
//
// A 36.9MB DWG uploaded cleanly and extracted NOTHING: 0 rows in
// document_embeddings against 28 for a working PDF, `status: "ready"`,
// `error_message: null`. The pipeline only marked a plan for review when
// something THREW, so extracting nothing was indistinguishable from extracting
// everything — and the questionnaire pre-filled silently from an empty source.
//
// These tests pin the rule the repo already states and did not apply here: a
// job reporting done is not proof of success.

const base: IngestOutcome = {
  pageCount: 1,
  chunkCount: 0,
  manualReview: false,
  errorMessage: null,
};

describe("classifyIngestOutcome — zero content is a failure, not a success", () => {
  it("sends a plan that produced no chunks to manual_review", () => {
    expect(classifyIngestOutcome(base, "dwg").status).toBe("manual_review");
  });

  it("explains WHY, rather than leaving the reason null", () => {
    const { errorMessage } = classifyIngestOutcome(base, "dwg");
    expect(errorMessage).toBeTruthy();
    expect(errorMessage).toMatch(/couldn't read any text/i);
  });

  it("marks a plan ready only when chunks were actually embedded", () => {
    const ok = classifyIngestOutcome({ ...base, chunkCount: 28 }, "pdf");
    expect(ok).toEqual({ status: "ready", errorMessage: null });
  });

  it("treats a negative count as failure too, not as a truthy number", () => {
    // Defensive: a counter that goes wrong should never read as success.
    expect(classifyIngestOutcome({ ...base, chunkCount: -1 }, "pdf").status).toBe(
      "manual_review",
    );
  });
});

describe("classifyIngestOutcome — a known failure keeps its own reason", () => {
  it("does not overwrite a specific error with the generic no-content one", () => {
    // "CloudConvert timed out" tells the reader far more than "we couldn't read
    // any text". Losing it to a broader message would be a regression in
    // diagnosability disguised as a fix.
    const failed: IngestOutcome = {
      pageCount: 0,
      chunkCount: 0,
      manualReview: true,
      errorMessage: "DWG → DXF conversion failed: CloudConvert timed out",
    };
    const out = classifyIngestOutcome(failed, "dwg");
    expect(out.status).toBe("manual_review");
    expect(out.errorMessage).toBe(
      "DWG → DXF conversion failed: CloudConvert timed out",
    );
  });
});

describe("noContentMessage — written for the person holding the file", () => {
  it("tells a CAD user the cause and what to do next", () => {
    const m = noContentMessage("dwg");
    expect(m).toMatch(/line-work/i); // the cause
    expect(m).toMatch(/PDF export|by hand/i); // the way forward
    expect(m).toMatch(/saved/i); // reassurance the file is not lost
  });

  it("gives a PDF user a different, accurate cause", () => {
    // A scanned PDF and a CAD drawing fail for different reasons; one message
    // for both would be wrong for at least one of them.
    expect(noContentMessage("pdf")).toMatch(/scan|image/i);
    expect(noContentMessage("pdf")).not.toMatch(/line-work/i);
  });

  it("covers every accepted file kind without falling back to silence", () => {
    for (const kind of ["pdf", "image", "dwg", "rvt", "skp", "doc"] as const) {
      expect(noContentMessage(kind).length).toBeGreaterThan(60);
    }
  });
});

// --- the vision fallback -----------------------------------------------------

const mockCallVisionModel = vi.fn();
vi.mock("@/lib/build/spatial/vision-call", () => ({
  callVisionModel: (...a: unknown[]) => mockCallVisionModel(...a),
}));
const mockPrepare = vi.fn();
vi.mock("@/lib/plans/pdf-vision-prep", () => ({
  preparePdfBufferForVision: (...a: unknown[]) => mockPrepare(...a),
}));

const { readPlanTextViaVision, NO_LEGIBLE_TEXT } = await import(
  "@/lib/plans/vision-text-fallback"
);

const LONG = "TITLE BLOCK\nProject: Terraces 01\nBEDROOM 1  3200 x 3600\nLIVING";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrepare.mockResolvedValue({
    buffer: Buffer.from("pdf"),
    optimised: false,
    withinCeiling: true,
  });
});

describe("readPlanTextViaVision — reads the drawing, or says it couldn't", () => {
  it("returns the transcription when the model reads the sheet", async () => {
    mockCallVisionModel.mockResolvedValue({ text: LONG });
    expect(await readPlanTextViaVision(Buffer.from("x"))).toEqual({ text: LONG });
  });

  it("refuses to send a PDF still over the size ceiling", async () => {
    // Sending it would 400 or silently truncate — degrade, don't fake.
    mockPrepare.mockResolvedValue({
      buffer: Buffer.from("pdf"),
      optimised: true,
      withinCeiling: false,
    });
    const r = await readPlanTextViaVision(Buffer.from("x"));
    expect(r).toHaveProperty("error");
    expect(mockCallVisionModel).not.toHaveBeenCalled();
  });

  it("treats the no-legible-text marker as a failure, not as content", async () => {
    mockCallVisionModel.mockResolvedValue({ text: NO_LEGIBLE_TEXT });
    expect(await readPlanTextViaVision(Buffer.from("x"))).toHaveProperty("error");
  });

  it("rejects a too-short reply rather than embedding a meaningless chunk", async () => {
    // A few characters is the model failing in a way the marker missed. Storing
    // it would let the plan claim it was read.
    mockCallVisionModel.mockResolvedValue({ text: "Sheet 1" });
    expect(await readPlanTextViaVision(Buffer.from("x"))).toHaveProperty("error");
  });

  it("never throws — a vision outage must not break ingestion", async () => {
    mockCallVisionModel.mockRejectedValue(new Error("provider 503"));
    const r = await readPlanTextViaVision(Buffer.from("x"));
    expect(r).toEqual({ error: "provider 503" });
  });

  it("asks the model to transcribe, never to interpret", async () => {
    // The prompt is the only thing standing between a transcription and an
    // invented description of a building — pin it.
    mockCallVisionModel.mockResolvedValue({ text: LONG });
    await readPlanTextViaVision(Buffer.from("x"));
    const system = mockCallVisionModel.mock.calls[0][1].system as string;
    expect(system).toMatch(/Never infer, complete, correct or expand/i);
    expect(system).toMatch(/not interpreting a design/i);
  });
});
