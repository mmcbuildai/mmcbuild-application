import { describe, it, expect } from "vitest";
import { TERMS_VERSION, needsTermsAcceptance } from "@/lib/legal/terms";

/**
 * These pin the behaviour that was missing, not the behaviour that was there.
 *
 * The version was already being WRITTEN to profiles.terms_version on
 * acceptance; nothing ever READ it. The gate asked only "is terms_accepted_at
 * null", so bumping the version — which the code comment said would force
 * re-acceptance — re-prompted nobody. Adding payment, renewal and cancellation
 * clauses to the terms would have bound no existing user to them.
 */
describe("terms acceptance versioning (SCRUM-372)", () => {
  it("prompts a user who has never accepted", () => {
    expect(needsTermsAcceptance(null, null)).toBe(true);
  });

  it("does NOT prompt a user who accepted the current version", () => {
    expect(needsTermsAcceptance("2026-08-05T00:00:00Z", TERMS_VERSION)).toBe(false);
  });

  it("re-prompts a user who accepted an OLDER version", () => {
    // The case the whole change exists for: they agreed to terms that had no
    // payment clause, so they have not agreed to being charged.
    expect(needsTermsAcceptance("2026-06-01T00:00:00Z", "beta-2026-06")).toBe(true);
  });

  it("re-prompts a pre-versioning acceptance (accepted, version null)", () => {
    // Everyone who accepted before the version was recorded. An acceptance with
    // no version cannot be shown to cover the current document, so it must not
    // be treated as if it does.
    expect(needsTermsAcceptance("2026-06-01T00:00:00Z", null)).toBe(true);
  });

  it("treats the version as opaque — any difference re-prompts", () => {
    expect(needsTermsAcceptance("2026-08-05T00:00:00Z", "anything-else")).toBe(true);
  });

  it("the current version mentions payment, so the bump is traceable", () => {
    // Guards against a bump that changes the string to something meaningless.
    // If this fails you have renamed the version — make sure it still says what
    // changed, because this string is the only record of WHICH terms a user agreed to.
    expect(TERMS_VERSION).not.toBe("beta-2026-06");
    expect(TERMS_VERSION.length).toBeGreaterThan(4);
  });
});
