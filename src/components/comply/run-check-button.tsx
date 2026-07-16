"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Play, Loader2 } from "lucide-react";
import { requestComplianceCheck } from "@/app/(dashboard)/comply/actions";

interface RunCheckButtonProps {
  projectId: string;
  planId: string;
  questionnaireId: string | null;
}

export function RunCheckButton({
  projectId,
  planId,
  questionnaireId,
}: RunCheckButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Report scope selector (SCRUM-50). Only "Whole house" is available today —
  // the compliance analysis always covers the full plan. Per-section reports
  // are surfaced as coming-soon (disabled) rather than shipping an inert option
  // that silently behaves the same as whole-house.
  const [scope, setScope] = useState<"whole_house" | "sections">("whole_house");

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await requestComplianceCheck(
        projectId,
        planId,
        questionnaireId
      );

      if ("error" in result) {
        // A check is already running for this project — don't show an error or
        // start a duplicate; take the user straight to the run in progress.
        if (
          result.error === "already_running" &&
          (result as { checkId?: string }).checkId
        ) {
          router.push(
            `/comply/${projectId}/check/${(result as { checkId: string }).checkId}`,
          );
          return;
        }
        // Prefer a human-readable `message` when the action provides one (e.g.
        // the building-classification hard gate) over the bare error code.
        setError(
          (result as { message?: string }).message ??
            result.error ??
            "Unknown error",
        );
        return;
      }

      if (result.checkId) {
        router.push(`/comply/${projectId}/check/${result.checkId}`);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="report-scope" className="text-sm font-medium">
          Report type
        </label>
        <select
          id="report-scope"
          value={scope}
          onChange={(e) => setScope(e.target.value as typeof scope)}
          disabled={isPending}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="whole_house">Whole house</option>
          <option value="sections" disabled>
            Sections (coming soon)
          </option>
        </select>
        <p className="text-xs text-muted-foreground">
          Checks currently cover the whole house. Per-section reports are coming
          soon.
        </p>
      </div>
      <Button
        size="sm"
        className="w-full"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Starting Check...
          </>
        ) : (
          <>
            <Play className="mr-2 h-4 w-4" />
            Run Compliance Check
          </>
        )}
      </Button>
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
