"use client";

import { useRouter } from "next/navigation";
import {
  ProcessingProgress,
  type ProcessingPoll,
} from "@/components/shared/processing-progress";
import { getDesignReport } from "@/app/(dashboard)/build/actions";
import { requestRunNotify } from "@/app/(dashboard)/notify-actions";

interface OptimisationProgressProps {
  checkId: string;
  initialStatus: string;
  /** design_checks.summary — carries the REAL reason on an error. */
  initialSummary?: string | null;
}

const TIPS = [
  "Reviewing your plan for prefabrication and modern-construction opportunities.",
  "Matching building elements to panelised, volumetric and printed systems.",
  "A thorough pass takes a few minutes — you can leave this page open.",
  "Estimating cost and time deltas versus traditional construction.",
];

// Real per-stage signal written by run-design-optimisation to design_checks.stage.
const STAGES = [
  { key: "analyse", label: "Analysing your plan for MMC opportunities" },
  { key: "suggest", label: "Generating system-by-system suggestions" },
  { key: "compile", label: "Compiling the optimisation report" },
];

/**
 * Migrated onto the shared ProcessingProgress (was a bespoke fork) so it
 * inherits the honest progress bar, "you can leave", real per-stage checklist,
 * and the "Notify me when it's ready" opt-in email — consistent with Quote.
 */
export function OptimisationProgress({
  checkId,
  initialStatus,
  initialSummary,
}: OptimisationProgressProps) {
  const router = useRouter();

  const poll = async (): Promise<ProcessingPoll | null> => {
    const result = await getDesignReport(checkId);
    if (!result.check) return null;
    const c = result.check as {
      status: string;
      summary: string | null;
      stage?: string | null;
    };
    return { status: c.status, errorReason: c.summary, currentStage: c.stage ?? null };
  };

  return (
    <ProcessingProgress
      title="Design Optimisation Progress"
      initialStatus={initialStatus}
      initialError={initialSummary}
      poll={poll}
      pollIntervalMs={3000}
      workingLabel="Analysing your plan for MMC opportunities"
      queuedLabel="Queued…"
      description="AI reviews your plans for prefabrication and modern-construction opportunities. This typically takes a few minutes — up to ~8 for large or complex plans — you can leave this page open."
      tips={TIPS}
      stages={STAGES}
      estimatedSecs={180}
      onNotify={() => {
        void requestRunNotify("optimisation", checkId);
      }}
      completionTitle="Your design optimisation report is ready"
      completionBody="Your design optimisation report is ready."
      onComplete={() => router.refresh()}
      accentClass="text-brand-600"
    />
  );
}
