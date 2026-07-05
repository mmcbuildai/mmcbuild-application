"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONSTRUCTION_SYSTEMS } from "./system-selection-panel";
import { updateSelectedSystems } from "@/app/(dashboard)/build/actions";

/**
 * System selection, integrated into the 3D preview ("explore → choose").
 *
 * Replaces the standalone Construction Systems checkbox panel: after the user
 * has seen their design across the systems, they tick the one(s) to optimise
 * here. Persists to projects.selected_systems (the same field), which gates
 * Design Optimisation (at least one system is required) and flows into Comply /
 * Quote / Train. Coming-soon systems can't be newly selected, but a legacy
 * project's previously-saved coming-soon system stays visible and removable.
 */
export function SystemSelectChips({
  projectId,
  initialSystems,
  hasDownstreamReports,
  onSaved,
}: {
  projectId: string;
  initialSystems: string[];
  hasDownstreamReports: boolean;
  // Notified with the persisted systems after a successful save, so a parent
  // (the preview panel) can unlock the inline Run Design Optimisation action
  // from client state without waiting on a server refresh to re-evaluate the
  // gate. (Multi-storey extraction runs for minutes in-place, and relying on a
  // single router.refresh() to unlock a separate server-rendered button left
  // the button dead — Karen, 2026-07-05.)
  onSaved?: (systems: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialSystems),
  );
  const [saved, setSaved] = useState<Set<string>>(new Set(initialSystems));
  const [isPending, startTransition] = useTransition();
  const [showWarning, setShowWarning] = useState(false);
  const router = useRouter();

  const isDirty = !setsEqual(selected, saved);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleSave() {
    if (hasDownstreamReports && isDirty) {
      setShowWarning(true);
      return;
    }
    doSave();
  }

  function doSave() {
    setShowWarning(false);
    startTransition(async () => {
      const result = await updateSelectedSystems(projectId, [...selected]);
      if (!("error" in result)) {
        setSaved(new Set(selected));
        onSaved?.([...selected]);
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-6 border-t pt-4">
      <p className="text-base font-medium text-zinc-900">
        Choose the system(s) to optimise
      </p>
      <p className="mt-0.5 text-sm text-zinc-500">
        Tick the systems you want to take into Design Optimisation. At least one
        is required — there&apos;s nothing to optimise against otherwise. You can
        pick more than one.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {CONSTRUCTION_SYSTEMS.map((sys) => {
          const isSelected = selected.has(sys.key);
          const locked = sys.comingSoon && !isSelected;
          return (
            <button
              key={sys.key}
              type="button"
              onClick={locked ? undefined : () => toggle(sys.key)}
              disabled={locked}
              aria-pressed={isSelected}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
                locked
                  ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400"
                  : isSelected
                    ? "border-teal-600 bg-teal-600 text-white"
                    : "border-gray-300 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {isSelected && <Check className="h-4 w-4 shrink-0" />}
              {sys.label}
              {sys.comingSoon && (
                <span
                  className={`rounded px-1.5 py-0 text-[10px] ${
                    isSelected ? "bg-white/20" : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {isSelected ? "no longer offered" : "coming soon"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selected.size === 0 && (
        <p className="mt-3 text-sm text-amber-700">
          Select at least one system to unlock Design Optimisation.
        </p>
      )}

      {showWarning && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium text-amber-800">
              Downstream reports may need re-running
            </p>
            <p className="mt-1 text-amber-700">
              Changing systems may affect Comply, Quote, and Build analyses.
              Existing reports won&apos;t update automatically.
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowWarning(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700"
                onClick={doSave}
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : null}
                Save Anyway
              </Button>
            </div>
          </div>
        </div>
      )}

      {!showWarning && isDirty && (
        <Button
          size="sm"
          className="mt-3 bg-teal-600 hover:bg-teal-700"
          onClick={handleSave}
          disabled={isPending}
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            "Save selection"
          )}
        </Button>
      )}
    </div>
  );
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}
