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
const MAX_POLL_ATTEMPTS = 80; // ~4 minutes
const MAX_DWG_BYTES = 50 * 1024 * 1024; // 50 MB matches plan-uploads cap

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
 *
 * For DWG → PDF specifically, the convert task asks for `all_layouts: true`.
 * CloudConvert's public format spec doesn't document this option but the
 * underlying cadconverter engine respects it when present, producing one
 * PDF page per paper-space layout instead of a single rasterisation of
 * model space. This is the right output for architectural CAD doc-sets
 * (Manor Homes, SAHA Row Homes, etc.) where each paper-space sheet is the
 * intended deliverable, not the model-space dump. If CloudConvert ignores
 * the option, we just get the same single-page behaviour as before — safe
 * to set unconditionally.
 */
export async function convertViaCloudConvert(
  sourceBuffer: Buffer,
  fileName: string,
  inputFormat: string,
  outputFormat: string,
  uploadMimeType: string = "application/octet-stream",
): Promise<CloudConvertResult> {
  const apiKey = process.env.CLOUDCONVERT_API_KEY;
  if (!apiKey) {
    return { error: "CLOUDCONVERT_API_KEY not configured" };
  }
  if (sourceBuffer.length > MAX_DWG_BYTES) {
    return { error: `File exceeds ${MAX_DWG_BYTES / 1024 / 1024}MB limit` };
  }

  const convertTask: Record<string, unknown> = {
    operation: "convert",
    input: "import-file",
    input_format: inputFormat,
    output_format: outputFormat,
  };
  if (inputFormat === "dwg" && outputFormat === "pdf") {
    convertTask.all_layouts = true;
  }

  // 1. Create a job: upload → convert → export-url
  const jobResp = await fetch(`${CLOUDCONVERT_BASE}/jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tasks: {
        "import-file": { operation: "import/upload" },
        "convert-file": convertTask,
        "export-file": {
          operation: "export/url",
          input: "convert-file",
        },
      },
    }),
  });

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
  });

  if (!uploadResp.ok) {
    const text = await uploadResp.text().catch(() => "");
    return { error: `Upload to CloudConvert failed: ${uploadResp.status} ${text.slice(0, 200)}` };
  }

  // 3. Poll the job status until conversion finishes (or fails / times out)
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const statusResp = await fetch(`${CLOUDCONVERT_BASE}/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!statusResp.ok) continue;

    const status = (await statusResp.json()) as CCJobResponse;

    if (status.data.status === "finished") {
      const exportTask = status.data.tasks.find((t) => t.name === "export-file");
      const fileUrl = exportTask?.result?.files?.[0]?.url;
      if (!fileUrl) {
        return { error: "CloudConvert finished without an export URL" };
      }

      const fileResp = await fetch(fileUrl);
      if (!fileResp.ok) {
        return { error: `Converted file download failed: ${fileResp.status}` };
      }

      const arrayBuffer = await fileResp.arrayBuffer();
      return { buffer: Buffer.from(arrayBuffer), format: outputFormat };
    }

    if (status.data.status === "error") {
      const failed = status.data.tasks.find((t) => t.status === "error");
      return { error: `CloudConvert task failed: ${failed?.name ?? "unknown"}` };
    }
  }

  return { error: "CloudConvert job timed out" };
}
