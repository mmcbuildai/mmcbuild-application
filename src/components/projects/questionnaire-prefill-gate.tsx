"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QuestionnaireForm } from "@/components/projects/questionnaire-form";
import { getProjectDesignPrefill } from "@/app/(dashboard)/projects/actions";

interface SiteIntelPrefill {
  climate_zone?: number | null;
  bal_rating?: string | null;
  wind_region?: string | null;
}

interface QuestionnairePrefillGateProps {
  projectId: string;
  existingResponses?: Record<string, unknown> | null;
  siteIntel?: SiteIntelPrefill | null;
  isDraft?: boolean;
  /** Server-computed prefill at first render (may be empty when pending). */
  initialPrefill: Record<string, string>;
  /**
   * True when the on-upload design extraction is plausibly still in flight and
   * the prefill is currently empty. When false the gate renders the form
   * immediately with whatever prefill it has.
   */
  initiallyPending: boolean;
}

// Poll cadence + hard cap so a slow/failed extraction can NEVER trap the user.
const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 18; // 18 × 5s = 90s hard cap.

/**
 * Hold-back gate around the Comply questionnaire. The design-attribute
 * extraction is an async ~30–60s job that often hasn't finished by the time the
 * user reaches the questionnaire, so the prefill arrives empty. This gate waits
 * (briefly, while polling) for the extraction to land so the form renders
 * PRE-FILLED — with two escape hatches that guarantee the user is never stuck:
 * a 90s hard cap and an explicit "Skip" button. The waiting state only ever
 * shows for a FRESH questionnaire whose prefill is genuinely still pending.
 */
export function QuestionnairePrefillGate({
  projectId,
  existingResponses,
  siteIntel,
  isDraft,
  initialPrefill,
  initiallyPending,
}: QuestionnairePrefillGateProps) {
  // Decide up-front whether we ever need to wait. Existing answers, a non-empty
  // prefill, or "not pending" all mean: render the form now, no polling.
  const shouldWait =
    !existingResponses &&
    initiallyPending &&
    Object.keys(initialPrefill).length === 0;

  const [waiting, setWaiting] = useState(shouldWait);
  const [prefill, setPrefill] = useState<Record<string, string>>(initialPrefill);
  const pollCountRef = useRef(0);
  // Time-based progress for the waiting bar. The extraction is a single async
  // job with no incremental signal, so the bar reflects elapsed time against the
  // 90s hard cap and eases toward (never reaching) 100% until the prefill lands —
  // an honest "working…" indicator, not a fabricated percentage.
  const startRef = useRef<number | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!waiting) return;

    let cancelled = false;
    const interval = setInterval(async () => {
      pollCountRef.current += 1;

      try {
        const next = await getProjectDesignPrefill(projectId);
        if (cancelled) return;
        if (Object.keys(next).length > 0) {
          setPrefill(next);
          setWaiting(false);
          return;
        }
      } catch {
        // Transient read failure — keep polling until the hard cap, then the
        // form renders anyway. Never block the user on an error.
      }

      // Hard cap: stop polling and render the form (manual fill).
      if (!cancelled && pollCountRef.current >= MAX_POLLS) {
        setWaiting(false);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [waiting, projectId]);

  // Drive the progress bar off elapsed time (Date.now in an effect, not render,
  // per the react-hooks purity rule).
  useEffect(() => {
    if (!waiting) return;
    if (startRef.current === null) startRef.current = Date.now();
    const totalMs = POLL_INTERVAL_MS * MAX_POLLS; // the 90s hard-cap window
    const tick = setInterval(() => {
      const start = startRef.current ?? Date.now();
      const pct = Math.min(92, ((Date.now() - start) / totalMs) * 100);
      setProgress(pct);
    }, 200);
    return () => clearInterval(tick);
  }, [waiting]);

  if (waiting) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
          <div className="space-y-1">
            <p className="text-base font-medium">
              Reading your design to pre-fill your answers…
            </p>
            <p className="mx-auto max-w-md text-base text-muted-foreground">
              We&rsquo;re reading your uploaded plan to pre-fill what we can.
              This takes up to a minute. You can skip and fill it in yourself.
            </p>
          </div>
          <div
            className="w-full max-w-md space-y-1.5"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            aria-label="Reading your design to pre-fill your answers"
          >
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${Math.max(6, progress)}%` }}
              />
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setWaiting(false)}
          >
            Skip — fill it in myself
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <QuestionnaireForm
      projectId={projectId}
      isDraft={isDraft}
      existingResponses={existingResponses}
      siteIntel={siteIntel}
      designPrefill={prefill}
    />
  );
}
