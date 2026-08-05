import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isOperatorEmail } from "@/lib/auth/operator";
import { getTestResults } from "./actions";
import { TestRegimeBoard } from "@/components/admin/test-regime-board";

export default async function TestRegimePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Was `role !== "owner" && role !== "admin"`, which let EVERY signed-up user
  // in: a self-signup is made the owner of their own personal org, so that
  // check passes for everybody. Every QA ticket publishes this page's URL, so
  // it was not obscure — a tester with a brand-new account reached it.
  // Operator identity is an email allowlist, never an org role.
  if (!isOperatorEmail(user.email)) redirect("/dashboard");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("user_id", user.id)
    .single();

  const results = await getTestResults();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Test Regime v1.0</h1>
        <p className="text-muted-foreground">
          Manual test execution checklist for beta sign-off. Mark each test as passed or failed with evidence.
        </p>
      </div>
      <TestRegimeBoard
        results={results}
        testerName={profile?.full_name || "Unknown"}
      />
    </div>
  );
}
