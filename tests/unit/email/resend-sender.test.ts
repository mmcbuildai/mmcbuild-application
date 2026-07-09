import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Regression test for the silent app-email outage (see memory
// project_auth_email_smtp_500): when RESEND_FROM_EMAIL is unset, FROM_EMAIL must
// fall back to a sender on the domain VERIFIED in the live `mmcbuild` Resend
// account — the `app.` subdomain — never the unverified bare apex, which Resend
// rejects and whose failure is swallowed by each send site's try/catch.
describe("FROM_EMAIL sender default", () => {
  // Control RESEND_FROM_EMAIL via vi.stubEnv (deterministically applied +
  // restored by vi.unstubAllEnvs) rather than mutating process.env by hand. The
  // hand-rolled delete/restore was order-sensitive: vitest shares process.env
  // across the files in a worker, so a sibling test that set the var could leak
  // into this file's "unset" case depending on scheduling. Stubbing pins the env
  // for each case and resetModules() forces `@/lib/email/resend` to re-read it.
  // The module treats "" (falsy) the same as unset, so an empty stub exercises
  // the default path without relying on a real delete.
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("defaults to the verified app.mmcbuild.com.au subdomain when env is unset", async () => {
    vi.stubEnv("RESEND_FROM_EMAIL", "");
    const { FROM_EMAIL } = await import("@/lib/email/resend");
    expect(FROM_EMAIL).toBe("MMC Build <noreply@app.mmcbuild.com.au>");
  });

  it("never defaults to the unverified bare apex domain", async () => {
    vi.stubEnv("RESEND_FROM_EMAIL", "");
    const { FROM_EMAIL } = await import("@/lib/email/resend");
    expect(FROM_EMAIL).not.toContain("@mmcbuild.com.au>");
    expect(FROM_EMAIL).toContain("@app.mmcbuild.com.au>");
  });

  it("honours RESEND_FROM_EMAIL when set", async () => {
    vi.stubEnv("RESEND_FROM_EMAIL", "MMC Build <noreply@app.mmcbuild.com.au>");
    const { FROM_EMAIL } = await import("@/lib/email/resend");
    expect(FROM_EMAIL).toBe("MMC Build <noreply@app.mmcbuild.com.au>");
  });
});
