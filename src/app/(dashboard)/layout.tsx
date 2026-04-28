import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/db";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ChatWidget } from "@/components/shared/chat-widget";

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

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, role, org_id")
    .eq("user_id", user.id)
    .single();

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

  // Get current month usage
  let runCount = 0;
  const monthYear = new Date().toISOString().slice(0, 7); // "2026-04"
  const { data: usage } = await admin
    .from("usage_limits")
    .select("run_count")
    .eq("user_id", user.id)
    .eq("month_year", monthYear)
    .single();
  if (usage?.run_count) runCount = usage.run_count;

  return (
    <>
      <DashboardShell
        tier={tier}
        runCount={runCount}
        fullName={profile?.full_name ?? null}
        role={profile?.role ?? null}
        orgName={orgName}
      >
        {children}
      </DashboardShell>
      <ChatWidget />
    </>
  );
}
