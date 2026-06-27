"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Play, Loader2 } from "lucide-react";
import { requestDesignOptimisation } from "@/app/(dashboard)/build/actions";

interface RunOptimisationButtonProps {
  projectId: string;
  planId: string;
}

export function RunOptimisationButton({
  projectId,
  planId,
}: RunOptimisationButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await requestDesignOptimisation(projectId, planId);

      if ("error" in result) {
        // Already running — go to the in-progress optimisation, no duplicate.
        if (
          result.error === "already_running" &&
          (result as { checkId?: string }).checkId
        ) {
          router.push(
            `/build/${projectId}/report/${(result as { checkId: string }).checkId}`,
          );
          return;
        }
        setError(result.error ?? "Unknown error");
        return;
      }

      if (result.checkId) {
        router.push(`/build/${projectId}/report/${result.checkId}`);
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button
        size="sm"
        className="w-full bg-teal-600 hover:bg-teal-700"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Starting Analysis...
          </>
        ) : (
          <>
            <Play className="mr-2 h-4 w-4" />
            Run Design Optimisation
          </>
        )}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
