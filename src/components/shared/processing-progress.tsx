"use client";

/**
 * Canonical long-wait "processing" progress shape — reused across every slow
 * analysis / compilation surface (Comply check, Quote cost estimation, Build
 * design optimisation, …) so users watching a multi-minute job stay reassured,
 * can go do something else, and get pinged + deep-linked back when it's done.
 *
 * Presentation + UX only; the HOST owns the data by passing a `poll` function
 * (each module wraps its own status server-action). On completion the component
 * fires a browser notification titled with the report name and, on click,
 * focuses the tab and navigates to `reportHref` — so a user who forgot what they
 * were waiting on lands straight on the finished report.
 *
 * Promotion note: this is the registry-free local mirror of the intended
 * `@caistech/processing-progress` portfolio component — keep the two in sync; the
 * canonical source lives in cais-shared-services so every repo reuses one shape.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle, Clock, Bell } from "lucide-react";

export type ProcessingStatus =
  | "queued"
  | "processing"
  | "completed"
  | "error"
  | string;

export interface ProcessingPoll {
  status: ProcessingStatus;
  /** Real failure reason to surface (Diagnostic Integrity) — never a generic. */
  errorReason?: string | null;
  /** Optional per-stage progress for surfaces that report it (e.g. Comply). */
  currentStage?: string | null;
  completedStages?: string[];
}

export interface ProcessingStage {
  key: string;
  label: string;
  /** "what we're doing" reassurance shown under the active stage. */
  blurb?: string;
}

export interface ProcessingProgressProps {
  title: string;
  initialStatus: ProcessingStatus;
  initialError?: string | null;
  /** Host-supplied poller. Return null on a transient read failure (keep going). */
  poll: () => Promise<ProcessingPoll | null>;
  pollIntervalMs?: number;
  workingLabel?: string;
  queuedLabel?: string;
  /** A paragraph explaining what's happening + rough duration. */
  description?: string;
  /** Rotating reassurance lines. */
  tips?: string[];
  /** Optional stage catalogue for per-stage display + blurbs. */
  stages?: ProcessingStage[];
  /** "why this stage is slow" note once a stage has been current a while. */
  slowStageNote?: (stageKey: string, dwellSecs: number) => string | null;
  /** Notification title on completion, e.g. "Your cost estimation report is ready". */
  completionTitle: string;
  completionBody?: string;
  /** Deep-link the completion notification + "View report" button navigate to. */
  reportHref?: string;
  /** Called once when status flips to completed (host usually router.refresh()). */
  onComplete?: () => void;
  /** Seconds before showing the "you can leave this page" note. */
  leaveAfterSecs?: number;
  /** Accent colour for the spinner/bar. */
  accentClass?: string;
}

const DEFAULT_TIPS = [
  "Working carefully through your design — this can take a few minutes.",
  "A thorough pass now means fewer surprises later.",
  "You can leave this page open and we'll keep going.",
];

