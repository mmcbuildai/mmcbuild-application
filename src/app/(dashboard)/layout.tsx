import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/db";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { HelpChat } from "@/components/help-chat/help-chat";
import { TermsGate } from "@/components/legal/terms-gate";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Use db() for columns not yet in generated types (subscription_tier)
  const admin = db();
  const monthYear = new Date().toISOString().slice(0, 7);

  // Profile and current-month usage are independent — fetch in parallel.
  const [profileRes, usageRes] = await Promise.all([
    admin
      .from("profiles")
      .select("full_name, role, org_id")
      .eq("user_id", user.id)
      .single(),
    admin
      .from("usage_limits")
      .select("run_count")
      .eq("user_id", user.id)
      .eq("month_year", monthYear)
      .single(),
  ]);

  const profile = profileRes.data;
  const runCount = usageRes.data?.run_count ?? 0;

  // T&C gate (SCRUM-281). Read terms acceptance defensively: if the
  // terms_accepted_at column isn't present yet (migration 00060 not applied),
  // the query returns an error and we fail OPEN (no gate) rather than break the
  // app. Once the column exists, a null value means the user must accept.
  let needsTerms = false;
  if (user) {
    const { data: termsRow, error: termsErr } = await admin
      .from("profiles")
      .select("terms_accepted_at")
      .eq("user_id", user.id)
      .single();
    if (!termsErr && termsRow) {
      needsTerms = (termsRow as { terms_accepted_at: string | null }).terms_accepted_at == null;
    }
  }

  let orgName = "Organisation";
  let tier: string | null = "trial";
  if (profile?.org_id) {
    const { data: org } = await admin
      .from("organisations")
      .select("name, subscription_tier")
      .eq("id", profile.org_id)
      .single();
    if (org?.name) orgName = org.name;
    if (org?.subscription_tier) tier = org.subscription_tier;
  }

  return (
    <DashboardShell
      tier={tier}
      runCount={runCount}
      fullName={profile?.full_name ?? null}
      role={profile?.role ?? null}
      orgName={orgName}
    >
      {children}
      <HelpChat />
      <TermsGate needsTerms={needsTerms} />
    </DashboardShell>
  );
}
