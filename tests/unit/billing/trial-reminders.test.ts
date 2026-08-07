import { describe, it, expect } from "vitest";
import {
  buildTrialReminder,
  grossAmountFor,
  reminderDueAt,
  TRIAL_REMINDER_DAYS,
} from "@/lib/billing/trial-reminders";

// SCRUM-366 D3. Under Option A the card is charged automatically at day 14, so
// these emails are the only warning a customer gets. The tests below are about
// one thing: does the warning actually tell them what is going to happen.

const APP_URL = "https://app.mmcbuild.com.au";
// A fixed date so the assertions do not drift with the clock.
const TRIAL_END = "2026-08-21T00:00:00.000Z";

function build(day: 7 | 11 | 13, planId: "essential" | "professional" = "essential") {
  return buildTrialReminder({
    day,
    firstName: "Karen",
    planId,
    trialEndsAt: TRIAL_END,
    appUrl: APP_URL,
  });
}

describe("trial reminder amounts", () => {
  it("states the GROSS amount, which is what leaves the account", () => {
    // Prices are quoted GST-exclusive. An email promising "$49" followed by a
    // $53.90 charge is not a warning, it is the start of a complaint.
    expect(grossAmountFor("essential")).toEqual({
      net: 49,
      gst: 4.9,
      gross: 53.9,
    });
    expect(grossAmountFor("professional")).toEqual({
      net: 199,
      gst: 19.9,
      gross: 218.9,
    });
  });

  it("has no amount to state for a custom-priced tier", () => {
    expect(grossAmountFor("enterprise")).toBeNull();
  });
});

describe("which reminder is due", () => {
  it("maps days remaining to the right reminder", () => {
    expect(reminderDueAt(7)).toBe(7); // day 7 of 14
    expect(reminderDueAt(3)).toBe(11); // day 11 of 14
    expect(reminderDueAt(1)).toBe(13); // day 13 of 14
  });

  it("is silent on every other day", () => {
    for (const d of [0, 2, 4, 5, 6, 8, 9, 14]) {
      expect(reminderDueAt(d), `day ${d} should send nothing`).toBeNull();
    }
  });
});

describe("every reminder", () => {
  it.each(TRIAL_REMINDER_DAYS)(
    "day %i names the exact amount and the exact date",
    (day) => {
      const { html } = build(day);
      // Someone who reads only one of the three still knows what is coming.
      expect(html).toContain("$53.90");
      expect(html).toContain("21 August 2026");
    },
  );

  it.each(TRIAL_REMINDER_DAYS)("day %i offers a way to cancel", (day) => {
    const { html } = build(day);
    expect(html).toContain(`${APP_URL}/billing`);
    expect(html.toLowerCase()).toContain("cancel");
  });
});

describe("the day-13 notice", () => {
  // Karen's requirement: "day 13 (24-hour notice naming the exact amount and
  // date)". This is the one with a specific obligation attached.
  it("names the amount in the subject line, where it cannot be missed", () => {
    expect(build(13).subject).toContain("$53.90");
  });

  it("says the charge is tomorrow", () => {
    expect(build(13).html.toLowerCase()).toContain("tomorrow");
  });

  it("uses the right amount for a Professional trial", () => {
    const { subject, html } = build(13, "professional");
    expect(subject).toContain("$218.90");
    expect(html).toContain("$218.90");
  });
});

describe("refusing to send a warning that does not warn", () => {
  it("throws rather than emailing about a charge it cannot name", () => {
    // Enterprise has no price. Sending "your trial ends tomorrow" with no figure
    // tells someone something is happening without telling them what — worse
    // than silence, and on day 13 it fails the notice requirement outright.
    expect(() =>
      buildTrialReminder({
        day: 13,
        firstName: null,
        planId: "enterprise",
        trialEndsAt: TRIAL_END,
        appUrl: APP_URL,
      }),
    ).toThrow(/no price to state/);
  });

  it("throws rather than emailing about a date it cannot name", () => {
    expect(() =>
      buildTrialReminder({
        day: 13,
        firstName: null,
        planId: "essential",
        trialEndsAt: "",
        appUrl: APP_URL,
      }),
    ).toThrow(/without a trial end date/);
  });
});

describe("greeting", () => {
  it("uses a first name when there is one", () => {
    expect(build(7).html).toContain("Hi Karen,");
  });

  it("stays polite without one", () => {
    const { html } = buildTrialReminder({
      day: 7,
      firstName: null,
      planId: "essential",
      trialEndsAt: TRIAL_END,
      appUrl: APP_URL,
    });
    expect(html).toContain("Hi,");
  });
});
