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
export async function notifyKarthikOfNewSubscription(
  subscription: Stripe.Subscription,
): Promise<void> {
  const to = process.env.KARTHIK_EMAIL || "karthik.rao@mmcbuild.com.au";
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
      console.warn("[notifyKarthikOfNewSubscription] resend failed:", error.message);
    }
  } catch (err) {
    console.warn("[notifyKarthikOfNewSubscription] resend threw:", err);
  }
}
