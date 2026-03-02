"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";
import { randomBytes } from "crypto";

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

export async function deletePlan(planId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return { error: "Profile not found" };
  }

  const admin = createAdminClient();

  // Fetch plan to verify ownership and get file_path
  const { data: plan } = await admin
    .from("plans")
    .select("id, org_id, file_path")
    .eq("id", planId)
    .single();

  if (!plan || plan.org_id !== profile.org_id) {
    return { error: "Plan not found" };
  }

  // Delete embeddings for this plan
  await admin
    .from("document_embeddings")
    .delete()
    .eq("source_type", "plan")
    .eq("source_id", planId);

  // Delete plan record
  await admin.from("plans").delete().eq("id", planId);

  // Delete file from storage
  await admin.storage.from("plan-uploads").remove([plan.file_path]);

  return { success: true };
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

export async function registerCertification(
  projectId: string,
  fileName: string,
  filePath: string,
  fileSizeBytes: number,
  certType: string,
  metadata?: {
    issuerName?: string;
    issueDate?: string;
    notes?: string;
    state?: string;
  }
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

  const admin = createAdminClient();
  const { data: cert, error: insertError } = await admin
    .from("project_certifications")
    .insert({
      project_id: projectId,
      org_id: profile.org_id,
      cert_type: certType,
      file_name: fileName,
      file_path: filePath,
      file_size_bytes: fileSizeBytes,
      status: "uploading",
      state: metadata?.state ?? null,
      issuer_name: metadata?.issuerName ?? null,
      issue_date: metadata?.issueDate ?? null,
      notes: metadata?.notes ?? null,
      created_by: profile.id,
    } as never)
    .select("id")
    .single();

  if (insertError) {
    return { error: `Failed to create certification record: ${insertError.message}` };
  }

  try {
    await inngest.send({
      name: "certification/uploaded",
      data: {
        projectId,
        certificationId: (cert as { id: string }).id,
        fileName,
        filePath,
        certType,
      },
    });
  } catch (e) {
    console.error("Failed to send Inngest event:", e);
  }

  return { success: true, certificationId: (cert as { id: string }).id };
}

export async function updateCertification(
  certId: string,
  updates: {
    certType?: string;
    issuerName?: string;
    issueDate?: string;
    notes?: string;
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile) return { error: "Profile not found" };

  const admin = createAdminClient();

  const { data: cert } = await admin
    .from("project_certifications")
    .select("org_id")
    .eq("id", certId)
    .single();

  if (!cert || cert.org_id !== profile.org_id) {
    return { error: "Certification not found" };
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.certType !== undefined) updateData.cert_type = updates.certType;
  if (updates.issuerName !== undefined) updateData.issuer_name = updates.issuerName || null;
  if (updates.issueDate !== undefined) updateData.issue_date = updates.issueDate || null;
  if (updates.notes !== undefined) updateData.notes = updates.notes || null;

  const { error } = await admin
    .from("project_certifications")
    .update(updateData as never)
    .eq("id", certId);

  if (error) return { error: `Failed to update certification: ${error.message}` };

  return { success: true };
}

export async function deleteCertification(certId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile) return { error: "Profile not found" };

  const admin = createAdminClient();

  const { data: cert } = await admin
    .from("project_certifications")
    .select("id, org_id, file_path")
    .eq("id", certId)
    .single();

  if (!cert || cert.org_id !== profile.org_id) {
    return { error: "Certification not found" };
  }

  // Delete embeddings
  await admin
    .from("document_embeddings")
    .delete()
    .eq("source_type", "certification")
    .eq("source_id", certId);

  // Delete storage file
  await admin.storage.from("engineering-certs").remove([cert.file_path]);

  // Delete record
  const { error } = await admin
    .from("project_certifications")
    .delete()
    .eq("id", certId);

  if (error) return { error: `Failed to delete certification: ${error.message}` };

  return { success: true };
}

