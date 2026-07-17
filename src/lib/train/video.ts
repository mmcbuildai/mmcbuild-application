// SCRUM-59 — lesson video upload constraints. Pure so the accepted-type + size
// checks are unit-testable and shared between the upload UI and any server-side
// guard. Mirrors the bucket config in migration 00085.

export const ACCEPTED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime", // .mov
  "video/x-m4v",
] as const;

/** For the file input `accept` attribute. */
export const ACCEPTED_VIDEO_EXTENSIONS = ".mp4,.webm,.mov,.m4v";

/** 500 MB — matches the training-videos bucket `file_size_limit`. */
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

export function isAcceptedVideoType(mime: string): boolean {
  return (ACCEPTED_VIDEO_MIME_TYPES as readonly string[]).includes(mime);
}

export function isWithinVideoSizeLimit(bytes: number): boolean {
  return bytes > 0 && bytes <= MAX_VIDEO_BYTES;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export type VideoValidation = { ok: true } | { ok: false; error: string };

/** Validate a chosen file before uploading — type first, then size. */
export function validateVideoFile(file: {
  type: string;
  size: number;
}): VideoValidation {
  if (!isAcceptedVideoType(file.type)) {
    return {
      ok: false,
      error: "Unsupported format — upload an MP4, WebM, MOV or M4V video.",
    };
  }
  if (!isWithinVideoSizeLimit(file.size)) {
    return {
      ok: false,
      error: `Video is too large (${formatBytes(file.size)}). The limit is ${formatBytes(MAX_VIDEO_BYTES)}.`,
    };
  }
  return { ok: true };
}
