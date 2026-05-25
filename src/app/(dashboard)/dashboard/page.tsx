import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSubscriptionStatus } from "@/lib/stripe/subscription";
import { DashboardShell } from "./dashboard-shell";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    // A signed-in user whose profile row hasn't provisioned yet must never see
    // a blank page (the old `return null` rendered an empty white panel).
    return (
      <div className="mx-auto max-w-md py-20 text-center space-y-4">
        <h1 className="text-2xl font-bold">Welcome to MMC Build</h1>
        <p className="text-muted-foreground">
          We&apos;re finishing setting up your workspace. If this doesn&apos;t
          update in a moment, reload the page — or contact us at
          info@mmcbuild.com.au and we&apos;ll sort it right away.
        </p>
        <a
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
        >
          Reload
        </a>
      </div>
    );
  }

  const [status, projectCount] = await Promise.all([
    getSubscriptionStatus(profile.org_id),
    (async () => {
      const admin = createAdminClient();
      const { count } = await admin
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("org_id", profile.org_id);
      return count ?? 0;
    })(),
  ]);

  const isAdmin = ["owner", "admin"].includes(profile.role);

  return (
    <DashboardShell
      status={status}
      isAdmin={isAdmin}
      hasProjects={projectCount > 0}
    />
  );
}
