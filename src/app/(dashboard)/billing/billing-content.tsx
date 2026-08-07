"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Settings } from "lucide-react";
import { getBillingStatus, createCheckoutSession, createPortalSession } from "./actions";
import {
  PLANS,
  annualSavingMonths,
  displayPriceFor,
  type BillingInterval,
  type PlanId,
} from "@/lib/stripe/plans";
import { grossAmountFor } from "@/lib/billing/trial-reminders";
import { UsageRing } from "@/components/billing/usage-ring";
import { PlanCard } from "@/components/billing/plan-card";
import { PaymentSuccess } from "@/components/billing/payment-success";
import { TrialBanner } from "@/components/billing/trial-banner";
import type { SubscriptionStatus } from "@/lib/stripe/subscription";

export function BillingContent({
  annualAvailable = false,
}: {
  /** Whether Stripe has annual prices configured — resolved server-side. */
  annualAvailable?: boolean;
}) {
  const searchParams = useSearchParams();
  const showSuccess = searchParams.get("success") === "true";
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  // The action returns a typed error for every failure it can name (plan not
  // configured, Stripe Tax not enabled, a rejected price id). Those were being
  // discarded, so a failed checkout looked identical to a button that did
  // nothing — no message, no console entry, nothing to report. Surface it.
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [portalError, setPortalError] = useState<string | null>(null);

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

  // "Has something to manage" — a real Stripe subscription, including one still
  // in its trial. A legacy trial held on the organisation row is NOT this: there
  // is no card and no subscription, so there is nothing to cancel and no billing
  // portal to open. Copy on this page has to tell those two apart or it promises
  // controls that do not exist for the reader.
  const hasSubscription =
    status.tier !== "trial" && status.tier !== "expired";

  const handleSelectPlan = (planId: string) => {
    setCheckoutError(null);
    startTransition(async () => {
      const result = await createCheckoutSession(planId as PlanId, interval);
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

  // Same defect the checkout button had: the action can return
  // { error: "No active subscription" } and the result was discarded, so a
  // failure was indistinguishable from a button that did nothing. That matters
  // more here than anywhere else in the product — this is the path a customer
  // uses to CANCEL, and a dead button on the cancel path is the one failure
  // nobody should ever be able to say we shipped.
  const handleManageSubscription = () => {
    setPortalError(null);
    startTransition(async () => {
      const result = await createPortalSession();
      // On success this redirects and never returns. Anything returned is a
      // failure worth showing.
      if (result && "error" in result) {
        setPortalError(
          `${result.error}. If you are trying to cancel and this keeps happening, email support@mmcbuild.com.au and we will cancel it for you — you will not be charged again.`,
        );
      }
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
                {status.status === "trialing"
                  ? `${PLANS[status.tier as PlanId]?.name ?? status.tier} — free trial`
                  : status.tier}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                ${PLANS[status.tier as PlanId]?.price ?? "—"}/month
                {status.cancelAtPeriodEnd && " · Cancels at period end"}
              </p>
              {/*
                A subscription in its trial reaches this branch too, and it used
                to read "Essential · $49/month · Renews 21 August" — which says
                nothing about being in a free trial, calls the FIRST charge a
                renewal, and quotes $49 when $53.90 leaves the account.
                Under Option A the customer has already handed over a card, so
                this panel is the one place they check before deciding whether
                to let it run. It has to name the real amount and the real date.
              */}
              {status.status === "trialing" && status.trialEndsAt ? (
                <p className="mt-2 text-sm font-medium text-slate-900">
                  First charge{" "}
                  {(() => {
                    const amounts = grossAmountFor(status.tier as PlanId);
                    return amounts ? `$${amounts.gross.toFixed(2)}` : "";
                  })()}{" "}
                  on{" "}
                  {new Date(status.trialEndsAt).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                  . Cancel before then and you pay nothing.
                </p>
              ) : (
                status.periodEnd && (
                  <p className="text-sm text-slate-500">
                    Renews{" "}
                    {new Date(status.periodEnd).toLocaleDateString("en-AU")}
                  </p>
                )
              )}
              {status.status === "past_due" && (
                <p className="text-sm text-red-500 font-medium mt-2">
                  Payment failed — please update your payment method
                </p>
              )}
              {/*
                Cancelling must be as easy to find as subscribing was. The
                Terms of Use now say a subscription can be cancelled "at any
                time, from the Billing page … no notice period, no cancellation
                fee, and no need to contact us" — so this page has to actually
                say the word "cancel", and mean it.

                Previously the only affordance was a small grey "Manage
                Subscription" text link. Nothing was hidden, but a customer
                looking to cancel had to guess that "Manage" contained it, and
                the page never used their word. That is friction on the one
                journey that should have none.
              */}
              <div className="mt-4 flex flex-col gap-2">
                <button
                  onClick={handleManageSubscription}
                  disabled={isPending}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
                >
                  <Settings className="w-4 h-4" />
                  {isPending ? "Opening…" : "Manage subscription or cancel"}
                </button>
                {/*
                  Say what is behind the button. The comment above complains
                  that a customer "had to guess that Manage contained it" —
                  which was true of cancelling, and is equally true of the card
                  on file, the invoices and the plan change. All four live in
                  the Stripe portal and none of them were named anywhere.
                */}
                <p className="text-xs text-slate-500">
                  Opens your billing portal, where you can{" "}
                  <strong>cancel</strong>, change plan, update the card on file,
                  and download past invoices and receipts.
                </p>
                <p className="text-xs text-slate-500">
                  Cancel any time — no notice period and no cancellation fee. You
                  keep access until the end of the period you have paid for.
                </p>
                {portalError && (
                  <div
                    role="alert"
                    className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                  >
                    {portalError}
                  </div>
                )}
              </div>
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
        {/*
          Monthly / annual switch. Rendered only when Stripe actually has annual
          prices configured — offering annual with no price id behind it would
          fail at the checkout page, in front of someone who has already decided
          to pay. Degrade, don't fake.
        */}
        {annualAvailable && (
          <div className="mb-5 flex justify-center">
            <div
              role="radiogroup"
              aria-label="Billing period"
              className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1"
            >
              {(["month", "year"] as const).map((option) => (
                <button
                  key={option}
                  role="radio"
                  aria-checked={interval === option}
                  onClick={() => setInterval(option)}
                  className={`inline-flex min-h-[44px] items-center rounded-md px-4 text-sm font-medium transition-colors ${
                    interval === option
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {option === "month" ? "Monthly" : "Annual"}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(PLANS).map(([id, plan]) => (
            <PlanCard
              key={id}
              name={plan.name}
              price={displayPriceFor(id as PlanId, interval)}
              features={plan.features}
              runLimit={plan.runLimit}
              isCurrent={status.tier === id}
              isPopular={"popular" in plan && plan.popular === true}
              isCustom={"isCustom" in plan && plan.isCustom === true}
              onSelect={() => handleSelectPlan(id)}
              disabled={isPending}
              interval={interval}
              savingMonths={annualSavingMonths(id as PlanId)}
            />
          ))}
        </div>

        {/*
          The terms were reachable from the footer and nowhere near the point of
          purchase. This is the screen where someone hands over a card, so the
          document describing what they are agreeing to belongs here — stated,
          not buried. Everything below is already in section 7 of the terms; it
          is repeated because a summary someone actually reads is worth more
          than a link they do not click.
        */}
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-medium text-slate-900">
            {hasSubscription ? "Your subscription terms" : "Before you subscribe"}
          </p>
          <ul className="mt-2 space-y-1.5">
            <li>
              Every plan starts with a <strong>14-day free trial</strong>. A card
              is required to begin it, and you are not charged during the trial.
            </li>
            <li>
              At the end of the 14 days your card is charged automatically for
              the first period, unless you cancel before then.
            </li>
            {/*
              This line was written in the present tense for everybody, which
              made it FALSE for the people most likely to read it: someone on a
              trial with no card has no cancel control on this page, because
              there is nothing to cancel. Telling them they can cancel here, and
              then showing them nothing that cancels, is worse than saying
              nothing at all — it reads as a control that is broken or hidden.
            */}
            <li>
              {hasSubscription ? (
                <>
                  <strong>You can cancel at any time from this page</strong> —
                  use the button in Current Plan above. No notice period, no
                  cancellation fee, and no need to contact us.
                </>
              ) : (
                <>
                  <strong>
                    Once you subscribe you can cancel at any time from this page
                  </strong>{" "}
                  — no notice period, no cancellation fee, and no need to contact
                  us.
                </>
              )}
            </li>
            <li>All prices exclude GST, which is added at checkout.</li>
          </ul>
          <p className="mt-3">
            <a
              href="/terms"
              className="font-medium text-brand-600 underline hover:text-brand-700"
            >
              Read the full Terms of Use
            </a>{" "}
            — payment, renewal and cancellation are in section 7.
          </p>
        </div>
      </div>
    </div>
  );
}
