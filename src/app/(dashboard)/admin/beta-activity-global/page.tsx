import Link from "next/link";
import { MessageSquarePlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isOperatorEmail } from "@/lib/auth/operator";
import {
  getGlobalBetaActivity,
  type GlobalBetaTesterRow,
  type BetaModuleCell,
  type SignupSource,
} from "./actions";
import { FixTesterButton } from "./fix-tester-button";
import { DummyTesterButton } from "./dummy-tester-button";

/** A tester is "stranded" if their email is unconfirmed or they have no org/profile. */
function needsFix(r: GlobalBetaTesterRow): boolean {
  return !r.emailConfirmedAt || !r.orgName;
}

const MODULES = [
  { id: "comply", label: "Comply" },
  { id: "build", label: "Build" },
  { id: "quote", label: "Quote" },
  { id: "direct", label: "Direct" },
  { id: "train", label: "Train" },
] as const;

export const dynamic = "force-dynamic";

export default async function GlobalBetaActivityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Platform-wide data is operator-only (email allowlist, NOT org role).
  if (!isOperatorEmail(user.email)) redirect("/dashboard");

  const { rows, funnel } = await getGlobalBetaActivity();

  // Active testers = signed in recently (distinct people, not cumulative totals).
  // Computed from each row's last sign-in so it answers "who is actually using it
  // right now?" rather than "how many ever signed in?".
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const activeWithin = (iso: string | null, ms: number) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return !Number.isNaN(t) && now - t <= ms;
  };
  const activeToday = rows.filter((r) => activeWithin(r.lastSignInAt, DAY_MS)).length;
  const activeWeek = rows.filter((r) => activeWithin(r.lastSignInAt, 7 * DAY_MS)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Beta Activity — All Organisations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every account on the platform, across all organisations — including
          people who signed up but never confirmed their email or never signed
          in. Use it to see how far each tester got: confirmed their email,
          signed in, ran a real AI job, and left feedback — across every
          organisation on the platform, not just your own.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <DummyTesterButton />
        <Link
          href="/admin/feedback"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Feedback &amp; Requests
        </Link>
      </div>

      {/* Active testers — who is signing in RIGHT NOW (distinct people, not a
          cumulative total). Answers Karen's "is anyone actually using it?". */}
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Active testers
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard label="Active today (24h)" value={activeToday} accent />
          <StatCard label="Active this week (7d)" value={activeWeek} accent />
          <StatCard label="Total testers" value={rows.length} />
        </div>
      </div>

      {/* Funnel — cumulative: how far testers got overall, all time. */}
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Overall progress (all time)
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Signed up" value={funnel.signedUp} />
          <StatCard label="Confirmed email" value={funnel.confirmedEmail} />
          <StatCard label="Signed in" value={funnel.signedIn} />
          <StatCard label="Ran an AI job" value={funnel.ranSomething} accent />
          <StatCard label="Left feedback" value={funnel.leftFeedback} accent />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No accounts found.
        </p>
      ) : (
        <>
          {/* Desktop: table */}
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Tester</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Confirmed</th>
                  <th className="px-3 py-2 font-medium">Last sign-in</th>
                  <th className="px-3 py-2 font-medium">Signed up</th>
                  {MODULES.map((m) => (
                    <th key={m.id} className="px-3 py-2 text-center font-medium">
                      {m.label}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium">AI runs</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.userId} className="border-b last:border-0 align-top">
                    <td className="px-3 py-3">
                      <div className="font-medium">{r.fullName || "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.email}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {r.orgName || "—"}
                      </div>
                      {needsFix(r) && <FixTesterButton userId={r.userId} />}
                    </td>
                    <td className="px-3 py-3">
                      <SourceBadge source={r.source} />
                    </td>
                    <td className="px-3 py-3">
                      <ConfirmedBadge at={r.emailConfirmedAt} />
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {fmtDateTime(r.lastSignInAt)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {fmtDate(r.signedUpAt)}
                    </td>
                    {MODULES.map((m) => (
                      <td key={m.id} className="px-3 py-3 text-center">
                        <ModuleBadge cell={r.modules[m.id]} />
                      </td>
                    ))}
                    <td className="px-3 py-3 text-right font-medium">
                      {r.totalRuns}
                      <div className="text-[11px] font-normal text-muted-foreground whitespace-nowrap">
                        C{r.runCounts.comply} · B{r.runCounts.build} · Q
                        {r.runCounts.quote}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked cards */}
          <div className="space-y-3 md:hidden">
            {rows.map((r) => (
              <div key={r.userId} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{r.fullName || "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.email}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {r.orgName || "—"}
                    </div>
                  </div>
                  <SourceBadge source={r.source} />
                </div>
                {needsFix(r) && <FixTesterButton userId={r.userId} />}
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Confirmed</dt>
                    <dd>
                      <ConfirmedBadge at={r.emailConfirmedAt} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Last sign-in</dt>
                    <dd>{fmtDateTime(r.lastSignInAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Signed up</dt>
                    <dd>{fmtDate(r.signedUpAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">AI runs</dt>
                    <dd>
                      {r.totalRuns} (C{r.runCounts.comply} · B{r.runCounts.build}{" "}
                      · Q{r.runCounts.quote})
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {MODULES.map((m) => (
                    <span
                      key={m.id}
                      className="inline-flex items-center gap-1 text-xs"
                    >
                      <span className="text-muted-foreground">{m.label}:</span>
                      <ModuleBadge cell={r.modules[m.id]} />
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <FeedbackList rows={rows} />
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`mt-1 text-2xl font-bold ${accent ? "text-emerald-600" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: SignupSource }) {
  const map: Record<SignupSource, { label: string; cls: string }> = {
    operator: { label: "Operator", cls: "bg-slate-100 text-slate-700" },
    invited: { label: "Invited", cls: "bg-blue-100 text-blue-800" },
    self_signup: { label: "Self sign-up", cls: "bg-purple-100 text-purple-800" },
    unknown: { label: "—", cls: "bg-muted text-muted-foreground" },
  };
  const { label, cls } = map[source];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

function ConfirmedBadge({ at }: { at: string | null }) {
  if (at) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
        Yes
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
      No
    </span>
  );
}

function ModuleBadge({ cell }: { cell: BetaModuleCell }) {
  if (cell.status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
        Done{cell.rating != null ? ` · ${cell.rating}★` : ""}
      </span>
    );
  }
  if (cell.status === "in_progress") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
        In progress
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}

function FeedbackList({ rows }: { rows: GlobalBetaTesterRow[] }) {
  const items = rows.flatMap((r) =>
    MODULES.flatMap((m) => {
      const cell = r.modules[m.id];
      if (!cell.feedback) return [];
      return [
        {
          key: `${r.userId}-${m.id}`,
          who: r.fullName || r.email || "Unknown",
          module: m.label,
          rating: cell.rating,
          feedback: cell.feedback,
          when: cell.completedAt,
        },
      ];
    })
  );

  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Written feedback (all organisations)
      </h2>
      <div className="space-y-3">
        {items.map((it) => (
          <div key={it.key} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{it.who}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                {it.module}
              </span>
              {it.rating != null && (
                <span className="text-xs text-muted-foreground">
                  {it.rating}★
                </span>
              )}
              {it.when && (
                <span className="text-xs text-muted-foreground">
                  {fmtDate(it.when)}
                </span>
              )}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {it.feedback}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Day + time, for sign-ins — so operators can see WHEN a tester last logged in,
 * not just the date. Rendered in the operator's local timezone. */
function fmtDateTime(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
