"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RefreshCw } from "lucide-react";
import { recheckCompliance } from "@/app/(dashboard)/comply/actions";

export interface RecheckPlanOption {
  id: string;
  file_name: string;
  created_at: string;
  isCurrent: boolean;
}

interface RecheckButtonProps {
  parentCheckId: string;
  projectId: string;
  // Ready plans the builder may attach as updated drawings. The plan the parent
  // check ran against is flagged isCurrent (selected by default).
  planOptions: RecheckPlanOption[];
  // Visual emphasis — primary when the readiness gate has promoted the re-check.
  variant?: "default" | "outline";
  label?: string;
}

// Phase-3 re-check control. Confirms the run (it consumes a usage run), lets the
// builder optionally attach updated drawings by picking an already-uploaded
// ready plan, then calls recheckCompliance and redirects to the new check.
// Re-checking on the current drawings is always available (no dead-end).
export function RecheckButton({
  parentCheckId,
  projectId,
  planOptions,
  variant = "default",
  label = "Re-check compliance",
}: RecheckButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const currentPlan = planOptions.find((p) => p.isCurrent) ?? planOptions[0];
  const [selectedPlanId, setSelectedPlanId] = useState<string>(
    currentPlan?.id ?? ""
  );

  // Other ready plans the builder could have uploaded as updated drawings.
  const updatedPlans = planOptions.filter((p) => !p.isCurrent);

  function run() {
    setError(null);
    startTransition(async () => {
      // Only pass newPlanId when the builder picked a plan other than the one
      // the parent ran against; otherwise re-check on the current drawings.
      const newPlanId =
        currentPlan && selectedPlanId && selectedPlanId !== currentPlan.id
          ? selectedPlanId
          : undefined;

      const result = await recheckCompliance(parentCheckId, { newPlanId });

      if ("error" in result && result.error) {
        if (result.error === "usage_limit_reached") {
          setError(
            "You've reached your compliance check limit. Upgrade your plan to run a re-check."
          );
        } else {
          setError(result.error);
        }
        return;
      }

      if ("checkId" in result && result.checkId) {
        setOpen(false);
        router.push(`/comply/${projectId}/check/${result.checkId}`);
      }
    });
  }

  return (
    <>
      <Button
        variant={variant}
        className="min-h-11 shrink-0"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <RefreshCw className="mr-1.5 h-4 w-4" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-check compliance</DialogTitle>
            <DialogDescription>
              This runs a fresh compliance check linked to the current report so
              you can see what cleared, what is still open, and anything new.
              Items you waived carry forward automatically. This consumes one
              compliance check from your plan.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Drawings to check</legend>

              {currentPlan && (
                <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-md border p-3 text-sm">
                  <input
                    type="radio"
                    name="recheck-plan"
                    className="mt-0.5 h-4 w-4"
                    checked={selectedPlanId === currentPlan.id}
                    onChange={() => setSelectedPlanId(currentPlan.id)}
                  />
                  <span>
                    <span className="font-medium">
                      Re-check the current drawings
                    </span>
                    <span className="block break-all text-xs text-muted-foreground">
                      {currentPlan.file_name}
                    </span>
                  </span>
                </label>
              )}

              {updatedPlans.map((p) => (
                <label
                  key={p.id}
                  className="flex min-h-11 cursor-pointer items-start gap-2 rounded-md border p-3 text-sm"
                >
                  <input
                    type="radio"
                    name="recheck-plan"
                    className="mt-0.5 h-4 w-4"
                    checked={selectedPlanId === p.id}
                    onChange={() => setSelectedPlanId(p.id)}
                  />
                  <span>
                    <span className="font-medium">
                      Use updated drawings
                    </span>
                    <span className="block break-all text-xs text-muted-foreground">
                      {p.file_name}
                    </span>
                  </span>
                </label>
              ))}

              {updatedPlans.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  To re-check against updated drawings, upload a new plan from the
                  project page first — it will appear here as an option.
                </p>
              )}
            </fieldset>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => setOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="min-h-11"
                onClick={run}
                disabled={isPending}
              >
                {isPending ? "Starting re-check..." : "Run re-check"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
