import { describe, it, expect } from "vitest";
import {
  retentionDays,
  retentionEnabled,
  retentionCutoffIso,
  DEFAULT_RETENTION_DAYS,
} from "@/lib/plans/retention";

// SCRUM-333 (Phase 3): the retention policy is off by default (dry-run) and the
// window defaults to 90 days.
describe("retention policy", () => {
  it("defaults the window to 90 days when unset or invalid", () => {
    expect(retentionDays({})).toBe(90);
    expect(DEFAULT_RETENTION_DAYS).toBe(90);
    expect(retentionDays({ PLAN_RETENTION_DAYS: "" })).toBe(90);
    expect(retentionDays({ PLAN_RETENTION_DAYS: "abc" })).toBe(90);
    expect(retentionDays({ PLAN_RETENTION_DAYS: "0" })).toBe(90);
    expect(retentionDays({ PLAN_RETENTION_DAYS: "-5" })).toBe(90);
  });

  it("honours a valid custom window (floored)", () => {
    expect(retentionDays({ PLAN_RETENTION_DAYS: "30" })).toBe(30);
    expect(retentionDays({ PLAN_RETENTION_DAYS: "45.9" })).toBe(45);
  });

  it("is disabled unless explicitly enabled with the string 'true'", () => {
    expect(retentionEnabled({})).toBe(false);
    expect(retentionEnabled({ PLAN_RETENTION_ENABLED: "false" })).toBe(false);
    expect(retentionEnabled({ PLAN_RETENTION_ENABLED: "1" })).toBe(false);
    expect(retentionEnabled({ PLAN_RETENTION_ENABLED: "TRUE" })).toBe(false);
    expect(retentionEnabled({ PLAN_RETENTION_ENABLED: "true" })).toBe(true);
  });

  it("computes the cutoff N days before now", () => {
    const now = Date.parse("2026-07-13T00:00:00.000Z");
    expect(retentionCutoffIso(now, 90)).toBe("2026-04-14T00:00:00.000Z");
    expect(retentionCutoffIso(now, 1)).toBe("2026-07-12T00:00:00.000Z");
  });
});
