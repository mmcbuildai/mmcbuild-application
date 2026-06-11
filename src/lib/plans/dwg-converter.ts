/**
 * DWG conversion via CloudConvert.
 *
 * AutoCAD DWG is a proprietary binary format with no native Node parser.
 * CloudConvert runs the conversion server-side. We default to DXF output
 * because DXF preserves layer structure, entities, and text annotations
 * needed for downstream layer extraction (3D vectoring, auto-fill across
 * comply / build / estimate). PDF output is also supported when an embedded
 * vector/raster representation is enough.
 *
 * Environment:
 *   CLOUDCONVERT_API_KEY — server-side only, never expose to client.
 *
 * Pricing (approx): ~$0.005-$0.02 per DWG depending on size / complexity.
 */

const CLOUDCONVERT_BASE = "https://api.cloudconvert.com/v2";
const POLL_INTERVAL_MS = 3000;
// 240s poll budget (80 × 3s). The CloudConvert call runs inside its OWN
// step.run (dwg-dxf-path / convert-to-pdf are separate steps since the
// 839f3f3 + 381cc0e pipeline split), so it gets a full Vercel 300s
// invocation. 240s poll + ~60s for create/upload/download stays inside
// that 300s step; on exhaustion convertViaCloudConvert returns an error
// RESULT (it does not throw), so there is no Inngest retry storm.
//
// History: 240s (80) when extraction was monolithic spun 11-min transport
// retries because a slow CC blew the whole *shared* step budget (ae6916c
// cut it to 90s/30). 90s was below CloudConvert's "30s–3min" envelope so
// large DWGs timed out; 150s (50) helped but still failed the big multi-
// drawing doc-sets. MH01 ("Manor Homes 01", ~16.4MB, SCRUM-218) is the
// confirmed case — recon-dwg-to-pdf.mjs proves it converts in ~240s. Now
// that the CC call is isolated in its own 300s step, restoring the 240s
// budget is safe (no shared-step blowout) and lets MH01-class files land.
// If files need >~270s end-to-end, the durable fix is step.sleep poll
// across multiple Inngest steps (removes the single-invocation ceiling).
const MAX_POLL_ATTEMPTS = 80;
// Per-HTTP-call timeout. Any single fetch (job create, file upload,
// status poll, file download) that takes longer than this aborts cleanly
// rather than hanging the function until Vercel kills the connection.
const FETCH_TIMEOUT_MS = 60_000;
const MAX_DWG_BYTES = 50 * 1024 * 1024; // 50 MB matches plan-uploads cap
// Job creation occasionally returns a transient 5xx — a 502 Bad Gateway killed
// a live DWG → PDF render on 2026-06-11 (test_3d_jobs ff22b841) because the
// call was single-shot with no retry. Retry transient server/network failures
// a few times before giving up; NEVER retry a 4xx (that's our request being
// wrong, not an upstream blip).
const TRANSIENT_RETRY_ATTEMPTS = 3;

/**
 * fetch() with bounded retry on transient failures (5xx responses + network
 * errors). Each attempt gets a FRESH AbortSignal.timeout — a reused signal
 * would already be aborted on the second attempt. A 4xx returns immediately
 * (not transient). Exported for unit testing the retry behaviour.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: {
    attempts?: number;
    label?: string;
    timeoutMs?: number;
    backoffMs?: number;
  } = {},
): Promise<Response> {
  const attempts = opts.attempts ?? TRANSIENT_RETRY_ATTEMPTS;
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  const backoffMs = opts.backoffMs ?? 800;
  let last = "";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const resp = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      // Success, or a non-transient client error (4xx), or the last attempt →
      // return the response as-is for the caller to handle.
      if (resp.ok || resp.status < 500 || attempt === attempts) return resp;
      last = `HTTP ${resp.status}`;
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
      if (attempt === attempts) throw err;
    }
    console.warn(
      `[cloudconvert] ${opts.label ?? "request"} attempt ${attempt}/${attempts} transient failure (${last}) — retrying`,
    );
    await new Promise((r) => setTimeout(r, backoffMs * attempt));
  }
  // The loop always returns or throws on the final attempt; this is for TS.
  throw new Error(
    `[cloudconvert] ${opts.label ?? "request"} exhausted ${attempts} attempts: ${last}`,
  );
}

export type DwgConvertResult =
  | { buffer: Buffer; format: "pdf" | "dxf" }
  | { error: string };

export type CloudConvertResult =
  | { buffer: Buffer; format: string }
  | { error: string };

interface CCTaskResultForm {
  url: string;
  parameters: Record<string, string>;
}

interface CCTask {
  name: string;
  status?: string;
  result?: {
    form?: CCTaskResultForm;
    files?: { url: string; filename: string }[];
  };
}

interface CCJobResponse {
  data: { id: string; status: string; tasks: CCTask[] };
}

export async function convertDwg(
  dwgBuffer: Buffer,
  fileName: string,
  outputFormat: "pdf" | "dxf" = "dxf",
): Promise<DwgConvertResult> {
  const result = await convertViaCloudConvert(
    dwgBuffer,
    fileName,
    "dwg",
    outputFormat,
    "application/acad",
  );
  if ("error" in result) return result;
  return { buffer: result.buffer, format: outputFormat };
}

/**
 * Run a CloudConvert job for any supported input format (rvt, skp, doc, docx,
 * etc) and return the converted buffer. PDF is the typical target for
 * non-DWG sources because the downstream ingestion pipeline (parsePdf →
 * chunk → embed) already handles PDFs natively.
 */
