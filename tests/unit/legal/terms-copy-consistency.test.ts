import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { TRIAL_RUN_LIMIT, TRIAL_UPLOAD_LIMIT } from "@/lib/stripe/plans";

/**
 * The trial is described in prose on several surfaces, and the numbers in that
 * prose are typed by hand rather than read from the constants. That is the exact
 * shape of every defect this file exists to catch, and it has happened twice:
 *
 *  - 7 Aug: the published terms said the trial was capped at 3 runs. The cap had
 *    become 10 five weeks earlier; the sentence was written from an older note.
 *    Live for one morning under a tickbox reading "By continuing you agree".
 *  - 10 Aug: Karen sent revised wording that again said 3 runs, because she was
 *    editing a copy saved during that morning.
 *
 * Neither was carelessness. A number in a sentence has nothing that ties it to
 * the constant the software enforces, so it stays wherever it was typed while
 * the software moves underneath it — and no diff ever shows it, because the
 * sentence does not change.
 *
 * This asserts the tie mechanically. It deliberately does NOT check the wording,
 * only the figures and a short list of claims that were specifically false. A
 * test that policed prose would be rewritten or deleted the first time someone
 * improved a sentence, and would then protect nothing.
 */

const SURFACES = [
  "src/components/legal/terms-gate.tsx",
  "src/app/(marketing)/terms/page.tsx",
  "src/app/(dashboard)/billing/billing-content.tsx",
];

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/**
 * Strip JSX/JS comments before scanning.
 *
 * Earned from the sibling social-proof check, which failed on an honest comment
 * that quoted the very string it was recording as removed. Punishing the
 * explanation teaches people to delete the explanation, which is the opposite of
 * what any of this is for.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("terms copy states the allowance the software actually enforces", () => {
  for (const rel of SURFACES) {
    it(`${rel} — every stated compliance-run figure equals TRIAL_RUN_LIMIT`, () => {
      const text = withoutComments(read(rel));
      const stated = [...text.matchAll(/(\d+)\s+compliance runs/g)].map((m) => Number(m[1]));
      // No mention is fine — not every surface lists the allowance. A WRONG
      // mention is not.
      for (const n of stated) expect(n).toBe(TRIAL_RUN_LIMIT);
    });

    it(`${rel} — every stated plan-upload figure equals TRIAL_UPLOAD_LIMIT`, () => {
      const text = withoutComments(read(rel));
      const stated = [...text.matchAll(/(\d+)\s+plan uploads/g)].map((m) => Number(m[1]));
      for (const n of stated) expect(n).toBe(TRIAL_UPLOAD_LIMIT);
    });
  }

  it("at least one surface states the allowance, so the check is not vacuously green", () => {
    const mentions = SURFACES.map((rel) => withoutComments(read(rel)))
      .join("\n")
      .match(/\d+\s+compliance runs/g);
    expect(mentions?.length ?? 0).toBeGreaterThan(0);
  });
});

describe("no surface claims a card is required to create an account", () => {
  /**
   * Sign-up is card-free and always has been. These sentences were live, and
   * each contradicted the signup page one click away, which reads "No credit
   * card required" — both true, of different doors, which is exactly why the
   * contradiction survived review.
   *
   * Scoped to the literal sentences that shipped rather than a general pattern:
   * "a card is required" is legitimate prose ABOUT SUBSCRIBING and must stay
   * sayable.
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
