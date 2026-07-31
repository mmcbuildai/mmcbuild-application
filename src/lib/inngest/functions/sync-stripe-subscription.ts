import { inngest } from "../client";
import { db } from "@/lib/supabase/db";
import { PLAN_TO_ORG_TIER, type OrgTier } from "@/lib/stripe/plans";

export const syncStripeSubscription = inngest.createFunction(
  { id: "sync-stripe-subscription", name: "Sync Stripe Subscription" },
  { event: "stripe/subscription.sync" },
  async ({ event, step }) => {
    const {
      customerId,
      subscriptionId,
      status,
      planId,
      orgId,
      currentPeriodEnd,
      currentPeriodStart,
      trialEnd,
      cancelAtPeriodEnd,
      usageLimit,
      resetUsage,
    } = event.data;

    await step.run("upsert-subscription", async () => {
      const admin = db();

      // Resolve org_id from metadata or customer lookup
      let resolvedOrgId = orgId;
      if (!resolvedOrgId) {
        const { data: org } = await admin
          .from("organisations")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();
        resolvedOrgId = org?.id;
      }

      if (!resolvedOrgId) {
        throw new Error(`No org found for Stripe customer ${customerId}`);
      }

      // Upsert subscription
      const subscriptionData = {
        org_id: resolvedOrgId,
        stripe_subscription_id: subscriptionId,
        stripe_customer_id: customerId,
        plan_id: planId,
        status,
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: cancelAtPeriodEnd,
        usage_limit: usageLimit,
        updated_at: new Date().toISOString(),
        ...(resetUsage ? { usage_count: 0 } : {}),
      };

      const { error } = await admin
        .from("subscriptions")
        .upsert(subscriptionData, {
          onConflict: "stripe_subscription_id",
        });

      if (error) {
        throw new Error(`Failed to upsert subscription: ${error.message}`);
      }

      // Update org subscription tier. planId arrives as a current tier id
      // (essential/professional/enterprise); "basic" is a legacy alias.
      // PLAN_TO_ORG_TIER is shared with the DB CHECK constraint — see the
      // ORG_TIER_VALUES doc comment in plans.ts.
      const tier: OrgTier = status === "canceled"
        ? "trial"
        : PLAN_TO_ORG_TIER[planId] ?? "essential";

      const { error: orgError } = await admin
        .from("organisations")
        .update({
          subscription_tier: tier,
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", resolvedOrgId);

      // Never discard this. Until 2026-07-31 the result was dropped, so a
      // CHECK-constraint rejection left the org on 'trial' after a successful
      // payment with nothing logged and no retry.
      if (orgError) {
        throw new Error(
          `Failed to set subscription_tier="${tier}" on org ${resolvedOrgId}: ${orgError.message}`,
        );
      }
    });

    return { synced: true, orgId, status, planId };
  }
);
