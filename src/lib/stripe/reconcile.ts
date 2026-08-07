import { stripe } from "./client";
import { db } from "@/lib/supabase/db";
import { getPlanByPriceId, PLAN_TO_ORG_TIER, type OrgTier } from "./plans";

/**
 * Recover subscription state by asking Stripe, instead of waiting to be told.
 *
 * WHY THIS EXISTS
 * Normally Stripe tells us about a subscription by calling our webhook, and an
 * Inngest job writes the row. On 7 August that stopped happening (SCRUM-389):
 * Stripe was never calling the endpoint at all. The result is the worst failure
 * this product can have — a customer pays, the money leaves their card, and the
 * app has no idea. They are locked out of what they just bought, there is no
 * error anywhere, and they cannot even cancel, because the app does not believe
 * there is anything to cancel.
 *
 * Fixing the webhook fixes the cause. This fixes the CONSEQUENCE, permanently:
 * if the app notices it has a Stripe customer but no subscription, it asks
 * Stripe directly rather than assuming the customer has nothing. A missed
 * webhook becomes a delay of one page load instead of a dead end.
 *
 * DELIBERATELY NOT A REPLACEMENT for the webhook. This only runs when someone
 * opens the Billing page, so it cannot unlock a product for a customer who has
 * not come back to look. The webhook is still the mechanism; this is the net.
 */

/** What a reconcile attempt found, so callers can say something true about it. */
export type ReconcileResult =
  | { status: "not-needed" }
  | { status: "nothing-in-stripe" }
  | { status: "recovered"; subscriptionId: string; planId: string }
  | { status: "duplicates"; count: number; kept: string; others: string[] }
  | { status: "failed"; detail: string };

/** Stripe's typings omit these on some API versions; they are present. */
interface SubWithPeriod {
  current_period_start?: number;
  current_period_end?: number;
  items?: {
    data?: Array<{ current_period_start?: number; current_period_end?: number }>;
  };
}

/**
 * When this subscription's current period ends, in seconds.
 *
 * THREE SOURCES, IN THIS ORDER, AND THE ORDER IS THE POINT.
 *
 * 1. `trial_end` when the subscription is trialing. This is the date the
 *    customer is told they will be charged, and it is the one they will check
 *    against their calendar. Take it from the field that means exactly that.
 * 2. `current_period_end` on the ITEM. Stripe moved it there in the 2025-03 API
 *    version; on newer versions the subscription-level field is simply absent.
 * 3. `current_period_end` on the subscription, for older API versions.
 *
 * Getting this wrong is not cosmetic. The first version of this file read only
 * source 3, found nothing, and fell back to "now" — so the Billing page told
 * Dennis his card would be charged on 8 August when Stripe had the trial ending
 * on the 21st. A date that is thirteen days early on a page about taking money
 * is the kind of thing a customer disputes, and they would be right to.
 */
function periodEndSeconds(sub: SubWithPeriod & { trial_end?: number | null; status?: string }): number | null {
  if (sub.status === "trialing" && sub.trial_end) return sub.trial_end;
  const item = sub.items?.data?.[0];
  return item?.current_period_end ?? sub.current_period_end ?? null;
}

/** Matching start, same three-source rule. */
function periodStartSeconds(sub: SubWithPeriod): number | null {
  const item = sub.items?.data?.[0];
  return item?.current_period_start ?? sub.current_period_start ?? null;
}

/**
 * Exported for tests only. These two functions decide the charge date shown to
 * a customer and emailed to them, and the bug they fix produced a date thirteen
 * days early with nothing failing — so they are worth pinning directly rather
 * than only through the code that calls them.
 */
export const __testing = { periodEndSeconds, periodStartSeconds };

