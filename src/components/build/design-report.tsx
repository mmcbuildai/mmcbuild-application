import { SuggestionCard } from "./suggestion-card";
import { getTechnologyLabel } from "@/lib/ai/types";
import { ReportExportButton } from "@/components/shared/report-export-button";
import { DaeDownloadButton } from "./dae-download-button";
import { ReportLegend } from "./report-legend";
import { DecisionSummary } from "./decision-summary";
import type { SuggestionDecision } from "@/app/(dashboard)/build/actions";
import type { SuggestionComplianceFlag } from "@/lib/build/suggestion-compliance";

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
  decision?: SuggestionDecision | null;
  decision_note?: string | null;
  complianceFlag?: SuggestionComplianceFlag | null;
}

interface DesignReportProps {
  check: {
    id: string;
    summary: string | null;
    completed_at: string | null;
    spatial_layout?: unknown;
  };
  suggestions: Suggestion[];
  /** Where the inline compliance warnings link for the full NCC pass. */
  complyHref?: string;
}

export function DesignReport({ check, suggestions, complyHref }: DesignReportProps) {
  const categories = [...new Set(suggestions.map((s) => s.technology_category))];

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-3">
        <DaeDownloadButton
          checkId={check.id}
          fallbackFilename={`mmc-build-${check.id.slice(0, 8)}.dae`}
          available={Boolean(check.spatial_layout)}
        />
        <ReportExportButton
          url={`/api/build/report/${check.id}`}
          fallbackFilename={`mmc-build-report-${check.id.slice(0, 8)}.pdf`}
        />
      </div>

      <DecisionSummary suggestions={suggestions} />

      <ReportLegend />

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

      <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4">
        <p className="text-xs text-yellow-800">
          <strong>Disclaimer:</strong> These are AI-generated advisory suggestions
          only. They do NOT constitute engineering certification. All suggestions
          must be reviewed by a qualified engineer or building designer. Structural
          adequacy of alternatives must be confirmed by a structural engineer.
        </p>
      </div>

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
                <SuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  complianceFlag={suggestion.complianceFlag}
                  complyHref={complyHref}
                />
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
