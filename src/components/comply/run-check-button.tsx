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
    <div className="space-y-2">
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
