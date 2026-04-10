import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getTestResults } from "./actions";
import { TestRegimeBoard } from "@/components/admin/test-regime-board";

export default async function TestRegimePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("user_id", user.id)
    .single();

  if (!profile || (profile.role !== "owner" && profile.role !== "admin")) {
    redirect("/dashboard");
  }

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
        testerName={profile.full_name || "Unknown"}
      />
    </div>
  );
}
