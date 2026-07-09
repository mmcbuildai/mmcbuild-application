"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Play, Loader2 } from "lucide-react";
import { requestCostEstimation } from "@/app/(dashboard)/quote/actions";

interface RunEstimateButtonProps {
  projectId: string;
  planId: string;
}

const STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"] as const;

export function RunEstimateButton({
  projectId,
  planId,
}: RunEstimateButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [region, setRegion] = useState("NSW");

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await requestCostEstimation(projectId, planId, region);

      if ("error" in result) {
        // Already running — go to the in-progress estimate, don't start a duplicate.
        if (
          result.error === "already_running" &&
          (result as { estimateId?: string }).estimateId
        ) {
          router.push(
            `/quote/${projectId}/report/${(result as { estimateId: string }).estimateId}`,
          );
          return;
        }
        setError(result.error ?? "Unknown error");
        return;
      }

      if (result.estimateId) {
        router.push(`/quote/${projectId}/report/${result.estimateId}`);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          Project Region
        </label>
        <Select value={region} onValueChange={setRegion}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        size="sm"
        className="w-full bg-violet-600 hover:bg-violet-700"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Starting Estimate...
          </>
        ) : (
          <>
            <Play className="mr-2 h-4 w-4" />
            Run Cost Estimation
          </>
        )}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
