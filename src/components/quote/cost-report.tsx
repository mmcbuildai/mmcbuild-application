import { LineItemCard } from "./line-item-card";
import { CostComparisonChart } from "./cost-comparison-chart";
import { HoldingCostCalculator } from "./holding-cost-calculator";
import { getCostCategoryLabel, isMmcBuildupCategory } from "@/lib/ai/types";
import { ReportExportButton } from "@/components/shared/report-export-button";
import { computeCostTotals } from "@/lib/quote/totals";
import { displayRateSource, isMarketSourced } from "@/lib/quote/source-label";

interface LineItem {
  id: string;
  cost_category: string;
  element_description: string;
  quantity: number | null;
  unit: string | null;
  traditional_rate: number | null;
  traditional_total: number | null;
  mmc_rate: number | null;
  mmc_total: number | null;
  mmc_alternative: string | null;
  savings_pct: number | null;
  source: string;
  confidence: number;
  sort_order: number;
  rate_source_name: string | null;
  rate_source_detail: string | null;
}

interface HoldingCostVars {
  weekly_finance_cost: number;
  weekly_site_costs: number;
  weekly_insurance: number;
  weekly_opportunity_cost: number;
  weekly_council_fees: number;
  custom_items: { label: string; amount: number }[];
}

interface CostReportProps {
  estimate: {
    id: string;
    summary: string | null;
    total_traditional: number | null;
    total_mmc: number | null;
    total_savings_pct: number | null;
    region: string | null;
    completed_at: string | null;
    traditional_duration_weeks?: number | null;
    mmc_duration_weeks?: number | null;
  };
  lineItems: LineItem[];
  holdingCostVariables?: HoldingCostVars | null;
}

