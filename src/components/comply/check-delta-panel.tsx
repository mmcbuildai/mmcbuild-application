import { CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";
import type { CheckDelta } from "@/lib/comply/check-delta";

// Presentational v1 -> v2 delta panel for a re-check (Comply Phase 3). Rendered
// at the top of the report page when the check has a parent_check_id. Summarises
// how the non-compliant items moved between the prior check and this re-check:
//   Cleared          — flagged before, not anymore
//   Still open        — flagged in both (incl. regressions on resolved items)
//   Newly introduced  — surfaced for the first time by this re-check
//
// Server-rendered; no client interactivity needed.

interface DeltaItem {
  id?: string;
  ncc_section: string;
  category: string;
  title: string;
}

interface CheckDeltaPanelProps {
  version: number;
  delta: CheckDelta<DeltaItem>;
}

export function CheckDeltaPanel({ version, delta }: CheckDeltaPanelProps) {
  const clearedN = delta.cleared.length;
  const stillOpenN = delta.stillOpen.length;
  const newN = delta.newlyIntroduced.length;

  return (
    <section className="rounded-lg border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">
          Re-check v{version}
        </h2>
        <p className="text-sm text-muted-foreground">
          Compared against the previous check. Cleared items no longer appear;
          still-open items persist (a resolved item that reappears here is a
          regression); newly-introduced items were surfaced for the first time
          by this re-check.
        </p>
      </div>

      {/* Counts */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <DeltaStat
          label="Cleared"
          count={clearedN}
          tone="green"
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <DeltaStat
          label="Still open"
          count={stillOpenN}
          tone="amber"
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <DeltaStat
          label="Newly introduced"
          count={newN}
          tone="red"
          icon={<AlertCircle className="h-5 w-5" />}
        />
      </div>

      {/* Lists */}
      <div className="mt-4 space-y-4">
        <DeltaList
          title="Cleared"
          items={delta.cleared}
          emptyHint="Nothing was cleared by this re-check."
          tone="green"
        />
        <DeltaList
          title="Still open"
          items={delta.stillOpen}
          emptyHint="No items carried over — every prior item was cleared."
          tone="amber"
        />
        <DeltaList
          title="Newly introduced"
          items={delta.newlyIntroduced}
          emptyHint="No new items were introduced."
          tone="red"
        />
      </div>
    </section>
  );
}

const TONE_STAT: Record<string, string> = {
  green: "border-green-200 bg-green-50 text-green-900",
  amber: "border-amber-200 bg-amber-50 text-amber-900",
  red: "border-red-200 bg-red-50 text-red-900",
};

function DeltaStat({
  label,
  count,
  tone,
  icon,
}: {
  label: string;
  count: number;
  tone: "green" | "amber" | "red";
  icon: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-md border p-3 ${TONE_STAT[tone]}`}
    >
      <span className="shrink-0">{icon}</span>
      <div>
        <p className="text-2xl font-bold leading-none">{count}</p>
        <p className="text-sm font-medium">{label}</p>
      </div>
    </div>
  );
}

const TONE_DOT: Record<string, string> = {
  green: "bg-green-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

function DeltaList({
  title,
  items,
  emptyHint,
  tone,
}: {
  title: string;
  items: DeltaItem[];
  emptyHint: string;
  tone: "green" | "amber" | "red";
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold">
        {title}{" "}
        <span className="font-normal text-muted-foreground">
          ({items.length})
        </span>
      </h3>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">{emptyHint}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((f, i) => (
            <li
              key={f.id ?? `${f.ncc_section}-${f.category}-${i}`}
              className="flex items-start gap-2 text-sm"
            >
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE_DOT[tone]}`}
              />
              <span>
                <span className="font-mono text-xs text-muted-foreground">
                  {f.ncc_section}
                </span>{" "}
                <span className="font-medium">{f.title}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
