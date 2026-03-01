import { RiskSummary } from "./risk-summary";
import { FindingCard } from "./finding-card";
import { FeedbackWidget } from "./feedback-widget";
import { CategoryRollup } from "./category-rollup";
import { ExportButton } from "./export-button";
import { getCategoryLabel } from "@/lib/ai/types";

interface Finding {
  id: string;
  ncc_section: string;
  category: string;
  title: string;
  description: string;
  recommendation: string | null;
  severity: "compliant" | "advisory" | "non_compliant" | "critical";
  confidence: number;
  ncc_citation: string | null;
  page_references: number[] | null;
  sort_order: number;
}

interface ComplianceReportProps {
  check: {
    id: string;
    summary: string | null;
    overall_risk: "low" | "medium" | "high" | "critical" | null;
    completed_at: string | null;
  };
  findings: Finding[];
}

export function ComplianceReport({ check, findings }: ComplianceReportProps) {
  // Group findings by category
  const categories = [...new Set(findings.map((f) => f.category))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div />
        <ExportButton checkId={check.id} />
      </div>

      {check.summary && check.overall_risk && (
        <RiskSummary
          summary={check.summary}
          overallRisk={check.overall_risk}
          findings={findings}
        />
      )}

      <CategoryRollup findings={findings} />

      <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4">
        <p className="text-xs text-yellow-800">
          <strong>Disclaimer:</strong> This is an AI-generated advisory report only.
          It does NOT constitute formal compliance certification. All findings must
          be verified by a qualified building surveyor or certifier.
        </p>
      </div>

      {categories.map((category) => {
        const catFindings = findings.filter((f) => f.category === category);
        const label = getCategoryLabel(category);

        return (
          <div key={category}>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {label} ({catFindings.length})
            </h3>
            <div className="space-y-3">
              {catFindings.map((finding) => (
                <FindingCard key={finding.id} finding={finding} />
              ))}
            </div>
          </div>
        );
      })}

      {check.completed_at && (
        <div className="pt-4 border-t">
          <p className="text-xs text-muted-foreground mb-3">
            Report generated {new Date(check.completed_at).toLocaleString("en-AU")}
          </p>
          <FeedbackWidget checkId={check.id} />
        </div>
      )}
    </div>
  );
}
