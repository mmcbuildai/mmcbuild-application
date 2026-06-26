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
  FolderKanban,
  ArrowRight,
  Lock,
} from "lucide-react";
import { MODULES, type ModuleId } from "@/lib/stripe/plans";
import {
  startTesting,
  submitFeedback,
  toggleTask,
  type BetaFeedbackRow,
} from "./actions";
import { TESTING_TASKS, allTasksDone } from "@/lib/beta/testing-tasks";

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
  locked,
}: {
  moduleId: ModuleId;
  progress: BetaFeedbackRow;
  onUpdate: (updated: BetaFeedbackRow) => void;
  locked: boolean;
}) {
  const mod = MODULES[moduleId];
  const Icon = MODULE_ICONS[moduleId];
  const colors = MODULE_COLORS[moduleId];
  const statusCfg = STATUS_CONFIG[progress.status];
  const tasks = TESTING_TASKS[moduleId];

  const [feedback, setFeedback] = useState(progress.feedback ?? "");
  const [rating, setRating] = useState(progress.rating ?? 0);
  const [doneTasks, setDoneTasks] = useState<number[]>(
    progress.completed_tasks ?? []
  );
  const [isPending, startTransition] = useTransition();
  const [showFeedback, setShowFeedback] = useState(
    progress.status === "in_progress" || progress.status === "completed"
  );

  const tasksComplete = allTasksDone(moduleId, doneTasks);
  const canSubmit = tasksComplete && feedback.trim().length > 0 && rating > 0;

  function handleToggleTask(index: number) {
    const optimistic = doneTasks.includes(index)
      ? doneTasks.filter((i) => i !== index)
      : [...doneTasks, index].sort((a, b) => a - b);
    const previous = doneTasks;
    setDoneTasks(optimistic);
    if (!showFeedback) setShowFeedback(true);
    startTransition(async () => {
      const res = await toggleTask(moduleId, index);
      if (res.error) {
        alert(res.error);
        setDoneTasks(previous); // rollback
        return;
      }
      const serverTasks = res.completed_tasks ?? optimistic;
      setDoneTasks(serverTasks);
      onUpdate({
        ...progress,
        completed_tasks: serverTasks,
        status:
          (res.status as BetaFeedbackRow["status"]) ??
          (progress.status === "not_started" ? "in_progress" : progress.status),
      });
    });
  }

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
    if (!tasksComplete) {
      alert("Tick off all the test tasks before completing this module.");
      return;
    }
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
      className={`rounded-xl border-2 transition-all ${
        locked
          ? "border-slate-200 bg-slate-50/60 opacity-75"
          : `${statusCfg.border} ${statusCfg.bg}`
      }`}
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
          {/* Status badge — or a Locked chip when no project exists yet */}
          {locked ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-500">
              <Lock className="h-3 w-3" />
              Locked
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${statusCfg.dot}`} />
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCfg.badge}`}
              >
                {statusCfg.label}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Test tasks — interactive checklist; all must be ticked to complete */}
      <div className="px-5 py-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Test tasks
          </p>
          <span
            className={`text-xs font-medium ${
              tasksComplete ? "text-green-600" : "text-muted-foreground"
            }`}
          >
            {doneTasks.length}/{tasks.length} done
          </span>
        </div>
        <ul className="space-y-0.5">
          {tasks.map((task, i) => {
            const checked = doneTasks.includes(i);
            return (
              <li key={i}>
                <button
                  type="button"
                  disabled={locked || isPending}
                  onClick={() => handleToggleTask(i)}
                  aria-pressed={checked}
                  className="flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  {checked ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                  )}
                  <span
                    className={
                      checked
                        ? "text-slate-400 line-through"
                        : "text-foreground"
                    }
                  >
                    {task}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {!locked && (
          <Link
            href={mod.href}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Open {mod.name.replace("MMC ", "")} to do these
          </Link>
        )}
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
              {!tasksComplete && (
                <p className="text-xs text-amber-700">
                  Tick off all {tasks.length} test tasks above to complete this
                  module ({doneTasks.length}/{tasks.length} done).
                </p>
              )}
              <button
                onClick={handleSubmitFeedback}
                disabled={isPending || !canSubmit}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Complete Module
              </button>
            </div>
          </div>
        )}

      {/* Actions */}
      <div className="px-5 pb-5 flex gap-2">
        {locked && (
          <Link
            href="/projects"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-200 transition-colors"
          >
            <Lock className="h-4 w-4" />
            Create a project to unlock
          </Link>
        )}

        {!locked && progress.status === "not_started" && (
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
  hasProjects,
}: {
  initialProgress: BetaFeedbackRow[];
  hasProjects: boolean;
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

      {/* Entry-path clarifier (#15) — testers were unsure whether to start from a
          project or from here, and whether work done elsewhere "counted". Make it
          explicit: start anywhere, progress auto-tracks regardless of entry path. */}
      <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-4 text-sm">
        <p className="font-medium">How beta testing works</p>
        <p className="mt-1 text-muted-foreground">
          Work through the modules below, or open any module straight from the
          sidebar — it&rsquo;s the same product either way. Each task here ticks
          off <strong>automatically</strong> as you actually do it (run a check,
          generate a 3D model, register a business…), no matter where you started.
          When you&rsquo;ve finished a module, add a rating and comment to mark it
          complete.
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
              title: "Work the Tasks",
              desc: "Open the module and tick off each test task as you complete it",
            },
            {
              step: 3,
              title: "Review & Complete",
              desc: "Rate the module and leave a comment — it completes only when every task is ticked",
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

      {/* Project gate — testers need a project before any module does
          anything (every module runs inside a project). Lead with a single
          Projects CTA, but still show the module test-cards below in a locked
          (greyed) state so testers can see what's coming; the cards unlock the
          moment a project exists, mirroring the main dashboard. */}
      {!hasProjects && (
        <div className="rounded-xl border bg-gradient-to-br from-teal-50 to-blue-50 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 p-3">
                <FolderKanban className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Create a project to start testing
                </h2>
                <p className="mt-0.5 text-sm text-zinc-600">
                  Every module runs inside a project. Create your first one and
                  the module test-cards below unlock.
                </p>
              </div>
            </div>
            <Link
              href="/projects"
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-lg bg-teal-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-teal-700 transition-colors"
            >
              Start Here
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {progress.map((p) => (
          <ModuleCard
            key={p.module_id}
            moduleId={p.module_id}
            progress={p}
            onUpdate={handleUpdate}
            locked={!hasProjects}
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
