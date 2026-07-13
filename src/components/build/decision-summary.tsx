import { CheckCircle2, CircleHelp, XCircle, CircleDashed } from "lucide-react";
import type { SuggestionDecision } from "@/app/(dashboard)/build/actions";

interface SuggestionForSummary {
  estimated_time_savings: number | null;
  estimated_cost_savings: number | null;
  estimated_waste_reduction: number | null;
  decision?: SuggestionDecision | null;
}

interface DecisionSummaryProps {
  suggestions: SuggestionForSummary[];
}

function avg(values: (number | null)[]): number {
  const nums = values.filter((v): v is number => v != null && v > 0);
  if (nums.length === 0) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

export function DecisionSummary({ suggestions }: DecisionSummaryProps) {
  const total = suggestions.length;
  if (total === 0) return null;

  const counts = {
    pursuing: 0,
    considering: 0,
    rejected: 0,
    undecided: 0,
  };
  for (const s of suggestions) {
    counts[s.decision ?? "undecided"]++;
  }

  const shortlist = suggestions.filter(
    (s) => s.decision === "pursuing" || s.decision === "considering",
  );
  const shortlistCount = shortlist.length;

  const shortlistTime = avg(shortlist.map((s) => s.estimated_time_savings));
  const shortlistCost = avg(shortlist.map((s) => s.estimated_cost_savings));
  const shortlistWaste = avg(shortlist.map((s) => s.estimated_waste_reduction));

  const allTime = avg(suggestions.map((s) => s.estimated_time_savings));
  const allCost = avg(suggestions.map((s) => s.estimated_cost_savings));
  const allWaste = avg(suggestions.map((s) => s.estimated_waste_reduction));

  const showShortlist = shortlistCount > 0;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Your decisions</h3>
        <p className="text-xs text-muted-foreground">
          Mark each suggestion as Pursuing, Considering, or Not for this
          project. Pursuing + Considering forms your shortlist — totals below
          recompute as you decide.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <DecisionPill
          icon={CheckCircle2}
          label="Pursuing"
          count={counts.pursuing}
          tone="emerald"
        />
        <DecisionPill
          icon={CircleHelp}
          label="Considering"
          count={counts.considering}
          tone="amber"
        />
        <DecisionPill
          icon={XCircle}
          label="Rejected"
          count={counts.rejected}
          tone="rose"
        />
        <DecisionPill
          icon={CircleDashed}
          label="Undecided"
          count={counts.undecided}
          tone="neutral"
        />
        <span className="ml-auto self-center text-xs text-muted-foreground">
          {total} suggestion{total === 1 ? "" : "s"} total
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <ImpactStat
          label="Avg. time savings"
          value={showShortlist ? shortlistTime : allTime}
          context={
            showShortlist
              ? `across ${shortlistCount} shortlisted`
              : `across all ${total} (no shortlist yet)`
          }
        />
        <ImpactStat
          label="Avg. cost savings"
          value={showShortlist ? shortlistCost : allCost}
          context={
            showShortlist
              ? `across ${shortlistCount} shortlisted`
              : `across all ${total} (no shortlist yet)`
          }
        />
        <ImpactStat
          label="Avg. waste reduction"
          value={showShortlist ? shortlistWaste : allWaste}
          context={
            showShortlist
              ? `across ${shortlistCount} shortlisted`
              : `across all ${total} (no shortlist yet)`
          }
        />
      </div>
    </div>
  );
}

function DecisionPill({
  icon: Icon,
  label,
  count,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  tone: "emerald" | "amber" | "rose" | "neutral";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-brandgreen-300 bg-brandgreen-50 text-brandgreen-900"
      : tone === "amber"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : tone === "rose"
          ? "border-rose-300 bg-rose-50 text-rose-900"
          : "border-border bg-muted/40 text-foreground";

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${toneClass}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{label}</span>
      <span className="font-semibold">{count}</span>
    </div>
  );
}

function ImpactStat({
  label,
  value,
  context,
}: {
  label: string;
  value: number;
  context: string;
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold text-brand-700">
        {value > 0 ? `-${value}%` : "—"}
      </p>
      <p className="text-[11px] text-muted-foreground">{context}</p>
    </div>
  );
}
