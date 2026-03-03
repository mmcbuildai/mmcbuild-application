import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Play,
  FileText,
  ArrowRight,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import {
  getProjectPlans,
  getProjectQuestionnaire,
  getProjectCertifications,
  getProjectContributors,
} from "@/app/(dashboard)/projects/actions";
import {
  getProjectChecks,
  deleteComplianceCheck,
} from "../actions";
import { RunCheckButton } from "@/components/comply/run-check-button";
import { ReadinessIndicators } from "@/components/projects/readiness-indicators";

export default async function ProjectComplyPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, address")
    .eq("id", projectId)
    .single();

  if (!project) {
    redirect("/comply");
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("user_id", user.id).single()
    : { data: null };
  const canDeleteChecks = profile?.role === "owner" || profile?.role === "admin";

  const [plans, questionnaire, checks, certifications, contributors] = await Promise.all([
    getProjectPlans(projectId),
    getProjectQuestionnaire(projectId),
    getProjectChecks(projectId),
    getProjectCertifications(projectId),
    getProjectContributors(projectId),
  ]);

  const readyPlan = plans.find(
    (p: { status: string }) => p.status === "ready"
  );
  const hasQuestionnaire = questionnaire?.completed;
  const canRunCheck = !!readyPlan && !!hasQuestionnaire;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/comply"
          className="text-sm text-muted-foreground hover:underline"
        >
          &larr; Back to Comply
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{project.name}</h1>
        <p className="text-muted-foreground">
          {project.address ?? "No address"}
        </p>
      </div>

      {/* Readiness + Run Check */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project Readiness</CardTitle>
            <CardDescription>
              Set up your project data to run a compliance check
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReadinessIndicators
              projectId={projectId}
              hasPlans={!!readyPlan}
              hasQuestionnaire={!!hasQuestionnaire}
              contributorCount={contributors.length}
              certificationCount={certifications.length}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Play className="h-5 w-5" />
              <CardTitle className="text-base">Run Compliance Check</CardTitle>
            </div>
            <CardDescription>
              Generate an AI-powered NCC compliance report
            </CardDescription>
          </CardHeader>
          <CardContent>
            {canRunCheck ? (
              <RunCheckButton
                projectId={projectId}
                planId={readyPlan.id}
                questionnaireId={questionnaire?.id ?? null}
              />
            ) : (
              <div className="text-sm text-muted-foreground">
                {!readyPlan && <p>Upload and process a plan first.</p>}
                {!hasQuestionnaire && <p>Complete the questionnaire first.</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* MMC Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">MMC Pipeline</CardTitle>
          <CardDescription>
            Your project journey through the MMC ecosystem
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 overflow-x-auto">
            {[
              { label: "Comply", active: true, desc: "NCC compliance check" },
              { label: "Build", active: false, desc: "Design optimisation" },
              { label: "Quote", active: false, desc: "Cost estimation" },
              { label: "Directory", active: false, desc: "Find trades" },
              { label: "Train", active: false, desc: "Upskill your team" },
            ].map((step, i) => (
              <div key={step.label} className="flex items-center gap-2">
                {i > 0 && (
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div
                  className={`rounded-md border px-3 py-2 text-center min-w-[100px] ${
                    step.active
                      ? "border-primary bg-primary/10"
                      : "border-dashed opacity-50"
                  }`}
                >
                  <p
                    className={`text-sm font-medium ${
                      step.active ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {step.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {step.active ? step.desc : "Coming soon"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Past checks */}
      {checks.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Past Compliance Checks</h2>
          <div className="space-y-2">
            {checks.map(
              (check: {
                id: string;
                status: string;
                overall_risk: string | null;
                summary: string | null;
                created_at: string;
                completed_at: string | null;
              }) => (
                <Link
                  key={check.id}
                  href={`/comply/${projectId}/check/${check.id}`}
                >
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium capitalize">
                            {check.status}
                            {check.overall_risk &&
                              ` - ${check.overall_risk} risk`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(check.created_at).toLocaleString(
                              "en-AU"
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {canDeleteChecks && (
                          <form
                            action={async () => {
                              "use server";
                              await deleteComplianceCheck(check.id);
                              revalidatePath(`/comply/${projectId}`);
                            }}
                          >
                            <Button
                              type="submit"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </form>
                        )}
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
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
