"use server";

import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/db";
import { stripe } from "@/lib/stripe/client";
import {
  PLANS,
  TRIAL_DAYS,
  priceIdFor,
  getPlanByPriceId,
  type BillingInterval,
  type PlanId,
} from "@/lib/stripe/plans";
import { getSubscriptionStatus } from "@/lib/stripe/subscription";
import { PAYMENT_METHOD_COLLECTION } from "@/lib/legal/commercial-facts";
import {
  reconcileSubscriptionFromStripe,
  countLiveStripeSubscriptions,
} from "@/lib/stripe/reconcile";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { Attribution } from "@/lib/attribution/first-touch";
import { parseGaClientId } from "@/lib/analytics/ga4-measurement-protocol";
import { notifyTeamOfCancellation } from "@/lib/email/subscriptions";

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


/**
 * The campaign that produced a PAYING customer, carried onto the Stripe record.
 *
 * Attribution previously stopped at the HubSpot contact: Karen could see which
 * advertisement produced an enquiry, and nothing at all about which produced
 * revenue. The first-touch cookie is readable server-side at `/billing/start`
 * (it is scoped to `.mmcbuild.com.au`, so it survives the marketing site → app
 * hop), so the values can ride along with the checkout session and land on the
 * subscription, the customer, and every webhook Stripe sends about them.
 *
 * EMPTY VALUES ARE DROPPED rather than written as "". Stripe allows 50 metadata
 * keys, and a direct visitor with no campaign should leave no trace instead of
 * five blank ones that read as "we tried to record this and it failed".
 *
 * ⚠️ FIRST touch, not last — the advertisement that started the journey. That
 * is the cookie's deliberate design (see first-touch.ts) and it is the question
 * "which ad is worth paying for" actually asks.
 */
function attributionMetadata(
  attribution?: Attribution | null,
): Record<string, string> {
  if (!attribution) return {};
  const pairs: [string, string][] = [
    ["utm_source", attribution.utmSource],
    ["utm_medium", attribution.utmMedium],
    ["utm_campaign", attribution.utmCampaign],
    ["utm_term", attribution.utmTerm],
    ["utm_content", attribution.utmContent],
    ["fbclid", attribution.fbclid],
    ["gclid", attribution.gclid],
    ["landing_page", attribution.landingPage],
    ["referrer", attribution.referrer],
  ];
  const out: Record<string, string> = {};
  for (const [key, value] of pairs) {
    // Stripe caps a metadata value at 500 characters and rejects the request
    // outright if one is longer, which would fail a real purchase over a long
    // landing-page URL. The cookie already caps these, but not this call's
    // contract, so it is enforced here too.
    if (value) out[key] = value.slice(0, 500);
  }
  return out;
}

