"use client";

import { AlertTriangle } from "lucide-react";
import { PLANS } from "@/lib/stripe/plans";
import { PlanCard } from "./plan-card";

interface InlineUpgradeCardProps {
  usageCount: number;
  usageLimit: number;
  tier: string;
  onSelectPlan: (planId: string) => void;
  loading?: boolean;
}

export function InlineUpgradeCard({
  usageCount,
  usageLimit,
  tier,
  onSelectPlan,
  loading,
}: InlineUpgradeCardProps) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-6 space-y-6" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
        <div>
          <h3 className="font-semibold text-slate-900">
            {tier === "expired" || tier === "trial"
              ? `You've used all ${usageLimit} trial runs`
              : `You've used all ${usageLimit} runs this period`}
          </h3>
          <p className="text-sm text-slate-600 mt-1">
            Your existing reports are still available. Upgrade to continue running
            compliance checks.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PlanCard
          name={PLANS.essential.name}
          price={PLANS.essential.price}
          features={PLANS.essential.features}
          runLimit={PLANS.essential.runLimit}
          onSelect={() => onSelectPlan("essential")}
          disabled={loading}
        />
        <PlanCard
          name={PLANS.professional.name}
          price={PLANS.professional.price}
          features={PLANS.professional.features}
          runLimit={PLANS.professional.runLimit}
          isPopular
          onSelect={() => onSelectPlan("professional")}
          disabled={loading}
        />
      </div>
    </div>
  );
}
