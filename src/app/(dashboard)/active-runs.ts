"use server";

import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/db";

export interface ActiveRun {
  kind: "comply" | "quote" | "optimisation";
  label: string;
  projectName: string;
  href: string;
  startedAt: string;
}

const SOURCES: {
  kind: ActiveRun["kind"];
  table: string;
  label: string;
  href: (projectId: string) => string;
}[] = [
  { kind: "comply", table: "compliance_checks", label: "Comply check", href: (p) => `/comply/${p}` },
  { kind: "quote", table: "cost_estimates", label: "Cost estimate", href: (p) => `/quote/${p}` },
  { kind: "optimisation", table: "design_checks", label: "Design optimisation", href: (p) => `/build/${p}` },
];

/**
 * The user's org's currently-running long jobs (Comply / Quote / Build
 * optimisation), so a persistent chip in the chrome lets them wander the app
 * and jump back to a run instead of losing it. Only RECENT in-flight rows
 * (last 20 min) so a stale ghost (pre-reaper) doesn't show forever.
 */
export async function getActiveRuns(): Promise<ActiveRun[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();
  if (!profile?.org_id) return [];

  const cutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const runs: ActiveRun[] = [];

  for (const src of SOURCES) {
    const { data } = await db()
      .from(src.table)
      .select("project_id, created_at")
      .eq("org_id", profile.org_id)
      .in("status", ["queued", "processing"])
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false });

    const rows = (data as { project_id: string; created_at: string }[] | null) ?? [];
    for (const r of rows) {
      const { data: proj } = await db()
        .from("projects")
        .select("name")
        .eq("id", r.project_id)
        .single();
      runs.push({
        kind: src.kind,
        label: src.label,
        projectName: (proj as { name?: string } | null)?.name ?? "your project",
        href: src.href(r.project_id),
        startedAt: r.created_at,
      });
    }
  }

  runs.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  return runs;
}
