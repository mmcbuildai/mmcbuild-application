import { describe, it, expect } from "vitest";
import { decidePlanVersion } from "@/lib/plans/versioning";

// SCRUM-333 (Phase 2): a re-upload of the same drawing slot creates a new
// version that supersedes the current one, rather than being rejected. An
// in-flight current upload still blocks so a double-submit can't fork versions.
describe("decidePlanVersion", () => {
  it("creates version 1 with no supersede when the slot is empty", () => {
    expect(decidePlanVersion(null)).toEqual({
      action: "create",
      version: 1,
      supersedeId: null,
    });
    expect(decidePlanVersion(undefined)).toEqual({
      action: "create",
      version: 1,
      supersedeId: null,
    });
  });

  it("supersedes a settled current version and bumps the number", () => {
    expect(
      decidePlanVersion({ id: "p1", status: "ready", version: 1 }),
    ).toEqual({ action: "create", version: 2, supersedeId: "p1" });
    expect(
      decidePlanVersion({ id: "p3", status: "manual_review", version: 3 }),
    ).toEqual({ action: "create", version: 4, supersedeId: "p3" });
    expect(
      decidePlanVersion({ id: "pe", status: "error", version: 2 }),
    ).toEqual({ action: "create", version: 3, supersedeId: "pe" });
  });

  it("treats a null current version as 1 (defaults) → next is 2", () => {
    expect(
      decidePlanVersion({ id: "p1", status: "ready", version: null }),
    ).toEqual({ action: "create", version: 2, supersedeId: "p1" });
  });

  it("blocks while the current version is still in flight", () => {
    expect(
      decidePlanVersion({ id: "p1", status: "uploading", version: 1 }),
    ).toEqual({ action: "reject-in-flight" });
    expect(
      decidePlanVersion({ id: "p1", status: "processing", version: 1 }),
    ).toEqual({ action: "reject-in-flight" });
  });
});
