import {
  Thermometer,
  Wind,
  Flame,
  Landmark,
  FileCheck2,
  ClipboardList,
  Users,
  ShieldCheck,
  Compass,
  Target,
  CalendarClock,
} from "lucide-react";
import {
  getProjectPlans,
  getProjectQuestionnaire,
  getProjectContributors,
  getProjectCertifications,
  getProjectSiteIntel,
} from "@/app/(dashboard)/projects/actions";

interface ProjectContextSummaryProps {
  projectId: string;
}

function Chip({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
  tone?: "neutral" | "positive" | "warning";
}) {
  const toneClass =
    tone === "positive"
      ? "border-brandgreen-300 bg-brandgreen-50 text-brandgreen-900 dark:border-brandgreen-900/50 dark:bg-brandgreen-950/30 dark:text-brandgreen-200"
      : tone === "warning"
        ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
        : "border-border bg-muted/40 text-foreground";

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${toneClass}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value ?? "—"}</span>
    </div>
  );
}

export async function ProjectContextSummary({
  projectId,
}: ProjectContextSummaryProps) {
  const [intel, plans, questionnaire, contributors, certifications] =
    await Promise.all([
      getProjectSiteIntel(projectId),
      getProjectPlans(projectId),
      getProjectQuestionnaire(projectId),
      getProjectContributors(projectId),
      getProjectCertifications(projectId),
    ]);

  const readyPlans = plans.filter((p) => p.status === "ready").length;
  const totalPlans = plans.length;
  const planValue =
    totalPlans === 0
      ? "None"
      : `${readyPlans}/${totalPlans} ready`;
  const planTone: "positive" | "warning" =
    totalPlans === 0 || readyPlans === 0 ? "warning" : "positive";

  const questionnaireDone = !!questionnaire?.completed;

  const responses =
    (questionnaire?.responses as Record<string, string> | null | undefined) ??
    null;
  const designStage = responses?.design_stage || null;
  const submissionTimeline = responses?.submission_timeline || null;
  const goalsRaw = responses?.project_goals || "";
  const goalsCount = goalsRaw.split("|").filter(Boolean).length;
  const goalsValue = goalsCount > 0 ? `${goalsCount} selected` : null;

  const hasStatusInfo = !!(designStage || submissionTimeline || goalsCount > 0);

  return (
    <div className="rounded-md border bg-card p-4 space-y-3">
      {hasStatusInfo && (
        <div className="flex flex-wrap items-center gap-2">
          <Chip icon={Compass} label="Stage" value={designStage} />
          <Chip icon={Target} label="Goals" value={goalsValue} />
          <Chip
            icon={CalendarClock}
            label="Submission"
            value={submissionTimeline}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Chip
          icon={Thermometer}
          label="Climate"
          value={intel?.climate_zone ? `Zone ${intel.climate_zone}` : null}
        />
        <Chip
          icon={Wind}
          label="Wind"
          value={intel?.wind_region ?? null}
        />
        <Chip
          icon={Flame}
          label="BAL"
          value={intel?.bal_rating ?? null}
        />
        <Chip
          icon={Landmark}
          label="Council"
          value={intel?.council_name ?? null}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Chip
          icon={FileCheck2}
          label="Plans"
          value={planValue}
          tone={planTone}
        />
        <Chip
          icon={ClipboardList}
          label="Questionnaire"
          value={questionnaireDone ? "Complete" : "Incomplete"}
          tone={questionnaireDone ? "positive" : "warning"}
        />
        <Chip
          icon={Users}
          label="Contributors"
          value={String(contributors.length)}
        />
        <Chip
          icon={ShieldCheck}
          label="Certifications"
          value={String(certifications.length)}
        />
      </div>
    </div>
  );
}
