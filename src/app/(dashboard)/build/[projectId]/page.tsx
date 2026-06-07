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
  hasPlanLayout,
} from "../actions";
import { RunOptimisationButton } from "@/components/build/run-optimisation-button";
import { SystemSelectionPanel } from "@/components/build/system-selection-panel";
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
  // Hard gate: Design Optimisation only unlocks after the user has run the 3D
  // preview ("See your design built in the 4 MMC systems") and seen their
  // design across the systems. The preview refreshes this page on success.
  const hasPreviewed = readyPlan ? await hasPlanLayout(readyPlan.id) : false;
  const canRun = !!readyPlan && hasPreviewed;

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
          through the 3D extractor so the system choice below is informed. */}
      {readyPlan && <SystemPreviewPanel planId={readyPlan.id} />}

      {/* Construction system selection */}
      <SystemSelectionPanel
        projectId={projectId}
        initialSystems={selectedSystems}
        hasDownstreamReports={checks.length > 0}
      />

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
            ) : !hasPreviewed ? (
              <p className="text-sm text-muted-foreground">
                Run <span className="font-medium">&ldquo;See your design built
                in the 4 MMC systems&rdquo;</span> above and review your design
                first — Design Optimisation unlocks once you have.
              </p>
            ) : (
              <RunOptimisationButton
                projectId={projectId}
                planId={readyPlan.id}
              />
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
