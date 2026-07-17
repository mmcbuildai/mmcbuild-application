import { describe, it, expect } from "vitest";
import {
  isAcceptedVideoType,
  isWithinVideoSizeLimit,
  validateVideoFile,
  formatBytes,
  MAX_VIDEO_BYTES,
} from "@/lib/train/video";

// SCRUM-59 — TC-TRAIN-59-001..006: the pure lesson-video upload guards (accepted
// formats + size cap) shared by the upload UI and the bucket config.
describe("train video — isAcceptedVideoType", () => {
  it("TC-TRAIN-59-001: accepts the supported web video types", () => {
    for (const t of ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"]) {
      expect(isAcceptedVideoType(t)).toBe(true);
    }
  });
  it("TC-TRAIN-59-002: rejects non-video / unsupported types", () => {
    expect(isAcceptedVideoType("application/pdf")).toBe(false);
    expect(isAcceptedVideoType("image/png")).toBe(false);
    expect(isAcceptedVideoType("video/x-msvideo")).toBe(false); // .avi
    expect(isAcceptedVideoType("")).toBe(false);
  });
});

describe("train video — isWithinVideoSizeLimit", () => {
  it("TC-TRAIN-59-003: enforces the 500 MB cap and rejects empty files", () => {
    expect(isWithinVideoSizeLimit(1)).toBe(true);
    expect(isWithinVideoSizeLimit(MAX_VIDEO_BYTES)).toBe(true);
    expect(isWithinVideoSizeLimit(MAX_VIDEO_BYTES + 1)).toBe(false);
    expect(isWithinVideoSizeLimit(0)).toBe(false);
  });
});

describe("train video — validateVideoFile", () => {
  it("TC-TRAIN-59-004: ok for a valid mp4 under the cap", () => {
    expect(validateVideoFile({ type: "video/mp4", size: 10_000_000 })).toEqual({
      ok: true,
    });
  });
  it("TC-TRAIN-59-005: type is checked before size", () => {
    const res = validateVideoFile({ type: "image/png", size: 10 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Unsupported format/);
  });
  it("TC-TRAIN-59-006: a too-large valid type is rejected with a size message", () => {
    const res = validateVideoFile({
      type: "video/mp4",
      size: MAX_VIDEO_BYTES + 1,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/too large/);
  });
});

describe("train video — formatBytes", () => {
  it("renders human sizes", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(MAX_VIDEO_BYTES)).toBe("500.0 MB");
  });
});
