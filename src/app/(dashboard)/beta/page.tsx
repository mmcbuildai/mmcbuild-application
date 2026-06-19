import { getBetaProgress } from "./actions";
import { BetaDashboard } from "./beta-dashboard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function BetaPage() {
  const progress = await getBetaProgress();

  // Step-1 gate: the module test-cards stay locked until THIS tester has created
  // their own project (created_by = their profile). Creating a project is the
  // intended first step — the tester uploads their own plan or picks a sample
  // design to test against, then the modules unlock. The locked state is made
  // explicit in the UI ("Start by creating a project...") so it doesn't read as
  // a broken checklist. (projects.created_by = profiles.id, the profile PK.)
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
