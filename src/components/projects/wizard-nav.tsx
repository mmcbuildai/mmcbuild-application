"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Loader2, Rocket } from "lucide-react";
import {
  advanceProjectSetupStep,
  activateProject,
} from "@/app/(dashboard)/projects/actions";
import type { ProjectTab } from "@/components/projects/project-tabs";

const STEP_BY_TAB: Record<ProjectTab, number> = {
  overview: 0,
  documents: 1,
  team: 2,
  questionnaire: 3,
};

const TAB_BY_STEP: Record<number, ProjectTab> = {
  0: "overview",
  1: "documents",
  2: "team",
  3: "questionnaire",
};

interface WizardNavProps {
  projectId: string;
  currentTab: ProjectTab;
  isDraft: boolean;
  /** Activation prerequisites — only relevant on the questionnaire step. */
  canActivate?: boolean;
  activationBlocker?: string | null;
}

export function WizardNav({
  projectId,
  currentTab,
  isDraft,
  canActivate,
  activationBlocker,
}: WizardNavProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isDraft) return null;

  const stepIdx = STEP_BY_TAB[currentTab];
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === 3;
  const prevTab = isFirst ? null : TAB_BY_STEP[stepIdx - 1];
  const nextTab = isLast ? null : TAB_BY_STEP[stepIdx + 1];

  function go(tab: ProjectTab) {
    const qs = tab === "overview" ? "" : `?tab=${tab}`;
    router.push(`/projects/${projectId}${qs}`);
  }

  function handleNext() {
    if (!nextTab) return;
    setError(null);
    startTransition(async () => {
      const result = await advanceProjectSetupStep(projectId, stepIdx + 1);
      if (result.error) {
        setError(result.error);
        return;
      }
      go(nextTab);
    });
  }

  async function handleActivate() {
    setActivating(true);
    setError(null);
    const result = await activateProject(projectId);
    if (result.error) {
      setError(result.error);
      setActivating(false);
      return;
    }
    await advanceProjectSetupStep(projectId, 4);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {isLast && !canActivate && activationBlocker && (
        <p className="text-xs text-muted-foreground">{activationBlocker}</p>
      )}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => prevTab && go(prevTab)}
          disabled={isFirst || pending || activating}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        {isLast ? (
          <Button
            onClick={handleActivate}
            disabled={!canActivate || activating}
            size="sm"
          >
            {activating ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="mr-1 h-4 w-4" />
            )}
            Save and Activate
          </Button>
        ) : (
          <Button onClick={handleNext} disabled={pending} size="sm">
            {pending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : null}
            Next
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
