import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { HelpChat } from "@/components/help-chat/help-chat";
import { TermsGate } from "@/components/legal/terms-gate";
import { isOperatorEmail } from "@/lib/auth/operator";
import { provisionUser } from "@/lib/auth/provision";

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

  let profile = profileRes.data;
  const runCount = usageRes.data?.run_count ?? 0;

  // Safety net: an authenticated user with NO profile is a stranded account —
  // their email confirmation was consumed by a mail scanner (or otherwise never
  // ran provisioning). Repair it on the spot so they aren't dead-ended. This is
  // the same idempotent path the auth callback uses; it joins a pending-invite
  // org when one exists, else creates a personal org.
  if (!profile && user.email) {
    await provisionUser(createAdminClient(), {
      id: user.id,
      email: user.email,
      fullName: (user.user_metadata?.full_name as string | undefined) ?? null,
      orgNameFallback:
        (user.user_metadata?.org_name as string | undefined) ?? null,
    });
    const repaired = await admin
      .from("profiles")
      .select("full_name, role, org_id")
      .eq("user_id", user.id)
      .single();
    profile = repaired.data;
  }

  // T&C gate (SCRUM-281). Protects against the PUBLIC — general users, invitees,
  // and suppliers who sign up — NOT our own operators. Platform operators (our
  // staff, listed in ADMIN_EMAILS) are exempt; everyone else accepts once.
  //
  // NOTE: org role (owner/admin) is deliberately NOT the exemption signal — a
  // supplier who self-signs-up becomes the OWNER of their own org, and they are
  // exactly who the gate must cover. Operator identity is an email allowlist.
  //
  // Read terms acceptance defensively: if the terms_accepted_at column isn't
  // present yet (migration 00060 not applied) the query errors and we fail OPEN
  // (no gate). Once the column exists, a null value means the user must accept.
  // Operator identity is an email allowlist (shared with the global beta-activity
  // view): see @/lib/auth/operator. ADMIN_EMAILS extends the baked-in defaults.
  const isOperator = isOperatorEmail(user.email);

  let needsTerms = false;
  if (!isOperator) {
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
