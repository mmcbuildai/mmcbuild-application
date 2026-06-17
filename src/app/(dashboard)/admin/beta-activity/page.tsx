import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getBetaActivity, type BetaTesterRow, type BetaModuleCell } from "./actions";

const MODULES = [
  { id: "comply", label: "Comply" },
  { id: "build", label: "Build" },
  { id: "quote", label: "Quote" },
  { id: "direct", label: "Direct" },
  { id: "train", label: "Train" },
] as const;

export const dynamic = "force-dynamic";

export default async function BetaActivityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (!profile || (profile.role !== "owner" && profile.role !== "admin")) {
    redirect("/dashboard");
  }

  const { orgName, rows } = await getBetaActivity();

  const activeCount = rows.filter((r) => r.hasBetaActivity || r.totalRuns > 0).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Beta Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Who in {orgName} has used the beta testing functions: when each person
          last signed in, which modules they marked as tested (with their rating
          and written feedback), and how many real AI runs they actually fired.
          Use it to see whether testers are genuinely exercising the product.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="People in org" value={rows.length} />
        <StatCard label="Active testers" value={activeCount} />
        <StatCard
          label="Total AI runs"
          value={rows.reduce((s, r) => s + r.totalRuns, 0)}
        />
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No people found in this organisation yet.
        </p>
      ) : (
        <>
          {/* Desktop: table */}
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Tester</th>
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
                      {r.role && (
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {r.role}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">{fmtDate(r.lastSignInAt)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{fmtDate(r.signedUpAt)}</td>
                    {MODULES.map((m) => (
                      <td key={m.id} className="px-3 py-3 text-center">
                        <ModuleBadge cell={r.modules[m.id]} />
                      </td>
                    ))}
                    <td className="px-3 py-3 text-right font-medium">
                      {r.totalRuns}
                      <div className="text-[11px] font-normal text-muted-foreground whitespace-nowrap">
                        C{r.runCounts.comply} · B{r.runCounts.build} · Q{r.runCounts.quote}
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
                <div className="font-medium">{r.fullName || "—"}</div>
                <div className="text-xs text-muted-foreground">{r.email}</div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Last sign-in</dt>
                    <dd>{fmtDate(r.lastSignInAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">AI runs</dt>
                    <dd>
                      {r.totalRuns} (C{r.runCounts.comply} · B{r.runCounts.build} · Q
                      {r.runCounts.quote})
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {MODULES.map((m) => (
                    <span key={m.id} className="inline-flex items-center gap-1 text-xs">
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

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
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

function FeedbackList({ rows }: { rows: BetaTesterRow[] }) {
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
        Written feedback
      </h2>
      <div className="space-y-3">
        {items.map((it) => (
          <div key={it.key} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{it.who}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{it.module}</span>
              {it.rating != null && (
                <span className="text-xs text-muted-foreground">{it.rating}★</span>
              )}
              {it.when && (
                <span className="text-xs text-muted-foreground">{fmtDate(it.when)}</span>
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
