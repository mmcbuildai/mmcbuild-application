"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { QuestionnaireForm } from "@/components/projects/questionnaire-form";
import {
  getDesignPrefillState,
  type DesignPrefillStatus,
} from "@/app/(dashboard)/projects/actions";

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
  /** Server-computed prefill at first render (empty while still extracting). */
  initialPrefill: Record<string, string>;
  /** Server-computed extraction state at first render. */
  initialStatus: DesignPrefillStatus;
  /** Deep-link target questionnaire field (SCRUM-188) — opens its step. */
  initialField?: string;
}

const POLL_INTERVAL_MS = 5000;
// Absolute backstop so a hung/failed extraction can never trap the user. A large
// plan set's extraction runs ~2–3 min; the stuck-job reaper marks genuine hangs
// errored within ~5 min, which flips the state to 'unavailable' before this. The
// backstop is the last resort: render the form for manual fill, honestly framed.
const MAX_WAIT_MS = 6 * 60 * 1000;
// Don't trap the user: after this, offer a quiet "fill it in yourself" escape.
const MANUAL_ESCAPE_AFTER_MS = 90 * 1000;
// Honest expected duration the progress bar eases across (never fabricated to
// 100% — it stops at ~92% until the extraction actually lands).
const EXPECTED_MS = 3 * 60 * 1000;

// Stage commentary — reflects what the extractor actually does, advanced by
// elapsed time (the pipeline has no per-stage signal). Honest "working…" labels,
// not a fake per-step completion.
const STAGES = [
  "Reading your uploaded plan…",
  "Finding the floor plans, elevations and sections…",
  "Tracing rooms, walls and areas…",
  "Reading the schedule of finishes and notes…",
  "Preparing your pre-filled answers…",
];
const STAGE_EVERY_MS = 30 * 1000;

/**
 * Hold-back gate around the Comply questionnaire.
 *
 * The design extraction that pre-fills the form is an async ~2–3 min job. Rather
 * than RACE it (render an empty form, then ignore the data when it lands — the
 * 90s-cap bug that left answers blank on a 32MB plan), this gate WAITS for the
 * precursor to finish, showing an honest progress bar + stage commentary so the
 * user understands the wait. It resolves only when the extraction is confirmed
 * done: 'ready' → form pre-filled; 'unavailable' → form for manual fill. Two
 * safety valves keep the user from ever being trapped: a quiet manual-escape
 * after 90s and a 6-min absolute backstop. Belt-and-braces: even after the form
 * renders, a background poll keeps running and feeds any late-arriving prefill
 * into the form (which fills the fields the user hasn't touched).
 */
export function QuestionnairePrefillGate({
  projectId,
  existingResponses,
  siteIntel,
  isDraft,
  initialPrefill,
  initialStatus,
  initialField,
}: QuestionnairePrefillGateProps) {
  // Wait only for a fresh questionnaire whose extraction is genuinely in flight.
  const shouldWait =
    !existingResponses &&
    initialStatus === "extracting" &&
    Object.keys(initialPrefill).length === 0;

  const [waiting, setWaiting] = useState(shouldWait);
  const [prefill, setPrefill] = useState<Record<string, string>>(initialPrefill);
  const [stage, setStage] = useState(0);
  const [progress, setProgress] = useState(0);
  const [showEscape, setShowEscape] = useState(false);
  const startRef = useRef<number | null>(null);

  // Foreground poll while waiting: resolve on 'ready' (prefill) or 'unavailable'.
  useEffect(() => {
    if (!waiting) return;
    if (startRef.current === null) startRef.current = Date.now();

    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const next = await getDesignPrefillState(projectId);
        if (cancelled) return;
        if (next.status === "ready" && Object.keys(next.prefill).length > 0) {
          setPrefill(next.prefill);
          setWaiting(false);
          return;
        }
        if (next.status === "unavailable") {
          setPrefill(next.prefill);
          setWaiting(false);
          return;
        }
      } catch {
        // Transient read failure — keep waiting until the backstop.
      }
      // Absolute backstop.
      if (!cancelled && startRef.current !== null) {
        if (Date.now() - startRef.current >= MAX_WAIT_MS) setWaiting(false);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [waiting, projectId]);

  // Drive the progress bar + stage commentary + escape off elapsed time.
  useEffect(() => {
    if (!waiting) return;
    const tick = setInterval(() => {
      const start = startRef.current ?? Date.now();
      const elapsed = Date.now() - start;
      setProgress(Math.min(92, (elapsed / EXPECTED_MS) * 100));
      setStage(Math.min(STAGES.length - 1, Math.floor(elapsed / STAGE_EVERY_MS)));
      if (elapsed >= MANUAL_ESCAPE_AFTER_MS) setShowEscape(true);
    }, 250);
    return () => clearInterval(tick);
  }, [waiting]);

  // Belt-and-braces: once the form is showing but the prefill is still empty (a
  // backstop/unavailable resolution while extraction may yet finish), keep
  // polling quietly. A late prefill flows into the form via its designPrefill
  // prop, which fills the fields the user hasn't touched.
  useEffect(() => {
    if (waiting) return;
    if (existingResponses) return;
    if (Object.keys(prefill).length > 0) return;

    let cancelled = false;
    let polls = 0;
    const interval = setInterval(async () => {
      polls += 1;
      try {
        const next = await getDesignPrefillState(projectId);
        if (!cancelled && Object.keys(next.prefill).length > 0) {
          setPrefill(next.prefill);
          clearInterval(interval);
          return;
        }
      } catch {
        /* keep trying */
      }
      if (polls >= 24) clearInterval(interval); // ~3 min of background retries
    }, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [waiting, existingResponses, prefill, projectId]);

  if (waiting) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
          <div className="space-y-1">
            <p className="text-base font-medium">{STAGES[stage]}</p>
            <p className="mx-auto max-w-md text-base text-muted-foreground">
              We&rsquo;re reading your uploaded plan to pre-fill your answers, so
              you don&rsquo;t re-type what&rsquo;s already on the drawings. Large
              plan sets can take 2&ndash;3 minutes — we&rsquo;ll fill in
              everything we can read.
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
          {showEscape && (
            <button
              type="button"
              onClick={() => setWaiting(false)}
              className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Taking a while? Fill it in yourself instead
            </button>
          )}
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
      initialField={initialField}
    />
  );
}
