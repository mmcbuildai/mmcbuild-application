"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getActiveRuns, type ActiveRun } from "@/app/(dashboard)/active-runs";

/**
 * Persistent chip in the chrome showing the org's running long jobs (Comply /
 * Quote / Build optimisation). Lets a user move anywhere in the app while a run
 * is going and jump straight back to it — so "you can go do something else"
 * never costs a restart (Karen/Dennis, 2026-06-27). Lives in the header, which
 * doesn't unmount on navigation, so the poll survives route changes. Hidden when
 * nothing is running.
 */
export function RunningJobsChip() {
  const router = useRouter();
  const [runs, setRuns] = useState<ActiveRun[]>([]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const active = await getActiveRuns();
        if (!cancelled) setRuns(active);
      } catch {
        // best-effort — a transient read failure just keeps the last state
      }
      // Poll faster while something is running, slower when idle.
      if (!cancelled) {
        timer = setTimeout(tick, runs.length > 0 ? 8000 : 20000);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (runs.length === 0) return null;

  const top = runs[0];
  const label =
    runs.length === 1
      ? `${top.label} running — ${top.projectName}`
      : `${runs.length} runs in progress`;

  return (
    <button
      type="button"
      onClick={() => router.push(top.href)}
      title={`${label} — click to jump back`}
      className="hidden items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-100 sm:inline-flex"
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span className="max-w-[200px] truncate">{label}</span>
    </button>
  );
}
