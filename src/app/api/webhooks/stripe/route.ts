import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { inngest } from "@/lib/inngest/client";
import { getPlanByPriceId } from "@/lib/stripe/plans";
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
          // Reset usage on renewal
          await sendSyncEvent(subscription, { resetUsage: true });
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