export async function getProjectCertifications(projectId: string) {
  const admin = createAdminClient();

  const { data } = await admin
    .from("project_certifications")
    .select("id, cert_type, file_name, file_size_bytes, status, issuer_name, issue_date, notes, error_message, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function submitFindingFeedback(
  findingId: string,
  checkId: string,
  rating: -1 | 0 | 1,
  correctionSeverity?: string,
  correctionText?: string
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

  const admin = createAdminClient();
  const { error } = await admin.from("finding_feedback").insert({
    finding_id: findingId,
    check_id: checkId,
    org_id: profile.org_id,
    user_id: user.id,
    rating,
    correction_severity: correctionSeverity ?? null,
    correction_text: correctionText ?? null,
  } as never);

  if (error) {
    return { error: `Failed to submit feedback: ${error.message}` };
  }

  return { success: true };
}

export async function deleteComplianceCheck(checkId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile) return { error: "Profile not found" };

  if (profile.role !== "owner" && profile.role !== "admin") {
    return { error: "Only owners and admins can delete compliance checks" };
  }

  const admin = createAdminClient();

  const { data: check } = await admin
    .from("compliance_checks")
    .select("id, org_id")
    .eq("id", checkId)
    .single();

  if (!check || check.org_id !== profile.org_id) {
    return { error: "Check not found" };
  }

  // Get finding IDs for cleanup
  const { data: findings } = await admin
    .from("compliance_findings")
    .select("id")
    .eq("check_id", checkId);

  const findingIds = (findings ?? []).map((f: { id: string }) => f.id);

  if (findingIds.length > 0) {
    // Delete finding activity log
    await admin
      .from("finding_activity_log" as never)
      .delete()
      .in("finding_id", findingIds);

    // Delete finding feedback
    await admin
      .from("finding_feedback")
      .delete()
      .in("finding_id", findingIds);

    // Delete findings
    await admin
      .from("compliance_findings")
      .delete()
      .eq("check_id", checkId);
  }

  // Delete embeddings for this check
  await admin
    .from("document_embeddings")
    .delete()
    .eq("source_type", "compliance_check")
    .eq("source_id", checkId);

  // Delete the check record
  const { error } = await admin
    .from("compliance_checks")
    .delete()
    .eq("id", checkId);

  if (error) return { error: `Failed to delete check: ${error.message}` };

  return { success: true };
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

// ============================================================
// Project Contributors
// ============================================================

export async function addProjectContributor(
  projectId: string,
  data: {
    contact_name: string;
    discipline: string;
    company_name?: string;
    contact_email?: string;
    contact_phone?: string;
    notes?: string;
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile) return { error: "Profile not found" };

  const admin = createAdminClient();
  const { data: contributor, error } = await admin
    .from("project_contributors" as never)
    .insert({
      project_id: projectId,
      org_id: profile.org_id,
      discipline: data.discipline,
      contact_name: data.contact_name,
      company_name: data.company_name ?? null,
      contact_email: data.contact_email ?? null,
      contact_phone: data.contact_phone ?? null,
      notes: data.notes ?? null,
      created_by: profile.id,
    } as never)
    .select("id")
    .single();

  if (error) return { error: `Failed to add contributor: ${error.message}` };

  return { success: true, contributorId: (contributor as { id: string }).id };
}

export async function updateProjectContributor(
  contributorId: string,
  data: {
    contact_name?: string;
    discipline?: string;
    company_name?: string;
    contact_email?: string;
    contact_phone?: string;
    notes?: string;
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile) return { error: "Profile not found" };

  const admin = createAdminClient();

  // Verify ownership
  const { data: existing } = await admin
    .from("project_contributors" as never)
    .select("org_id")
    .eq("id", contributorId)
    .single();

  if (!existing || (existing as { org_id: string }).org_id !== profile.org_id) {
    return { error: "Contributor not found" };
  }

  const { error } = await admin
    .from("project_contributors" as never)
    .update({ ...data, updated_at: new Date().toISOString() } as never)
    .eq("id", contributorId);

  if (error) return { error: `Failed to update contributor: ${error.message}` };

  return { success: true };
}

export async function removeProjectContributor(contributorId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile) return { error: "Profile not found" };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("project_contributors" as never)
    .select("org_id")
    .eq("id", contributorId)
    .single();

  if (!existing || (existing as { org_id: string }).org_id !== profile.org_id) {
    return { error: "Contributor not found" };
  }

  const { error } = await admin
    .from("project_contributors" as never)
    .delete()
    .eq("id", contributorId);

  if (error) return { error: `Failed to remove contributor: ${error.message}` };

  return { success: true };
}

export async function getProjectContributors(projectId: string) {
  const admin = createAdminClient();

  const { data } = await admin
    .from("project_contributors" as never)
    .select("id, discipline, company_name, contact_name, contact_email, contact_phone, notes, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  return (data ?? []) as {
    id: string;
    discipline: string;
    company_name: string | null;
    contact_name: string;
    contact_email: string | null;
    contact_phone: string | null;
    notes: string | null;
    created_at: string;
  }[];
}

