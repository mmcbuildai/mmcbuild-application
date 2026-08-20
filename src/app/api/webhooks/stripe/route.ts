import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { inngest } from "@/lib/inngest/client";
import { getPlanByPriceId } from "@/lib/stripe/plans";
import { notifyTeamOfNewSubscription } from "@/lib/email/subscriptions";
import { sendGA4Event } from "@/lib/analytics/ga4-measurement-protocol";
import { db } from "@/lib/supabase/db";
import type Stripe from "stripe";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          );
          await sendSyncEvent(subscription);
          // Fired here only — checkout.session.completed is the one event that
          // means "a user just subscribed" (not a renewal or plan change).
          await notifyTeamOfNewSubscription(subscription);
          // GA4 "trial started" conversion — fast signal for Google Ads bidding.
          // A card was just captured (payment_method_collection: "always"), so
          // this is a meaningfully qualified signal, not a throwaway one — but
          // it is still not revenue, see the invoice.paid case below for that.
          await sendGA4Event(subscription.metadata?.ga_client_id, {
            name: "trial_signup",
            params: { plan_id: subscription.metadata?.plan_id || "" },
          });
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const paidSubId = typeof invoice.parent?.subscription_details === "object"
          ? invoice.parent?.subscription_details?.subscription
          : null;
        if (paidSubId) {
          const subscription = await stripe.subscriptions.retrieve(paidSubId as string);

          // Was this subscription still "trialing" in OUR records the moment
          // before this invoice? If so, this invoice.paid is the trial
          // genuinely converting to a real charge — the one that actually
          // matters for revenue-based conversion tracking. Checked BEFORE
          // sendSyncEvent below, which is what overwrites status to "active".
          //
          // Deliberately NOT using Stripe's own `invoice.billing_reason` for
          // this: "subscription_cycle" covers BOTH the first post-trial charge
          // AND every renewal after it, so it cannot tell them apart on its
          // own. Our own stored status can, because sendSyncEvent has not run
          // yet at this point in the handler.
          const { data: existingSub } = await db()
            .from("subscriptions")
            .select("status")
            .eq("stripe_subscription_id", paidSubId as string)
            .maybeSingle();
          const isTrialConversion = existingSub?.status === "trialing";

          // Reset usage on renewal
          await sendSyncEvent(subscription, { resetUsage: true });

          if (isTrialConversion) {
            // GA4 "purchase" — the real revenue conversion. Uses GA4's own
            // recommended ecommerce event name + value/currency so Google Ads
            // can do value-based bidding, not just count conversions.
            await sendGA4Event(subscription.metadata?.ga_client_id, {
              name: "purchase",
              params: {
                value: (invoice.amount_paid ?? 0) / 100,
                currency: (invoice.currency || "aud").toUpperCase(),
                plan_id: subscription.metadata?.plan_id || "",
              },
            });
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const failedSubId = typeof invoice.parent?.subscription_details === "object"
          ? invoice.parent?.subscription_details?.subscription
          : null;
        if (failedSubId) {
          const subscription = await stripe.subscriptions.retrieve(failedSubId as string);
          await sendSyncEvent(subscription);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await sendSyncEvent(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await sendSyncEvent(subscription);
        break;
      }
    }
  } catch (e) {
    console.error("Webhook handler error:", e);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// Stripe v21 removed current_period_end/start from TS types but the API still returns them
interface SubscriptionWithPeriod extends Stripe.Subscription {
  current_period_end?: number;
  current_period_start?: number;
}

async function sendSyncEvent(
  subscription: Stripe.Subscription,
  options?: { resetUsage?: boolean }
) {
  const sub = subscription as SubscriptionWithPeriod;
  const priceId = subscription.items.data[0]?.price?.id;
  const plan = priceId ? getPlanByPriceId(priceId) : null;
  const orgId = subscription.metadata?.org_id;

  const now = new Date().toISOString();

  // usage_limit is a numeric column — Enterprise's Infinity run limit must be
  // written as a finite sentinel, not Infinity.
  const usageLimit = plan
    ? plan.runLimit === Infinity
      ? 999999
      : plan.runLimit
    : 10;

  await inngest.send({
    name: "stripe/subscription.sync",
    data: {
      customerId: subscription.customer as string,
      subscriptionId: subscription.id,
      status: subscription.status,
      planId: plan?.id || subscription.metadata?.plan_id || "essential",
      orgId: orgId || "",
      currentPeriodEnd: sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : now,
      currentPeriodStart: sub.current_period_start
        ? new Date(sub.current_period_start * 1000).toISOString()
        : now,
      trialEnd: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      usageLimit,
      resetUsage: options?.resetUsage ?? false,
    },
  });
}