/**
 * How many live subscriptions this customer has, asked without the
 * "are we missing a row?" precondition.
 *
 * Separate from reconcileSubscriptionFromStripe because of a race that made the
 * duplicate warning useless: the page called reconcile (which wrote the missing
 * row) and then called it again to ask about duplicates — by which point a row
 * existed, so the second call returned "not-needed" and said nothing. Dennis
 * had two live subscriptions and the banner built to catch that stayed silent.
 *
 * Double billing has to be detectable whether or not our records happen to be
 * up to date, so this asks Stripe every time it is called.
 */
export async function countLiveStripeSubscriptions(
  orgId: string,
): Promise<ReconcileResult> {
  try {
    const admin = db();
    const { data: org } = await admin
      .from("organisations")
      .select("stripe_customer_id")
      .eq("id", orgId)
      .single();

    if (!org?.stripe_customer_id) return { status: "not-needed" };

    const list = await stripe.subscriptions.list({
      customer: org.stripe_customer_id,
      status: "all",
      limit: 20,
    });
    const live = list.data.filter((s) =>
      ["active", "trialing", "past_due"].includes(s.status),
    );

    if (live.length === 0) return { status: "nothing-in-stripe" };
    if (live.length === 1) return { status: "not-needed" };

    live.sort((a, b) => b.created - a.created);
    const others = live.slice(1).map((s) => s.id);
    console.error(
      `[reconcile] org ${orgId} has ${live.length} live Stripe subscriptions — ` +
        `possible double billing. Newest ${live[0].id}; also live: ${others.join(", ")}`,
    );
    return {
      status: "duplicates",
      count: live.length,
      kept: live[0].id,
      others,
    };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[reconcile] duplicate check failed", { orgId, detail });
    return { status: "failed", detail };
  }
}

/**
 * Ask Stripe what subscriptions this organisation really has, and write what we
 * find. Safe to call on every Billing page load: it returns immediately unless
 * the organisation has a Stripe customer AND no live subscription recorded —
 * which is precisely the "possibly stranded" case. Once it recovers a row, the
 * condition stops being true and it stops running.
 *
 * Never throws. A billing page that fails to render because Stripe was slow is
 * a worse outcome than one that renders slightly stale.
 */
export async function reconcileSubscriptionFromStripe(
  orgId: string,
): Promise<ReconcileResult> {
  try {
    const admin = db();

    const { data: org } = await admin
      .from("organisations")
      .select("stripe_customer_id")
      .eq("id", orgId)
      .single();

    // No customer means they have never reached checkout. Nothing to ask about.
    if (!org?.stripe_customer_id) return { status: "not-needed" };

    // NOTE: this deliberately does NOT skip when a row already exists.
    //
    // The first version returned early in that case — "we know about it, the
    // webhook did its job" — and that was wrong twice over while the webhook is
    // down. It meant a row could never be CORRECTED, only created:
    //
    //   - Dennis's row carried a period_end of 7 August, thirteen days early,
    //     written by the date bug fixed alongside this. It would have stayed
    //     wrong forever, because a row existed.
    //   - He then cancelled a subscription in the Stripe portal. Nothing told
    //     us, so the page kept offering to cancel something already cancelled.
    //
    // A record that can be created from Stripe but never corrected from Stripe
    // is only half a safety net. Refreshing costs one list call on a page a
    // customer opens rarely, and it is what keeps the page honest about money
    // while the webhook is unreliable.
    const list = await stripe.subscriptions.list({
      customer: org.stripe_customer_id,
      status: "all",
      limit: 20,
    });

    const live = list.data.filter((s) =>
      ["active", "trialing", "past_due"].includes(s.status),
    );

    if (live.length === 0) return { status: "nothing-in-stripe" };

    // Newest first, so "kept" is the one the customer most recently intended.
    live.sort((a, b) => b.created - a.created);
    const chosen = live[0];

    await writeSubscription(orgId, org.stripe_customer_id, chosen);

    if (live.length > 1) {
      // DO NOT quietly sync one and ignore the rest. More than one live
      // subscription on a single customer means they are being billed more than
      // once — which is exactly what happens when a checkout is retried because
      // the first one appeared not to work, which is exactly what a missed
      // webhook makes people do. Silently syncing the newest would hide a real
      // double-charge behind a page that finally looks correct.
      const others = live.slice(1).map((s) => s.id);
      console.error(
        `[reconcile] org ${orgId} has ${live.length} live Stripe subscriptions — ` +
          `possible double billing. Kept ${chosen.id}; also live: ${others.join(", ")}`,
      );
      return { status: "duplicates", count: live.length, kept: chosen.id, others };
    }

    return {
      status: "recovered",
      subscriptionId: chosen.id,
      planId: resolvePlanId(chosen),
    };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[reconcile] failed", { orgId, detail });
    return { status: "failed", detail };
  }
}

