import { describe, it, expect } from "vitest";
import { resolveFromEmail, DEFAULT_FROM_EMAIL } from "@/lib/email/resend";

// Regression test for the silent app-email outage (see memory
// project_auth_email_smtp_500): when RESEND_FROM_EMAIL is unset, the sender must
// fall back to a sender on the domain VERIFIED in the live `mmcbuild` Resend
// account — the `app.` subdomain — never the unverified bare apex, which Resend
// rejects and whose failure is swallowed by each send site's try/catch.
//
// Tests the PURE resolver rather than the module-level FROM_EMAIL constant:
// exercising the constant via env-mutation + dynamic import was order-flaky
// across vitest's worker-shared module cache. The resolver takes env as an arg,
// so these are deterministic regardless of test ordering.
describe("resolveFromEmail", () => {
  it("defaults to the verified app.mmcbuild.com.au subdomain when unset", () => {
    expect(resolveFromEmail(undefined)).toBe("MMC Build <noreply@app.mmcbuild.com.au>");
    expect(resolveFromEmail("")).toBe("MMC Build <noreply@app.mmcbuild.com.au>");
  });

  it("never defaults to the unverified bare apex domain", () => {
    const fallback = resolveFromEmail(undefined);
    expect(fallback).not.toContain("@mmcbuild.com.au>");
    expect(fallback).toContain("@app.mmcbuild.com.au>");
    expect(DEFAULT_FROM_EMAIL).toContain("@app.mmcbuild.com.au>");
  });

  it("honours RESEND_FROM_EMAIL when set", () => {
    expect(resolveFromEmail("MMC Build <noreply@app.mmcbuild.com.au>")).toBe(
      "MMC Build <noreply@app.mmcbuild.com.au>",
    );
    expect(resolveFromEmail("Custom <x@app.mmcbuild.com.au>")).toBe(
      "Custom <x@app.mmcbuild.com.au>",
    );
  });
});
