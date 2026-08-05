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
    // The card is captured at sign-up. That must not be a surprise.
    set("true");
    const text = ctaSubtext();
    expect(text).toMatch(/14 days free/i);
    expect(text).toMatch(/card/i);
    expect(text).toMatch(/cancel/i);
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
    set("true");
    const labelMentionsOffer = /trial|free|\$|month/i.test(PURCHASE_CTA_LABEL);
    if (!labelMentionsOffer) {
      const text = ctaSubtext();
      expect(text).not.toBe("");
      expect(text).toMatch(/card/i);
      expect(text).toMatch(/charg|bill/i);
    }
  });
});
