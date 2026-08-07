import { PLANS, TAX_QUALIFIER, type PlanId } from "@/lib/stripe/plans";

/**
 * Trial-ending reminders — Karen's SCRUM-366 D3: day 7, day 11, day 13.
 *
 * Under Option A a card is captured at signup and charged automatically at day
 * 14. These three emails are the only warning a customer gets, so the content is
 * held here — pure, no database, no network — and unit-tested. The cron in
 * `inngest/functions/remind-trial-ending.ts` decides WHO to send to; this file
 * decides WHAT it says.
 *
 * The day-13 message is the one that legally matters: Karen's requirement is a
 * "24-hour notice naming the exact amount and date", so the amount and the date
 * are not optional in that one and the builder throws if either is missing.
 */

/** GST rate applied at checkout for Australian buyers. */
const GST_RATE = 0.1;

/** Which day of the 14-day trial each reminder goes out on. */
export const TRIAL_REMINDER_DAYS = [7, 11, 13] as const;
export type TrialReminderDay = (typeof TRIAL_REMINDER_DAYS)[number];

/**
 * Days remaining when each reminder fires, on a 14-day trial.
 * Day 7 → 7 left, day 11 → 3 left, day 13 → 1 left.
 * The cron matches on days REMAINING, because that is what it can compute from
 * the trial end date without needing to know when the trial started.
 */
export const DAYS_REMAINING_FOR_REMINDER: Record<TrialReminderDay, number> = {
  7: 7,
  11: 3,
  13: 1,
};

/** Map days-remaining back to the reminder due today, or null if none is. */
export function reminderDueAt(daysRemaining: number): TrialReminderDay | null {
  for (const day of TRIAL_REMINDER_DAYS) {
    if (DAYS_REMAINING_FOR_REMINDER[day] === daysRemaining) return day;
  }
  return null;
}

/**
 * The amount that will actually leave the customer's account.
 *
 * Every price in the product is quoted GST-EXCLUSIVE (see TAX_QUALIFIER), so
 * $49 collects $53.90. A warning email that says "$49" and is followed by a
 * $53.90 charge is not a warning — it is the start of a complaint. This returns
 * the gross figure and states the split.
 */
export function grossAmountFor(planId: PlanId): {
  net: number;
  gst: number;
  gross: number;
} | null {
  const plan = PLANS[planId];
  if (!plan || plan.price == null) return null;
  const net = plan.price;
  const gst = Math.round(net * GST_RATE * 100) / 100;
  return { net, gst, gross: Math.round((net + gst) * 100) / 100 };
}

/** Format a date the way an Australian reader expects to see it. */
export function formatChargeDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export interface TrialReminderInput {
  day: TrialReminderDay;
  firstName: string | null;
  planId: PlanId;
  /** ISO timestamp of the trial end — the date the card is charged. */
  trialEndsAt: string;
  appUrl: string;
}

export interface TrialReminderEmail {
  subject: string;
  html: string;
}

/**
 * Build the reminder for a given day.
 *
 * Throws when the amount cannot be resolved — deliberately. A trial reminder
 * that cannot name the charge is worse than no email: it tells the customer
 * something is happening without telling them what, and on day 13 it would fail
 * the notice requirement outright. The cron treats a throw as "leave it for
 * tomorrow and log loudly", which is the honest outcome.
 */
export function buildTrialReminder(
  input: TrialReminderInput,
): TrialReminderEmail {
  const { day, firstName, planId, trialEndsAt, appUrl } = input;
  const amounts = grossAmountFor(planId);
  const plan = PLANS[planId];

  if (!amounts) {
    throw new Error(
      `Cannot build a trial reminder for plan "${planId}": no price to state. ` +
        `Refusing to send a charge warning that does not name the charge.`,
    );
  }
  if (!trialEndsAt) {
    throw new Error(
      "Cannot build a trial reminder without a trial end date to state.",
    );
  }

  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const chargeDate = formatChargeDate(trialEndsAt);
  const amountLine =
    `<strong>$${amounts.gross.toFixed(2)}</strong> ` +
    `($${amounts.net} ${TAX_QUALIFIER.replace("+ ", "plus ")} of $${amounts.gst.toFixed(2)})`;
  const billingLink = `${appUrl}/billing`;

  // Every one of the three names the amount and the date. The day-7 message is
  // the friendliest and the day-13 the plainest, but none of them buries the
  // charge — someone who reads only one of the three still knows what is coming.
  const bodies: Record<TrialReminderDay, { subject: string; lead: string }> = {
    7: {
      subject: `You're a week into your MMC Build trial`,
      lead:
        `<p>You are halfway through your 14-day free trial of ${plan.name}. ` +
        `There is nothing you need to do — this is just a note about what happens next.</p>` +
        `<p>On <strong>${chargeDate}</strong> your trial ends and your card is charged ${amountLine} for your first month. ` +
        `If MMC Build is not right for you, you can cancel before then and pay nothing.</p>`,
    },
    11: {
      subject: `3 days left on your MMC Build trial`,
      lead:
        `<p>There are <strong>3 days</strong> left on your free trial of ${plan.name}.</p>` +
        `<p>On <strong>${chargeDate}</strong> your card will be charged ${amountLine} for your first month, ` +
        `and your subscription will continue monthly until you cancel.</p>` +
        `<p>If you would rather not continue, cancelling now costs you nothing and you keep access until the trial ends.</p>`,
    },
    13: {
      // Karen's requirement: 24-hour notice naming the exact amount and date.
      subject: `Tomorrow: your MMC Build trial ends and your card is charged $${amounts.gross.toFixed(2)}`,
      lead:
        `<p>This is a courtesy notice that your free trial of ${plan.name} ends <strong>tomorrow</strong>.</p>` +
        `<p><strong>On ${chargeDate} we will charge your card ${amountLine}.</strong> ` +
        `After that, your subscription renews monthly at the same amount until you cancel.</p>` +
        `<p>If you do not want to be charged, <a href="${billingLink}">cancel from your Billing page</a> before then. ` +
        `There is no notice period and no cancellation fee, and you keep access until the trial ends.</p>`,
    },
  };

  const { subject, lead } = bodies[day];

  const html =
    `<p>${greeting}</p>` +
    lead +
    `<p><a href="${billingLink}">Manage or cancel your subscription</a></p>` +
    `<p>If anything is not working as you expected, reply to this email — it reaches a real person.</p>` +
    `<p>— MMC Build</p>`;

  return { subject, html };
}
