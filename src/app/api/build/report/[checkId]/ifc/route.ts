import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/db";
import { buildIfcFromLayout } from "@/lib/build/ifc-exporter";
import type { SpatialLayout } from "@/lib/build/spatial/types";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ checkId: string }> },
) {
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

  // Cross-tenant isolation (SCRUM-342): db() bypasses RLS — the check must
  // belong to the caller's org, else this exports another org's 3D geometry.
  if (rec.org_id !== profile.org_id) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  if (rec.status !== "completed") {
    return NextResponse.json({ error: "Report not yet completed" }, { status: 400 });
  }
  if (!rec.spatial_layout) {
    return NextResponse.json(
      {
        error:
          "No 3D layout available for this report. Re-run optimisation on a plan whose floor plan page is detectable.",
      },
      { status: 409 },
    );
  }

  const { data: project } = await admin
    .from("projects")
    .select("name")
    .eq("id", rec.project_id)
    .single();

  const ifc = buildIfcFromLayout({
    layout: rec.spatial_layout,
    projectName: (project as { name?: string } | null)?.name ?? "Untitled Project",
    reportId: rec.id,
  });

  const projectSlug = ((project as { name?: string } | null)?.name ?? "project")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+$/, "");

  return new NextResponse(ifc, {
    headers: {
      "Content-Type": "application/x-step",
      "Content-Disposition": `attachment; filename="mmc-build-${projectSlug}-${checkId.slice(0, 8)}.ifc"`,
      "Cache-Control": "no-store",
    },
  });
}
