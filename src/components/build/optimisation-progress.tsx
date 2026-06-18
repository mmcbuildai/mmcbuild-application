"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle, Clock } from "lucide-react";
import { getDesignReport } from "@/app/(dashboard)/build/actions";

interface OptimisationProgressProps {
  checkId: string;
  initialStatus: string;
  /** The reason text stored on the check (design_checks.summary). On an error
   *  this carries the REAL cause — surface it instead of a generic message. */
  initialSummary?: string | null;
}

export function OptimisationProgress({
  checkId,
  initialStatus,
  initialSummary,
}: OptimisationProgressProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [errorReason, setErrorReason] = useState<string | null>(
    initialSummary ?? null,
  );
  // Lazy-init the start time in an effect, not during render (Date.now() is
  // impure — calling it in render violates react-hooks/purity).
  const startTimeRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Elapsed time ticker
  useEffect(() => {
    if (status === "completed" || status === "error") return;
    if (startTimeRef.current === null) startTimeRef.current = Date.now();

    const timer = setInterval(() => {
      const start = startTimeRef.current ?? Date.now();
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [status]);

  // Poll for progress
  useEffect(() => {
    if (status === "completed" || status === "error") return;

    const interval = setInterval(async () => {
      const result = await getDesignReport(checkId);
      if (result.check) {
        const c = result.check as { status: string; summary: string | null };
        setStatus(c.status);

        if (c.status === "completed") {
          clearInterval(interval);
          router.refresh();
        } else if (c.status === "error") {
          setErrorReason(c.summary ?? null);
          clearInterval(interval);
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [checkId, status, router]);

  const formatElapsed = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  // The job doesn't emit a precise percentage, so the bar is a TIME-BASED
  // estimate: it fills toward an expected ~2 min run and holds near the end
  // until the run actually completes — honest reassurance for a long wait,
  // never a fake "done".
  const ESTIMATED_SECONDS = 120;
  const percent =
    status === "completed"
      ? 100
      : status === "queued"
        ? 6
        : Math.min(95, Math.round((elapsed / ESTIMATED_SECONDS) * 100));

  if (status === "completed") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Design Optimisation Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-sm font-medium">Complete</p>
              <p className="text-xs text-muted-foreground">
                Your design optimisation report is ready.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === "error") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Design Optimisation Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <XCircle className="h-5 w-5 text-red-600" />
            <div>
              <p className="text-sm font-medium">Error</p>
              <p className="text-xs text-muted-foreground">
                {errorReason || "Something went wrong. Please try again."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Design Optimisation Progress</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
            <span className="text-sm font-medium">
              {status === "queued"
                ? "Queued..."
                : "Analysing your plan for MMC opportunities"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {formatElapsed(elapsed)}
          </div>
        </div>

        {/* Horizontal progress bar (time-based estimate) */}
        <div className="space-y-1">
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Design optimisation progress"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-500 to-teal-600 transition-[width] duration-1000 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex justify-end">
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {percent}%
            </span>
          </div>
        </div>

        {status === "queued" && (
          <p className="text-xs text-muted-foreground">
            Your design optimisation is in the queue and will start shortly.
          </p>
        )}

        {status === "processing" && (
          <p className="text-xs text-muted-foreground">
            AI is reviewing your plans for prefabrication and modern construction opportunities. This can take a couple of minutes — you can leave this page open.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
