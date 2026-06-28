"use client";

import { computeCostTotals } from "@/lib/quote/totals";

interface CostComparisonChartProps {
  lineItems: {
    cost_category: string;
    traditional_total: number | null;
    mmc_total: number | null;
  }[];
}

/**
 * Traditional vs MMC headline comparison. Under the whole-module model the two
 * sides are disjoint sets of line items (traditional trades vs the MMC build-up),
 * so a per-category side-by-side no longer makes sense — this shows the totals.
 */
export function CostComparisonChart({ lineItems }: CostComparisonChartProps) {
  const { traditional, mmc, savingsPct } = computeCostTotals(lineItems);
  const maxValue = Math.max(traditional, mmc);

  if (maxValue === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Traditional vs MMC</h3>
        {savingsPct > 0 && (
          <span className="text-xs font-medium text-green-600">
            −{savingsPct}% with MMC
          </span>
        )}
      </div>
      <div className="space-y-2">
        <Bar
          label="Traditional"
          value={traditional}
          pct={(traditional / maxValue) * 100}
          colour="bg-gray-300"
        />
        <Bar
          label="MMC"
          value={mmc}
          pct={(mmc / maxValue) * 100}
          colour="bg-violet-500"
        />
      </div>
    </div>
  );
}

function Bar({
  label,
  value,
  pct,
  colour,
}: {
  label: string;
  value: number;
  pct: number;
  colour: string;
}) {
  return (
    <div className="space-y-0.5">
      <span className="text-xs font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <div
          className={`h-4 rounded-sm ${colour}`}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
        <span className="shrink-0 text-[11px] text-muted-foreground">
          ${Math.round(value).toLocaleString()}
        </span>
      </div>
    </div>
  );
}
