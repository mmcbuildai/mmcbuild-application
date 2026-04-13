"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Hammer,
  Calculator,
  Users,
  GraduationCap,
  Star,
  CheckCircle2,
  Clock,
  Circle,
  MessageSquare,
  ExternalLink,
  Loader2,
  FlaskConical,
} from "lucide-react";
import { MODULES, type ModuleId } from "@/lib/stripe/plans";
import { startTesting, submitFeedback, type BetaFeedbackRow } from "./actions";

/* ── Testing prompts per module ── */
const TESTING_PROMPTS: Record<ModuleId, string[]> = {
  comply: [
    "Upload a PDF building plan and run a compliance check",
    "Review the generated NCC findings report",
    "Check that citations reference specific NCC clauses",
    "Try exporting the report as PDF",
  ],
  build: [
    "Open an existing project and view design suggestions",
    "Check the 3D viewer loads correctly",
    "Review material and system selection options",
    "Verify suggestions are relevant to your project type",
  ],
  quote: [
    "Generate a cost estimate for a project",
    "Compare traditional vs MMC cost breakdown",
    "Check that rate benchmarks look reasonable",
    "Try exporting the quote as PDF or Word",
  ],
  direct: [
    "Search for trades by state and category",
    "Open a company profile and check all fields display",
    "Try filtering by certification status",
    "Test the enquiry form on a listing",
  ],
  train: [
    "Browse available training modules",
    "Start a module and complete at least one lesson",
    "Check that progress is tracked on the dashboard",
    "Try a quiz and verify scoring works",
  ],
};

const MODULE_ICONS: Record<ModuleId, typeof ShieldCheck> = {
  comply: ShieldCheck,
  build: Hammer,
  quote: Calculator,
  direct: Users,
  train: GraduationCap,
};

const MODULE_COLORS: Record<
  ModuleId,
  { gradient: string; border: string; bg: string; text: string }
> = {
  comply: {
    gradient: "from-blue-500 to-blue-600",
    border: "border-blue-300",
    bg: "bg-blue-50",
    text: "text-blue-700",
  },
  build: {
    gradient: "from-teal-500 to-teal-600",
    border: "border-teal-300",
    bg: "bg-teal-50",
    text: "text-teal-700",
  },
  quote: {
    gradient: "from-violet-500 to-violet-600",
    border: "border-violet-300",
    bg: "bg-violet-50",
    text: "text-violet-700",
  },
  direct: {
    gradient: "from-amber-500 to-amber-600",
    border: "border-amber-300",
    bg: "bg-amber-50",
    text: "text-amber-700",
  },
  train: {
    gradient: "from-indigo-500 to-indigo-600",
    border: "border-indigo-300",
    bg: "bg-indigo-50",
    text: "text-indigo-700",
  },
};

const STATUS_CONFIG = {
  not_started: {
    icon: Circle,
    label: "Not Started",
    dot: "bg-red-500",
    border: "border-red-200",
    bg: "bg-red-50/30",
    badge: "bg-red-100 text-red-700",
  },
  in_progress: {
    icon: Clock,
    label: "In Progress",
    dot: "bg-amber-500",
    border: "border-amber-200",
    bg: "bg-amber-50/30",
    badge: "bg-amber-100 text-amber-700",
  },
  completed: {
    icon: CheckCircle2,
    label: "Tested",
    dot: "bg-green-500",
    border: "border-green-200",
    bg: "bg-green-50/30",
    badge: "bg-green-100 text-green-700",
  },
};