export function CostReport({ estimate, lineItems, holdingCostVariables }: CostReportProps) {
  const categories = [...new Set(lineItems.map((li) => li.cost_category))];

  // Compute the headline from the line items (the source of truth = what's shown
  // below + in the PDF), not the stored rollup which was sometimes null → "$0 at
  // the top" while the detail showed real numbers (Karen, 2026-06-27).
  const {
    traditional: totalTraditional,
    mmc: totalMmc,
    savings: totalSavings,
    savingsPct,
    tbcCount,
  } = computeCostTotals(lineItems, estimate);

  // Aggregate data sources (honest provenance labels)
  const sourceCountMap = new Map<string, number>();
  for (const li of lineItems) {
    const name = displayRateSource(li.rate_source_name);
    sourceCountMap.set(name, (sourceCountMap.get(name) ?? 0) + 1);
  }
  const sourceCounts = [...sourceCountMap.entries()].sort((a, b) => b[1] - a[1]);

  // Split into the two disjoint sides of the whole-module model.
  const tradCategories = categories.filter((c) => !isMmcBuildupCategory(c));
  const mmcCategories = categories.filter((c) => isMmcBuildupCategory(c));

  const renderCategoryGroup = (category: string, isMmc: boolean) => {
    const catItems = lineItems.filter((li) => li.cost_category === category);
    const catTraditional = catItems.reduce(
      (sum, li) => sum + (li.traditional_total ?? 0),
      0,
    );
    const catMmc = catItems.reduce((sum, li) => sum + (li.mmc_total ?? 0), 0);
    const label = getCostCategoryLabel(category);

    return (
      <div key={category}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {label} ({catItems.length})
          </h3>
          <div className="text-xs text-muted-foreground">
            {isMmc ? (
              <span className="font-medium text-violet-700">
                MMC: ${Math.round(catMmc).toLocaleString()}
              </span>
            ) : (
              <>Trad: ${Math.round(catTraditional).toLocaleString()}</>
            )}
          </div>
        </div>
        <div className="space-y-3">
          {catItems.map((item) => (
            <LineItemCard key={item.id} item={item} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Export button */}
      <div className="flex justify-end">
        <ReportExportButton
          url={`/api/quote/report/${estimate.id}`}
          fallbackFilename={`mmc-quote-report-${estimate.id.slice(0, 8)}.pdf`}
        />
      </div>

      {/* Headline totals */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <TotalCard label="Traditional Cost" value={`$${totalTraditional.toLocaleString()}`} />
        <TotalCard
          label="MMC Cost"
          value={`$${totalMmc.toLocaleString()}`}
          accent
        />
        <TotalCard
          label="Potential Savings"
          value={`$${totalSavings.toLocaleString()}`}
          positive
        />
        <TotalCard
          label="Savings"
          value={savingsPct > 0 ? `${savingsPct}%` : "—"}
          positive
        />
      </div>
      {tbcCount > 0 && (
        <div className="-mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span className="font-medium">
            Headline total is not the full price.
          </span>{" "}
          {tbcCount} item{tbcCount === 1 ? "" : "s"} could not be priced yet
          (shown as <span className="font-medium">TBC</span> in the line items
          below) and {tbcCount === 1 ? "is" : "are"} <span className="font-medium">excluded</span>{" "}
          from the totals above — so the real cost will be higher once{" "}
          {tbcCount === 1 ? "it is" : "they are"} priced.
        </div>
      )}

      {/* Comparison chart */}
      <div className="rounded-lg border bg-white p-4">
        <CostComparisonChart lineItems={lineItems} />
      </div>

      {/* Executive summary */}
      {estimate.summary && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 p-4">
          <h3 className="text-sm font-semibold text-violet-900 mb-2">
            Executive Summary
          </h3>
          <div className="text-sm text-violet-800 whitespace-pre-line">
            {estimate.summary}
          </div>
        </div>
      )}

      {/* Data Sources summary */}
      {sourceCounts.length > 0 && (
        <div className="rounded-lg border bg-white p-4">
          <h3 className="text-sm font-semibold text-muted-foreground mb-1">
            Data Sources
          </h3>
          <p className="mb-3 text-xs text-muted-foreground">
            <span className="font-medium text-green-700">Green</span> = market
            rate sourced from comparable industry quotes (±15% for price creep).{" "}
            <span className="font-medium text-amber-700">Amber</span> = extrapolated
            from public information — a data gap; confirm against your own figures.
          </p>
          <div className="flex flex-wrap gap-3">
            {sourceCounts.map(([name, count]) => {
              const isDb = isMarketSourced(name);
              return (
                <div
                  key={name}
                  className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${
                    isDb
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : "bg-amber-50 text-amber-700 border border-amber-200"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isDb ? "bg-green-500" : "bg-amber-500"
                    }`}
                  />
                  {name}
                  <span className="text-muted-foreground">
                    ({count} item{count !== 1 ? "s" : ""})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Time & Holding Cost Calculator */}
      <HoldingCostCalculator
        estimateId={estimate.id}
        traditionalCost={totalTraditional}
        mmcCost={totalMmc}
        traditionalWeeks={estimate.traditional_duration_weeks ?? null}
        mmcWeeks={estimate.mmc_duration_weeks ?? null}
        initialVariables={holdingCostVariables ?? null}
      />

      {/* Disclaimer */}
      <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4">
        <p className="text-xs text-yellow-800">
          <strong>Disclaimer:</strong> These are advisory cost estimates only. They do
          NOT constitute a formal quantity surveyor report or fixed-price quotation. The
          MMC cost is a whole-module build-up (factory module supply + site works), not a
          per-trade figure. Rates marked &ldquo;Extrapolated from public information&rdquo;
          are data gaps — <strong>confirm them against your own supplier pricing</strong>.
          Market rates carry a ±15% margin for price creep. All estimates must be reviewed
          by a qualified quantity surveyor. Actual costs will vary based on site and market
          conditions and detailed specification. Region: {estimate.region ?? "NSW"}.
        </p>
      </div>

      {/* Traditional build — per trade */}
      {tradCategories.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-base font-bold text-gray-800 border-b pb-1">
            Traditional Build — by trade
          </h2>
          {tradCategories.map((category) => renderCategoryGroup(category, false))}
        </div>
      )}

      {/* MMC build — whole-module: factory module supply + site works */}
      {mmcCategories.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-base font-bold text-violet-800 border-b border-violet-200 pb-1">
            MMC Build — factory module + site works
          </h2>
          <p className="-mt-2 text-xs text-muted-foreground">
            MMC isn&rsquo;t priced trade-by-trade: a factory module is bought as one
            supply rate per m², replacing frame, walls, roof, insulation, internal
            fit-out and services rough-in — then site works are added on top.
          </p>
          {mmcCategories.map((category) => renderCategoryGroup(category, true))}
        </div>
      )}

      {lineItems.length === 0 && (
        <div className="rounded-md border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No cost line items were generated for this estimate.
          </p>
        </div>
      )}

      {estimate.completed_at && (
        <div className="pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            Report generated{" "}
            {new Date(estimate.completed_at).toLocaleString("en-AU")}
          </p>
        </div>
      )}
    </div>
  );
}

function TotalCard({
  label,
  value,
  accent,
  positive,
}: {
  label: string;
  value: string;
  accent?: boolean;
  positive?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-white p-4 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-xl font-bold ${
          positive ? "text-green-700" : accent ? "text-violet-700" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