export async function createCheckoutSession(
  planId: PlanId,
  interval: BillingInterval = "month",
  attribution?: Attribution | null,
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

  // REFUSE A SECOND SUBSCRIPTION.
  //
  // Nothing stopped this until 8 August, and Dennis ended up with two live
  // Professional subscriptions on one customer — two trials, two future charges
  // of $218.90 — simply by clicking Select Plan again when the first attempt
  // appeared not to have worked.
  //
  // That is not unusual behaviour to design around; it is the FIRST thing
  // anyone does when a purchase looks like it failed. And a missed webhook
  // makes every purchase look like it failed, so the two faults compound: the
  // customer is told nothing happened, tries again, and is billed twice.
  //
  // ⚠️ THIS ASKS STRIPE, NOT OUR DATABASE, and that is the whole point. A guard
  // reading our own `subscriptions` table would have waved Dennis straight
  // through, because the missed webhook meant the table was empty — the exact
  // circumstance in which the guard is most needed is the one in which our
  // records are least trustworthy. Stripe is the only authority on whether
  // money is already being taken.
  try {
    const existing = await stripe.subscriptions.list({
      customer: org.stripe_customer_id,
      status: "all",
      limit: 20,
    });
    const live = existing.data.filter((s) =>
      ["active", "trialing", "past_due"].includes(s.status),
    );

    if (live.length > 0) {
      const current = live[0];
      const currentPlan = getPlanByPriceId(
        current.items.data[0]?.price?.id ?? "",
      );
      const samePlan = currentPlan?.id === planId;

      return {
        error: samePlan
          ? `You are already subscribed to ${currentPlan?.name ?? "this plan"}. ` +
            `There is nothing more to buy — use "Payment details and invoices" ` +
            `to change or cancel it.`
          : `You already have an active ${currentPlan?.name ?? "subscription"}. ` +
            `To move to ${PLANS[planId].name}, use "Payment details and invoices" ` +
            `and change your plan there — that way you are not charged twice and ` +
            `the difference is worked out for you.`,
      };
    }
  } catch (e) {
    // Do not block a genuine purchase because the check itself failed. Someone
    // with no subscription must still be able to buy one if Stripe's list call
    // has a bad moment — refusing everyone on a transient error would be a
    // worse outcome than the duplicate this prevents, which is at least visible
    // and refundable.
    console.error("[billing] duplicate-subscription pre-check failed", {
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  const campaign = attributionMetadata(attribution);

  // GA4 client_id, carried through so the Stripe webhook can attribute a
  // server-side conversion event (fired days later, with no browser present)
  // back to the visitor who actually clicked the ad. Read here rather than
  // passed in like `attribution`: by this point the user has navigated fully
  // onto app.mmcbuild.com.au (through /signup, then here), so the app's own
  // GA4 tag has already set `_ga` on THIS domain — same-origin, unlike
  // HubSpot's hutk which needs reading in the browser for a genuine
  // cross-origin reason. See ga4-measurement-protocol.ts for the full why.
  const gaClientId = parseGaClientId((await cookies()).get("_ga")?.value);
  const gaMetadata: Record<string, string> = gaClientId ? { ga_client_id: gaClientId } : {};

  // Also stamp the CUSTOMER, so the origin survives beyond this one purchase —
  // a cancellation and re-subscribe would otherwise lose it. Only when absent:
  // first touch must not be overwritten by a later campaign, which is the same
  // rule the cookie itself follows. Never allowed to block a purchase.
  if (Object.keys(campaign).length > 0) {
    try {
      const customer = await stripe.customers.retrieve(org.stripe_customer_id);
      const existing =
        !("deleted" in customer && customer.deleted) && customer.metadata
          ? customer.metadata
          : {};
      if (!existing.utm_source && !existing.utm_campaign) {
        await stripe.customers.update(org.stripe_customer_id, {
          metadata: { ...existing, ...campaign },
        });
      }
    } catch (e) {
      console.error("[billing] could not stamp campaign on customer", {
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      customer: org.stripe_customer_id,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/billing?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/billing?canceled=true`,
      metadata: { org_id: org.id, plan_id: planId, interval, ...campaign, ...gaMetadata },
      subscription_data: {
        metadata: { org_id: org.id, plan_id: planId, interval, ...campaign, ...gaMetadata },
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
      //
      // Read from `commercial-facts` rather than written here, so the sentence
      // in the terms and the behaviour at the till cannot disagree. They did:
      // for three days the terms said a card was required to start the trial
      // while sign-up took none, and both halves looked correct to whoever
      // checked them separately.
      payment_method_collection: PAYMENT_METHOD_COLLECTION,

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

  let session;
  try {
    session = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/billing`,
    });
  } catch (e) {
    // This call had no error handling at all, which mattered more here than
    // anywhere else in the file: it is the path a customer takes to STOP being
    // charged.
    //
    // The likely cause is not a code fault. Stripe's customer portal needs a
    // configuration saved in the dashboard, PER MODE — and a portal configured
    // in test mode does nothing for live. Without one, this throws
    // "No configuration provided and your live mode default configuration has
    // not been created", the action rejects, and the customer sees a button
    // that does nothing on the one journey the terms promise will be easy.
    //
    // cancelSubscription() below exists so that failure can no longer strand
    // anyone, but naming the cause here is what makes it fixable in a minute
    // rather than debugged for an hour.
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[billing] portal session create failed", { detail });
    return {
      error:
        `Could not open the billing portal: ${detail}. ` +
        `If this mentions a missing configuration, the Stripe customer portal ` +
        `needs to be saved in the dashboard for THIS mode (Settings → Billing → ` +
        `Customer portal). You can still cancel using the Cancel button on this page.`,
    };
  }

  redirect(session.url);
}

/**
 * Cancel the current subscription, without depending on the Stripe portal.
 *
 * WHY THIS EXISTS SEPARATELY
 * The terms say: "You can cancel at any time, from the Billing page in your
 * account. No notice period, no cancellation fee, and no need to contact us."
 *
 * Until now the only way to honour that was the Stripe customer portal, which
 * needs a configuration saved in the dashboard per mode. If that has not been
 * done in live mode — and as of 5 August it had not — the portal button throws
 * and the customer cannot cancel at all. They would have to contact us, which
 * is the one thing the terms promise they will not have to do, and they would
 * be charged in the meantime.
 *
 * This path talks to the subscription directly and needs no dashboard setup, so
 * cancelling cannot be blocked by a configuration nobody remembered to save.
 *
 * `cancel_at_period_end` rather than an immediate cancellation, deliberately:
 *   - during a TRIAL, the period ends on day 14, so they keep the access they
 *     still have and are never charged — exactly what the terms describe.
 *   - once PAID, they keep what they have already paid for, which is also what
 *     the terms describe ("you keep access until the end of the period you have
 *     paid for").
 * An immediate cancellation would take away access someone had paid for, and
 * would be the wrong kind of surprise on a screen that exists to remove them.
 */
export async function cancelSubscription() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorised" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile?.org_id) return { error: "Profile / org not found" };

  // Only an owner or admin may cancel — a `builder` or `viewer` inside someone
  // else's organisation must not be able to end the subscription paying for it.
  const { data: role } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", profile.org_id)
    .single();

  if (!role || (role.role !== "owner" && role.role !== "admin")) {
    return {
      error:
        "Only an organisation owner or admin can cancel the subscription. " +
        "Please ask them to do it from the Billing page.",
    };
  }

  const { data: sub } = await db()
    .from("subscriptions")
    .select("stripe_subscription_id, status, plan_id")
    .eq("org_id", profile.org_id)
    .in("status", ["active", "past_due", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub?.stripe_subscription_id) {
    return { error: "There is no active subscription on this account to cancel." };
  }

  try {
    const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    // Reflect it immediately rather than waiting for the webhook. The webhook is
    // still the source of truth and will confirm this, but a customer who has
    // just cancelled must see it acknowledged on the page — otherwise they click
    // again, or worse, assume it did not work and email us.
    await db()
      .from("subscriptions")
      .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
      .eq("stripe_subscription_id", sub.stripe_subscription_id);

    const wasTrialing = sub.status === "trialing";
    const endsAt = updated.cancel_at
      ? new Date(updated.cancel_at * 1000).toISOString()
      : null;

    // Best-effort internal alert — an early warning while there's still a
    // retention window, not blocking the customer's own cancellation.
    const orgRow = await db().from("organisations").select("name").eq("id", profile.org_id).single();
    const planLabel = PLANS[sub.plan_id as PlanId]?.name ?? sub.plan_id ?? "unknown";
    await notifyTeamOfCancellation({
      orgId: profile.org_id,
      orgName: (orgRow.data as { name?: string } | null)?.name ?? "—",
      planLabel,
      wasTrialing,
      endsAt,
      cancelledByEmail: user.email ?? "—",
    });

    return {
      ok: true,
      wasTrialing,
      endsAt,
    };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[billing] cancel failed", { detail });
    return {
      error:
        `Could not cancel the subscription: ${detail}. ` +
        `Please contact us at info@mmcbuild.com.au and we will cancel it for you ` +
        `— you will not be charged in the meantime.`,
    };
  }
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

  // Ask Stripe before answering, IF the organisation looks stranded — it has a
  // Stripe customer but we have no live subscription recorded for it.
  //
  // That combination means one of two things: they abandoned checkout (fine,
  // nothing to find), or they paid and we were never told (SCRUM-389 — the
  // worst failure this product has, because the customer is charged, locked
  // out, and cannot even cancel since we do not believe there is anything to
  // cancel).
  //
  // Reconciling here turns a missed webhook into a delay of one page load. It
  // returns immediately in the common case, and once it recovers a row the
  // condition stops being true, so it stops running.
  await reconcileSubscriptionFromStripe(profile.org_id);

  return getSubscriptionStatus(profile.org_id);
}

/**
 * Ask Stripe directly and report what was found, for the Billing page to show.
 *
 * Separate from getBillingStatus so the page can tell the customer something
 * true when reconciliation finds a problem it cannot fix on its own — in
 * particular, more than one live subscription on the same customer, which means
 * they are being billed twice and needs a person.
 */
export async function reconcileBilling() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "failed" as const, detail: "Unauthorised" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile?.org_id) {
    return { status: "failed" as const, detail: "Profile / org not found" };
  }

  // Ask Stripe how many live subscriptions there really are, WITHOUT the
  // "are we missing a row?" precondition. getBillingStatus has already
  // reconciled by the time this runs, so a check gated on a missing row would
  // find one present and report nothing — which is exactly what happened: two
  // live subscriptions, and the banner built to catch that stayed silent.
  return countLiveStripeSubscriptions(profile.org_id);
}
