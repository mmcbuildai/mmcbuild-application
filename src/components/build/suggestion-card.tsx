"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronDown,
  ChevronUp,
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  XCircle,
  StickyNote,
  AlertTriangle,
} from "lucide-react";
import {
  getTechnologyLabel,
  COMPLEXITY_LABELS,
  COMPLEXITY_COLOURS,
  type ImplementationComplexity,
} from "@/lib/ai/types";
import {
  setSuggestionDecision,
  type SuggestionDecision,
} from "@/app/(dashboard)/build/actions";
import type { SuggestionComplianceFlag } from "@/lib/build/suggestion-compliance";
import { FeaturedSupplierProducts } from "./featured-supplier-products";
import type { FeaturedProduct } from "@/lib/direct/featured-suppliers";

interface SuggestionCardProps {
  suggestion: {
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
    decision?: SuggestionDecision | null;
    decision_note?: string | null;
  };
  /** Inline NCC compliance flag for this suggestion on this site (SCRUM-174). */
  complianceFlag?: SuggestionComplianceFlag | null;
  /** Where the "see Comply for details" link points. */
  complyHref?: string;
  /** Project context for the featured-supplier referral log (SCRUM-171). */
  projectId?: string;
  /** Growth-partner suppliers' products matching this suggestion's category. */
  featuredProducts?: FeaturedProduct[];
  /** SCRUM-169: notify the report page when the decision changes, so the live
   *  3D overlay can react (rejected → the suggestion drops out of the render). */
  onDecisionChange?: (decision: SuggestionDecision) => void;
}

const FLAG_STYLES = {
  warning: {
    badge: "bg-rose-100 text-rose-700",
    panel: "border-rose-300 bg-rose-50 text-rose-900",
    icon: "text-rose-600",
  },
  caution: {
    badge: "bg-amber-100 text-amber-800",
    panel: "border-amber-300 bg-amber-50 text-amber-900",
    icon: "text-amber-600",
  },
} as const;

const DECISION_BORDER: Record<SuggestionDecision, string> = {
  undecided: "border-l-brand-500",
  pursuing: "border-l-brandgreen-500",
  considering: "border-l-amber-500",
  rejected: "border-l-rose-500",
};

