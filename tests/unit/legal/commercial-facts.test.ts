import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { TRIAL_DAYS, TRIAL_RUN_LIMIT, TRIAL_UPLOAD_LIMIT } from "@/lib/stripe/plans";
import {
  CHECKOUT_REQUIRES_CARD,
  PAYMENT_METHOD_COLLECTION,
  SIGNUP_REQUIRES_CARD,
  accountTrialLengthText,
  signupCardClause,
  signupCardClauseShort,
  trialAllowanceText,
  trialLengthAdjective,
} from "@/lib/legal/commercial-facts";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("the facts render from the constants", () => {
  it("allowance text tracks both limits", () => {
    expect(trialAllowanceText()).toBe(
      `${TRIAL_RUN_LIMIT} compliance runs and ${TRIAL_UPLOAD_LIMIT} plan uploads`,
    );
  });

  it("length text tracks TRIAL_DAYS", () => {
    expect(accountTrialLengthText()).toBe(`${TRIAL_DAYS} days`);
    expect(trialLengthAdjective()).toBe(`${TRIAL_DAYS}-day`);
  });

  it("the card clauses follow SIGNUP_REQUIRES_CARD rather than being written twice", () => {
    expect(SIGNUP_REQUIRES_CARD).toBe(false);
    expect(signupCardClause()).toContain("No payment card is required");
    expect(signupCardClauseShort()).toBe("No credit card required");
  });
});

describe("the checkout flag is DERIVED, not merely asserted", () => {
  /**
   * The whole point of the module. A boolean that only *describes* what Stripe
   * does is a second place to be wrong — which is the disease, not the cure. So
   * the Stripe call must consume it.
   */
  it("maps to Stripe's value", () => {
    expect(CHECKOUT_REQUIRES_CARD).toBe(true);
    expect(PAYMENT_METHOD_COLLECTION).toBe("always");
  });

  it("the checkout session sets payment_method_collection FROM the constant", () => {
    const source = read("src/app/(dashboard)/billing/actions.ts");
    expect(source).toContain("payment_method_collection: PAYMENT_METHOD_COLLECTION");
    // The literal must be gone, or the constant is decorative and the two can
    // drift apart again exactly as they did.
    expect(withoutComments(source)).not.toContain('payment_method_collection: "always"');
  });
});

describe("no customer-facing surface restates a commercial fact by hand", () => {
  /**
   * The refactor only holds if the NEXT page written also imports. Nothing stops
   * someone typing "14-day free trial" into a new file, and nobody would notice
   * for weeks — that is precisely how eleven copies accumulated.
   *
   * Scans the surfaces that carry these claims for hardcoded figures. Comments
   * are stripped first: the modules explain their own history and quote the very
   * strings they retired, and failing an honest explanation teaches people to
   * delete the explanation.
   */
  const SURFACES = [
    "src/components/legal/terms-gate.tsx",
    "src/app/(marketing)/terms/page.tsx",
    "src/app/(dashboard)/billing/billing-content.tsx",
    "src/app/(auth)/signup/page.tsx",
    "src/app/(marketing)/pricing/pricing-client.tsx",
  ];

  const HARDCODED = [
    /\b\d+\s+compliance runs\b/,
    /\b\d+\s+plan uploads(?!\s+per month)/,
    /\b\d+-day free trial\b/,
    /\bno credit card required\b/i,
  ];

  for (const rel of SURFACES) {
    it(`${rel} imports the facts instead of typing them`, () => {
      const text = withoutComments(read(rel));
      for (const pattern of HARDCODED) {
        expect(text, `${rel} hardcodes ${pattern}`).not.toMatch(pattern);
      }
    });
  }

  it("is not vacuously green — the surfaces do import the module", () => {
    const importing = SURFACES.filter((rel) =>
      read(rel).includes("@/lib/legal/commercial-facts"),
    );
    expect(importing.length).toBe(SURFACES.length);
  });

  /**
   * Retired sentences, kept as a regression list.
   *
   * These were live, and each contradicted the signup page one click away. They
   * are checked as literal strings rather than as a pattern, because "a card is
   * required" is legitimate prose ABOUT SUBSCRIBING and has to stay sayable —
   * a broader rule would ban the true sentence along with the false one.
   *
   * (This block was a separate file, `terms-copy-consistency`, whose other half
   * asserted the FIGURES matched the constants. That half is now structural: the
   * figures are rendered, so a surface cannot state a wrong one. It went red the
   * moment the refactor landed — correctly, since it had nothing left to check —
   * and is folded in here rather than left passing over an empty scan.)
   */
  const RETIRED_CLAIMS = [
    "A payment card is required to begin it",
    "A valid payment card is required to start the trial",
    "Every plan starts with a 14-day free trial. A card",
  ];

  for (const rel of SURFACES) {
    it(`${rel} carries none of the retired card-at-signup claims`, () => {
      const text = withoutComments(read(rel));
      for (const claim of RETIRED_CLAIMS) expect(text).not.toContain(claim);
    });
  }
});
