import { SuggestionCard } from "./suggestion-card";
import { getTechnologyLabel } from "@/lib/ai/types";
import { ReportExportButton } from "@/components/shared/report-export-button";

interface Suggestion {
  id: string;
  technology_category: string;
  current_approach: string;
  suggested_alternative: string;
  benefits: string;
  estimated_time_savings: number | null;
  estimated_cost_savings: number | null;
  estimated_waste_reduction: number | null;
  implementation_complexity: string;
  confidence: number;
  sort_order: number;
}

interface DesignReportProps {
  check: {
    id: string;
    summary: string | null;
    completed_at: string | null;
  };
  suggestions: Suggestion[];
}

export function DesignReport({ check, suggestions }: DesignReportProps) {
  // Group suggestions by technology category
  const categories = [...new Set(suggestions.map((s) => s.technology_category))];

  // Aggregate stats
  const avgTimeSavings =
    suggestions.length > 0
      ? Math.round(
          suggestions.reduce((sum, s) => sum + (s.estimated_time_savings ?? 0), 0) /
            suggestions.length
        )
      : 0;
  const avgCostSavings =
    suggestions.length > 0
      ? Math.round(
          suggestions.reduce((sum, s) => sum + (s.estimated_cost_savings ?? 0), 0) /
            suggestions.length
        )
      : 0;
  const avgWasteReduction =
    suggestions.length > 0
      ? Math.round(
          suggestions.reduce((sum, s) => sum + (s.estimated_waste_reduction ?? 0), 0) /
            suggestions.length
        )
      : 0;

  return (
    <div className="space-y-6">
      {/* Export button */}
      <div className="flex justify-end">
        <ReportExportButton
          url={`/api/build/report/${check.id}`}
          fallbackFilename={`mmc-build-report-${check.id.slice(0, 8)}.pdf`}
        />
      </div>

      {/* Aggregate stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Avg. Time Savings" value={`${avgTimeSavings}%`} />
        <StatCard label="Avg. Cost Savings" value={`${avgCostSavings}%`} />
        <StatCard label="Avg. Waste Reduction" value={`${avgWasteReduction}%`} />
      </div>

      {/* Executive summary */}
      {check.summary && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-4">
          <h3 className="text-sm font-semibold text-teal-900 mb-2">
            Executive Summary
          </h3>
          <div className="text-sm text-teal-800 whitespace-pre-line">
            {check.summary}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4">
        <p className="text-xs text-yellow-800">
          <strong>Disclaimer:</strong> These are AI-generated advisory suggestions
          only. They do NOT constitute engineering certification. All suggestions
          must be reviewed by a qualified engineer or building designer. Structural
          adequacy of alternatives must be confirmed by a structural engineer.
        </p>
      </div>

      {/* Suggestions grouped by category */}
      {categories.map((category) => {
        const catSuggestions = suggestions.filter(
          (s) => s.technology_category === category
        );
        const label = getTechnologyLabel(category);

        return (
          <div key={category}>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {label} ({catSuggestions.length})
            </h3>
            <div className="space-y-3">
              {catSuggestions.map((suggestion) => (
                <SuggestionCard key={suggestion.id} suggestion={suggestion} />
              ))}
            </div>
          </div>
        );
      })}

      {suggestions.length === 0 && (
        <div className="rounded-md border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No MMC optimisation suggestions were identified for this plan.
          </p>
        </div>
      )}

      {check.completed_at && (
        <div className="pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            Report generated{" "}
            {new Date(check.completed_at).toLocaleString("en-AU")}
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white p-4 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold text-teal-700">{value}</p>
    </div>
  );
}
