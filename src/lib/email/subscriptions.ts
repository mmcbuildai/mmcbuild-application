import type Stripe from "stripe";
import { getResend, FROM_EMAIL } from "@/lib/email/resend";
import { db } from "@/lib/supabase/db";
import { getPlanByPriceId } from "@/lib/stripe/plans";

/**
 * Best-effort internal alert fired once per NEW paid subscription, from the
 * `checkout.session.completed` webhook case only (never on renewals/updates/
 * cancellations — those are not "a user subscribed"). Never throws, so a
 * Resend or lookup failure can't break the webhook handler.
 */
export async function notifyTeamOfNewSubscription(
  subscription: Stripe.Subscription,
): Promise<void> {
  const to = [
    process.env.KAREN_EMAIL || "karen.engel@mmcbuild.com.au",
    process.env.KARTHIK_EMAIL || "karthik.rao@mmcbuild.com.au",
  ];
  const priceId = subscription.items.data[0]?.price?.id;
  const plan = priceId ? getPlanByPriceId(priceId) : null;
  const orgId = subscription.metadata?.org_id;

  let orgName = "—";
  if (orgId) {
    const { data: org } = await db()
      .from("organisations")
      .select("name")
      .eq("id", orgId)
      .single();
    orgName = (org as { name?: string } | null)?.name ?? "—";
  }

  const planLabel = plan?.id ?? subscription.metadata?.plan_id ?? "unknown";
  const subject = `New subscriber — ${orgName} (${planLabel})`;
  const text = [
    "A new paid subscription just started:",
    "",
    `Org:    ${orgName}`,
    `Plan:   ${planLabel}`,
    `Status: ${subscription.status}`,
    `Stripe subscription: ${subscription.id}`,
    `Stripe customer:     ${subscription.customer}`,
    "",
    "— app.mmcbuild.com.au/billing",
  ].join("\n");

  try {
    const { error } = await getResend().emails.send({ from: FROM_EMAIL, to, subject, text });
    if (error) {
      console.warn("[notifyTeamOfNewSubscription] resend failed:", error.message);
    }
  } catch (err) {
    console.warn("[notifyTeamOfNewSubscription] resend threw:", err);
  }
}

/**
 * Best-effort internal alert fired the moment a customer REQUESTS cancellation
 * — cancelSubscription() in billing/actions.ts, which sets
 * cancel_at_period_end rather than ending access immediately. Fired here,
 * not from customer.subscription.deleted, deliberately: that event can land
 * weeks later (whenever the paid period actually elapses), and the point of
 * this alert is an early warning while there's still a retention window, not
 * a delayed confirmation that revenue has already stopped.
 */
export async function notifyTeamOfCancellation(input: {
  orgId: string;
  orgName: string;
  planLabel: string;
  wasTrialing: boolean;
  endsAt: string | null;
  cancelledByEmail: string;
}): Promise<void> {
  const to = [
    process.env.KAREN_EMAIL || "karen.engel@mmcbuild.com.au",
    process.env.KARTHIK_EMAIL || "karthik.rao@mmcbuild.com.au",
  ];

  const subject = `Cancellation requested — ${input.orgName} (${input.planLabel})`;
  const text = [
    `A subscription was just cancelled (access continues until the end of the current ${input.wasTrialing ? "trial" : "billing"} period):`,
    "",
    `Org:          ${input.orgName}`,
    `Plan:         ${input.planLabel}`,
    `Cancelled by: ${input.cancelledByEmail}`,
    `Was trialing: ${input.wasTrialing ? "yes — never converted to a paying customer" : "no"}`,
    `Access ends:  ${input.endsAt ?? "—"}`,
    "",
    "— app.mmcbuild.com.au/billing",
  ].join("\n");

  try {
    const { error } = await getResend().emails.send({ from: FROM_EMAIL, to, subject, text });
    if (error) {
      console.warn("[notifyTeamOfCancellation] resend failed:", error.message);
    }
  } catch (err) {
    console.warn("[notifyTeamOfCancellation] resend threw:", err);
  }
}
