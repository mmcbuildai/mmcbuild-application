import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/db";
import { getBetaProgress } from "@/app/(dashboard)/beta/actions";
import { BetaTaskChecklist } from "./beta-task-checklist";
import { isBetaTestingEnabled } from "@/lib/beta/enabled";
import type { ModuleId } from "@/lib/stripe/plans";

/**
 * Server wrapper that renders the in-context beta checklist ONLY for beta-role
 * testers, on the module they're looking at. Calling getBetaProgress() here also
 * auto-ticks the "ran the module" task if a real run has been recorded, so the
 * checklist is up to date the moment the tester lands on the page. It is
 * deliberately fail-safe: any error returns null rather than breaking a
 * (REGULATED) module page over a testing helper.
 */
export async function BetaTaskPanel({ moduleId }: { moduleId: ModuleId }) {
  // Hidden for Go Live (SCRUM-351) — the whole beta-testing module is gated off
  // by one env flag. Off → render nothing on every module page.
  if (!isBetaTestingEnabled()) return null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await db()
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();
    if ((profile?.role as string) !== "beta") return null;

    const progress = await getBetaProgress();
    const row = progress.find((p) => p.module_id === moduleId);
    if (!row) return null;

    return <BetaTaskChecklist moduleId={moduleId} initial={row} />;
  } catch {
    return null;
  }
}
