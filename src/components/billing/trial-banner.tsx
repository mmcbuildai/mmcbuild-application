"use client";

import { Clock } from "lucide-react";

interface TrialBannerProps {
  daysRemaining: number;
  usageCount: number;
  usageLimit: number;
}

export function TrialBanner({ daysRemaining, usageCount, usageLimit }: TrialBannerProps) {
  const isUrgent = daysRemaining <= 7;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm ${
        isUrgent
          ? "bg-amber-50 border border-amber-200 text-amber-800"
          : "bg-brandgreen-50 border border-brandgreen-200 text-brandgreen-800"
      }`}
    >
      <Clock className="w-4 h-4 shrink-0" />
      <div>
        <span className="font-medium">
          {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} left
        </span>{" "}
        on your free trial &middot; {usageCount} of {usageLimit} runs used
      </div>
    </div>
  );
}
