import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/db";
import { getSubscriptionStatus } from "@/lib/stripe/subscription";
import { buildDxfFromLayout, type DxfSuggestion } from "@/lib/build/dxf-exporter";
import type { SpatialLayout } from "@/lib/build/spatial/types";
import { is3dRenderingEnabled } from "@/lib/build/render-3d";
import { NextResponse } from "next/server";

/**
 * Export the modified plan as a DXF (SCRUM-173) — the source plan with the
 * user's PURSUING MMC changes applied (original geometry dotted on
 * SOURCE_OVERLAY, new geometry solid on CHANGES). Paid-tier only.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ checkId: string }> },
) {
  // The modified-plan export is drawn from the same extracted geometry as the
  // 3D render, so it is hidden with it at Go Live 1 (Karen, 2026-08-01 — see
  // @/lib/build/render-3d). Gated here as well as on the button, because this
  // URL survives in browser history and download managers.
  if (!is3dRenderingEnabled()) {
    return NextResponse.json(
      {
        error:
          "Modified-plan export is temporarily unavailable while 3D rendering is switched off.",
      },
      { status: 404 },
    );
  }

  const { checkId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = db();

  const { data: check, error: checkError } = await admin
    .from("design_checks")
    .select("id, status, project_id, org_id, spatial_layout")
    .eq("id", checkId)
    .single();

  if (checkError || !check) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const rec = check as {
    id: string;
    status: string;
    project_id: string;
    org_id: string;
    spatial_layout: SpatialLayout | null;
  };

  // Cross-tenant isolation (SCRUM-342): db() bypasses RLS — reject a check that
  // isn't the caller's BEFORE the paywall, else a foreign checkId both exports
  // another org's DXF and evaluates the paywall against the victim's tier.
  if (rec.org_id !== profile.org_id) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  // Paid-tier gate (AC). Trial / expired orgs can view the report but not export
  // the modified DWG.
  const status = await getSubscriptionStatus(rec.org_id);
  const paid = status.tier !== "trial" && status.tier !== "expired";
  if (!paid) {
    return NextResponse.json(
      {
        error:
          "Exporting the modified plan (DWG) is a paid feature. Upgrade your plan to enable it.",
      },
      { status: 403 },
    );
  }

  if (rec.status !== "completed") {
    return NextResponse.json(
      { error: "Report not yet completed" },
      { status: 400 },
    );
  }
  if (!rec.spatial_layout) {
    return NextResponse.json(
      {
        error:
          "No plan geometry available for this report. Re-run optimisation on a plan whose floor plan page is detectable.",
      },
      { status: 409 },
    );
  }

  const { data: project } = await admin
    .from("projects")
    .select("name")
    .eq("id", rec.project_id)
    .single();

  const { data: suggestions } = await admin
    .from("design_suggestions")
    .select("id, technology_category, suggested_alternative, affected_wall_ids, decision")
    .eq("check_id", checkId);

  const { dxf } = buildDxfFromLayout({
    layout: rec.spatial_layout,
    suggestions: (suggestions ?? []) as unknown as DxfSuggestion[],
  });

  const projectSlug = ((project as { name?: string } | null)?.name ?? "project")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+$/, "");

  return new NextResponse(dxf, {
    headers: {
      "Content-Type": "application/dxf",
      "Content-Disposition": `attachment; filename="mmc-build-modified-${projectSlug}-${checkId.slice(0, 8)}.dxf"`,
      "Cache-Control": "no-store",
    },
  });
}
