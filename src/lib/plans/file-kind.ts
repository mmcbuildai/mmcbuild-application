export type PlanFileKind =
  | "pdf"
  | "image"
  | "dwg"
  | "rvt"
  | "skp"
  | "doc";

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp"]);
const IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export const ACCEPTED_PLAN_EXTS = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".dwg",
  ".rvt",
  ".skp",
  ".doc",
  ".docx",
] as const;

export const ACCEPTED_PLAN_ACCEPT_ATTR =
  "application/pdf,image/jpeg,image/png,image/webp,.dwg,.rvt,.skp,.doc,.docx," +
  "application/msword," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Hard ceiling on the PDF the 3D extractor will accept. Anthropic's document
 * API caps a single PDF at 32 MB / 100 pages, and a file near that size is
 * also what strains the worker (rasterising a render-heavy architect set) and
 * the browser (a 36 MB plan round-trips as ~48 MB of base64). 32 MB is the
 * line because it's the provider's documented ceiling — we cannot raise it.
 * Guarded both client-side (fail before upload) and server-side (the universal
 * backstop in extractFullHouse, which also covers the project-preview path
 * that never touches the client guard).
 */
export const ANTHROPIC_PDF_MAX_BYTES = 32 * 1024 * 1024;

/** Friendly, actionable message for an over-limit plan file. */
export function planTooLargeMessage(bytes: number): string {
  const mb = (bytes / 1024 / 1024).toFixed(1);
  return (
    `This plan is ${mb} MB, over the 32 MB limit for 3D reconstruction. ` +
    `Architect sets are usually this large because of embedded high-resolution ` +
    `renders or photos. Please compress / flatten the PDF to under 32 MB, or ` +
    `upload just the floor-plan sheet, and try again.`
  );
}

export function detectPlanKind(
  fileName: string,
  mimeType: string | null | undefined,
): PlanFileKind | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf" || mimeType === "application/pdf") return "pdf";
  if (ext === "dwg") return "dwg";
  if (ext === "rvt") return "rvt";
  if (ext === "skp") return "skp";
  if (
    ext === "doc" ||
    ext === "docx" ||
    mimeType === "application/msword" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "doc";
  if (IMAGE_EXTS.has(ext) || (mimeType && IMAGE_MIME.has(mimeType)))
    return "image";
  return null;
}

export function contentTypeForKind(
  kind: PlanFileKind,
  fileName: string,
): string {
  if (kind === "pdf") return "application/pdf";
  if (kind === "dwg") return "application/acad";
  if (kind === "rvt") return "application/octet-stream";
  if (kind === "skp") return "application/vnd.sketchup.skp";
  if (kind === "doc") {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    if (ext === "docx")
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    return "application/msword";
  }
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

/**
 * Kinds that aren't directly ingestible by our PDF/Vision pipeline and need
 * a CloudConvert pass to produce a PDF first. DWG stays out of this set
 * because it has its own DXF-extraction path (layer preservation).
 */
export function requiresPdfConversion(kind: PlanFileKind): boolean {
  return kind === "rvt" || kind === "skp" || kind === "doc";
}

/**
 * CloudConvert `input_format` string for the conversion API. Returns null
 * for kinds that don't go through CloudConvert.
 */
export function cloudConvertInputFormat(
  kind: PlanFileKind,
  fileName: string,
): string | null {
  if (kind === "dwg") return "dwg";
  if (kind === "rvt") return "rvt";
  if (kind === "skp") return "skp";
  if (kind === "doc") {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    return ext === "docx" ? "docx" : "doc";
  }
  return null;
}
