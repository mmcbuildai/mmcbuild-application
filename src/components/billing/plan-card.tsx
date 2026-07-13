"use client";

import { Check, Star } from "lucide-react";
import { cn } from "@/lib/utils";

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
            <span className="text-sm text-slate-500">/month</span>
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
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-slate-600">
            <Check className="w-4 h-4 text-brandgreen-500 mt-0.5 shrink-0" />
            {feature}
          </li>
        ))}
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
