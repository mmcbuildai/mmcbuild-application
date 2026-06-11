"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle, Clock } from "lucide-react";
import { getComplianceReport } from "@/app/(dashboard)/comply/actions";
import { getCategoryLabel } from "@/lib/ai/types";

interface CheckProgressProps {
  checkId: string;
  initialStatus: string;
  initialProgressCurrent?: string | null;
  initialProgressCompleted?: string[];
  /** compliance_checks.summary — carries the REAL reason on an error. Surface
   *  it instead of a generic message (Diagnostic Integrity). */
  initialSummary?: string | null;
}

export function CheckProgress({
  checkId,
  initialStatus,
  initialProgressCurrent,
  initialProgressCompleted,
  initialSummary,
}: CheckProgressProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [progressCurrent, setProgressCurrent] = useState<string | null>(
    initialProgressCurrent ?? null
  );
  const [progressCompleted, setProgressCompleted] = useState<string[]>(
    initialProgressCompleted ?? []
  );
  const [errorReason, setErrorReason] = useState<string | null>(
    initialSummary ?? null
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
      const result = await getComplianceReport(checkId);
      if (result.check) {
        const c = result.check as {
          status: string;
          summary?: string | null;
          progress_current?: string | null;
          progress_completed?: string[] | null;
        };

        setStatus(c.status);
        setProgressCurrent(c.progress_current ?? null);
        setProgressCompleted(c.progress_completed ?? []);

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

  if (status === "completed") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Compliance Check Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-sm font-medium">Complete</p>
              <p className="text-xs text-muted-foreground">
                Your compliance report is ready.
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
          <CardTitle className="text-lg">Compliance Check Progress</CardTitle>
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

  const completedCount = progressCompleted.length;
  const isProcessing = status === "processing";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Compliance Check Progress</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status + elapsed */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm font-medium">
              {status === "queued" ? "Queued..." : "Analysing your plan"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {formatElapsed(elapsed)}
          </div>
        </div>

        {/* Progress bar */}
        {isProcessing && completedCount > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {completedCount} domain{completedCount !== 1 ? "s" : ""} completed
              </span>
              {progressCurrent && <span>Analysing next...</span>}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{
                  width: `${Math.max(
                    5,
                    (completedCount / (completedCount + (progressCurrent ? 1 : 0) + 1)) * 100
                  )}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Domain checklist */}
        {isProcessing && (completedCount > 0 || progressCurrent) && (
          <div className="space-y-1">
            {progressCompleted.map((cat) => (
              <div key={cat} className="flex items-center gap-2 py-0.5">
                <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                <span className="text-sm text-foreground">
                  {getCategoryLabel(cat)}
                </span>
              </div>
            ))}
            {progressCurrent && (
              <div className="flex items-center gap-2 py-0.5">
                <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                <span className="text-sm font-medium text-primary">
                  {getCategoryLabel(progressCurrent)}
                </span>
                <span className="text-xs text-muted-foreground">Analysing...</span>
              </div>
            )}
          </div>
        )}

        {/* Queued state message */}
        {status === "queued" && (
          <p className="text-xs text-muted-foreground">
            Your compliance check is in the queue and will start shortly.
          </p>
        )}

        {/* Processing but no progress yet */}
        {isProcessing && completedCount === 0 && !progressCurrent && (
          <p className="text-xs text-muted-foreground">
            Preparing analysis pipeline...
          </p>
        )}
      </CardContent>
    </Card>
  );
}
