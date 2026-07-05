import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileText, ArrowRight, Play } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getProjectPlans } from "@/app/(dashboard)/projects/actions";
import {
  getProjectDesignChecks,
  getProjectSelectedSystems,
  hasValidExtraction,
} from "../actions";
import { SystemPreviewPanel } from "@/components/build/system-preview-panel";
import { ReportVersionList } from "@/components/shared/report-version-list";
import { ProjectContextSummary } from "@/components/shared/project-context-summary";
import { getReportVersions } from "@/lib/report-versions";

export default async function ProjectBuildPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, address, status")
    .eq("id", projectId)
    .single();

  if (!project) {
    redirect("/build");
  }

  // Gate: only active projects
  if (project.status !== "active") {
    return (
      <div className="space-y-6">
        <div>
          <Link
            href="/build"
            className="text-sm text-muted-foreground hover:underline"
          >
            &larr; Back to Build
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{project.name}</h1>
          <p className="text-muted-foreground">
            {project.address ?? "No address"}
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Setup Required</CardTitle>
            <CardDescription>
              Complete project setup before running design optimisation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Your project needs plans uploaded before you can use MMC Build.
            </p>
            <Button asChild>
              <Link href={`/projects/${projectId}`}>Complete Project Setup</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [plans, checks, selectedSystems, versions] = await Promise.all([
    getProjectPlans(projectId),
    getProjectDesignChecks(projectId),
    getProjectSelectedSystems(projectId),
    getReportVersions(projectId, "build"),
  ]);

  const readyPlan = plans.find(
    (p: { status: string }) => p.status === "ready"
  );
  // Hard gate: Design Optimisation unlocks only once the design has a VALID
  // extracted 3D ("See your design built in the 4 MMC systems"). A design we
  // can't reconstruct is rejected — the user is told why and must fix + re-
  // upload before proceeding; we don't optimise invalid designs. The preview
  // refreshes this page when extraction succeeds.
  const hasValidDesign = readyPlan ? await hasValidExtraction(readyPlan.id) : false;
  // Design Optimisation also needs at least one construction system chosen —
  // there's nothing to optimise against otherwise. Systems are now selected in
  // the preview (the standalone checkbox panel is deprecated).
  const hasSystemSelected = selectedSystems.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/build"
          className="text-sm text-muted-foreground hover:underline"
        >
          &larr; Back to Build
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{project.name}</h1>
        <p className="text-muted-foreground">
          {project.address ?? "No address"}
        </p>
      </div>

      <ProjectContextSummary projectId={projectId} />

      {/* See-your-design-in-4-systems preview — runs the already-uploaded plan
          through the 3D extractor, then the user picks the system(s) to
          optimise right here. (The standalone Construction Systems checkbox
          panel is deprecated — selection lives in the preview now.) */}
      {readyPlan && (
        <SystemPreviewPanel
          projectId={projectId}
          planId={readyPlan.id}
          initialSystems={selectedSystems}
          hasDownstreamReports={checks.length > 0}
        />
      )}

      {/* Plan status + Run button */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Plan Status</CardTitle>
            <CardDescription>
              Design optimisation analyses your uploaded building plans
            </CardDescription>
          </CardHeader>
          <CardContent>
            {readyPlan ? (
              <div className="flex items-center gap-2 text-sm text-green-700">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                Plan ready: {(readyPlan as { file_name?: string }).file_name ?? "Uploaded plan"}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                <p>No processed plan found.</p>
                <Link
                  href={`/comply/${projectId}/upload`}
                  className="text-teal-600 hover:underline"
                >
                  Upload a plan
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Play className="h-5 w-5 text-teal-600" />
              <CardTitle className="text-base">
                Run Design Optimisation
              </CardTitle>
            </div>
            <CardDescription>
              AI-powered MMC opportunity analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!readyPlan ? (
              <p className="text-sm text-muted-foreground">
                Upload and process a plan first.
              </p>
            ) : !hasValidDesign ? (
              <p className="text-sm text-muted-foreground">
                Run <span className="font-medium">&ldquo;See your design built
                in the 4 MMC systems&rdquo;</span> above first. Design
                Optimisation unlocks once your design extracts successfully — if
                it can&apos;t, you&apos;ll be told why so you can fix and
                re-upload it.
              </p>
            ) : !hasSystemSelected ? (
              <p className="text-sm text-muted-foreground">
                Choose at least one construction system in the preview above
                (and save it) — there&apos;s nothing to optimise against until
                you do.
              </p>
            ) : (
              // The Run Design Optimisation button lives in the preview panel
              // above, driven by client state so it unlocks the instant the
              // design is ready and a system is saved. Rendering it here too
              // (a) duplicated the button and (b) depended on a server refresh
              // landing — the race that stranded the button on multi-storey
              // plans (Karen, 2026-07-05). Point to the reliable one instead.
              <p className="text-sm text-muted-foreground">
                Your design is ready. Use the{" "}
                <span className="font-medium">Run Design Optimisation</span>{" "}
                button in the preview above to start the analysis.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Version history */}
      {versions.length > 0 ? (
        <ReportVersionList
          versions={versions}
          module="build"
          projectId={projectId}
        />
      ) : checks.length > 0 ? (
        <div>
          <h2 className="mb-3 text-lg font-semibold">
            Past Design Optimisation Reports
          </h2>
          <div className="space-y-2">
            {checks.map(
              (check: {
                id: string;
                status: string;
                summary: string | null;
                created_at: string;
                completed_at: string | null;
              }) => (
                <Link
                  key={check.id}
                  href={`/build/${projectId}/report/${check.id}`}
                >
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium capitalize">
                            {check.status}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(check.created_at).toLocaleString("en-AU")}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </CardContent>
                  </Card>
                </Link>
              )
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