export async function convertViaCloudConvert(
  sourceBuffer: Buffer,
  fileName: string,
  inputFormat: string,
  outputFormat: string,
  uploadMimeType: string = "application/octet-stream",
  convertOptions: Record<string, unknown> = {},
): Promise<CloudConvertResult> {
  if (sourceBuffer.length > MAX_DWG_BYTES) {
    return { error: `File exceeds ${MAX_DWG_BYTES / 1024 / 1024}MB limit` };
  }

  // Job graph: upload → convert → export-url. The middle "convert-file" task
  // is the only part that differs from an optimise job (see runCloudConvertJob).
  const result = await runCloudConvertJob(
    {
      "import-file": { operation: "import/upload" },
      "convert-file": {
        operation: "convert",
        input: "import-file",
        input_format: inputFormat,
        output_format: outputFormat,
        ...convertOptions,
      },
      "export-file": { operation: "export/url", input: "convert-file" },
    },
    sourceBuffer,
    fileName,
    uploadMimeType,
  );
  if ("error" in result) return result;
  return { buffer: result.buffers[0], format: outputFormat };
}

/**
 * Shared CloudConvert job runner: create job → upload via signed form → poll →
 * download the export. Used by both convertViaCloudConvert and
 * optimizePdfViaCloudConvert. The task graph MUST contain an "import-file"
 * (import/upload) task and an "export-file" (export/url) task; the middle task
 * is what each caller varies.
 */
