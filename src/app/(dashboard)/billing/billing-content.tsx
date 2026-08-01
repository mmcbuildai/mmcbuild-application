"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Settings } from "lucide-react";
import { getBillingStatus, createCheckoutSession, createPortalSession } from "./actions";
import { PLANS, type PlanId } from "@/lib/stripe/plans";
import { UsageRing } from "@/components/billing/usage-ring";
import { PlanCard } from "@/components/billing/plan-card";
import { PaymentSuccess } from "@/components/billing/payment-success";
import { TrialBanner } from "@/components/billing/trial-banner";
import type { SubscriptionStatus } from "@/lib/stripe/subscription";

export function BillingContent() {
  const searchParams = useSearchParams();
  const showSuccess = searchParams.get("success") === "true";
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  // The action returns a typed error for every failure it can name (plan not
  // configured, Stripe Tax not enabled, a rejected price id). Those were being
  // discarded, so a failed checkout looked identical to a button that did
  // nothing — no message, no console entry, nothing to report. Surface it.
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    getBillingStatus().then((s) => {
      setStatus(s);
      setLoading(false);
    });
  }, []);

  if (loading) return null; // Suspense fallback handles this
  if (!status) return <p className="text-muted-foreground">Unable to load billing status.</p>;

  // Show success state after checkout
  if (showSuccess && status.tier !== "trial" && status.tier !== "expired") {
    const plan = PLANS[status.tier as PlanId];
    return (
      <PaymentSuccess
        planName={plan?.name ?? "your plan"}
        runLimit={plan?.runLimit ?? 10}
      />
    );
  }

  const handleSelectPlan = (planId: string) => {
    setCheckoutError(null);
    startTransition(async () => {
      const result = await createCheckoutSession(planId as PlanId);
      if (result.url) {
        // Stripe's own hosted-checkout URL. It carries a required fragment and
        // cannot be rebuilt from the session id — the previous code guessed the
        // URL and, worse, gated on `clientSecret`, which is always null for a
        // hosted session. Net effect: a Stripe session was created on every
        // click and the browser never went anywhere.
        window.location.href = result.url;
        return;
      }
      setCheckoutError(
        result.error ??
          "Checkout could not be started. Please try again, or contact support if it keeps happening.",
      );
    });
  };

  const handleManageSubscription = () => {
    startTransition(async () => {
      await createPortalSession();
    });
  };

  return (
    <div className="space-y-8">
      {/* Trial banner */}
      {status.tier === "trial" && status.daysRemaining !== null && (
        <TrialBanner
          daysRemaining={status.daysRemaining}
          usageCount={status.usageCount}
          usageLimit={status.usageLimit}
        />
      )}

      {/* Current plan + Usage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current plan card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Current Plan</h2>
          {status.tier === "trial" || status.tier === "expired" ? (
            <div>
              <p className="text-2xl font-bold text-slate-900">Free Trial</p>
              <p className="text-sm text-slate-500 mt-1">
                {status.tier === "expired"
                  ? "Trial expired — upgrade to continue"
                  : `${status.daysRemaining} days remaining`}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-2xl font-bold text-slate-900 capitalize">
                {status.tier}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                ${PLANS[status.tier as PlanId]?.price ?? "—"}/month
                {status.cancelAtPeriodEnd && " · Cancels at period end"}
              </p>
              {status.periodEnd && (
                <p className="text-sm text-slate-500">
                  Renews {new Date(status.periodEnd).toLocaleDateString("en-AU")}
                </p>
              )}
              {status.status === "past_due" && (
                <p className="text-sm text-red-500 font-medium mt-2">
                  Payment failed — please update your payment method
                </p>
              )}
              <button
                onClick={handleManageSubscription}
                disabled={isPending}
                className="mt-4 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
              >
                <Settings className="w-4 h-4" />
                Manage Subscription
              </button>
            </div>
          )}
        </div>

        {/* Usage ring */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-col items-center justify-center">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Usage This Period</h2>
          <UsageRing
            used={status.usageCount}
            limit={status.usageLimit}
          />
        </div>
      </div>

      {/* Plan comparison */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          {status.tier === "trial" || status.tier === "expired"
            ? "Choose a Plan"
            : "Available Plans"}
        </h2>
        {checkoutError && (
          <div
            role="alert"
            className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {checkoutError}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(PLANS).map(([id, plan]) => (
            <PlanCard
              key={id}
              name={plan.name}
              price={plan.price}
              features={plan.features}
              runLimit={plan.runLimit}
              isCurrent={status.tier === id}
              isPopular={"popular" in plan && plan.popular === true}
              isCustom={"isCustom" in plan && plan.isCustom === true}
              onSelect={() => handleSelectPlan(id)}
              disabled={isPending}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
