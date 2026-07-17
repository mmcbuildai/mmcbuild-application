import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileText, ArrowRight, Calculator } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getProjectPlans } from "@/app/(dashboard)/projects/actions";
import { getProjectCostEstimates } from "../actions";
import {
  getSupplierComparisonOptions,
  getProjectSupplierComparisons,
} from "../supplier-actions";
import { RunEstimateButton } from "@/components/quote/run-estimate-button";
import { SupplierComparisonPanel } from "@/components/quote/supplier-comparison-panel";
import { ReportVersionList } from "@/components/shared/report-version-list";
import { ProjectContextSummary } from "@/components/shared/project-context-summary";
import { getReportVersions } from "@/lib/report-versions";
import { getTechnologyLabel } from "@/lib/ai/types";
import { Scale, ArrowUpRight } from "lucide-react";

export default async function ProjectQuotePage({
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
    redirect("/quote");
  }

  if (project.status !== "active") {
    return (
      <div className="space-y-6">
        <div>
          <Link
            href="/quote"
            className="text-sm text-muted-foreground hover:underline"
          >
            &larr; Back to Quote
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
              Complete project setup before running cost estimation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Your project needs plans uploaded before you can use MMC Quote.
            </p>
            <Button asChild>
              <Link href={`/projects/${projectId}`}>
                Complete Project Setup
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [plans, estimates, versions, supplierOptions, supplierComparisons] =
    await Promise.all([
      getProjectPlans(projectId),
      getProjectCostEstimates(projectId),
      getReportVersions(projectId, "quote"),
      getSupplierComparisonOptions(projectId),
      getProjectSupplierComparisons(projectId),
    ]);

  const readyPlan = plans.find(
    (p: { status: string }) => p.status === "ready"
  );
  const canRun = !!readyPlan;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/quote"
          className="text-sm text-muted-foreground hover:underline"
        >
          &larr; Back to Quote
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{project.name}</h1>
        <p className="text-muted-foreground">
          {project.address ?? "No address"}
        </p>
      </div>

      <ProjectContextSummary projectId={projectId} />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Plan Status</CardTitle>
            <CardDescription>
              Cost estimation analyses your uploaded building plans
            </CardDescription>
          </CardHeader>
          <CardContent>
            {readyPlan ? (
              <div className="flex items-center gap-2 text-sm text-green-700">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                Plan ready:{" "}
                {(readyPlan as { file_name?: string }).file_name ??
                  "Uploaded plan"}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                <p>No processed plan found.</p>
                <Link
                  href={`/comply/${projectId}/upload`}
                  className="text-violet-600 hover:underline"
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
              <Calculator className="h-5 w-5 text-violet-600" />
              <CardTitle className="text-base">Run Cost Estimation</CardTitle>
            </div>
            <CardDescription>
              AI-powered itemised cost breakdown with MMC comparison
            </CardDescription>
          </CardHeader>
          <CardContent>
            {canRun ? (
              <RunEstimateButton
                projectId={projectId}
                planId={readyPlan.id}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Upload and process a plan first.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SCRUM-172 — multi-supplier comparison quote */}
      {supplierOptions.length > 0 && (
        <SupplierComparisonPanel
          projectId={projectId}
          options={supplierOptions}
        />
      )}

      {supplierComparisons.length > 0 && (
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <Scale className="h-5 w-5 text-violet-600" />
            Supplier Comparisons
          </h2>
          <div className="space-y-2">
            {supplierComparisons.map((c) => (
              <Link
                key={c.id}
                href={`/quote/${projectId}/suppliers/${c.id}`}
              >
                <Card className="cursor-pointer transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="text-sm font-medium">
                        {getTechnologyLabel(c.technology_category)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.status === "completed"
                          ? "Completed"
                          : c.status === "error"
                            ? "Failed"
                            : "In progress"}
                        {" · "}
                        {new Date(c.created_at).toLocaleString("en-AU")}
                      </p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Version history */}
      {versions.length > 0 && (
        <ReportVersionList
          versions={versions}
          module="quote"
          projectId={projectId}
        />
      )}

      {/* Past estimates (fallback for pre-versioning) */}
      {versions.length === 0 && estimates.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">
            Past Cost Estimates
          </h2>
          <div className="space-y-2">
            {estimates.map(
              (est: {
                id: string;
                status: string;
                total_traditional: number | null;
                total_mmc: number | null;
                total_savings_pct: number | null;
                created_at: string;
                completed_at: string | null;
              }) => (
                <Link
                  key={est.id}
                  href={`/quote/${projectId}/report/${est.id}`}
                >
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium capitalize">
                            {est.total_traditional != null ||
                            est.status === "completed"
                              ? "Completed"
                              : est.status === "error"
                                ? "Failed"
                                : "In progress"}
                            {est.total_traditional != null &&
                              ` - $${est.total_traditional.toLocaleString()}`}
                            {est.total_savings_pct != null &&
                              est.total_savings_pct > 0 &&
                              ` (${est.total_savings_pct}% savings)`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(est.created_at).toLocaleString("en-AU")}
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
      )}
    </div>
  );
}
