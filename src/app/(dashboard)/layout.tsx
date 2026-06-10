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
  // Baked-in operator allowlist so the exemption works on deploy without a
  // separate env step; ADMIN_EMAILS (comma-separated) extends it for any
  // additional operators added later.
  const DEFAULT_OPERATOR_EMAILS = [
    "dennis@corporateaisolutions.com",
    "karen.engel@mmcbuild.com.au",
    "karthik.rao@mmcbuild.com.au",
  ];
  const operatorEmails = [
    ...DEFAULT_OPERATOR_EMAILS,
    ...(process.env.ADMIN_EMAILS ?? "").split(","),
  ]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isOperator =
    !!user.email && operatorEmails.includes(user.email.toLowerCase());

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
