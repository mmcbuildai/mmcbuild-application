import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Sign-up must record a CRM lead.
 *
 * For two days every account created on the live site wrote a profile, an org
 * and a membership — and nothing to `leads`. Zero rows with form_type 'signup'
 * had ever existed, while contact / waitlist / trades-supplier recorded
 * normally, and calling recordSignupLead directly against production inserted
 * and synced to HubSpot first time.
 *
 * The cause was structural rather than a broken function. There are TWO
 * provisioning paths:
 *
 *   signUp action   creates org + profile + membership inline, when email
 *                   confirmation is disabled — which is how production runs
 *   provisionUser   the idempotent repair path used by magic-link, OAuth and
 *                   invited users
 *
 * The capture was wired into `provisionUser`'s `self_signup` branch — correct
 * when written, and unreachable from an email-and-password signup, because the
 * profile already exists by the time it runs.
 *
 * These are source assertions rather than behavioural ones, deliberately. The
 * action redirects (which throws to unwind the request) and depends on Supabase
 * auth, so exercising it properly needs the live stack — that is what the
 * manual production walk is for. What a unit test CAN do is stop the wiring
 * being removed or drifting again, which is exactly what happened here.
 */

const ACTIONS = readFileSync(
  join(process.cwd(), "src/app/(auth)/actions.ts"),
  "utf8",
);

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("the signUp action records a CRM lead", () => {
  const code = withoutComments(ACTIONS);

  it("calls recordSignupLead", () => {
    expect(code).toContain("recordSignupLead(");
  });

  it("awaits it, so the redirect cannot unwind the request first", () => {
    expect(code).toMatch(/await\s+recordSignupLead\(/);
  });

  it("calls it BEFORE redirect(redirectTo) — after that line nothing runs", () => {
    const call = code.indexOf("recordSignupLead(");
    const redirectTo = code.indexOf("redirect(redirectTo)");
    expect(call).toBeGreaterThan(-1);
    expect(redirectTo).toBeGreaterThan(-1);
    expect(call).toBeLessThan(redirectTo);
  });

  it("passes first-touch attribution, not just the person", () => {
    // A captured lead with no campaign is half a fix: the point of the work is
    // being able to say which advertisement produced the customer. This action
    // is the only place the cookie is visible.
    expect(code).toContain("ATTRIBUTION_COOKIE");
    expect(code).toMatch(/attribution:\s*parseAttribution\(/);
  });

  it("passes the HubSpot visitor token, which HubSpot's own reporting needs", () => {
    expect(code).toContain("hubspotutk");
  });
});