/* ── Star rating component ── */
function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className="p-0.5 transition-colors"
        >
          <Star
            className={`h-6 w-6 ${
              star <= value
                ? "fill-amber-400 text-amber-400"
                : "text-slate-300"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

/* ── Module card ── */
function ModuleCard({
  moduleId,
  progress,
  onUpdate,
}: {
  moduleId: ModuleId;
  progress: BetaFeedbackRow;
  onUpdate: (updated: BetaFeedbackRow) => void;
}) {
  const mod = MODULES[moduleId];
  const Icon = MODULE_ICONS[moduleId];
  const colors = MODULE_COLORS[moduleId];
  const statusCfg = STATUS_CONFIG[progress.status];
  const prompts = TESTING_PROMPTS[moduleId];

  const [feedback, setFeedback] = useState(progress.feedback ?? "");
  const [rating, setRating] = useState(progress.rating ?? 0);
  const [isPending, startTransition] = useTransition();
  const [showFeedback, setShowFeedback] = useState(
    progress.status === "in_progress" || progress.status === "completed"
  );

  function handleStartTesting() {
    startTransition(async () => {
      const res = await startTesting(moduleId);
      if (res.error) {
        alert(res.error);
        return;
      }
      onUpdate({
        ...progress,
        status: "in_progress",
        started_at: new Date().toISOString(),
      });
      setShowFeedback(true);
    });
  }

  function handleSubmitFeedback() {
    if (!feedback.trim()) {
      alert("Please write some feedback before submitting.");
      return;
    }
    if (rating === 0) {
      alert("Please give a star rating before submitting.");
      return;
    }
    startTransition(async () => {
      const res = await submitFeedback(moduleId, feedback, rating);
      if (res.error) {
        alert(res.error);
        return;
      }
      onUpdate({
        ...progress,
        status: "completed",
        feedback,
        rating,
        completed_at: new Date().toISOString(),
      });
    });
  }

  return (
    <div
      className={`rounded-xl border-2 transition-all ${statusCfg.border} ${statusCfg.bg}`}
    >
      {/* Header */}
      <div className="p-5 pb-0">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className={`inline-flex rounded-xl bg-gradient-to-br ${colors.gradient} p-3`}
            >
              <Icon className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">{mod.name}</h3>
              <p className="text-xs text-muted-foreground">{mod.tagline}</p>
            </div>
          </div>
          {/* Status badge */}
          <div className="flex items-center gap-2">
            <span className={`h-3 w-3 rounded-full ${statusCfg.dot}`} />
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCfg.badge}`}
            >
              {statusCfg.label}
            </span>
          </div>
        </div>
      </div>

      {/* What to test */}
      <div className="px-5 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          What to test
        </p>
        <ul className="space-y-1.5">
          {prompts.map((prompt, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-sm text-muted-foreground"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">
                {i + 1}
              </span>
              {prompt}
            </li>
          ))}
        </ul>
      </div>

      {/* Completed feedback display */}
      {progress.status === "completed" && progress.feedback && (
        <div className="mx-5 mb-3 rounded-lg border border-green-200 bg-green-50 p-3">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="h-3.5 w-3.5 text-green-600" />
            <span className="text-xs font-medium text-green-700">
              Your feedback
            </span>
            <div className="flex gap-0.5 ml-auto">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`h-3 w-3 ${
                    s <= (progress.rating ?? 0)
                      ? "fill-amber-400 text-amber-400"
                      : "text-slate-300"
                  }`}
                />
              ))}
            </div>
          </div>
          <p className="text-sm text-green-800">{progress.feedback}</p>
        </div>
      )}

      {/* Feedback form (in_progress) */}
      {showFeedback &&
        progress.status === "in_progress" && (
          <div className="px-5 pb-3">
            <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  How was your experience? (required)
                </label>
                <textarea
                  placeholder="What worked well? What didn't? Any suggestions for improvement?"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Rate this module (required)
                </label>
                <StarRating value={rating} onChange={setRating} />
              </div>
              <button
                onClick={handleSubmitFeedback}
                disabled={isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Submit Feedback
              </button>
            </div>
          </div>
        )}

      {/* Actions */}
      <div className="px-5 pb-5 flex gap-2">
        {progress.status === "not_started" && (
          <button
            onClick={handleStartTesting}
            disabled={isPending}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r ${colors.gradient} px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50`}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4" />
            )}
            Start Testing
          </button>
        )}

        {progress.status === "in_progress" && (
          <Link
            href={mod.href}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r ${colors.gradient} px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity`}
          >
            Open {mod.name.replace("MMC ", "")}
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}

        {progress.status === "completed" && (
          <div className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-100 px-4 py-2.5 text-sm font-medium text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            Testing Complete
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main dashboard ── */
export function BetaDashboard({
  initialProgress,
}: {
  initialProgress: BetaFeedbackRow[];
}) {
  const [progress, setProgress] = useState(initialProgress);

  const completed = progress.filter((p) => p.status === "completed").length;
  const inProgress = progress.filter((p) => p.status === "in_progress").length;
  const notStarted = progress.filter((p) => p.status === "not_started").length;
  const total = progress.length;

  function handleUpdate(updated: BetaFeedbackRow) {
    setProgress((prev) =>
      prev.map((p) => (p.module_id === updated.module_id ? updated : p))
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <FlaskConical className="h-6 w-6 text-teal-600" />
          <h1 className="text-2xl font-bold">Beta Testing Dashboard</h1>
        </div>
        <p className="text-muted-foreground">
          Test each module and provide your feedback. Your input shapes the
          product.
        </p>
      </div>

      {/* Progress overview */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium">
            Testing Progress: {completed} of {total} modules reviewed
          </span>
          <span className="text-sm text-muted-foreground">
            {total > 0 ? Math.round((completed / total) * 100) : 0}%
          </span>
        </div>
        <div className="h-4 rounded-full bg-slate-100 overflow-hidden flex">
          {completed > 0 && (
            <div
              className="bg-green-500 transition-all duration-500"
              style={{ width: `${(completed / total) * 100}%` }}
            />
          )}
          {inProgress > 0 && (
            <div
              className="bg-amber-400 transition-all duration-500"
              style={{ width: `${(inProgress / total) * 100}%` }}
            />
          )}
          {notStarted > 0 && (
            <div
              className="bg-red-300 transition-all duration-500"
              style={{ width: `${(notStarted / total) * 100}%` }}
            />
          )}
        </div>
        <div className="flex gap-6 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            {completed} Tested
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            {inProgress} In Progress
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
            {notStarted} Not Started
          </span>
        </div>
      </div>

      {/* Instructions */}
      <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-5">
        <h2 className="font-semibold text-teal-900 mb-2">How it works</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              step: 1,
              title: "Start Testing",
              desc: 'Click "Start Testing" on a module card below',
            },
            {
              step: 2,
              title: "Try the Module",
              desc: "Open the module from the side navbar and work through the test prompts",
            },
            {
              step: 3,
              title: "Give Feedback",
              desc: "Rate the module and tell us what worked (or didn't)",
            },
          ].map((s) => (
            <div key={s.step} className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white">
                {s.step}
              </span>
              <div>
                <p className="text-sm font-medium text-teal-900">{s.title}</p>
                <p className="text-xs text-teal-700">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Module cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {progress.map((p) => (
          <ModuleCard
            key={p.module_id}
            moduleId={p.module_id}
            progress={p}
            onUpdate={handleUpdate}
          />
        ))}
      </div>

      {/* Completion message */}
      {completed === total && (
        <div className="rounded-xl border-2 border-green-300 bg-green-50 p-6 text-center">
          <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-green-900">
            All modules tested!
          </h2>
          <p className="text-sm text-green-700 mt-1">
            Thank you for your feedback. It will be reviewed and incorporated
            into the next sprint.
          </p>
        </div>
      )}
    </div>
  );
}
