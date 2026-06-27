"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";
import { randomBytes } from "crypto";
import { addProjectContributor } from "@/app/(dashboard)/projects/actions";
import { checkAndIncrementUsage } from "@/lib/stripe/subscription";
import {
  computeFindingLifecycle,
  type FindingLifecycle,
} from "@/lib/comply/finding-lifecycle";
import {
  resolveFindingSchema,
  waiveFindingSchema,
  requestMoreInfoSchema,
} from "@/lib/validators/finding-resolution";
import { sendEmail } from "@/lib/email/resend";

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

  // Load questionnaire data for context (before the paywall, so the hard gate
  // below never consumes a paid run).
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

  // HARD GATE — the Building Classification MUST be set by the user. It decides
  // which NCC volume the plan is assessed against (Class 1/10 → Volume Two,
  // Housing Provisions; Class 2–9 → Volume One). A wrong/blank class assesses
  // the plan against the wrong code, so this is a correctness gate, not a
  // convenience default. Block here AND mark the field required in the UI.
  const buildingClass = String(questionnaireData.building_class ?? "").trim();
  if (!buildingClass) {
    return {
      error: "building_class_required",
      message:
        "Set the Building Classification (NCC) in the project questionnaire before running a compliance check. It determines which NCC volume your plan is assessed against — Class 1 or 10 (houses / structures) are assessed under Volume Two (Housing Provisions); Class 2–9 (apartments, boarding houses, commercial) under Volume One. Without it the check would apply the wrong code.",
    };
  }

  // Paywall check — atomic usage increment
  const usage = await checkAndIncrementUsage(profile.org_id);
  if (!usage.allowed) {
    return {
      error: "usage_limit_reached",
      usageCount: usage.newCount,
      usageLimit: usage.limit,
      tier: usage.tier,
    };
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

/**
 * Re-check (Comply Phase 3): re-run compliance against the (optionally updated)
 * design, producing a NEW check chained to the parent (parent_check_id +
 * version). Builder-initiated — we do NOT hard-block on convergence here; the
 * Phase-2 readiness banner only PROMOTES the re-check when items are
 * resolved/waived, but the action itself trusts the builder.
 *
 * REGULATED: verifies the user's org owns the parent check, and a re-check
 * consumes a usage run exactly like a fresh check.
 */
export async function recheckCompliance(
  parentCheckId: string,
  opts?: { newPlanId?: string; scope?: "resolved" | "full" }
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

  // Load the parent check and verify org ownership before anything else.
  const { data: parent, error: parentError } = await admin
    .from("compliance_checks")
    .select("id, project_id, org_id, plan_id, questionnaire_id, version")
    .eq("id", parentCheckId)
    .single();

  if (parentError || !parent) {
    return { error: "Parent check not found" };
  }

  const parentCheck = parent as unknown as {
    id: string;
    project_id: string;
    org_id: string;
    plan_id: string;
    questionnaire_id: string | null;
    version: number | null;
  };

  if (parentCheck.org_id !== profile.org_id) {
    return { error: "Parent check not found" };
  }

  // If the builder attached updated drawings, verify the new plan belongs to the
  // same org + project (never re-check against a plan from another org).
  let planId = parentCheck.plan_id;
  if (opts?.newPlanId) {
    const { data: newPlan } = await admin
      .from("plans")
      .select("id, org_id, project_id")
      .eq("id", opts.newPlanId)
      .single();

    const np = newPlan as { id: string; org_id: string; project_id: string } | null;
    if (!np || np.org_id !== profile.org_id || np.project_id !== parentCheck.project_id) {
      return { error: "Selected plan not found for this project" };
    }
    planId = np.id;
  }

  // Decide scope. Default is "resolved": re-verify ONLY the domains the builder
  // marked resolved (resolution_type updated_drawings / evidence) and carry the
  // rest forward — far cheaper/faster than re-running all 14 NCC domains.
  // "full" (or attaching updated drawings, where any domain could change) runs
  // everything. Computed BEFORE the usage charge so "nothing to re-verify" never
  // consumes a run.
  const scope: "resolved" | "full" =
    opts?.newPlanId ? "full" : opts?.scope ?? "resolved";
  let recheckCategories: string[] | undefined;
  if (scope === "resolved") {
    const { data: resolved } = await admin
      .from("compliance_findings")
      .select("category")
      .eq("check_id", parentCheck.id)
      .in("resolution_type", ["updated_drawings", "evidence"]);
    const cats = Array.from(
      new Set(
        ((resolved ?? []) as { category: string | null }[])
          .map((r) => r.category)
          .filter((c): c is string => Boolean(c)),
      ),
    );
    if (cats.length === 0) {
      // Nothing was resolved → a scoped re-check has nothing to verify. Guide the
      // builder rather than silently running (and charging) a full check.
      return { error: "no_resolved_items" };
    }
    recheckCategories = cats;
  }

  // Paywall — a re-check consumes a run, same as a normal check (verified at the
  // Server Action layer, not just middleware — REGULATED tier).
  const usage = await checkAndIncrementUsage(profile.org_id);
  if (!usage.allowed) {
    return {
      error: "usage_limit_reached",
      usageCount: usage.newCount,
      usageLimit: usage.limit,
      tier: usage.tier,
    };
  }

  // Load questionnaire data for context (carried from the parent).
  let questionnaireData: Record<string, unknown> = {};
  if (parentCheck.questionnaire_id) {
    const { data: qr } = await admin
      .from("questionnaire_responses")
      .select("responses")
      .eq("id", parentCheck.questionnaire_id)
      .single();

    if (qr) {
      questionnaireData = (qr as { responses: Record<string, unknown> }).responses;
    }
  }

  // Create the chained re-check record.
  const { data: check, error } = await admin
    .from("compliance_checks")
    .insert({
      project_id: parentCheck.project_id,
      org_id: profile.org_id,
      plan_id: planId,
      questionnaire_id: parentCheck.questionnaire_id,
      status: "queued",
      created_by: profile.id,
      parent_check_id: parentCheck.id,
      version: (parentCheck.version ?? 1) + 1,
    } as never)
    .select("id")
    .single();

  if (error) {
    return { error: `Failed to create re-check: ${error.message}` };
  }

  // Fire the pipeline (non-blocking) — same event shape as a fresh check.
  try {
    await inngest.send({
      name: "compliance/check.requested",
      data: {
        projectId: parentCheck.project_id,
        planId,
        questionnaireData,
        // Undefined for a full re-check ⇒ pipeline analyses everything.
        recheckCategories,
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

  // `select("*")` already returns the Phase-2 resolution columns
  // (resolution_type, resolution_note, waiver_reason, resolved_by, resolved_at).
  const findingRows = (findings ?? []) as unknown as Record<string, unknown>[];

  // Attach contributor responses (notes + uploaded file) to each finding so the
  // builder can read the engineer's reply, not just see a status badge. Load every
  // responded share token for these findings and group by finding_id (most-recent first).
  let findingsWithResponses = findingRows;
  if (findingRows.length > 0) {
    const findingIds = findingRows.map((f) => f.id as string);

    const { data: tokens } = await admin
      .from("finding_share_tokens" as never)
      .select(
        "id, finding_id, contributor_id, email_to, remediation_status, response_notes, response_file_path, response_file_name, responded_at"
      )
      .in("finding_id", findingIds)
      .not("responded_at", "is", null)
      .order("responded_at", { ascending: false });

    const responseRows = (tokens ?? []) as unknown as RemediationResponse[];

    const byFinding = new Map<string, RemediationResponse[]>();
    for (const r of responseRows) {
      const list = byFinding.get(r.finding_id) ?? [];
      list.push(r);
      byFinding.set(r.finding_id, list);
    }

    findingsWithResponses = findingRows.map((f) => {
      const responses = byFinding.get(f.id as string) ?? [];
      const lifecycle: FindingLifecycle = computeFindingLifecycle({
        resolution_type: f.resolution_type as string | null,
        resolved_at: f.resolved_at as string | null,
        remediation_status: f.remediation_status as string | null,
        responses,
      });
      return {
        ...f,
        responses,
        lifecycle,
      };
    });
  }

  return { check, findings: findingsWithResponses };
}

// A contributor's reply to a shared finding, as surfaced to the authenticated
// builder. Mirrors the responded columns on `finding_share_tokens`.
export interface RemediationResponse {
  id: string;
  finding_id: string;
  contributor_id: string;
  email_to: string;
  remediation_status: string;
  response_notes: string | null;
  response_file_path: string | null;
  response_file_name: string | null;
  responded_at: string | null;
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

// Lightweight loader for the v1 -> v2 re-check delta (Comply Phase 3). Returns
// the ACTIONABLE (non-compliant / critical) findings for a check, org-guarded.
// Used by the report page to compute the delta against the parent check without
// pulling the full response/lifecycle rollup of getComplianceReport.
export async function getActionableFindingsForCheck(checkId: string): Promise<{
  id: string;
  ncc_section: string;
  category: string;
  title: string;
  severity: string;
}[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();
  if (!profile) return [];

  const admin = createAdminClient();

  // Org guard via the check.
  const { data: check } = await admin
    .from("compliance_checks")
    .select("org_id")
    .eq("id", checkId)
    .single();
  if (!check || (check as { org_id: string }).org_id !== profile.org_id) return [];

  const { data: findings } = await admin
    .from("compliance_findings")
    .select("id, ncc_section, category, title, severity")
    .eq("check_id", checkId)
    .in("severity", ["non_compliant", "critical"]);

  return (findings ?? []) as unknown as {
    id: string;
    ncc_section: string;
    category: string;
    title: string;
    severity: string;
  }[];
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
// Finding Resolution (Comply Phase 2 — builder-side convergence)
// ============================================================

// Loads the authenticated builder's profile and verifies the finding belongs to
// their org, with a role allowed to resolve (owner / admin / builder). Returns
// either an { error } or the { profile, admin } the caller needs. Mirrors the
// org/role gate used by deleteComplianceCheck, extended to allow the builder.
async function authorizeFindingResolution(findingId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile) return { error: "Profile not found" as const };

  // Any member of the finding's org may record a resolution EXCEPT a read-only
  // "viewer" — org-ownership (verified below) is the real boundary. This admits
  // owner/admin/builder/architect/project_manager/trade and beta testers (role
  // "beta", stored via cast outside the enum), while keeping viewers read-only.
  if ((profile.role as string) === "viewer") {
    return { error: "Viewers cannot resolve findings" as const };
  }

  const admin = createAdminClient();

  // Verify the finding belongs to the user's org via its parent check.
  const { data: finding } = await admin
    .from("compliance_findings")
    .select("id, check_id")
    .eq("id", findingId)
    .single();

  if (!finding) return { error: "Finding not found" as const };

  const { data: check } = await admin
    .from("compliance_checks")
    .select("org_id")
    .eq("id", (finding as { check_id: string }).check_id)
    .single();

  if (!check || (check as { org_id: string }).org_id !== profile.org_id) {
    return { error: "Finding not found" as const };
  }

  return { profile: profile as { id: string; org_id: string; role: string }, admin };
}

export async function resolveFinding(
  findingId: string,
  input: { type: "updated_drawings" | "evidence"; note?: string }
) {
  const parsed = resolveFindingSchema.safeParse({ findingId, ...input });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const auth = await authorizeFindingResolution(parsed.data.findingId);
  if ("error" in auth) return { error: auth.error };
  const { profile, admin } = auth;

  const note = parsed.data.note?.trim() ? parsed.data.note.trim() : null;

  const { error } = await admin
    .from("compliance_findings")
    .update({
      resolution_type: parsed.data.type,
      resolution_note: note,
      waiver_reason: null,
      resolved_by: profile.id,
      resolved_at: new Date().toISOString(),
    } as never)
    .eq("id", parsed.data.findingId);

  if (error) return { error: `Failed to resolve finding: ${error.message}` };

  await admin.from("finding_activity_log").insert({
    finding_id: parsed.data.findingId,
    action: "finding_resolved",
    actor_id: profile.id,
    details: { resolution_type: parsed.data.type, note },
  } as never);

  return { success: true };
}

export async function waiveFinding(findingId: string, reason: string) {
  const parsed = waiveFindingSchema.safeParse({ findingId, reason });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const auth = await authorizeFindingResolution(parsed.data.findingId);
  if ("error" in auth) return { error: auth.error };
  const { profile, admin } = auth;

  const { error } = await admin
    .from("compliance_findings")
    .update({
      resolution_type: "waiver",
      resolution_note: null,
      waiver_reason: parsed.data.reason,
      resolved_by: profile.id,
      resolved_at: new Date().toISOString(),
    } as never)
    .eq("id", parsed.data.findingId);

  if (error) return { error: `Failed to waive finding: ${error.message}` };

  await admin.from("finding_activity_log").insert({
    finding_id: parsed.data.findingId,
    action: "finding_waived",
    actor_id: profile.id,
    details: { reason: parsed.data.reason },
  } as never);

  return { success: true };
}

/**
 * "Request more info" — the third option Karen needed beyond Resolve/Waive
 * (2026-06-27): keep the conversation going with the external contributor
 * instead of being forced to a terminal verdict. Re-opens the most recent share
 * for another round (back to `awaiting`, clears the prior response, extends the
 * link) and emails the contributor the builder's follow-up message. No schema
 * change — reuses the existing finding_share_tokens round.
 */
export async function requestMoreInfo(findingId: string, message: string) {
  const parsed = requestMoreInfoSchema.safeParse({ findingId, message });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const auth = await authorizeFindingResolution(parsed.data.findingId);
  if ("error" in auth) return { error: auth.error };
  const { profile, admin } = auth;

  // The most recent contributor we shared this finding with — the one to re-engage.
  const { data: tokenRow } = await admin
    .from("finding_share_tokens" as never)
    .select("id, token, email_to")
    .eq("finding_id", parsed.data.findingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const share =
    (tokenRow as unknown as {
      id: string;
      token: string;
      email_to: string;
    } | null) ?? null;
  if (!share) {
    return {
      error:
        "No one has been sent this finding yet — share it for remediation first, then you can request more info.",
    };
  }

  // Re-open the same share for another round.
  const nowIso = new Date().toISOString();
  const expiresIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error: tokErr } = await admin
    .from("finding_share_tokens" as never)
    .update({
      remediation_status: "awaiting",
      responded_at: null,
      expires_at: expiresIso,
      updated_at: nowIso,
    } as never)
    .eq("id", share.id);
  if (tokErr) {
    return { error: `Couldn't re-open the request: ${tokErr.message}` };
  }

  // Finding back to awaiting (not "responded"/resolved) so the board shows the
  // open conversation again rather than a terminal state.
  await admin
    .from("compliance_findings")
    .update({
      remediation_status: "awaiting",
      remediation_responded_at: null,
    } as never)
    .eq("id", parsed.data.findingId);

  // Email the contributor the builder's follow-up + the same respond link.
  try {
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://app.mmcbuild.com.au";
    const respondUrl = `${appUrl}/respond/${share.token}`;
    const safeMessage = parsed.data.message
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    await sendEmail({
      to: share.email_to,
      subject: "A follow-up on the compliance finding you responded to",
      html: `<p>Hi,</p>
<p>Thanks for your response. The reviewer has a follow-up before this finding can be closed:</p>
<blockquote style="border-left:3px solid #cbd5e1;margin:0;padding:8px 12px;color:#374151;">${safeMessage}</blockquote>
<p><a href="${respondUrl}">Reply to this finding</a> — no login required.</p>
<p>— MMC Build</p>`,
    });
  } catch (e) {
    console.error(
      "[requestMoreInfo] follow-up email failed (non-fatal):",
      (e as Error).message,
    );
  }

  await admin.from("finding_activity_log").insert({
    finding_id: parsed.data.findingId,
    action: "more_info_requested",
    actor_id: profile.id,
    details: { message: parsed.data.message, email_to: share.email_to },
  } as never);

  return { success: true };
}

export async function reopenFinding(findingId: string) {
  const auth = await authorizeFindingResolution(findingId);
  if ("error" in auth) return { error: auth.error };
  const { profile, admin } = auth;

  const { error } = await admin
    .from("compliance_findings")
    .update({
      resolution_type: null,
      resolution_note: null,
      waiver_reason: null,
      resolved_by: null,
      resolved_at: null,
    } as never)
    .eq("id", findingId);

  if (error) return { error: `Failed to reopen finding: ${error.message}` };

  await admin.from("finding_activity_log").insert({
    finding_id: findingId,
    action: "finding_reopened",
    actor_id: profile.id,
    details: {},
  } as never);

  return { success: true };
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
