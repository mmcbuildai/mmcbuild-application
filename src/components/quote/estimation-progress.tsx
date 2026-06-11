"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle, Clock } from "lucide-react";
import { getCostReport } from "@/app/(dashboard)/quote/actions";

interface EstimationProgressProps {
  estimateId: string;
  initialStatus: string;
  /** cost_estimates.summary — carries the REAL reason on an error. Surface it
   *  instead of a generic message (Diagnostic Integrity). */
  initialSummary?: string | null;
}

export function EstimationProgress({
  estimateId,
  initialStatus,
  initialSummary,
}: EstimationProgressProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [errorReason, setErrorReason] = useState<string | null>(
    initialSummary ?? null,
  );
  // Lazy-init the start time in an effect, not during render (Date.now() is
  // impure — calling it in render violates react-hooks/purity).
  const startTimeRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (status === "completed" || status === "error") return;
    if (startTimeRef.current === null) startTimeRef.current = Date.now();

    const timer = setInterval(() => {
      const start = startTimeRef.current ?? Date.now();
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (status === "completed" || status === "error") return;

    const interval = setInterval(async () => {
      const result = await getCostReport(estimateId);
      if (result.estimate) {
        const e = result.estimate as { status: string; summary: string | null };
        setStatus(e.status);

        if (e.status === "completed") {
          clearInterval(interval);
          router.refresh();
        } else if (e.status === "error") {
          setErrorReason(e.summary ?? null);
          clearInterval(interval);
        }
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [estimateId, status, router]);

  const formatElapsed = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  if (status === "completed") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cost Estimation Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-sm font-medium">Complete</p>
              <p className="text-xs text-muted-foreground">
                Your cost estimation report is ready.
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
          <CardTitle className="text-lg">Cost Estimation Progress</CardTitle>
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
        <CardTitle className="text-lg">Cost Estimation Progress</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
            <span className="text-sm font-medium">
              {status === "queued"
                ? "Queued..."
                : "Estimating costs across all categories"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {formatElapsed(elapsed)}
          </div>
        </div>

        {status === "queued" && (
          <p className="text-xs text-muted-foreground">
            Your cost estimation is in the queue and will start shortly.
          </p>
        )}

        {status === "processing" && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              The AI agent is working through 6 phases of cost estimation,
              looking up reference rates and comparing traditional vs MMC alternatives.
              This typically takes 2-4 minutes.
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-violet-500 transition-all duration-1000 animate-pulse"
                style={{ width: `${Math.min(90, elapsed * 1.5)}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
