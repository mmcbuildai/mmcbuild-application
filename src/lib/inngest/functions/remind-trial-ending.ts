import { inngest } from "../client";
import { db } from "@/lib/supabase/db";
import { sendEmail } from "@/lib/email/resend";
import { normalizePlanId, PLANS, type PlanId } from "@/lib/stripe/plans";
import {
  buildTrialReminder,
  reminderDueAt,
  type TrialReminderDay,
} from "@/lib/billing/trial-reminders";

// SCRUM-366 D3 — warn a trialling customer before their card is charged.
//
// Option A takes a card at signup and charges it automatically at day 14, so
// these three emails (day 7, 11, 13) are the ONLY thing between a customer and
// a charge they did not expect. That makes this cron a customer-trust surface
// rather than a marketing one, and it is why the failure handling below leans
// towards "send again" rather than "skip".
//
// Daily cron. The `trial_reminders` UNIQUE (subscription_id, reminder_day)
// constraint is what actually prevents a double-send — not a check in this file.

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://app.mmcbuild.com.au";

interface TrialingSubscription {
  id: string;
  org_id: string;
  plan_id: string;
  current_period_end: string;
}

/** Whole days from now until `iso`, rounded up — 1 means "tomorrow". */
function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export const remindTrialEnding = inngest.createFunction(
  { id: "remind-trial-ending", name: "Remind Trial Ending" },
  { cron: "0 23 * * *" }, // daily, 23:00 UTC ≈ 09:00 Brisbane
  async ({ step }) => {
    const due = await step.run("find-trials-ending", async () => {
      // Look 8 days ahead — one more than the earliest reminder — so a trial is
      // always seen at least once per reminder window even if a run is missed.
      const windowEnd = new Date(Date.now() + 8 * 86_400_000).toISOString();

      const { data, error } = await db()
        .from("subscriptions")
        .select("id, org_id, plan_id, current_period_end")
        .eq("status", "trialing")
        .not("current_period_end", "is", null)
        .gte("current_period_end", new Date().toISOString())
        .lte("current_period_end", windowEnd)
        .limit(500);

      if (error) {
        console.error(`[remindTrialEnding] query failed: ${error.message}`);
        return [] as TrialingSubscription[];
      }
      return (data ?? []) as TrialingSubscription[];
    });

    if (due.length === 0) return { sent: 0, skipped: 0 };

    const result = await step.run("send-reminders", async () => {
      let sent = 0;
      let skipped = 0;

      for (const sub of due) {
        const day = reminderDueAt(daysUntil(sub.current_period_end));
        if (day === null) {
          // In the window but not on a reminder day — nothing owed today.
          continue;
        }

        const planId = normalizePlanId(sub.plan_id) as PlanId;
        if (!PLANS[planId]) {
          console.error(
            `[remindTrialEnding] subscription ${sub.id} has unrecognised plan "${sub.plan_id}" — cannot state a price, skipping`,
          );
          skipped++;
          continue;
        }

        // The owner is who agreed to pay, so the owner is who gets warned.
        const { data: profile } = await db()
          .from("profiles")
          .select("email, full_name")
          .eq("org_id", sub.org_id)
          .eq("role", "owner")
          .limit(1)
          .maybeSingle();

        const email = profile?.email;
        if (!email) {
          console.error(
            `[remindTrialEnding] org ${sub.org_id} has no owner email — cannot warn before charging, skipping`,
          );
          skipped++;
          continue;
        }

        // CLAIM FIRST. The unique constraint means a concurrent or repeated run
        // loses this insert and moves on, so nobody is warned twice by a retry.
        const { error: claimError } = await db()
          .from("trial_reminders")
          .insert({
            subscription_id: sub.id,
            reminder_day: day satisfies TrialReminderDay,
            sent_to: email,
          });

        if (claimError) {
          // Almost always the unique violation — already sent. Not an error.
          continue;
        }

        try {
          const { subject, html } = buildTrialReminder({
            day,
            firstName: profile?.full_name?.split(" ")[0] ?? null,
            planId,
            trialEndsAt: sub.current_period_end,
            appUrl: APP_URL,
          });

          await sendEmail({ to: email, subject, html });
          sent++;
        } catch (err) {
          // RELEASE THE CLAIM so tomorrow's run tries again. Leaving it in place
          // would mark the customer as warned when they were not — and the next
          // thing they would receive is the charge.
          await db()
            .from("trial_reminders")
            .delete()
            .eq("subscription_id", sub.id)
            .eq("reminder_day", day);

          console.error(
            `[remindTrialEnding] send failed for subscription ${sub.id} day ${day}:`,
            err instanceof Error ? err.message : String(err),
          );
          skipped++;
        }
      }

      return { sent, skipped };
    });

    return result;
  },
);