// ============================================================
// Finding Review Workflow
// ============================================================

export async function reviewFinding(
  findingId: string,
  action: "accepted" | "rejected",
  data?: { rejection_reason?: string }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile) return { error: "Profile not found" };

  const admin = createAdminClient();

  const updateData: Record<string, unknown> = {
    review_status: action,
    reviewed_by: profile.id,
    reviewed_at: new Date().toISOString(),
  };

  if (action === "rejected" && data?.rejection_reason) {
    updateData.rejection_reason = data.rejection_reason;
  }

  const { error } = await admin
    .from("compliance_findings")
    .update(updateData as never)
    .eq("id", findingId);

  if (error) return { error: `Failed to review finding: ${error.message}` };

  // Log activity
  await admin.from("finding_activity_log").insert({
    finding_id: findingId,
    action: action === "accepted" ? "accepted" : "rejected",
    actor_id: profile.id,
    details: data?.rejection_reason ? { rejection_reason: data.rejection_reason } : {},
  } as never);

  return { success: true };
}

export async function amendFinding(
  findingId: string,
  amendments: {
    amended_description?: string;
    amended_action?: string;
    amended_discipline?: string;
    assigned_contributor_id?: string;
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile) return { error: "Profile not found" };

  const admin = createAdminClient();

  const { error } = await admin
    .from("compliance_findings")
    .update({
      review_status: "amended",
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
      amended_description: amendments.amended_description ?? null,
      amended_action: amendments.amended_action ?? null,
      amended_discipline: amendments.amended_discipline ?? null,
      assigned_contributor_id: amendments.assigned_contributor_id ?? null,
    } as never)
    .eq("id", findingId);

  if (error) return { error: `Failed to amend finding: ${error.message}` };

  await admin.from("finding_activity_log").insert({
    finding_id: findingId,
    action: "amended",
    actor_id: profile.id,
    details: amendments,
  } as never);

  return { success: true };
}

export async function sendFindingToContributor(findingId: string) {
  // Legacy redirect — now calls shareFindingWithContributor if contributor is assigned
  const admin = createAdminClient();
  const { data: finding } = await admin
    .from("compliance_findings")
    .select("assigned_contributor_id" as never)
    .eq("id", findingId)
    .single();

  const contributorId = finding
    ? (finding as unknown as Record<string, unknown>).assigned_contributor_id as string | null
    : null;

  if (contributorId) {
    return shareFindingWithContributor(findingId, contributorId);
  }

  // Fallback to mark-as-sent if no contributor
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile) return { error: "Profile not found" };

  const { error } = await admin
    .from("compliance_findings")
    .update({
      review_status: "sent",
      sent_at: new Date().toISOString(),
    } as never)
    .eq("id", findingId);

  if (error) return { error: `Failed to send finding: ${error.message}` };

  await admin.from("finding_activity_log").insert({
    finding_id: findingId,
    action: "sent",
    actor_id: profile.id,
    details: {},
  } as never);

  return { success: true };
}

export async function shareFindingWithContributor(
  findingId: string,
  contributorId: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile) return { error: "Profile not found" };

  const admin = createAdminClient();

  // Load contributor
  const { data: contributor } = await admin
    .from("project_contributors" as never)
    .select("id, project_id, contact_name, contact_email")
    .eq("id", contributorId)
    .single();

  if (!contributor) return { error: "Contributor not found" };
  const c = contributor as { id: string; project_id: string; contact_name: string; contact_email: string | null };

  if (!c.contact_email) {
    return { error: "Contributor has no email address" };
  }

  // Generate secure token
  const token = randomBytes(32).toString("hex");

  // Insert share token
  const { data: shareToken, error: insertError } = await admin
    .from("finding_share_tokens" as never)
    .insert({
      finding_id: findingId,
      contributor_id: contributorId,
      project_id: c.project_id,
      org_id: profile.org_id,
      token,
      email_to: c.contact_email,
      created_by: profile.id,
    } as never)
    .select("id")
    .single();

  if (insertError) return { error: `Failed to create share token: ${insertError.message}` };

  // Update finding status
  await admin
    .from("compliance_findings")
    .update({
      review_status: "sent",
      sent_at: new Date().toISOString(),
      remediation_status: "awaiting",
    } as never)
    .eq("id", findingId);

  // Log activity
  await admin.from("finding_activity_log").insert({
    finding_id: findingId,
    action: "shared",
    actor_id: profile.id,
    details: { contributor_id: contributorId, email_to: c.contact_email },
  } as never);

  // Fire Inngest event for async email
  try {
    await inngest.send({
      name: "finding/share.requested",
      data: {
        shareTokenId: (shareToken as { id: string }).id,
        findingId,
        projectId: c.project_id,
        contributorId,
        recipientEmail: c.contact_email,
        recipientName: c.contact_name,
      },
    });
  } catch (e) {
    console.error("Failed to send Inngest event:", e);
  }

  return { success: true };
}