/** Resolve the tier from the price, exactly as the webhook path does. */
function resolvePlanId(sub: {
  items: { data: Array<{ price?: { id?: string } | null }> };
  metadata?: Record<string, string> | null;
}): string {
  const priceId = sub.items.data[0]?.price?.id;
  const plan = priceId ? getPlanByPriceId(priceId) : null;
  return plan?.id || sub.metadata?.plan_id || "essential";
}

/**
 * Write the subscription exactly as the webhook + Inngest path would.
 *
 * The field mapping is copied from sync-stripe-subscription.ts on purpose,
 * including the Enterprise sentinel: usage_limit is a numeric column, so an
 * Infinity run limit has to be written as 999999 rather than Infinity. A row
 * that differs from the webhook's shape would be worse than no row — the two
 * paths must be indistinguishable once written, or behaviour depends on which
 * one happened to run.
 */
async function writeSubscription(
  orgId: string,
  customerId: string,
  sub: Awaited<ReturnType<typeof stripe.subscriptions.list>>["data"][number],
) {
  const admin = db();
  const withPeriod = sub as unknown as SubWithPeriod;
  const now = new Date().toISOString();
  const planId = resolvePlanId(sub);

  const priceId = sub.items.data[0]?.price?.id;
  const plan = priceId ? getPlanByPriceId(priceId) : null;
  const usageLimit = plan
    ? plan.runLimit === Infinity
      ? 999999
      : plan.runLimit
    : 10;

  const endSeconds = periodEndSeconds(
    withPeriod as SubWithPeriod & { trial_end?: number | null; status?: string },
  );
  const startSeconds = periodStartSeconds(withPeriod);

  const { error } = await admin.from("subscriptions").upsert(
    {
      org_id: orgId,
      stripe_subscription_id: sub.id,
      stripe_customer_id: customerId,
      plan_id: planId,
      status: sub.status,
      current_period_start: startSeconds
        ? new Date(startSeconds * 1000).toISOString()
        : now,
      // Falling back to `now` here is what produced a charge date thirteen days
      // early. It is kept only as a last resort — periodEndSeconds tries the
      // trial end, then the item, then the subscription, so reaching this means
      // Stripe returned a subscription with no period information at all.
      current_period_end: endSeconds
        ? new Date(endSeconds * 1000).toISOString()
        : now,
      cancel_at_period_end: sub.cancel_at_period_end,
      usage_limit: usageLimit,
      updated_at: now,
    },
    { onConflict: "stripe_subscription_id" },
  );

  if (error) throw new Error(`reconcile upsert failed: ${error.message}`);

  const tier: OrgTier =
    sub.status === "canceled" ? "trial" : PLAN_TO_ORG_TIER[planId] ?? "essential";

  const { error: orgError } = await admin
    .from("organisations")
    .update({
      subscription_tier: tier,
      stripe_customer_id: customerId,
      updated_at: now,
    })
    .eq("id", orgId);

  // Same reason this is checked in the webhook path: until 2026-07-31 the result
  // was discarded, so a CHECK-constraint rejection left the org on 'trial' after
  // a successful payment, with nothing logged and no retry.
  if (orgError) {
    throw new Error(
      `reconcile: failed to set subscription_tier="${tier}" on org ${orgId}: ${orgError.message}`,
    );
  }
}
