import { getBetaProgress } from "./actions";
import { BetaDashboard } from "./beta-dashboard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function BetaPage() {
  const progress = await getBetaProgress();

  // Unlock the module test-cards as soon as there's a project in the tester's
  // ORG to test against. (We briefly gated on the tester's OWN project, but in
  // the shared MMC Build beta org most testers test against existing projects
  // rather than creating their own — that locked the modules, which also
  // disables the per-task checkboxes, so testers couldn't record tasks or
  // complete a module. Org-scoped lock unblocks them immediately. The /projects
  // list stays scoped to each tester's own projects for tidiness.)
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
