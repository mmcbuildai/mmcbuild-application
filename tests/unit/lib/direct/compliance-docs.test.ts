import { describe, it, expect } from "vitest";
import {
  daysUntilExpiry,
  expiryStatus,
  isPubliclyVisible,
  needsExpiryReminder,
  complianceDocTypeLabel,
  EXPIRY_REMINDER_DAYS,
} from "@/lib/direct/compliance-docs";

// SCRUM-175 — TC-DIRECT-175-001..008: the pure expiry rules behind "expired docs
// are hidden from the public" + "remind 30 days out". Dates are injected so the
// tests are deterministic (no clock).
const TODAY = new Date("2026-07-15T00:00:00Z");

describe("compliance-docs — daysUntilExpiry", () => {
  it("TC-DIRECT-175-001: counts whole days to a future expiry", () => {
    expect(daysUntilExpiry("2026-07-25", TODAY)).toBe(10);
  });
  it("TC-DIRECT-175-002: is negative once past", () => {
    expect(daysUntilExpiry("2026-07-10", TODAY)).toBe(-5);
  });
  it("TC-DIRECT-175-003: null for no expiry or unparseable input", () => {
    expect(daysUntilExpiry(null, TODAY)).toBeNull();
    expect(daysUntilExpiry("not-a-date", TODAY)).toBeNull();
  });
});

describe("compliance-docs — expiryStatus", () => {
  it("TC-DIRECT-175-004: none / valid / expiring_soon / expired bands", () => {
    expect(expiryStatus(null, TODAY)).toBe("none");
    expect(expiryStatus("2026-12-31", TODAY)).toBe("valid"); // >30 days
    expect(expiryStatus("2026-08-01", TODAY)).toBe("expiring_soon"); // 17 days
    expect(expiryStatus("2026-07-01", TODAY)).toBe("expired");
  });
  it(`TC-DIRECT-175-005: the boundary is inclusive at ${EXPIRY_REMINDER_DAYS} days`, () => {
    // exactly 30 days out → still "expiring_soon"; 31 → "valid"
    expect(expiryStatus("2026-08-14", TODAY)).toBe("expiring_soon"); // 30 days
    expect(expiryStatus("2026-08-15", TODAY)).toBe("valid"); // 31 days
  });
});

describe("compliance-docs — isPubliclyVisible", () => {
  it("TC-DIRECT-175-006: only verified AND not-expired docs are public", () => {
    expect(
      isPubliclyVisible({ verified: true, expires_at: "2026-12-31" }, TODAY),
    ).toBe(true);
    // verified but expired → hidden (the acceptance criterion)
    expect(
      isPubliclyVisible({ verified: true, expires_at: "2026-07-01" }, TODAY),
    ).toBe(false);
    // unverified → hidden regardless of expiry
    expect(
      isPubliclyVisible({ verified: false, expires_at: "2026-12-31" }, TODAY),
    ).toBe(false);
    // verified, no expiry → visible
    expect(
      isPubliclyVisible({ verified: true, expires_at: null }, TODAY),
    ).toBe(true);
  });
});

describe("compliance-docs — needsExpiryReminder", () => {
  it("TC-DIRECT-175-007: fires only for verified, in-window, not-yet-reminded docs", () => {
    const base = { verified: true, reminder_sent_at: null as string | null };
    expect(
      needsExpiryReminder({ ...base, expires_at: "2026-08-01" }, TODAY),
    ).toBe(true); // 17 days out
    expect(
      needsExpiryReminder({ ...base, expires_at: "2026-12-31" }, TODAY),
    ).toBe(false); // too far out
    expect(
      needsExpiryReminder({ ...base, expires_at: "2026-07-01" }, TODAY),
    ).toBe(false); // already expired
    expect(
      needsExpiryReminder(
        { ...base, reminder_sent_at: "2026-07-14", expires_at: "2026-08-01" },
        TODAY,
      ),
    ).toBe(false); // already reminded
    expect(
      needsExpiryReminder(
        { verified: false, reminder_sent_at: null, expires_at: "2026-08-01" },
        TODAY,
      ),
    ).toBe(false); // not verified
  });
});

describe("compliance-docs — labels", () => {
  it("TC-DIRECT-175-008: known types map to human labels, unknown falls back", () => {
    expect(complianceDocTypeLabel("codemark")).toBe("CodeMark Certificate");
    expect(complianceDocTypeLabel("ncc_compliance")).toBe("NCC Compliance Report");
    expect(complianceDocTypeLabel("mystery_type")).toBe("Mystery Type");
  });
});
