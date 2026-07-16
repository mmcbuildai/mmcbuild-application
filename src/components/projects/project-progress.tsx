import { ShieldCheck, HardHat, Calculator, CheckCircle2, Circle } from "lucide-react";
import {
  type ProjectStageProgress,
  stageProgressPct,
} from "@/lib/projects/progress";

const STAGES = [
  { key: "comply", label: "Comply", icon: ShieldCheck },
  { key: "build", label: "Build", icon: HardHat },
  { key: "quote", label: "Quote", icon: Calculator },
] as const;

/**
 * Per-project progress indicator (SCRUM-46): an overall bar plus a
 * Comply / Build / Quote stage checklist. `compact` (list cards) shows the bar
 * only; the full form adds the stage chips.
 */
export function ProjectProgress({
  progress,
  compact = false,
}: {
  progress: ProjectStageProgress;
  compact?: boolean;
}) {
  const pct = stageProgressPct(progress);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Module progress</span>
        <span className="font-medium tabular-nums">{pct}%</span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-brand-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {!compact && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
          {STAGES.map((stage) => {
            const done = progress[stage.key];
            return (
              <span
                key={stage.key}
                className={`flex items-center gap-1.5 text-xs ${
                  done ? "font-medium text-brand-700" : "text-muted-foreground"
                }`}
              >
                {done ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-brand-600" />
                ) : (
                  <Circle className="h-3.5 w-3.5" />
                )}
                {stage.label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
