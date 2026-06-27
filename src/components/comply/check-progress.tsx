"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle, Clock, Bell } from "lucide-react";
import { getComplianceReport } from "@/app/(dashboard)/comply/actions";
import { requestRunNotify } from "@/app/(dashboard)/notify-actions";
import { getCategoryLabel } from "@/lib/ai/types";

// A short, reassuring line about what each domain check is actually doing —
// shown under the "Analysing <domain>" row so a long run reads as careful work,
// not a hang. Keyed by NccCategory (src/lib/ai/types.ts).
const CATEGORY_BLURB: Record<string, string> = {
  fire_safety:
    "Checking egress paths, fire separation and smoke-alarm coverage against the NCC fire provisions.",
  structural: "Reviewing footings, wind classification and structural adequacy.",
  energy_efficiency:
    "Assessing insulation, glazing and the energy pathway (DTS / NatHERS).",
  accessibility:
    "Checking accessible paths of travel, door widths and sanitary facilities.",
  waterproofing: "Reviewing wet-area waterproofing and falls to drainage.",
  ventilation:
    "Checking natural and mechanical ventilation to habitable and wet rooms.",
  glazing: "Assessing glazing energy performance and human-impact safety glass.",
  termite: "Reviewing termite-management and barrier provisions.",
  bushfire:
    "Checking the BAL construction requirements for the site's bushfire rating.",
  weatherproofing:
    "Reviewing the external envelope, flashings and weatherproofing (H2).",
  health_amenity:
    "Checking room sizes, ceiling heights and amenity provisions (H4).",
  safe_movement:
    "Reviewing stairs, balustrades and barrier heights for safe movement (H5).",
  ancillary: "Checking ancillary provisions such as swimming-pool barriers (H7).",
  livable_housing: "Assessing livable-housing design features (H8).",
};

// Rotating reassurance shown while the check runs — a careful multi-domain pass
// takes several minutes, so keep the user grounded in what's happening.
const PROGRESS_TIPS = [
  "Reading your plan the way a certifier would — one domain at a time.",
  "Each domain is checked independently to keep the findings accurate.",
  "Cross-referencing your design against the National Construction Code.",
  "A thorough pass now means fewer surprises at certification.",
  "Compiling the evidence behind each finding so you can act on it directly.",
];

