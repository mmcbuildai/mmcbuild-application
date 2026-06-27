"use client";

import { useRouter } from "next/navigation";
import {
  ProcessingProgress,
  type ProcessingPoll,
} from "@/components/shared/processing-progress";
import { getCostReport } from "@/app/(dashboard)/quote/actions";

interface EstimationProgressProps {
  estimateId: string;
  initialStatus: string;
  /** cost_estimates.summary — carries the REAL reason on an error. Surface it
   *  instead of a generic message (Diagnostic Integrity). */
  initialSummary?: string | null;
}

const TIPS = [
  "Pricing every building category against current supplier rates.",
  "Comparing traditional construction with the MMC alternatives, line by line.",
  "A full cost model takes a few minutes — you can leave this page open.",
  "Extracting quantities from your plan so the numbers reflect your design.",
];

export function EstimationProgress({
  estimateId,
  initialStatus,
  initialSummary,
}: EstimationProgressProps) {
  const router = useRouter();

  const poll = async (): Promise<ProcessingPoll | null> => {
    const result = await getCostReport(estimateId);
    if (!result.estimate) return null;
    const e = result.estimate as { status: string; summary: string | null };
    return { status: e.status, errorReason: e.summary };
  };

  return (
    <ProcessingProgress
      title="Cost Estimation Progress"
      initialStatus={initialStatus}
      initialError={initialSummary}
      poll={poll}
      pollIntervalMs={4000}
      workingLabel="Estimating costs across all categories"
      queuedLabel="Queued…"
      // Transparent on WHY it takes time: it's real, structured work — every
      // category is quantified from the plan and priced against current rates
      // for both traditional and MMC methods, in sequential phases.
      description="The cost engine works through every building category in phases — extracting quantities from your plan, looking up current supplier rates, and comparing traditional construction against the MMC alternatives. This typically takes 5–8 minutes, and longer for large or complex plans."
      tips={TIPS}
      estimatedSecs={360}
      completionTitle="Your cost estimation report is ready"
      completionBody="Your cost estimation report is ready."
      onComplete={() => router.refresh()}
      accentClass="text-violet-600"
    />
  );
}
