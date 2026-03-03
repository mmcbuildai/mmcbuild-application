import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProjectHeader } from "@/components/projects/project-header";
import { SiteIntelCard } from "@/components/projects/site-intel-card";
import { EditProjectDialog } from "@/components/projects/edit-project-dialog";
import { DeleteProjectButton } from "@/components/projects/delete-project-button";
import { ProjectTabs, type ProjectTab } from "@/components/projects/project-tabs";
import { DocumentsTab } from "@/components/projects/documents-tab";
import { ProjectContributors } from "@/components/projects/project-contributors";
import { QuestionnaireForm } from "@/components/projects/questionnaire-form";
import {
  getProjectSiteIntel,
  getProjectPlans,
  getProjectQuestionnaire,
  getProjectCertifications,
  getProjectContributors,
} from "../actions";
import {
  ArrowLeft,
  ShieldCheck,
  HardHat,
  Calculator,
} from "lucide-react";

export default async function ProjectOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const tab = (sp.tab as ProjectTab) || "overview";
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, address, status, created_at, created_by")
    .eq("id", projectId)
    .single();

  if (!project) {
    redirect("/projects");
  }

  // Conditionally fetch data based on active tab
  const siteIntel = tab === "overview" ? await getProjectSiteIntel(projectId) : null;

  const [plans, certifications] = tab === "documents"
    ? await Promise.all([getProjectPlans(projectId), getProjectCertifications(projectId)])
    : [null, null];

  const contributors = tab === "team"
    ? await getProjectContributors(projectId)
    : null;

  const [questionnaire, qSiteIntel] = tab === "questionnaire"
    ? await Promise.all([getProjectQuestionnaire(projectId), getProjectSiteIntel(projectId)])
    : [null, null];

  const modules = [
    {
      title: "MMC Comply",
      description: "NCC compliance checking",
      icon: ShieldCheck,
      href: `/comply/${projectId}`,
    },
    {
      title: "MMC Build",
      description: "Design optimisation",
      icon: HardHat,
      href: `/build/${projectId}`,
      disabled: true,
    },
    {
      title: "MMC Quote",
      description: "Cost estimation",
      icon: Calculator,
      href: `/quote/${projectId}`,
      disabled: true,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/projects"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Projects
        </Link>
        <div className="flex items-start justify-between">
          <ProjectHeader
            name={project.name}
            status={project.status}
            address={project.address}
            createdAt={project.created_at}
          />
          <div className="flex items-center gap-2">
            <EditProjectDialog
              projectId={project.id}
              name={project.name}
              address={project.address}
              status={project.status}
            />
            <DeleteProjectButton
              projectId={project.id}
              projectName={project.name}
            />
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        <ProjectTabs projectId={projectId} />
      </Suspense>

      {/* Overview tab */}
      {tab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            {siteIntel ? (
              <SiteIntelCard intel={siteIntel} />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Site Intelligence</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    No site intelligence available. Add a geocoded address to
                    auto-derive site data.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4 lg:col-span-2">
            <h2 className="text-lg font-semibold">Modules</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {modules.map((mod) => (
                <Card
                  key={mod.title}
                  className={mod.disabled ? "opacity-50" : "hover:shadow-md transition-shadow"}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <mod.icon className="h-5 w-5 text-primary" />
                      <CardTitle className="text-sm">{mod.title}</CardTitle>
                    </div>
                    <CardDescription className="text-xs">
                      {mod.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {mod.disabled ? (
                      <Button size="sm" variant="outline" disabled>
                        Coming Soon
                      </Button>
                    ) : (
                      <Button size="sm" asChild>
                        <Link href={mod.href}>Open</Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Documents tab */}
      {tab === "documents" && plans && certifications && (
        <DocumentsTab
          projectId={projectId}
          plans={plans}
          certifications={certifications as {
            id: string;
            cert_type: string;
            file_name: string;
            status: string;
            issuer_name: string | null;
            issue_date: string | null;
            notes?: string | null;
            error_message: string | null;
            created_at: string;
          }[]}
        />
      )}

      {/* Team tab */}
      {tab === "team" && contributors && (
        <ProjectContributors projectId={projectId} contributors={contributors} />
      )}

      {/* Questionnaire tab */}
      {tab === "questionnaire" && (
        <div className="max-w-2xl">
          <QuestionnaireForm
            projectId={projectId}
            existingResponses={
              questionnaire?.responses as Record<string, unknown> | null
            }
            siteIntel={
              qSiteIntel
                ? {
                    climate_zone: qSiteIntel.climate_zone,
                    bal_rating: qSiteIntel.bal_rating,
                    wind_region: qSiteIntel.wind_region,
                  }
                : null
            }
          />
        </div>
      )}
    </div>
  );
}
