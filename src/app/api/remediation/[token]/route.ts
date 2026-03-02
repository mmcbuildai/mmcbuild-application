import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RemediationStatus } from "@/lib/supabase/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const admin = createAdminClient();

  // Load share token
  const { data: shareToken } = await admin
    .from("finding_share_tokens" as never)
    .select("*")
    .eq("token", token)
    .single();

  if (!shareToken) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  const st = shareToken as Record<string, unknown>;

  // Check expiry
  if (new Date(st.expires_at as string) < new Date()) {
    return NextResponse.json({ error: "This link has expired" }, { status: 410 });
  }

  // Load finding details
  const { data: finding } = await admin
    .from("compliance_findings")
    .select("*")
    .eq("id", st.finding_id as string)
    .single();

  if (!finding) {
    return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  }

  // Load project name
  const { data: project } = await admin
    .from("projects")
    .select("name")
    .eq("id", st.project_id as string)
    .single();

  // Load org name
  const { data: org } = await admin
    .from("organisations")
    .select("name")
    .eq("id", st.org_id as string)
    .single();

  const f = finding as Record<string, unknown>;

  return NextResponse.json({
    finding: {
      title: f.title,
      description: (f.amended_description as string) ?? f.description,
      severity: f.severity,
      ncc_section: f.ncc_section,
      ncc_citation: f.ncc_citation,
      category: f.category,
      remediation_action: (f.amended_action as string) ?? f.remediation_action,
    },
    project: project?.name ?? "Unknown Project",
    organisation: org?.name ?? "",
    remediationStatus: st.remediation_status,
    respondedAt: st.responded_at,
    responseNotes: st.response_notes,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const admin = createAdminClient();

  // Validate token
  const { data: shareToken } = await admin
    .from("finding_share_tokens" as never)
    .select("id, finding_id, expires_at")
    .eq("token", token)
    .single();

  if (!shareToken) {
    return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  }

  const st = shareToken as { id: string; finding_id: string; expires_at: string };

  if (new Date(st.expires_at) < new Date()) {
    return NextResponse.json({ error: "This link has expired" }, { status: 410 });
  }

  const body = await request.json();
  const { status, notes, file_path, file_name } = body as {
    status: RemediationStatus;
    notes?: string;
    file_path?: string;
    file_name?: string;
  };

  const validStatuses: RemediationStatus[] = [
    "acknowledged",
    "in_progress",
    "completed",
    "disputed",
  ];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const now = new Date().toISOString();

  // Update share token
  await admin
    .from("finding_share_tokens" as never)
    .update({
      remediation_status: status,
      response_notes: notes ?? null,
      response_file_path: file_path ?? null,
      response_file_name: file_name ?? null,
      responded_at: now,
      updated_at: now,
    } as never)
    .eq("id", st.id);

  // Update finding remediation status
  await admin
    .from("compliance_findings")
    .update({
      remediation_status: status,
      remediation_responded_at: now,
    } as never)
    .eq("id", st.finding_id);

  // Log activity
  await admin.from("finding_activity_log").insert({
    finding_id: st.finding_id,
    action: "remediation_response",
    actor_id: null,
    details: { status, notes: notes ?? null, respondent: "external_contributor" },
  } as never);

  return NextResponse.json({ success: true });
}
