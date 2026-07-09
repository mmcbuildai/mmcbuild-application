import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { db } from "@/lib/supabase/db";
import {
  detectPlanKind,
  cloudConvertInputFormat,
  requiresPdfConversion,
  type PlanFileKind,
} from "@/lib/plans/file-kind";
import { convertViaCloudConvert } from "@/lib/plans/dwg-converter";
import { preparePdfBufferForVision } from "@/lib/plans/pdf-vision-prep";
import { extractSpatialLayoutFromDxf } from "@/lib/plans/dxf-extractor";
import { extractFullHouse } from "@/lib/build/spatial/full-house-extractor";
import { extractSpatialLayout } from "@/lib/build/spatial/extractor";
import { aiUnavailableUserMessage } from "@/lib/ai/provider-errors";
import type { Test3DResult } from "@/lib/build/test-3d-types";

/**
 * Test-3D extraction orchestrator. Each heavy operation runs as its own
 * step.run so it gets its own Vercel /api/inngest invocation with the
 * full 300s maxDuration budget. Previously a monolithic pdf-path step
 * accumulated CloudConvert + classifier + extractor + decomposer in one
 * invocation and exceeded 300s, causing Vercel to kill the dispatch and
 * Inngest's transport-level retries to spin indefinitely.
 *
 * Pipeline:
 *   mark-processing       — write started_at
 *   IF image:
 *     extract-image       — direct image → SpatialLayout, persist done in-step
 *   IF dwg:
 *     dwg-dxf-path        — DWG → DXF → wall-layer extract, persist done in-step
 *                           (returns a small ok/skip flag, early-exits on ok)
 *   convert-to-pdf        — pass-through native PDFs, CloudConvert others.
 *                           Intermediate PDF written to a temp path in the
 *                           plan-uploads bucket; only the path string
 *                           passes through Inngest (avoids the per-step
 *                           1MB result-size limit on base64 payloads).
 *   extract-full-house    — read PDF from temp path, run classifier +
 *                           extractor + decomposer, then persist the
 *                           SpatialLayout to test_3d_jobs IN-STEP.
 *
 * Every extract step PERSISTS its layout to the DB inside the step and returns
 * only a small handle — the full layout must never become a step's return value,
 * or Inngest serialises it as step output and a many-walled plan intermittently
 * blows the per-step output cap (output_too_large), erroring the job AFTER the
 * geometry succeeded (SCRUM-309, the terrace).
 *
 * Intermediate temp PDFs accumulate in <org_id>/test-3d/intermediate/.
 * Best-effort cleanup is a future cron — not blocking shipping.
 */
