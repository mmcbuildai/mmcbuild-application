import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSubscriptionStatus } from "@/lib/stripe/subscription";
import { DashboardShell } from "./dashboard-shell";
import { redirect } from "next/navigation";
import { isBetaTestingEnabled } from "@/lib/beta/enabled";
import { isOperatorEmail } from "@/lib/auth/operator";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

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
          className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          Reload
        </a>
      </div>
    );
  }

  // Beta testers live in the Beta Testing area, not the generic dashboard.
  // Routing here (not just in the auth callback) catches every entry path —
  // invite link, magic link, or a direct visit — so a beta tester always lands
  // on /beta.
  // role enum includes 'beta' on live; generated types lag, so compare as string.
  // Only route to /beta while the beta module is enabled — otherwise a beta-role
  // user would bounce /dashboard → /beta → /dashboard (SCRUM-351: /beta redirects
  // back here when hidden). Hidden → beta users just use the normal dashboard.
  if ((profile.role as string) === "beta" && isBetaTestingEnabled()) {
    redirect("/beta");
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

  // Platform operator = EMAIL allowlist, never org role. This read
  //
  //     ["owner", "admin"].includes(profile.role)
  //
  // which is true for EVERY user who has ever signed up, because a self-signup
  // is made the owner of their own personal org — lib/auth/operator.ts opens by
  // saying exactly that. So every customer saw an "Admin View" toggle and a
  // menu of platform administration. Karen reported it from a brand-new account
  // on 5 August; c8e6b03 fixed the /admin/* pages it linked to, but the toggle
  // that advertised them was never touched.
  //
  // The destination pages are org-scoped or already operator-gated, so nothing
  // leaked — but a customer should not be shown a door, least of all one that
  // bounces them back to /dashboard. Named isOperator, not isAdmin, because the
  // word "admin" meaning two different things is what caused this.
  const isOperator = isOperatorEmail(user.email);

  return (
    <DashboardShell
      status={status}
      isOperator={isOperator}
      hasProjects={projectCount > 0}
    />
  );
}
