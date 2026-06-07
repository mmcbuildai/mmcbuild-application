import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Regression test for the silent app-email outage (see memory
// project_auth_email_smtp_500): when RESEND_FROM_EMAIL is unset, FROM_EMAIL must
// fall back to a sender on the domain VERIFIED in the live `mmcbuild` Resend
// account — the `app.` subdomain — never the unverified bare apex, which Resend
// rejects and whose failure is swallowed by each send site's try/catch.
describe("FROM_EMAIL sender default", () => {
  const ORIGINAL = process.env.RESEND_FROM_EMAIL;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.RESEND_FROM_EMAIL;
    } else {
      process.env.RESEND_FROM_EMAIL = ORIGINAL;
    }
  });

  it("defaults to the verified app.mmcbuild.com.au subdomain when env is unset", async () => {
    delete process.env.RESEND_FROM_EMAIL;
    const { FROM_EMAIL } = await import("@/lib/email/resend");
    expect(FROM_EMAIL).toBe("MMC Build <noreply@app.mmcbuild.com.au>");
  });

  it("never defaults to the unverified bare apex domain", async () => {
    delete process.env.RESEND_FROM_EMAIL;
    const { FROM_EMAIL } = await import("@/lib/email/resend");
    expect(FROM_EMAIL).not.toContain("@mmcbuild.com.au>");
    expect(FROM_EMAIL).toContain("@app.mmcbuild.com.au>");
  });

  it("honours RESEND_FROM_EMAIL when set", async () => {
    process.env.RESEND_FROM_EMAIL = "MMC Build <noreply@app.mmcbuild.com.au>";
    const { FROM_EMAIL } = await import("@/lib/email/resend");
    expect(FROM_EMAIL).toBe("MMC Build <noreply@app.mmcbuild.com.au>");
  });
});