export function SuggestionCard({
  suggestion,
  complianceFlag,
  complyHref,
  projectId,
  featuredProducts,
  onDecisionChange,
}: SuggestionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [decision, setDecision] = useState<SuggestionDecision>(
    suggestion.decision ?? "undecided",
  );
  const [note, setNote] = useState(suggestion.decision_note ?? "");
  const [showNote, setShowNote] = useState(!!suggestion.decision_note);
  const [isPending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

  const complexity = suggestion.implementation_complexity as ImplementationComplexity;

  function persistDecision(next: SuggestionDecision, nextNote?: string) {
    setSaveError(null);
    startTransition(async () => {
      const result = await setSuggestionDecision(
        suggestion.id,
        next,
        nextNote ?? note,
      );
      if (result.error) {
        setSaveError(result.error);
      }
    });
  }

  function pickDecision(next: SuggestionDecision) {
    if (next === decision) return;
    setDecision(next);
    onDecisionChange?.(next); // SCRUM-169: update the live 3D overlay
    persistDecision(next);
  }

  function saveNote() {
    persistDecision(decision, note);
  }

  return (
    <Card className={`border-l-4 ${DECISION_BORDER[decision]}`}>
      <CardHeader
        className="cursor-pointer pb-2"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full">
                {getTechnologyLabel(suggestion.technology_category)}
              </span>
              <span
                title="How disruptive this change would be to implement: structural impact, trade availability, schedule. Not financial — that's the cost-savings stat."
                className={`text-xs font-medium px-2 py-0.5 rounded-full cursor-help ${COMPLEXITY_COLOURS[complexity] ?? "bg-gray-100 text-gray-700"}`}
              >
                {COMPLEXITY_LABELS[complexity] ?? complexity} effort
              </span>
              {complianceFlag && (
                <span
                  title={complianceFlag.detail}
                  className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full cursor-help ${FLAG_STYLES[complianceFlag.severity].badge}`}
                >
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  {complianceFlag.title}
                </span>
              )}
            </div>
            <CardTitle className="text-sm font-medium">
              {suggestion.suggested_alternative}
            </CardTitle>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div
              className="text-right"
              title="AI's confidence that this suggestion fits this specific plan and would deliver the claimed savings. Calibrated by your team's past feedback."
            >
              <div className="text-xs text-muted-foreground cursor-help">
                Confidence
              </div>
              <div className="flex items-center gap-1">
                <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${suggestion.confidence * 100}%` }}
                  />
                </div>
                <span className="text-xs font-mono">
                  {Math.round(suggestion.confidence * 100)}%
                </span>
              </div>
            </div>
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-4">
          {complianceFlag && (
            <div
              className={`rounded-md border p-3 ${FLAG_STYLES[complianceFlag.severity].panel}`}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className={`h-4 w-4 shrink-0 mt-0.5 ${FLAG_STYLES[complianceFlag.severity].icon}`}
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold">
                    {complianceFlag.severity === "warning"
                      ? "Compliance risk"
                      : "Compliance check needed"}
                    : {complianceFlag.title}
                  </p>
                  <p className="text-sm">{complianceFlag.detail}</p>
                  <p className="text-xs opacity-80">
                    Reference: {complianceFlag.nccClause}
                  </p>
                  {complyHref && (
                    <Link
                      href={complyHref}
                      className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2"
                    >
                      See Comply for the full NCC check
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border bg-red-50 p-3">
              <p className="text-xs font-semibold text-red-700 mb-1">Current Approach</p>
              <p className="text-sm text-red-900">{suggestion.current_approach}</p>
            </div>
            <div className="rounded-md border bg-brand-50 p-3">
              <p className="text-xs font-semibold text-brand-700 mb-1">Suggested Alternative</p>
              <p className="text-sm text-brand-900">{suggestion.suggested_alternative}</p>
            </div>
          </div>

          <div className="flex justify-center sm:hidden -my-2">
            <ArrowRight className="h-5 w-5 text-brand-500 rotate-90" />
          </div>

          <div>
            <p className="text-xs font-medium mb-1">Benefits</p>
            <p className="text-sm text-muted-foreground">{suggestion.benefits}</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <SavingsStat
              label="Time Savings"
              value={suggestion.estimated_time_savings}
              tooltip="Estimated reduction in build programme vs traditional construction (% of programme weeks)."
            />
            <SavingsStat
              label="Cost Savings"
              value={suggestion.estimated_cost_savings}
              tooltip="Estimated reduction in total cost-of-build for this element vs traditional construction (% of element cost)."
            />
            <SavingsStat
              label="Waste Reduction"
              value={suggestion.estimated_waste_reduction}
              tooltip="Estimated reduction in on-site material waste vs traditional construction (% by mass)."
            />
          </div>

          <div className="rounded-md border bg-muted/30 p-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Your decision
            </p>
            <div className="flex flex-wrap gap-2">
              <DecisionButton
                active={decision === "pursuing"}
                disabled={isPending}
                onClick={() => pickDecision("pursuing")}
                icon={CheckCircle2}
                label="Pursuing"
                activeClass="bg-brandgreen-600 text-white hover:bg-brandgreen-700"
              />
              <DecisionButton
                active={decision === "considering"}
                disabled={isPending}
                onClick={() => pickDecision("considering")}
                icon={CircleHelp}
                label="Considering"
                activeClass="bg-amber-500 text-white hover:bg-amber-600"
              />
              <DecisionButton
                active={decision === "rejected"}
                disabled={isPending}
                onClick={() => pickDecision("rejected")}
                icon={XCircle}
                label="Not for this project"
                activeClass="bg-rose-600 text-white hover:bg-rose-700"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setShowNote((s) => !s)}
              >
                <StickyNote className="mr-1.5 h-3.5 w-3.5" />
                {showNote ? "Hide note" : note ? "Edit note" : "Add note"}
              </Button>
            </div>

            {showNote && (
              <div className="space-y-2">
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Why this decision? e.g. 'client likes carbon story', 'site can't take crane', 'awaiting structural engineer's view'"
                  className="text-sm"
                  rows={2}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={saveNote}
                    disabled={isPending}
                  >
                    Save note
                  </Button>
                </div>
              </div>
            )}

            {saveError && (
              <p className="text-xs text-rose-600">{saveError}</p>
            )}
          </div>

          {projectId && featuredProducts && featuredProducts.length > 0 && (
            <FeaturedSupplierProducts
              products={featuredProducts}
              projectId={projectId}
              suggestionId={suggestion.id}
            />
          )}
        </CardContent>
      )}
    </Card>
  );
}

function DecisionButton({
  active,
  disabled,
  onClick,
  icon: Icon,
  label,
  activeClass,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  activeClass: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
        active
          ? activeClass
          : "bg-background hover:bg-muted text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function SavingsStat({
  label,
  value,
  tooltip,
}: {
  label: string;
  value: number | null;
  tooltip?: string;
}) {
  const pct = value ?? 0;
  return (
    <div
      className="text-center rounded-md border p-2"
      title={tooltip}
    >
      <p className="text-xs text-muted-foreground cursor-help">{label}</p>
      <p className="text-lg font-bold text-brand-700">
        {pct > 0 ? `-${pct}%` : "—"}
      </p>
    </div>
  );
}
