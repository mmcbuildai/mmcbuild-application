/**
 * SCRUM-372 — the waitlist/purchase call-to-action switch.
 *
 * The one behaviour that must never regress: the DEFAULT is waitlist. This flag
 * is the door to taking money, and it is sequenced last at go-live precisely so
 * it can be flipped back as a rollback. A flag that opens purchasing when unset
 * — or on a typo'd value — would open the door on any environment that simply
 * forgot to configure it.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  isPurchaseCtaEnabled,
  ctaHref,
  ctaLabel,
  ctaSubtext,
  showWaitlistSections,
  PURCHASE_CTA_LABEL,
  WAITLIST_CTA_LABEL,
} from "@/lib/marketing/purchase-cta";

const KEY = "NEXT_PUBLIC_PURCHASE_CTA_ENABLED";
const original = process.env[KEY];

function set(value: string | undefined) {
  if (value === undefined) delete process.env[KEY];
  else process.env[KEY] = value;
}

afterEach(() => set(original));

describe("isPurchaseCtaEnabled", () => {
  it("is OFF when the variable is unset", () => {
    set(undefined);
    expect(isPurchaseCtaEnabled()).toBe(false);
  });

  it("is ON only for the exact string 'true'", () => {
    set("true");
    expect(isPurchaseCtaEnabled()).toBe(true);
  });

  it.each(["false", "", "TRUE", "True", "1", "yes", "enabled", " true"])(
    "stays OFF for %o — the safe state must not depend on a loose match",
    (value) => {
      set(value);
      expect(isPurchaseCtaEnabled()).toBe(false);
    },
  );
});

describe("waitlist mode (the default)", () => {
  it("keeps today's label", () => {
    set(undefined);
    expect(ctaLabel()).toBe(WAITLIST_CTA_LABEL);
  });

  it("keeps the page's own waitlist destination", () => {
    set(undefined);
    expect(ctaHref("#waitlist")).toBe("#waitlist");
    expect(ctaHref("/contact")).toBe("/contact");
  });

  it("shows the waitlist sections", () => {
    set(undefined);
    expect(showWaitlistSections()).toBe(true);
  });

  it("has no trial disclosure, because there is nothing to disclose", () => {
    set(undefined);
    expect(ctaSubtext()).toBe("");
  });
});

describe("purchase mode", () => {
  it("sends every call-to-action to sign-up regardless of its waitlist target", () => {
    set("true");
    expect(ctaHref("#waitlist")).toBe("/signup");
    expect(ctaHref("/contact")).toBe("/signup");
  });

  it("uses the purchase label", () => {
    set("true");
    expect(ctaLabel()).toBe(PURCHASE_CTA_LABEL);
  });

  it("hides the waitlist sections, not just the buttons", () => {
    // "Join the waitlist for exclusive early access" is wrong the moment the
    // product is buyable — the section, not only the button above it.
    set("true");
    expect(showWaitlistSections()).toBe(false);
  });

  it("discloses the trial terms next to the button", () => {
    // ⚠️ HISTORY, wrong in both directions now — see the identical note on
    // PURCHASE_CTA_LABEL in purchase-cta.ts. This test previously asserted
    // /cancel/i, on the belief that a card is captured at sign-up; corrected
    // 2026-08-09 to /subscrib/i once sign-up was confirmed to take no card.
    // On 2026-08-13 sign-up was rewired into Stripe checkout (#186) and a card
    // IS captured now, and the 2026-08-09 rewrite of ctaSubtext() dropped
    // "subscri(be/ption)" from the copy entirely in favour of stating plainly
    // WHEN the card is charged — so /subscrib/i stopped matching anything and
    // silently pinned wording that no longer exists. Corrected 2026-08-18 to
    // check for that same "when" disclosure via /charg/i instead.
    set("true");
    const text = ctaSubtext();
    expect(text).toMatch(/14 days free/i);
    expect(text).toMatch(/card/i);
    // Says WHEN a card is taken, which is the part a visitor needs.
    expect(text).toMatch(/charg/i);
  });

  it("discloses that a card IS required at sign-up, because one now is", () => {
    // ⚠️ INVERTED 2026-08-18. Until 2026-08-13 this test correctly guarded
    // against the real defect it still describes below — sign-up genuinely took
    // no card, so claiming otherwise next to "Get started" was false. On
    // 2026-08-13 sign-up was rewired to lead into Stripe checkout (#186,
    // "a card IS required at sign-up"), which made a card requirement true and
    // therefore made THIS test's old assertions (`not.toMatch(/card required
    // at sign-?up/i)`, `toMatch(/no card needed/i)`) the false statement being
    // pinned in place instead. Flipped to match current, correct behaviour.
    //
    // Original defect this guarded, preserved for context: this exact claim
    // once shipped next to every "Get started" button on both sites, while the
    // signup page one click later said "No credit card required" — two
    // contradictory statements about the visitor's card, on a product taking
    // real ones. The product's answer to "is a card required at sign-up" has
    // changed since, but the two surfaces must still agree with each other —
    // see the byte-identical purchase-cta.ts pairing with mmcbuild-marketing.
    set("true");
    const text = ctaSubtext();
    expect(text).toMatch(/card required/i);
    expect(text).not.toMatch(/no card needed/i);
  });

  it("does not use wording that overstates the commitment", () => {
    // "Buy now" implies an immediate charge; nothing is charged for 14 days.
    expect(PURCHASE_CTA_LABEL).not.toMatch(/buy now|purchase now|pay now/i);
  });

  it("discloses the card in the subtext whenever the label itself does not", () => {
    // The label was changed from "Start free trial" to "Sign Up" (SCRUM-372,
    // Karthik, 2026-08-05). "Start free trial" carried the offer in the button;
    // "Sign Up" does not, so the ONLY place a visitor learns a card is required
    // before day 15 is the subtext. That makes the subtext load-bearing rather
    // than supporting copy, and this test is what keeps it that way: if someone
    // later empties or softens it while the label stays silent, a card gets
    // captured off a button that never mentioned one.
    //
    // ⚠️ The /charg|bill/ assertion was dropped on 2026-08-09, on the belief
    // that sign-up took no card and so nothing was ever charged from it. Once
    // sign-up was rewired into Stripe checkout on 2026-08-13 (#186) that belief
    // no longer held, and /subscrib/i (substituted at the time) stopped
    // matching once the copy was rewritten to state plainly WHEN the now-real
    // card is charged. Restored 2026-08-18 as /charg/i — the intent of the
    // test is unchanged and still enforced: the subtext stays load-bearing
    // whenever the label itself is silent.
    set("true");
    const labelMentionsOffer = /trial|free|\$|month/i.test(PURCHASE_CTA_LABEL);
    if (!labelMentionsOffer) {
      const text = ctaSubtext();
      expect(text).not.toBe("");
      expect(text).toMatch(/card/i);
      expect(text).toMatch(/charg/i);
    }
  });
});