export async function addContributorAndShareFinding(
  projectId: string,
  findingId: string,
  contributorData: {
    contact_name: string;
    discipline: string;
    contact_email: string;
    company_name?: string;
  }
) {
  // Step 1: Create contributor
  const result = await addProjectContributor(projectId, contributorData);
  if ("error" in result) return result;

  // Step 2: Assign contributor to finding
  const admin = createAdminClient();
  await admin
    .from("compliance_findings")
    .update({
      assigned_contributor_id: result.contributorId,
    } as never)
    .eq("id", findingId);

  // Step 3: Share finding
  return shareFindingWithContributor(findingId, result.contributorId!);
}

export async function bulkReviewFindings(
  findingIds: string[],
  action: "accepted" | "rejected",
  rejectionReason?: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile) return { error: "Profile not found" };

  const admin = createAdminClient();

  const updateData: Record<string, unknown> = {
    review_status: action,
    reviewed_by: profile.id,
    reviewed_at: new Date().toISOString(),
  };

  if (action === "rejected" && rejectionReason) {
    updateData.rejection_reason = rejectionReason;
  }

  const { error } = await admin
    .from("compliance_findings")
    .update(updateData as never)
    .in("id", findingIds);

  if (error) return { error: `Failed to bulk review: ${error.message}` };

  // Log activity for each finding
  for (const findingId of findingIds) {
    await admin.from("finding_activity_log").insert({
      finding_id: findingId,
      action: `bulk_${action}`,
      actor_id: profile.id,
      details: rejectionReason ? { rejection_reason: rejectionReason } : {},
    } as never);
  }

  return { success: true };
}

export async function bulkShareFindings(findingIds: string[]) {
  const results: { findingId: string; success: boolean; error?: string }[] = [];

  for (const findingId of findingIds) {
    const result = await sendFindingToContributor(findingId);
    results.push({
      findingId,
      success: !("error" in result),
      error: "error" in result ? result.error : undefined,
    });
  }

  const succeeded = results.filter((r) => r.success).length;
  return { success: true, shared: succeeded, total: findingIds.length };
}

export async function getShareTokensForCheck(checkId: string) {
  const admin = createAdminClient();

  // Get finding IDs for this check
  const { data: findings } = await admin
    .from("compliance_findings")
    .select("id")
    .eq("check_id", checkId);

  if (!findings || findings.length === 0) return [];

  const findingIds = findings.map((f: { id: string }) => f.id);

  const { data: tokens } = await admin
    .from("finding_share_tokens" as never)
    .select("id, finding_id, contributor_id, email_to, sent_at, remediation_status, response_notes, responded_at")
    .in("finding_id", findingIds)
    .order("created_at", { ascending: false });

  return (tokens ?? []) as {
    id: string;
    finding_id: string;
    contributor_id: string;
    email_to: string;
    sent_at: string | null;
    remediation_status: string;
    response_notes: string | null;
    responded_at: string | null;
  }[];
}

export async function getWorkflowSummary(checkId: string) {
  const admin = createAdminClient();

  const { data: findings } = await admin
    .from("compliance_findings")
    .select("review_status, responsible_discipline" as never)
    .eq("check_id", checkId);

  if (!findings) return { total: 0, pending: 0, accepted: 0, amended: 0, rejected: 0, sent: 0 };

  const rows = findings as unknown as { review_status: string | null }[];

  return {
    total: rows.length,
    pending: rows.filter((f) => f.review_status === "pending").length,
    accepted: rows.filter((f) => f.review_status === "accepted").length,
    amended: rows.filter((f) => f.review_status === "amended").length,
    rejected: rows.filter((f) => f.review_status === "rejected").length,
    sent: rows.filter((f) => f.review_status === "sent").length,
  };
}
