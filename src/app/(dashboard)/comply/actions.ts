"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";

/**
 * Register a plan that was already uploaded to Supabase Storage from the browser.
 * This avoids Vercel's 4.5MB serverless body size limit.
 */
export async function registerPlan(
  projectId: string,
  fileName: string,
  filePath: string,
  fileSizeBytes: number
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return { error: "Profile not found" };
  }

  // Create plan record
  const { data: plan, error: insertError } = await supabase
    .from("plans" as never)
    .insert({
      project_id: projectId,
      org_id: profile.org_id,
      file_name: fileName,
      file_path: filePath,
      file_size_bytes: fileSizeBytes,
      status: "uploading",
      created_by: profile.id,
    } as never)
    .select("id")
    .single();

  if (insertError) {
    return { error: `Failed to create plan record: ${insertError.message}` };
  }

  // Send Inngest event for async processing (non-blocking)
  try {
    await inngest.send({
      name: "plan/uploaded",
      data: {
        projectId,
        fileUrl: filePath,
        fileName,
        uploadedBy: profile.id,
      },
    });
  } catch (e) {
    console.error("Failed to send Inngest event:", e);
  }

  return { success: true, planId: (plan as { id: string }).id };
}

export async function saveQuestionnaire(
  projectId: string,
  responses: Record<string, unknown>
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return { error: "Profile not found" };
  }

  // Check if questionnaire already exists for this project
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("questionnaire_responses")
    .select("id")
    .eq("project_id", projectId)
    .eq("org_id", profile.org_id)
    .limit(1)
    .single();

  if (existing) {
    // Update existing
    const { error } = await admin
      .from("questionnaire_responses")
      .update({
        responses,
        completed: true,
      } as never)
      .eq("id", existing.id);

    if (error) {
      return { error: `Failed to update questionnaire: ${error.message}` };
    }

    return { success: true, questionnaireId: existing.id };
  }

  // Insert new
  const { data: qr, error } = await admin
    .from("questionnaire_responses")
    .insert({
      project_id: projectId,
      org_id: profile.org_id,
      responses,
      completed: true,
      created_by: profile.id,
    } as never)
    .select("id")
    .single();

  if (error) {
    return { error: `Failed to save questionnaire: ${error.message}` };
  }

  return { success: true, questionnaireId: (qr as { id: string }).id };
}

export async function requestComplianceCheck(
  projectId: string,
  planId: string,
  questionnaireId: string | null
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return { error: "Profile not found" };
  }

  // Load questionnaire data for context
  let questionnaireData: Record<string, unknown> = {};
  if (questionnaireId) {
    const admin = createAdminClient();
    const { data: qr } = await admin
      .from("questionnaire_responses")
      .select("responses")
      .eq("id", questionnaireId)
      .single();

    if (qr) {
      questionnaireData = (qr as { responses: Record<string, unknown> }).responses;
    }
  }

  // Create compliance check record
  const admin = createAdminClient();
  const { data: check, error } = await admin
    .from("compliance_checks")
    .insert({
      project_id: projectId,
      org_id: profile.org_id,
      plan_id: planId,
      questionnaire_id: questionnaireId,
      status: "queued",
      created_by: profile.id,
    } as never)
    .select("id")
    .single();

  if (error) {
    return { error: `Failed to create check: ${error.message}` };
  }

  // Send Inngest event (non-blocking)
  try {
    await inngest.send({
      name: "compliance/check.requested",
      data: {
        projectId,
        planId,
        questionnaireData,
      },
    });
  } catch (e) {
    console.error("Failed to send Inngest event:", e);
  }

  return { success: true, checkId: (check as { id: string }).id };
}

export async function getComplianceReport(checkId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const admin = createAdminClient();

  const { data: check, error: checkError } = await admin
    .from("compliance_checks")
    .select("*")
    .eq("id", checkId)
    .single();

  if (checkError || !check) {
    return { error: "Check not found" };
  }

  const { data: findings, error: findingsError } = await admin
    .from("compliance_findings")
    .select("*")
    .eq("check_id", checkId)
    .order("sort_order", { ascending: true });

  if (findingsError) {
    return { error: "Failed to load findings" };
  }

  return { check, findings: findings ?? [] };
}

export async function submitFeedback(
  checkId: string,
  rating: -1 | 1,
  comment?: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return { error: "Profile not found" };
  }

  const { error } = await supabase.from("feedback").insert({
    user_id: user.id,
    org_id: profile.org_id,
    feature: "comply",
    rating,
    comment: comment ?? null,
    ai_output_id: checkId,
  });

  if (error) {
    return { error: `Failed to submit feedback: ${error.message}` };
  }

  return { success: true };
}

export async function getProjectPlans(projectId: string) {
  const admin = createAdminClient();

  const { data } = await admin
    .from("plans")
    .select("id, file_name, file_size_bytes, page_count, status, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function getProjectQuestionnaire(projectId: string) {
  const admin = createAdminClient();

  const { data } = await admin
    .from("questionnaire_responses")
    .select("id, responses, completed, created_at, updated_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return data;
}

export async function getProjectChecks(projectId: string) {
  const admin = createAdminClient();

  const { data } = await admin
    .from("compliance_checks")
    .select("id, status, summary, overall_risk, created_at, completed_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  return data ?? [];
}