// When a single domain has been running a while, explain WHY it's detailed so a
// long dwell reads as thoroughness, not a stall. Shown only after the domain has
// been current for a bit. Falls back to a generic note for any other domain.
const SLOW_CATEGORY_NOTE: Record<string, string> = {
  safe_movement:
    "Safe movement covers every stair, ramp, balustrade and barrier height in the plan — there's a lot to verify here, so it takes a little longer.",
  livable_housing:
    "Livable Housing checks step-free access, door and corridor widths and bathroom layouts across the whole dwelling — a detailed, room-by-room pass.",
  energy_efficiency:
    "Energy efficiency cross-checks insulation, glazing and the full thermal envelope against the energy provisions — one of the more involved domains.",
  accessibility:
    "Accessibility traces every path of travel and sanitary facility — a thorough domain that takes a little longer.",
  fire_safety:
    "Fire safety works through separation, egress and alarm coverage room by room — a detailed domain.",
  structural:
    "Structural verifies footings, wind classification and load paths against the structural provisions — careful work.",
};
const GENERIC_SLOW_NOTE =
  "This domain has a lot to check — still working carefully through it.";

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
  const [tipIndex, setTipIndex] = useState(0);
  // How long the CURRENT domain has been running, so we can explain a slow one.
  const catStartRef = useRef<number | null>(null);
  const prevCatRef = useRef<string | null>(null);
  const [catElapsed, setCatElapsed] = useState(0);
  // "Notify me when it's ready" — a browser notification (like a long LLM run),
  // armed via a ref so the poll can read it without re-creating its interval.
  const [notifyState, setNotifyState] = useState<"off" | "armed" | "unsupported">(
    "off",
  );
  const notifyRef = useRef(false);

  // Elapsed time ticker
  useEffect(() => {
    if (status === "completed" || status === "error") return;
    if (startTimeRef.current === null) startTimeRef.current = Date.now();

    const timer = setInterval(() => {
      const start = startTimeRef.current ?? Date.now();
      setElapsed(Math.floor((Date.now() - start) / 1000));
      if (catStartRef.current !== null) {
        setCatElapsed(Math.floor((Date.now() - catStartRef.current) / 1000));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [status]);

  // Reset the per-domain timer whenever the current domain changes (refs only —
  // the elapsed ticker recomputes catElapsed from catStartRef on its next tick).
  useEffect(() => {
    if (progressCurrent !== prevCatRef.current) {
      prevCatRef.current = progressCurrent;
      catStartRef.current = progressCurrent ? Date.now() : null;
    }
  }, [progressCurrent]);

  // Rotate the reassurance tip every ~7s while the check runs.
  useEffect(() => {
    if (status === "completed" || status === "error") return;
    const rotate = setInterval(() => {
      setTipIndex((i) => (i + 1) % PROGRESS_TIPS.length);
    }, 7000);
    return () => clearInterval(rotate);
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
          if (
            notifyRef.current &&
            typeof Notification !== "undefined" &&
            Notification.permission === "granted"
          ) {
            try {
              new Notification("MMC Comply", {
                body: "Your compliance report is ready.",
              });
            } catch {
              // Notifications are best-effort — never block completion on them.
            }
          }
          router.refresh();
        } else if (c.status === "error") {
          setErrorReason(c.summary ?? null);
          clearInterval(interval);
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [checkId, status, router]);

  // Safety net for the poll. getComplianceReport can transiently return {error}
  // (e.g. a getUser() hiccup on a long run); if that persists, the 3s poll above
  // silently stalls and the page spins forever even though the job finished —
  // only a manual refresh fixed it (the reported bug). This slow server-side
  // re-sync swaps the page to the finished report within ~30s regardless, since
  // the page renders by the server-read check.status. Cheap; stops on completion.
  useEffect(() => {
    if (status === "completed" || status === "error") return;
    const safety = setInterval(() => router.refresh(), 30000);
    return () => clearInterval(safety);
  }, [status, router]);

  const formatElapsed = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  // Arm a browser notification so the user can leave and be pinged when the
  // report is ready (like a long LLM run). Best-effort; degrades cleanly.
  const armNotify = async () => {
    if (typeof Notification === "undefined") {
      setNotifyState("unsupported");
      return;
    }
    if (Notification.permission === "granted") {
      notifyRef.current = true;
      setNotifyState("armed");
      void requestRunNotify("comply", checkId);
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      notifyRef.current = true;
      setNotifyState("armed");
      void requestRunNotify("comply", checkId);
    }
  };

  // Show the "why this domain is slow" note once it's been running a while.
  const slowNote =
    progressCurrent && catElapsed >= 75
      ? SLOW_CATEGORY_NOTE[progressCurrent] ?? GENERIC_SLOW_NOTE
      : null;

  if (status === "completed") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Compliance Check Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 shrink-0 text-green-600" />
              <div>
                <p className="text-sm font-medium">Complete</p>
                <p className="text-xs text-muted-foreground">
                  Your compliance report is ready — open the{" "}
                  <span className="font-medium">Action Items</span> tab below to
                  see the findings.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="min-h-11 shrink-0"
              onClick={() => router.refresh()}
            >
              View report
            </Button>
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
              <div className="py-0.5">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                  <span className="text-sm font-medium text-primary">
                    {getCategoryLabel(progressCurrent)}
                  </span>
                  <span className="text-xs text-muted-foreground">Analysing...</span>
                </div>
                {CATEGORY_BLURB[progressCurrent] && (
                  <p className="ml-6 mt-0.5 text-xs text-muted-foreground">
                    {CATEGORY_BLURB[progressCurrent]}
                  </p>
                )}
                {slowNote && (
                  <p className="ml-6 mt-1 text-xs text-amber-700">{slowNote}</p>
                )}
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

        {/* Reassurance: rotating tip, a "you can leave" note on long runs, and a
            notify-me-when-ready browser notification — to manage impatience on a
            multi-minute check. */}
        {(isProcessing || status === "queued") && (
          <div className="space-y-2 rounded-md bg-muted/40 px-3 py-2.5">
            <p className="text-xs text-muted-foreground">
              {PROGRESS_TIPS[tipIndex % PROGRESS_TIPS.length]}
            </p>
            {elapsed >= 180 && (
              <p className="text-xs text-muted-foreground">
                A full multi-domain check can take several minutes. You can leave
                this page — we&rsquo;ll keep working and your report will be saved.
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
        )}
      </CardContent>
    </Card>
  );
}
