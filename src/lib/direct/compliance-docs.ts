// SCRUM-175 — supplier compliance documents: the doc-type vocabulary + the pure
// expiry helpers. Kept pure (dates injected) so the "expired → hidden from
// public" + "remind 30 days out" rules are unit-testable without a clock or DB.

export const COMPLIANCE_DOC_TYPES = [
  { key: "codemark", label: "CodeMark Certificate" },
  { key: "ncc_compliance", label: "NCC Compliance Report" },
  { key: "datasheet", label: "Technical Datasheet" },
  { key: "test_report", label: "Test / Assessment Report" },
  { key: "warranty", label: "Warranty" },
  { key: "insurance", label: "Insurance Certificate" },
  { key: "other", label: "Other" },
] as const;

export type ComplianceDocType = (typeof COMPLIANCE_DOC_TYPES)[number]["key"];

export function complianceDocTypeLabel(key: string): string {
  return (
    COMPLIANCE_DOC_TYPES.find((t) => t.key === key)?.label ??
    key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/** Days before expiry that a supplier is reminded (and the "expiring soon" band). */
export const EXPIRY_REMINDER_DAYS = 30;

export type ExpiryStatus = "none" | "valid" | "expiring_soon" | "expired";

/** Compare two dates by their UTC calendar day, ignoring time-of-day / TZ. */
function utcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Whole days from `today` until `expiresAt` (negative once past). null when
 * there is no expiry or the value is unparseable. Date-only strings
 * ("2026-08-01") are treated as UTC midnight.
 */
export function daysUntilExpiry(
  expiresAt: string | null | undefined,
  today: Date = new Date(),
): number | null {
  if (!expiresAt) return null;
  const exp = new Date(expiresAt);
  if (Number.isNaN(exp.getTime())) return null;
  return Math.round((utcDay(exp) - utcDay(today)) / 86_400_000);
}

/**
 * `none` (no expiry set) · `valid` (>30 days out) · `expiring_soon` (0–30 days) ·
 * `expired` (past). The 30-day band matches EXPIRY_REMINDER_DAYS.
 */
export function expiryStatus(
  expiresAt: string | null | undefined,
  today: Date = new Date(),
): ExpiryStatus {
  const d = daysUntilExpiry(expiresAt, today);
  if (d === null) return "none";
  if (d < 0) return "expired";
  if (d <= EXPIRY_REMINDER_DAYS) return "expiring_soon";
  return "valid";
}

/**
 * The public-visibility rule (mirrors the RLS SELECT policy): a doc is shown to
 * the public only when it is verified AND not expired.
 */
export function isPubliclyVisible(
  doc: { verified: boolean; expires_at: string | null },
  today: Date = new Date(),
): boolean {
  return doc.verified && expiryStatus(doc.expires_at, today) !== "expired";
}

/**
 * Should the 30-day reminder fire for this doc now? Verified, has an expiry, not
 * already reminded, and inside the reminder window but not yet expired.
 */
export function needsExpiryReminder(
  doc: {
    verified: boolean;
    expires_at: string | null;
    reminder_sent_at: string | null;
  },
  today: Date = new Date(),
): boolean {
  if (!doc.verified || !doc.expires_at || doc.reminder_sent_at) return false;
  const d = daysUntilExpiry(doc.expires_at, today);
  return d !== null && d >= 0 && d <= EXPIRY_REMINDER_DAYS;
}
