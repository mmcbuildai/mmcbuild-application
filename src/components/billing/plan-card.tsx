"use client";

import { Check, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { TAX_QUALIFIER, type BillingInterval } from "@/lib/stripe/plans";

interface PlanCardProps {
  name: string;
  price: number | null;
  features: readonly string[];
  runLimit: number;
  isCurrent?: boolean;
  isPopular?: boolean;
  isCustom?: boolean;
  onSelect?: () => void;
  disabled?: boolean;
  /** Which billing period `price` refers to. Defaults to monthly. */
  interval?: BillingInterval;
  /** Whole months saved by paying annually, when there is a saving to state. */
  savingMonths?: number | null;
}

export function PlanCard({
  name,
  price,
  features,
  runLimit,
  isCurrent,
  isPopular,
  isCustom,
  onSelect,
  disabled,
  interval = "month",
  savingMonths,
}: PlanCardProps) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border p-6 flex flex-col",
        isPopular
          ? "border-brandgreen-400 bg-brandgreen-50/50 shadow-lg"
          : "border-slate-200 bg-white",
        isCurrent && "ring-2 ring-brandgreen-400"
      )}
    >
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-brandgreen-400 text-white text-xs font-medium">
            <Star className="w-3 h-3" /> Most Popular
          </span>
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">{name}</h3>
        {price !== null ? (
          <div className="mt-2">
            <span className="text-3xl font-bold text-slate-900">${price}</span>
            {/* Prices are quoted GST-exclusive — see TAX_QUALIFIER in plans.ts. */}
            <span className="text-sm text-slate-500">
              /{interval === "year" ? "year" : "month"} {TAX_QUALIFIER}
            </span>
            {interval === "year" && savingMonths ? (
              <p className="mt-1 text-sm font-medium text-brandgreen-600">
                {savingMonths} {savingMonths === 1 ? "month" : "months"} free
                compared with paying monthly
              </p>
            ) : null}
          </div>
        ) : (
          <div className="mt-2">
            <span className="text-3xl font-bold text-slate-900">Custom</span>
          </div>
        )}
        <p className="text-sm text-slate-500 mt-1">
          {runLimit === Infinity ? "Unlimited" : runLimit} compliance runs
        </p>
      </div>

      <ul className="space-y-2 flex-1 mb-6">
        {/*
          "separator" is a rule, not a feature. The list is shared with the
          pricing page (SCRUM-399 — the two pages used to keep separate copies
          and drifted), and it uses this marker to split the allowance from the
          capability list. Without this branch the word "separator" renders as
          a bullet with a tick next to it.
        */}
        {features.map((feature, i) =>
          feature === "separator" ? (
            <li key={`sep-${i}`} className="py-1" aria-hidden="true">
              <div className="border-t border-slate-200" />
            </li>
          ) : (
            <li key={feature} className="flex items-start gap-2 text-sm text-slate-600">
              <Check className="w-4 h-4 text-brandgreen-500 mt-0.5 shrink-0" />
              {feature}
            </li>
          ),
        )}
      </ul>

      {isCurrent ? (
        <button
          disabled
          className="w-full py-2.5 px-4 rounded-full bg-slate-100 text-slate-500 text-sm font-medium cursor-default"
        >
          Current Plan
        </button>
      ) : isCustom ? (
        <a
          href="mailto:hello@mmcbuild.com.au?subject=Enterprise%20Plan%20Enquiry"
          className="w-full py-2.5 px-4 rounded-full bg-slate-900 text-white text-sm font-medium text-center hover:bg-slate-800 transition-colors"
        >
          Contact Us
        </a>
      ) : (
        <button
          onClick={onSelect}
          disabled={disabled}
          className="w-full py-2.5 px-4 rounded-full bg-brandgreen-500 text-white text-sm font-medium hover:bg-brandgreen-600 transition-colors disabled:opacity-50"
        >
          {disabled ? "Loading..." : "Select Plan"}
        </button>
      )}
    </div>
  );
}
