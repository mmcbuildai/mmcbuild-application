"use server";

import { db } from "@/lib/supabase/db";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Test catalog for the v1.0 regime. Persona-based flows were removed in
// favour of behavioural beta observation, so the original onboarding /
// access-control suite has been collapsed.
const TEST_CASES = [
  { tcId: "TC-ONB-001", title: "Authenticated user lands on dashboard with all modules visible", section: "Onboarding" },
  { tcId: "TC-COMPLY-001", title: "Upload valid PDF plan — analysis runs — report generated", section: "MMC Comply" },
  { tcId: "TC-COMPLY-002", title: "Upload invalid file type — error message shown", section: "MMC Comply" },
  { tcId: "TC-COMPLY-003", title: "Run limit enforcement at 10 runs (Trial tier)", section: "MMC Comply" },
  { tcId: "TC-COMPLY-004", title: "NCC citations present in output report", section: "MMC Comply" },
  { tcId: "TC-COMPLY-005", title: "Export compliance report as PDF", section: "MMC Comply" },
  { tcId: "TC-BUILD-001", title: "Upload plan — material suggestions generated", section: "MMC Build" },
  { tcId: "TC-BUILD-002", title: "Material selection persists to project record", section: "MMC Build" },
  { tcId: "TC-BUILD-003", title: "No project exists — redirected to project creation", section: "MMC Build" },
  { tcId: "TC-BUILD-004", title: "Cross-module plan sharing", section: "MMC Build" },
  { tcId: "TC-QUOTE-001", title: "Quote generated from selected materials", section: "MMC Quote" },
  { tcId: "TC-QUOTE-002", title: "Quote export as PDF", section: "MMC Quote" },
  { tcId: "TC-QUOTE-003", title: "Quote PDF export contains full cost comparison", section: "MMC Quote" },
  { tcId: "TC-QUOTE-004", title: "Custom cost rate overrides reflected in quote output", section: "MMC Quote" },
  { tcId: "TC-DIRECT-001", title: "Directory search by state and category returns results", section: "MMC Direct" },
  { tcId: "TC-DIRECT-002", title: "Filter by certification status works correctly", section: "MMC Direct" },
  { tcId: "TC-DIRECT-003", title: "Company profile displays all required fields", section: "MMC Direct" },
  { tcId: "TC-TRAIN-001", title: "Training module loads and progress is tracked", section: "MMC Train" },
  { tcId: "TC-TRAIN-002", title: "Quiz completion triggers certificate generation", section: "MMC Train" },
  { tcId: "TC-TRAIN-003", title: "Dashboard shows completion percentage per module", section: "MMC Train" },
  { tcId: "TC-BILL-001", title: "Trial user sees run limit progress bar", section: "Billing" },
  { tcId: "TC-BILL-002", title: "Upgrade prompt shown when run limit reached", section: "Billing" },
  { tcId: "TC-BILL-003", title: "Stripe test mode payment completes successfully", section: "Billing" },
  { tcId: "TC-ACCESS-001", title: "All authenticated users see all five modules", section: "Access Control" },
  { tcId: "TC-ACCESS-002", title: "Unauthenticated user is redirected to /login", section: "Access Control" },
];

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile || (profile.role !== "owner" && profile.role !== "admin")) {
    throw new Error("Not authorised");
  }

  return { ...profile, userId: user.id };
}

interface TestResultRow {
  id: string | null;
  tc_id: string;
  title: string;
  section: string;
  status: "pending" | "passed" | "failed";
  notes: string | null;
  tested_by: string | null;
  tested_at: string | null;
  test_screenshots: { id: string; file_name: string; file_path: string; file_size: number }[];
}

function emptyResult(tc: { tcId: string; title: string; section: string }): TestResultRow {
  return {
    id: null,
    tc_id: tc.tcId,
    title: tc.title,
    section: tc.section,
    status: "pending",
    notes: null,
    tested_by: null,
    tested_at: null,
    test_screenshots: [],
  };
}

export async function getTestResults(): Promise<TestResultRow[]> {
  await requireAdmin();

  const { data: results } = await db()
    .from("test_results")
    .select("*, test_screenshots(*)")
    .order("created_at", { ascending: true });

  // If no results exist yet, return defaults for all test cases
  if (!results || results.length === 0) {
    return TEST_CASES.map(emptyResult);
  }

  // Merge with test cases to ensure all are present
  const rows = results as TestResultRow[];
  const resultMap = new Map(rows.map((r) => [r.tc_id, r]));
  return TEST_CASES.map((tc) => resultMap.get(tc.tcId) ?? emptyResult(tc));
}

export async function updateTestResult(
  tcId: string,
  status: "pending" | "passed" | "failed",
  notes: string | null
) {
  const admin = await requireAdmin();
  const tc = TEST_CASES.find((t) => t.tcId === tcId);
  if (!tc) return { error: "Invalid test case ID" };

  // Check if result already exists
  const { data: existing } = await db()
    .from("test_results")
    .select("id")
    .eq("tc_id", tcId)
    .maybeSingle();

  if (existing) {
    const { error } = await db()
      .from("test_results")
      .update({
        status,
        notes,
        tested_by: admin.userId,
        tested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) return { error: error.message };
  } else {
    const { error } = await db()
      .from("test_results")
      .insert({
        tc_id: tcId,
        title: tc.title,
        section: tc.section,
        status,
        notes,
        tested_by: admin.userId,
        tested_at: new Date().toISOString(),
      });

    if (error) return { error: error.message };
  }

  revalidatePath("/admin/test-regime");
  return { success: true };
}

export async function addScreenshot(
  tcId: string,
  fileName: string,
  filePath: string,
  fileSize: number
) {
  await requireAdmin();

  // Get or create the test result
  let { data: result } = await db()
    .from("test_results")
    .select("id")
    .eq("tc_id", tcId)
    .maybeSingle();

  if (!result) {
    const tc = TEST_CASES.find((t) => t.tcId === tcId);
    if (!tc) return { error: "Invalid test case ID" };

    const { data: created, error } = await db()
      .from("test_results")
      .insert({
        tc_id: tcId,
        title: tc.title,
        section: tc.section,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) return { error: error.message };
    result = created;
  }

  const { error } = await db()
    .from("test_screenshots")
    .insert({
      test_result_id: result.id,
      file_name: fileName,
      file_path: filePath,
      file_size: fileSize,
    });

  if (error) return { error: error.message };

  revalidatePath("/admin/test-regime");
  return { success: true };
}

export async function deleteScreenshot(screenshotId: string) {
  await requireAdmin();

  // Get file path for storage cleanup
  const { data: screenshot } = await db()
    .from("test_screenshots")
    .select("file_path")
    .eq("id", screenshotId)
    .single();

  if (screenshot) {
    const supabase = await createClient();
    await supabase.storage.from("test-screenshots").remove([screenshot.file_path]);
  }

  const { error } = await db()
    .from("test_screenshots")
    .delete()
    .eq("id", screenshotId);

  if (error) return { error: error.message };

  revalidatePath("/admin/test-regime");
  return { success: true };
}

export async function resetAllTests() {
  await requireAdmin();

  const { error } = await db()
    .from("test_results")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // delete all

  if (error) return { error: error.message };

  revalidatePath("/admin/test-regime");
  return { success: true };
}
