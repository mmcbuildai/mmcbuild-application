import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FolderOpen } from "lucide-react";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { CopyProjectButton } from "@/components/projects/copy-project-button";
import { TestingGuide } from "@/components/dashboard/testing-guide";
import { ExplainerVideo } from "@/components/shared/explainer-video";
import { ProjectProgress } from "@/components/projects/project-progress";
import { getProjectsStageProgress } from "@/lib/projects/progress";

const showTestingGuide = process.env.NEXT_PUBLIC_TESTING_MODE === "true";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string }>;
}) {
  const params = await searchParams;
  const autoCreate = params.prompt === "create";
  const supabase = await createClient();

  // Beta testers share one org (MMC Build), so RLS alone would show them every
  // tester's — and the operator's — projects. Scope the list to the tester's OWN
  // projects (created_by = their profile) so each tester only sees what they
  // made. Operators/owners/admins still see all org projects.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let ownProfileId: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("user_id", user.id)
      .single();
    if (profile && (profile.role as string) === "beta") {
      ownProfileId = profile.id as string;
    }
  }

  let projectsQuery = supabase
    .from("projects")
    .select("id, name, address, status, created_at, created_by")
    .order("created_at", { ascending: false });
  if (ownProfileId) projectsQuery = projectsQuery.eq("created_by", ownProfileId);
  const { data: projects } = await projectsQuery;

  // Per-project module progress (SCRUM-46) — one batched lookup for the list.
  const progressByProject = await getProjectsStageProgress(
    supabase,
    (projects ?? []).map((p) => p.id),
  );

  return (
    <div className="space-y-6">
      {showTestingGuide && <TestingGuide />}

      <ExplainerVideo module="projects" videoUrl="/videos/projects-explainer.mp4" />

      <div className="flex justify-end">
        <CreateProjectDialog defaultOpen={autoCreate} />
      </div>

      {projects && projects.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div key={project.id} className="relative">
              <Link href={`/projects/${project.id}`} className="block">
                <Card className="hover:shadow-md transition-shadow h-full overflow-hidden">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="min-w-0 flex-1 truncate text-lg" title={project.name}>
                        {project.name}
                      </CardTitle>
                      <Badge variant="secondary" className="shrink-0 capitalize">
                        {project.status}
                      </Badge>
                    </div>
                    <CardDescription className="truncate" title={project.address ?? undefined}>
                      {project.address ?? "No address"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {project.status !== "draft" &&
                      progressByProject.get(project.id) && (
                        <ProjectProgress
                          progress={progressByProject.get(project.id)!}
                          compact
                        />
                      )}
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(project.created_at).toLocaleDateString("en-AU")}
                    </p>
                  </CardContent>
                </Card>
              </Link>
              <div className="absolute right-2 top-2">
                <CopyProjectButton projectId={project.id} stopPropagation />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card className="flex flex-col items-center justify-center py-12">
          <FolderOpen className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-medium">No projects yet</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Create your first project to get started with MMC Build.
          </p>
          <CreateProjectDialog defaultOpen={autoCreate} />
        </Card>
      )}
    </div>
  );
}