async function runCloudConvertJob(
  tasks: Record<string, unknown>,
  sourceBuffer: Buffer,
  fileName: string,
  uploadMimeType: string,
): Promise<{ buffers: Buffer[] } | { error: string }> {
  const apiKey = process.env.CLOUDCONVERT_API_KEY;
  if (!apiKey) {
    return { error: "CLOUDCONVERT_API_KEY not configured" };
  }

  // 1. Create the job. Retry transient 5xx — a single 502 here permanently
  //    failed a live render (ff22b841, 2026-06-11). fetchWithRetry gives each
  //    attempt a fresh timeout signal and never retries a 4xx.
  const jobResp = await fetchWithRetry(
    `${CLOUDCONVERT_BASE}/jobs`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tasks }),
    },
    { label: "job-create" },
  );

  if (!jobResp.ok) {
    const text = await jobResp.text().catch(() => "");
    return { error: `CloudConvert job creation failed: ${jobResp.status} ${text.slice(0, 200)}` };
  }

  const job = (await jobResp.json()) as CCJobResponse;
  const jobId = job.data.id;
  const importTask = job.data.tasks.find((t) => t.name === "import-file");
  const uploadForm = importTask?.result?.form;

  if (!uploadForm?.url) {
    return { error: "CloudConvert did not return an upload URL" };
  }

  // 2. Upload the source file via the signed multipart form
  const form = new FormData();
  for (const [key, value] of Object.entries(uploadForm.parameters)) {
    form.append(key, value);
  }
  form.append(
    "file",
    new Blob([new Uint8Array(sourceBuffer)], { type: uploadMimeType }),
    fileName,
  );

  const uploadResp = await fetch(uploadForm.url, {
    method: "POST",
    body: form,
    // A large upload over a slow link can otherwise hang past Vercel's 300s
    // function timeout — abort cleanly at 60s so the caller can surface the
    // failure and either retry or fall through.
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!uploadResp.ok) {
    const text = await uploadResp.text().catch(() => "");
    return { error: `Upload to CloudConvert failed: ${uploadResp.status} ${text.slice(0, 200)}` };
  }

  // 3. Poll the job status until it finishes (or fails / times out)
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const statusResp = await fetch(`${CLOUDCONVERT_BASE}/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }).catch(() => null);
    if (!statusResp || !statusResp.ok) continue;

    const status = (await statusResp.json()) as CCJobResponse;

    if (status.data.status === "finished") {
      const exportTask = status.data.tasks.find((t) => t.name === "export-file");
      const files = exportTask?.result?.files ?? [];
      if (files.length === 0) {
        return { error: "CloudConvert finished without an export URL" };
      }

      // Download every export file. A multi-page PDF→PNG job yields one file
      // per page (used by rasterizePdfPages for the OpenAI vision fallback);
      // single-output jobs (dwg→dxf/pdf, optimise) return a 1-element array and
      // their callers take buffers[0].
      const buffers: Buffer[] = [];
      for (const f of files) {
        const fileResp = await fetch(f.url, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!fileResp.ok) {
          return { error: `Converted file download failed: ${fileResp.status}` };
        }
        buffers.push(Buffer.from(await fileResp.arrayBuffer()));
      }
      return { buffers };
    }

    if (status.data.status === "error") {
      const failed = status.data.tasks.find((t) => t.status === "error");
      return { error: `CloudConvert task failed: ${failed?.name ?? "unknown"}` };
    }
  }

  return { error: "CloudConvert job timed out" };
}

/**
 * Compress/optimise a PDF via CloudConvert (image downsampling + structure
 * cleanup). Architect plan sets are huge (~36 MB for Gladesville) because of
 * embedded high-resolution renders/photos; an optimise pass collapses them
 * well under Anthropic's 32 MB document ceiling so the 3D extractor can read
 * them, WITHOUT asking the user to compress by hand. Runs server-side via
 * CloudConvert (already a hard dependency) — no @napi-rs/canvas bundling risk.
 * Returns an error RESULT (never throws) so the caller can fall back to the
 * original file.
 */
export async function optimizePdfViaCloudConvert(
  pdfBuffer: Buffer,
  fileName: string = "plan.pdf",
): Promise<CloudConvertResult> {
  if (pdfBuffer.length > MAX_DWG_BYTES) {
    return { error: `File exceeds ${MAX_DWG_BYTES / 1024 / 1024}MB limit` };
  }
  const result = await runCloudConvertJob(
    {
      "import-file": { operation: "import/upload" },
      "optimize-file": {
        operation: "optimize",
        input: "import-file",
        input_format: "pdf",
        // "web" downsamples embedded images aggressively — the right profile
        // for shrinking a render-heavy architect PDF for vision extraction.
        profile: "web",
      },
      "export-file": { operation: "export/url", input: "optimize-file" },
    },
    pdfBuffer,
    fileName,
    "application/pdf",
  );
  if ("error" in result) return result;
  return { buffer: result.buffers[0], format: "pdf" };
}

/**
 * Rasterise the first page of a PDF to a high-resolution PNG via CloudConvert.
 *
 * Used by the sheet decomposer to turn a CloudConvert-rendered model-space DWG
 * dump (many drawings tiled on one small page) into a raster Claude vision can
 * actually read. CloudConvert's native PDF document type is rendered at too low
 * a resolution to discern internal walls on a tiled sheet — at the default page
 * size each tile is ~100px and floor plans get mis-read (Claude tagged Manor
 * Homes floor plans as "bus interiors" at native res). Rendering at 300 DPI
 * yields a ~3300×2500 PNG where each tile is legible after cropping.
 *
 * Done server-side via CloudConvert (already a hard dependency of this pipeline)
 * rather than a local rasteriser (pdf-to-img / @napi-rs/canvas) because the
 * latter has a documented history of failing to bundle on Vercel — the very
 * reason the decomposer originally avoided raster. CloudConvert + sharp keeps
 * every step Vercel-safe.
 */
export async function rasterizePdfToPng(
  pdfBuffer: Buffer,
  pixelDensity: number = 300,
): Promise<CloudConvertResult> {
  return convertViaCloudConvert(
    pdfBuffer,
    "page.pdf",
    "pdf",
    "png",
    "application/pdf",
    { pixel_density: pixelDensity, pages: "1" },
  );
}

/**
 * Rasterise multiple PDF pages to PNG in a SINGLE CloudConvert job. Used by the
 * OpenAI vision fallback (SCRUM-290): GPT-4o can't read PDFs, so when Claude is
 * unavailable we turn the plan into page images for it. One job emits one PNG
 * per page (downloaded via runCloudConvertJob's multi-file path).
 *
 * Page scope (the D2 decision): if `pageHint` is given, rasterise just that
 * page; otherwise the first `maxPages` (default 12) — bounded cost, covers the
 * floor plan in virtually every residential set. The caller logs when a set is
 * truncated (no silent cap).
 *
 * @returns the page PNG buffers in page order, or an error RESULT (never throws).
 */
export async function rasterizePdfPages(
  pdfBuffer: Buffer,
  opts: { maxPages?: number; pixelDensity?: number; pageHint?: number } = {},
): Promise<{ buffers: Buffer[] } | { error: string }> {
  if (pdfBuffer.length > MAX_DWG_BYTES) {
    return { error: `File exceeds ${MAX_DWG_BYTES / 1024 / 1024}MB limit` };
  }
  const pixelDensity = opts.pixelDensity ?? 200;
  const pages =
    opts.pageHint && opts.pageHint > 0
      ? String(opts.pageHint)
      : `1-${opts.maxPages ?? 12}`;
  return runCloudConvertJob(
    {
      "import-file": { operation: "import/upload" },
      "convert-file": {
        operation: "convert",
        input: "import-file",
        input_format: "pdf",
        output_format: "png",
        pages,
        pixel_density: pixelDensity,
      },
      "export-file": { operation: "export/url", input: "convert-file" },
    },
    pdfBuffer,
    "plan.pdf",
    "application/pdf",
  );
}