export function ProcessingProgress({
  title,
  initialStatus,
  initialError,
  poll,
  pollIntervalMs = 3500,
  workingLabel = "Working on your design",
  queuedLabel = "Queued…",
  description,
  tips = DEFAULT_TIPS,
  stages,
  slowStageNote,
  completionTitle,
  completionBody = "Your report is ready.",
  reportHref,
  onComplete,
  leaveAfterSecs = 180,
  accentClass = "text-primary",
}: ProcessingProgressProps) {
  const router = useRouter();
  const [status, setStatus] = useState<ProcessingStatus>(initialStatus);
  const [errorReason, setErrorReason] = useState<string | null>(
    initialError ?? null,
  );
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [completedStages, setCompletedStages] = useState<string[]>([]);

  const startRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);

  const stageStartRef = useRef<number | null>(null);
  const prevStageRef = useRef<string | null>(null);
  const [stageElapsed, setStageElapsed] = useState(0);

  const [notifyState, setNotifyState] = useState<"off" | "armed" | "unsupported">(
    "off",
  );
  const notifyRef = useRef(false);

  const done = status === "completed" || status === "error";

  // Elapsed + per-stage tickers.
  useEffect(() => {
    if (done) return;
    if (startRef.current === null) startRef.current = Date.now();
    const t = setInterval(() => {
      const s = startRef.current ?? Date.now();
      setElapsed(Math.floor((Date.now() - s) / 1000));
      if (stageStartRef.current !== null) {
        setStageElapsed(Math.floor((Date.now() - stageStartRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(t);
  }, [done]);

  // Reset the per-stage timer when the active stage changes (refs only).
  useEffect(() => {
    if (currentStage !== prevStageRef.current) {
      prevStageRef.current = currentStage;
      stageStartRef.current = currentStage ? Date.now() : null;
    }
  }, [currentStage]);

  // Rotate the reassurance tip.
  useEffect(() => {
    if (done || tips.length === 0) return;
    const r = setInterval(
      () => setTipIndex((i) => (i + 1) % tips.length),
      7000,
    );
    return () => clearInterval(r);
  }, [done, tips.length]);

  // Poll loop.
  useEffect(() => {
    if (done) return;
    const interval = setInterval(async () => {
      let res: ProcessingPoll | null = null;
      try {
        res = await poll();
      } catch {
        return; // transient — keep polling
      }
      if (!res) return;
      if (res.currentStage !== undefined) setCurrentStage(res.currentStage);
      if (res.completedStages) setCompletedStages(res.completedStages);
      setStatus(res.status);
      if (res.status === "completed") {
        clearInterval(interval);
        if (
          notifyRef.current &&
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          try {
            const n = new Notification(completionTitle, { body: completionBody });
            n.onclick = () => {
              window.focus();
              if (reportHref) router.push(reportHref);
              n.close();
            };
          } catch {
            // best-effort
          }
        }
        onComplete?.();
      } else if (res.status === "error") {
        setErrorReason(res.errorReason ?? null);
        clearInterval(interval);
      }
    }, pollIntervalMs);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, status]);

  // Safety net: if the host poll stalls (e.g. a transient auth hiccup returns no
  // result), re-sync the server view periodically so a finished job surfaces
  // without a manual refresh. Hosts render by server-read status + onComplete,
  // so a slow router.refresh() resolves it. Cheap; stops once done.
  useEffect(() => {
    if (done) return;
    const safety = setInterval(() => router.refresh(), 30000);
    return () => clearInterval(safety);
  }, [done, router]);

  const armNotify = async () => {
    if (typeof Notification === "undefined") {
      setNotifyState("unsupported");
      return;
    }
    if (Notification.permission === "granted") {
      notifyRef.current = true;
      setNotifyState("armed");
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      notifyRef.current = true;
      setNotifyState("armed");
    }
  };

  const fmt = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  if (status === "completed") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-sm font-medium">Complete</p>
              <p className="text-xs text-muted-foreground">{completionBody}</p>
            </div>
          </div>
          {reportHref && (
            <Button
              type="button"
              size="sm"
              className="h-9"
              onClick={() => router.push(reportHref)}
            >
              View report
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (status === "error") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
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

  const stage = currentStage
    ? stages?.find((s) => s.key === currentStage)
    : undefined;
  const slowNote =
    currentStage && stageElapsed >= 75 && slowStageNote
      ? slowStageNote(currentStage, stageElapsed)
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 className={`h-4 w-4 animate-spin ${accentClass}`} />
            <span className="text-sm font-medium">
              {status === "queued" ? queuedLabel : workingLabel}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {fmt(elapsed)}
          </div>
        </div>

        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}

        {/* Indeterminate, time-eased progress bar (no per-step signal). */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-1000"
            style={{ width: `${Math.min(92, Math.max(5, elapsed * 1.2))}%` }}
          />
        </div>

        {/* Per-stage checklist when the host reports stages. */}
        {(completedStages.length > 0 || currentStage) && stages && (
          <div className="space-y-1">
            {completedStages.map((k) => {
              const st = stages.find((s) => s.key === k);
              return (
                <div key={k} className="flex items-center gap-2 py-0.5">
                  <CheckCircle className="h-4 w-4 shrink-0 text-green-600" />
                  <span className="text-sm">{st?.label ?? k}</span>
                </div>
              );
            })}
            {currentStage && (
              <div className="py-0.5">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                  <span className="text-sm font-medium text-primary">
                    {stage?.label ?? currentStage}
                  </span>
                  <span className="text-xs text-muted-foreground">Analysing…</span>
                </div>
                {stage?.blurb && (
                  <p className="ml-6 mt-0.5 text-xs text-muted-foreground">
                    {stage.blurb}
                  </p>
                )}
                {slowNote && (
                  <p className="ml-6 mt-1 text-xs text-amber-700">{slowNote}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Reassurance + leave-the-page + notify-me. */}
        <div className="space-y-2 rounded-md bg-muted/40 px-3 py-2.5">
          {tips.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {tips[tipIndex % tips.length]}
            </p>
          )}
          {elapsed >= leaveAfterSecs && (
            <p className="text-xs text-muted-foreground">
              This can take several minutes. You can leave this page or work on
              something else — we&rsquo;ll keep going and save your report.
            </p>
          )}
          <div className="pt-0.5">
            {notifyState === "armed" ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700">
                <CheckCircle className="h-3.5 w-3.5" />
                We&rsquo;ll notify you when it&rsquo;s ready
              </span>
            ) : notifyState === "unsupported" ? (
              <span className="text-xs text-muted-foreground">
                Notifications aren&rsquo;t supported in this browser.
              </span>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={armNotify}
              >
                <Bell className="mr-1.5 h-3.5 w-3.5" />
                Notify me when it&rsquo;s ready
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
