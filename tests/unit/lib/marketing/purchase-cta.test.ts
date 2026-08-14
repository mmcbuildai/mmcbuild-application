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
// Imported rather than restated: this is the constant the Stripe call reads for
// `payment_method_collection`, so a test that agrees with it agrees with what
// actually happens to the visitor's card. See the guard in "purchase mode".
import { SIGNUP_REQUIRES_CARD } from "@/lib/legal/commercial-facts";

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
    // Four facts a buyer is entitled to before clicking: how long the free
    // period runs, whether a card is taken now, whether anything is charged
    // during it, and that they can get out before it ends.
    //
    // ⚠️ This assertion has now been wrong TWICE, in opposite directions —
    // /cancel/i pinned "a card is captured at sign-up" (corrected 9 Aug when it
    // was not), then /subscrib/i pinned "no card yet, one later" (broken 13 Aug
    // when sign-up started taking one). Each time the test agreed with the copy
    // and both were behind the software. Hence the card half is no longer
    // spelled out here at all: it is derived from SIGNUP_REQUIRES_CARD below,
    // which is the constant Stripe itself reads.
    set("true");
    const text = ctaSubtext();
    expect(text).toMatch(/14 days free/i);
    expect(text).toMatch(/card/i);
    expect(text).toMatch(/nothing charged/i);
    expect(text).toMatch(/cancel/i);
  });

  it("says the same thing about the card as the software does", () => {
    // THE regression guard, rewritten 2026-08-14 to stop encoding an answer.
    //
    // It used to assert `/no card needed/i` — true on 9 August, false from 13
    // August when #186 routed sign-up through Stripe checkout, and it failed
    // here for a day afterwards. An earlier version asserted the opposite and
    // was also, later, wrong. A test naming ONE side of a flag is a third place
    // for the claim to live, so it goes stale exactly when the flag flips: at
    // the moment the copy most needs guarding.
    //
    // So it no longer says which way the answer goes. It says the subtext and
    // SIGNUP_REQUIRES_CARD must agree — and that constant is what the Stripe
    // call reads for `payment_method_collection`, so agreeing with it is
    // agreeing with what actually happens to the visitor's card.
    //
    // The original defect stays covered either way: "card required at sign-up"
    // next to every button while the signup page said "No credit card
    // required" now fails whichever of the two is the lie.
    set("true");
    const text = ctaSubtext();

    if (SIGNUP_REQUIRES_CARD) {
      expect(text).toMatch(/card required/i);
      expect(text).not.toMatch(/no (credit )?card/i);
    } else {
      expect(text).toMatch(/no (credit )?card/i);
      expect(text).not.toMatch(/card required/i);
    }
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
    // ⚠️ The specific WORDING assertion here has churned twice (/charg|bill/
    // dropped 9 Aug, /subscrib/ broken 13 Aug) because each version described
    // the offer of the week. The test's actual intent never changed, so it now
    // asserts only that: the subtext is non-empty and mentions the card
    // whenever the label is silent about it. Which sentence it uses to do that
    // is the copy's business, and is pinned against the software one test up.
    set("true");
    const labelMentionsOffer = /trial|free|\$|month/i.test(PURCHASE_CTA_LABEL);
    if (!labelMentionsOffer) {
      const text = ctaSubtext();
      expect(text).not.toBe("");
      expect(text).toMatch(/card/i);
      expect(text).toMatch(/14 days/i);
    }
  });
});
