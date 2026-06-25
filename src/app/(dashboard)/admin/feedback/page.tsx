import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { db } from "@/lib/supabase/db";
import { redirect } from "next/navigation";
import { isOperatorEmail } from "@/lib/auth/operator";
import { MessageSquarePlus, GraduationCap } from "lucide-react";

export const dynamic = "force-dynamic";

interface FeedbackRow {
  id: string;
  user_id: string;
  org_id: string | null;
  page_url: string | null;
  page_path: string | null;
  message: string;
  status: string;
  created_at: string;
}

/**
 * Operator view of per-page beta feedback + course requests (issues #4/#5/#12).
 * Reads beta_page_feedback (service role bypasses the owner-only RLS) so the
 * operator can see everything users have asked for and prioritise it.
 */
export default async function FeedbackDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isOperatorEmail(user.email)) redirect("/dashboard");

  const admin = createAdminClient();
  // beta_page_feedback isn't in the generated types — use the untyped db() helper.
  const { data } = await db()
    .from("beta_page_feedback")
    .select("id, user_id, org_id, page_url, page_path, message, status, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = (data ?? []) as unknown as FeedbackRow[];

  // Resolve user emails/names for display.
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: profs } = userIds.length
    ? await admin
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds)
    : { data: [] as { user_id: string; full_name: string | null; email: string | null }[] };
  const byUser = new Map(
    ((profs ?? []) as { user_id: string; full_name: string | null; email: string | null }[]).map(
      (p) => [p.user_id, p],
    ),
  );

  const isCourse = (m: string) => m.startsWith("[Course request]");
  const courseRequests = rows.filter((r) => isCourse(r.message));
  const pageFeedback = rows.filter((r) => !isCourse(r.message));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Feedback &amp; Requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What beta testers have told us — page feedback and course requests,
          newest first. Use it to prioritise what users are actually asking for.
          Each entry is tagged with the page it came from and the user.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <StatCard label="Course requests" value={courseRequests.length} icon={<GraduationCap className="h-4 w-4" />} />
        <StatCard label="Page feedback" value={pageFeedback.length} icon={<MessageSquarePlus className="h-4 w-4" />} />
      </div>

      <Section
        title="Course requests"
        empty="No course requests yet."
        rows={courseRequests}
        byUser={byUser}
        stripPrefix
      />
      <Section
        title="Page feedback"
        empty="No page feedback yet."
        rows={pageFeedback}
        byUser={byUser}
      />
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function Section({
  title,
  empty,
  rows,
  byUser,
  stripPrefix = false,
}: {
  title: string;
  empty: string;
  rows: FeedbackRow[];
  byUser: Map<string, { full_name: string | null; email: string | null }>;
  stripPrefix?: boolean;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const u = byUser.get(r.user_id);
            const msg = stripPrefix
              ? r.message.replace(/^\[Course request\]\s*/, "")
              : r.message;
            return (
              <div key={r.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {u?.full_name || u?.email || "Unknown user"}
                  </span>
                  {u?.email && u.full_name && <span>· {u.email}</span>}
                  {r.page_path && (
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                      {r.page_path}
                    </span>
                  )}
                  <span>· {fmt(r.created_at)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{msg}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