export const runTest3DExtractionFn = inngest.createFunction(
  {
    id: "run-test-3d-extraction",
    name: "Run Test-3D Extraction",
    retries: 0,
    // Terminal-status guarantee. The handler only calls markError() for the
    // failure paths it catches itself. If a step throws an uncaught error, or
    // Vercel kills the invocation when extract-full-house exceeds the function
    // maxDuration, the function fails WITHOUT the job row ever leaving
    // status='processing' — and the client poller then spins forever (the
    // exact "ran for minutes then the app died" symptom). onFailure runs once
    // retries are exhausted (retries: 0 → after the first failure, including a
    // timeout kill) and writes the row to status='error' so every job reaches
    // a terminal state no matter how the worker dies.
    onFailure: async ({ error, event }) => {
      const jobId = event?.data?.event?.data?.jobId as string | undefined;
      if (jobId) {
        // If the hard failure was a provider outage (billing / key / rate
        // limit), write the honest user-facing message instead of a raw
        // "Extraction failed: 400 ... credit balance is too low" string.
        const outageMessage = aiUnavailableUserMessage(error);
        await markError(
          jobId,
          outageMessage ?? `Extraction failed: ${error.message}`,
        );
      }
      console.error(
        "[run-test-3d-extraction] onFailure — job marked error:",
        jobId,
        error.message,
      );
    },
  },
  { event: "test3d/extract.requested" },
  async ({ event, step }) => {
    const { jobId, storagePath, fileName, pageInput } = event.data;

    await step.run("mark-processing", async () => {
      await db()
        .from("test_3d_jobs")
        .update({
          status: "processing",
          started_at: new Date().toISOString(),
          stage: "reading",
        })
        .eq("id", jobId);
    });

    const kind = detectPlanKind(fileName, null);
    if (!kind) {
      await markError(jobId, `Unsupported file type: ${fileName}`);
      return { jobId, status: "error" };
    }

    // Image kind — skip everything else, extract directly
    if (kind === "image") {
      // Persist in-step; never return the layout across the step boundary
      // (output_too_large guard, SCRUM-309).
      await step.run("extract-image", async () => {
        const layout = await extractImagePath(storagePath, fileName, kind);
        await db()
          .from("test_3d_jobs")
          .update({
            status: "done",
            result: layout,
            finished_at: new Date().toISOString(),
          })
          .eq("id", jobId);
        return { persisted: true };
      });
      return { jobId, status: "done" };
    }

    // DWG kind — try DXF-direct first
    if (kind === "dwg") {
      // Persist the layout IN-STEP and return only a small ok/skip flag — same
      // output_too_large guard as the full-house path (SCRUM-309): the full
      // Test3DResult must never become step output.
      const dxfOutcome = await step.run("dwg-dxf-path", async () => {
        const buf = await downloadFromBucket(storagePath);
        if (!buf) return { ok: false };
        const dxfConv = await convertViaCloudConvert(buf, fileName, "dwg", "dxf");
        if ("error" in dxfConv) {
          console.log(
            "[run-test-3d-extraction] DWG→DXF failed:",
            dxfConv.error,
          );
          return { ok: false };
        }
        const layout = extractSpatialLayoutFromDxf(dxfConv.buffer);
        if (!layout) return { ok: false };
        if (!layout.roof) {
          layout.roof = {
            form: "gable",
            pitch_deg: 22.5,
            eave_overhang_m: 0.5,
          };
        }
        const result: Test3DResult = {
          layout,
          kind,
          convertedFrom: "dwg",
          extractedVia: "dxf-direct",
        };
        await db()
          .from("test_3d_jobs")
          .update({
            status: "done",
            result,
            finished_at: new Date().toISOString(),
          })
          .eq("id", jobId);
        return { ok: true };
      });

      if (dxfOutcome.ok) {
        return { jobId, status: "done", extractedVia: "dxf-direct" };
      }
    }

    // PDF-route: native PDFs pass through, others go via CloudConvert.
    // The converted PDF lives in a temp storage path; only the path
    // string travels between steps so we don't blow the Inngest 1MB
    // per-step result limit on multi-MB PDFs.
    const conv = await step.run("convert-to-pdf", async () => {
      return await convertToPdfStep(storagePath, fileName, kind, jobId);
    });

    if ("error" in conv) {
      await markError(jobId, conv.error);
      return { jobId, status: "error" };
    }

    // Downscale large PDFs before extraction. Architect sets run ~36MB (mostly
    // embedded hi-res renders) — over Anthropic's 32MB document ceiling and
    // heavy on worker memory. A CloudConvert optimise pass collapses them well
    // under the limit so they extract instead of hitting the size guard. Only
    // runs above the threshold (cost/latency), and falls back to the original
    // path on any failure.
    const optimisedPath = await step.run("optimise-large-pdf", async () => {
      return await optimiseLargePdfStep(conv.pdfPath, jobId);
    });

    await step.run("stage-extracting", async () => {
      await db()
        .from("test_3d_jobs")
        .update({ stage: "extracting" })
        .eq("id", jobId);
    });

    // Persist the extracted layout INSIDE the extraction step, and return only a
    // small handle. Returning the full layout across the Inngest step boundary
    // serialised it as this step's OUTPUT, which intermittently exceeded the
    // step-output size cap on plans with many walls — a terrace extracted 55
    // walls, then failed with output_too_large so the job errored even though the
    // geometry was produced (SCRUM-309; matches the "more walls → error, fewer →
    // clean" pattern). Writing to test_3d_jobs in-step keeps the big blob out of
    // the step output entirely. (Same latent pattern noted in the Inngest
    // pitfalls memo: never RETURN a big blob from step.run.)
    const summary = await step.run("extract-full-house", async () => {
      const layout = await extractFromPdfPath(
        optimisedPath,
        kind,
        conv.convertedFrom,
        pageInput,
      );
      await db()
        .from("test_3d_jobs")
        .update({
          status: "done",
          result: layout,
          finished_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      const wallCount =
        (layout as { layout?: { walls?: unknown[] } } | null)?.layout?.walls
          ?.length ?? null;
      return { wallCount };
    });

    return { jobId, status: "done", wallCount: summary.wallCount };
  },
);

async function downloadFromBucket(path: string): Promise<Buffer | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("plan-uploads")
    .download(path);
  if (error || !data) {
    console.error(
      "[run-test-3d-extraction] download failed:",
      path,
      error?.message,
    );
    return null;
  }
  return Buffer.from(await data.arrayBuffer());
}

async function markError(jobId: string, message: string) {
  await db()
    .from("test_3d_jobs")
    .update({
      status: "error",
      error: message,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

/**
 * Image path — PNG/JPG only. WebP rejected. Direct Sonnet image-content
 * extraction, no PDF detour, no decomposer.
 */
async function extractImagePath(
  storagePath: string,
  fileName: string,
  kind: PlanFileKind,
): Promise<Test3DResult> {
  const sourceBuffer = await downloadFromBucket(storagePath);
  if (!sourceBuffer) {
    return { layout: null, kind, error: "Storage download failed" };
  }
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "webp") {
    return {
      layout: null,
      kind,
      error:
        "WebP not supported by the current extractor. Convert to PNG/JPG and re-upload.",
    };
  }
  const mediaType: "image/png" | "image/jpeg" =
    ext === "png" ? "image/png" : "image/jpeg";
  const layout = await extractSpatialLayout(
    sourceBuffer.toString("base64"),
    mediaType,
  );
  return { layout, kind };
}

/**
 * Convert-to-PDF step. Returns the storage path of the PDF (the original
 * path for native-PDF uploads, or a freshly-written intermediate path
 * for CloudConvert outputs). Caller passes only the path string forward;
 * the next step downloads the bytes.
 */
async function convertToPdfStep(
  storagePath: string,
  fileName: string,
  kind: PlanFileKind,
  jobId: string,
): Promise<
  | { pdfPath: string; convertedFrom: PlanFileKind | undefined }
  | { error: string }
> {
  if (kind === "pdf") {
    return { pdfPath: storagePath, convertedFrom: undefined };
  }
  if (!requiresPdfConversion(kind) && kind !== "dwg") {
    return { error: `Unsupported kind for PDF route: ${kind}` };
  }

  const inputFormat =
    kind === "dwg" ? "dwg" : cloudConvertInputFormat(kind, fileName);
  if (!inputFormat) {
    return { error: `No CloudConvert input format for kind: ${kind}` };
  }

  const sourceBuffer = await downloadFromBucket(storagePath);
  if (!sourceBuffer) return { error: "Storage download failed (source)" };

  const conv = await convertViaCloudConvert(
    sourceBuffer,
    fileName,
    inputFormat,
    "pdf",
  );
  if ("error" in conv) {
    return { error: `CloudConvert ${kind} → PDF failed: ${conv.error}` };
  }

  // Write intermediate PDF to storage under the same org bucket so the
  // next step can read it. Path is keyed by jobId for uniqueness.
  const orgPrefix = storagePath.split("/")[0] || "shared";
  const intermediatePath = `${orgPrefix}/test-3d/intermediate/${jobId}.pdf`;
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("plan-uploads")
    .upload(intermediatePath, conv.buffer, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadError) {
    return {
      error: `Intermediate PDF upload failed: ${uploadError.message}`,
    };
  }

  return { pdfPath: intermediatePath, convertedFrom: kind };
}

/**
 * Downscale-large-PDF step. Runs the shared PDF→vision prep (the SAME optimise
 * pass the on-upload attribute extractor uses); when it shrinks the file, writes
 * the smaller copy to a temp path and returns it, otherwise returns the original
 * path unchanged. Best-effort: the size guard in extractFullHouse is the backstop
 * if optimise can't get it under the ceiling.
 */
async function optimiseLargePdfStep(
  pdfPath: string,
  jobId: string,
): Promise<string> {
  const buf = await downloadFromBucket(pdfPath);
  if (!buf) return pdfPath; // download failure surfaces in the extract step

  const prep = await preparePdfBufferForVision(buf);
  if (!prep.optimised) return pdfPath; // below threshold, no win, or optimise failed

  const orgPrefix = pdfPath.split("/")[0] || "shared";
  const optimisedPath = `${orgPrefix}/test-3d/optimised/${jobId}.pdf`;
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from("plan-uploads")
    .upload(optimisedPath, prep.buffer, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (error) {
    console.error(
      "[run-test-3d-extraction] optimised upload failed, using original:",
      error.message,
    );
    return pdfPath;
  }
  return optimisedPath;
}

/**
 * Extract-full-house step. Reads the PDF (intermediate or original) from
 * storage and runs the full classifier + extractor + decomposer chain.
 * Returns the final Test3DResult.
 */
async function extractFromPdfPath(
  pdfPath: string,
  kind: PlanFileKind,
  convertedFrom: PlanFileKind | undefined,
  pageInput?: string,
): Promise<Test3DResult> {
  const pdfBuffer = await downloadFromBucket(pdfPath);
  if (!pdfBuffer) {
    return { layout: null, kind, convertedFrom, error: "PDF download failed" };
  }

  try {
    const requestedPage =
      pageInput && pageInput.trim() !== ""
        ? Number(pageInput.trim())
        : undefined;
    const pdfBase64 = pdfBuffer.toString("base64");
    const result = await extractFullHouse(pdfBase64, {
      floorPlanPageOverride: requestedPage,
    });

    if (result.error || !result.layout) {
      return {
        layout: null,
        kind,
        convertedFrom,
        detectedPage: result.floorPlanPage ?? undefined,
        pdfPageCount: result.totalPages ?? undefined,
        classifications: result.classifications,
        decomposer: result.decomposer,
        error: result.error ?? "PDF extraction returned no layout",
      };
    }

    return {
      layout: result.layout,
      detectedPage:
        requestedPage == null ? (result.floorPlanPage ?? undefined) : undefined,
      pageUsed: requestedPage ?? (result.floorPlanPage ?? undefined),
      pdfPageCount: result.totalPages ?? undefined,
      kind,
      convertedFrom,
      classifications: result.classifications,
      elevationsExtracted: result.elevationsExtracted.length,
      sectionPage: result.sectionExtracted?.pageNumber,
      schedulePage: result.scheduleExtracted?.pageNumber,
      decomposer: result.decomposer,
    };
  } catch (err) {
    console.error("[run-test-3d-extraction] extract-full-house threw:", err);
    // Prefer an honest "AI service unavailable" message over a raw provider
    // error string when the cause is an outage (billing / key / rate limit).
    const outageMessage = aiUnavailableUserMessage(err);
    return {
      layout: null,
      kind,
      convertedFrom,
      error:
        outageMessage ?? (err instanceof Error ? err.message : String(err)),
    };
  }
}
