import { getBetaProgress } from "./actions";
import { BetaDashboard } from "./beta-dashboard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function BetaPage() {
  const progress = await getBetaProgress();

  // Gate the module test-cards behind having a project: testers were dropped
  // straight onto five module cards with nothing to test them against. Count
  // the org's projects so the dashboard can lead with "create a project first".
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let hasProjects = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("user_id", user.id)
      .single();
    if (profile?.org_id) {
      const admin = createAdminClient();
      const { count } = await admin
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("org_id", profile.org_id);
      hasProjects = (count ?? 0) > 0;
    }
  }

  return <BetaDashboard initialProgress={progress} hasProjects={hasProjects} />;
}
