"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  FlaskConical,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from "lucide-react";
import { toggleTask, type BetaFeedbackRow } from "@/app/(dashboard)/beta/actions";
import { TESTING_TASKS, allTasksDone } from "@/lib/beta/testing-tasks";
import { MODULES, type ModuleId } from "@/lib/stripe/plans";

/**
 * In-context beta task checklist, shown at the top of a module page so a tester
 * sees exactly what to do on THIS module without going back to /beta. It shares
 * the same toggleTask action and beta_feedback.completed_tasks as the beta
 * dashboard, so ticks made here and there stay in sync (and the "ran the module"
 * task auto-ticks once a real run is recorded). Final completion — rating +
 * comment — still happens on /beta, which this links to.
 */
export function BetaTaskChecklist({
  moduleId,
  initial,
}: {
  moduleId: ModuleId;
  initial: BetaFeedbackRow;
}) {
  const tasks = TESTING_TASKS[moduleId];
  const mod = MODULES[moduleId];
  const [done, setDone] = useState<number[]>(initial.completed_tasks ?? []);
  const [open, setOpen] = useState(true);
  const [isPending, startTransition] = useTransition();

  const complete = allTasksDone(moduleId, done);

  function toggle(index: number) {
    const optimistic = done.includes(index)
      ? done.filter((i) => i !== index)
      : [...done, index].sort((a, b) => a - b);
    const previous = done;
    setDone(optimistic);
    startTransition(async () => {
      const res = await toggleTask(moduleId, index);
      if (res.error) {
        setDone(previous);
        return;
      }
      setDone(res.completed_tasks ?? optimistic);
    });
  }

  return (
    <div className="rounded-xl border-2 border-brand-200 bg-brand-50/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="inline-flex rounded-lg bg-brand-600 p-2">
          <FlaskConical className="h-4 w-4 text-white" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-brand-900">
            Beta testing: {mod.name}
          </span>
          <span className="block text-xs text-brand-700">
            {complete
              ? "All tasks done — finish with a rating on the Beta page."
              : "Tick off these tasks as you go. They sync with your Beta page."}
          </span>
        </span>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            complete
              ? "bg-green-100 text-green-700"
              : "bg-brand-100 text-brand-800"
          }`}
        >
          {done.length}/{tasks.length} done
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-brand-700" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-brand-700" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4">
          <ul className="space-y-0.5">
            {tasks.map((task, i) => {
              const checked = done.includes(i);
              return (
                <li key={i}>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => toggle(i)}
                    aria-pressed={checked}
                    className="flex min-h-[44px] w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-brand-100/50 disabled:cursor-not-allowed sm:min-h-0"
                  >
                    {checked ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                    ) : (
                      <Circle className="h-5 w-5 shrink-0 text-brand-300" />
                    )}
                    <span
                      className={
                        checked
                          ? "text-brand-400 line-through"
                          : "text-brand-900"
                      }
                    >
                      {task}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <Link
            href="/beta"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
          >
            {complete ? "Finish on the Beta page" : "View all beta tasks"}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}
