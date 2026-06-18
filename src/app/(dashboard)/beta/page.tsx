import { getBetaProgress } from "./actions";
import { BetaDashboard } from "./beta-dashboard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function BetaPage() {
  const progress = await getBetaProgress();

  // Gate the module test-cards behind THIS tester having created their own
  // project. Counting org projects was wrong for the beta: every tester is
  // provisioned into the shared MMC Build org, which already has the operator's
  // projects — so the gate never engaged and testers saw unlocked modules
  // pointing at someone else's project. Count projects created_by this user's
  // profile so each tester gets the "create a project first" onboarding.
  // (projects.created_by = profiles.id — the profile PK, not the auth user id.)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let hasProjects = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (profile?.id) {
      const admin = createAdminClient();
      const { count } = await admin
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("created_by", profile.id);
      hasProjects = (count ?? 0) > 0;
    }
  }

  return <BetaDashboard initialProgress={progress} hasProjects={hasProjects} />;
}
