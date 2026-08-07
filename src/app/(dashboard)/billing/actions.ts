"use server";

import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/db";
import { stripe } from "@/lib/stripe/client";
import {
  PLANS,
  TRIAL_DAYS,
  priceIdFor,
  type BillingInterval,
  type PlanId,
} from "@/lib/stripe/plans";
import { getSubscriptionStatus } from "@/lib/stripe/subscription";
import { redirect } from "next/navigation";

async function getOrgWithStripeCustomer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile) throw new Error("Profile not found");

  const admin = db();
  const { data: org } = await admin
    .from("organisations")
    .select("id, name, stripe_customer_id")
    .eq("id", profile.org_id)
    .single();

  if (!org) throw new Error("Organisation not found");

  // Create Stripe customer if needed
  if (!org.stripe_customer_id) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: org.name,
      metadata: { org_id: org.id },
    });

    await admin
      .from("organisations")
      .update({ stripe_customer_id: customer.id })
      .eq("id", org.id);

    return { ...org, stripe_customer_id: customer.id };
  }

  return org;
}

export async function createCheckoutSession(
  planId: PlanId,
  interval: BillingInterval = "month",
) {
  const plan = PLANS[planId];
  if (!plan || ("isCustom" in plan && plan.isCustom)) {
    return { error: "Invalid plan" };
  }

  // Annual is only sellable where a live annual price exists. An unset env var
  // would otherwise reach Stripe as an empty price and fail at the checkout
  // page, in front of a customer who has already chosen to pay.
  const priceId = priceIdFor(planId, interval);
  if (!priceId) {
    return {
      error:
        interval === "year"
          ? "Annual billing is not available for this plan yet. Please choose monthly, or contact us."
          : "Plan not configured in Stripe",
    };
  }

  const org = await getOrgWithStripeCustomer();

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      customer: org.stripe_customer_id,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/billing?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/billing?canceled=true`,
      metadata: { org_id: org.id, plan_id: planId, interval },
      subscription_data: {
        metadata: { org_id: org.id, plan_id: planId, interval },
        // 14 days free, then Stripe charges the stored card automatically.
        // Karen's decision (SCRUM-366, 7 August): "I would like to go with
        // option A. Based on my experience with the market who are time poor
        // and will forget to make the decision after 14 days."
        trial_period_days: TRIAL_DAYS,
      },

      // ⚠️ MANDATORY with a trial, and the single most dangerous default in
      // this file. Stripe's default is `if_required`, and with a trial present
      // NOTHING is required at checkout — so Stripe creates the subscription
      // with NO CARD ON FILE. It looks perfectly healthy for fourteen days and
      // then the first charge fails, silently, with nothing to alert anyone.
      // The whole point of Option A is that the card is captured up front, so
      // `always` is what makes this model work at all.
      payment_method_collection: "always",

      // GST. Prices are quoted tax-EXCLUSIVE (see TAX_QUALIFIER in plans.ts),
      // so the tax has to be added by the session — configuring the Stripe
      // product as exclusive does nothing on its own. Without this the $49 tier
      // charges a flat $49 with no GST line, while every price surface in the
      // app says "+ GST".
      automatic_tax: { enabled: true },
      // Stripe Tax needs an address to determine the rate, and refuses the
      // session if the customer has none. `address: "auto"` writes what the
      // buyer enters at checkout back onto the customer record, so the second
      // purchase doesn't ask again.
      billing_address_collection: "required",
      customer_update: { address: "auto", name: "auto" },
      // AU business buyers expect to enter an ABN, and it appears on the
      // tax invoice they'll claim the GST back against.
      tax_id_collection: { enabled: true },
    });
  } catch (e) {
    // Do not surface a bare Stripe error as a dead button. The likely cause is
    // an account-side prerequisite, not a code fault: automatic_tax requires
    // Stripe Tax to be enabled with an AU GST registration. Name it, so the
    // failure is answerable instead of "something went wrong".
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[billing] checkout session create failed", { planId, detail });
    return {
      error:
        `Could not start checkout: ${detail}. ` +
        `If this mentions tax, Stripe Tax needs to be enabled with an Australian ` +
        `GST registration in the Stripe dashboard (Settings → Tax).`,
    };
  }

  // Return the HOSTED checkout URL. `client_secret` is null on a hosted session
  // (it is only populated for `ui_mode: 'embedded'`), and the caller previously
  // gated its redirect on that null value — so the button created a real Stripe
  // session on every click and then did nothing, silently. Proven against
  // production 2026-08-01: four sessions in the Stripe account, all
  // `ui_mode=hosted_page`, all `client_secret=null`, none ever opened.
  //
  // The URL must be Stripe's own `session.url` — it carries a required fragment
  // and cannot be reconstructed from the session id.
  return { url: session.url, sessionId: session.id };
}

export async function createPortalSession() {
  const org = await getOrgWithStripeCustomer();

  if (!org.stripe_customer_id) {
    return { error: "No active subscription" };
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/billing`,
  });

  redirect(session.url);
}

export async function getBillingStatus() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile) return null;

  return getSubscriptionStatus(profile.org_id);
}
