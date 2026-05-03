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

const showTestingGuide = process.env.NEXT_PUBLIC_TESTING_MODE === "true";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string }>;
}) {
  const params = await searchParams;
  const autoCreate = params.prompt === "create";
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, address, status, created_at, created_by")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      {showTestingGuide && <TestingGuide />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground">
            Manage your construction projects
          </p>
        </div>
        <CreateProjectDialog defaultOpen={autoCreate} />
      </div>

      <ExplainerVideo
        module="projects"
        videoUrl="/videos/projects-explainer.mp4"
        title="One project, every module — set up once, reuse everywhere"
        description="Projects is the foundation of MMC Build. Address, design intent, and drawings are captured once and shared across Comply, Build, and Quote — no re-entering data, no version drift."
        bullets={[
          {
            heading: "Auto-derived intelligence",
            body: "Drop in the address; we auto-derive climate zone, wind region, and council from public data — no manual lookups.",
          },
          {
            heading: "Multi-format plans",
            body: "PDF, DWG, DXF, SketchUp and Revit exports all accepted. Plans are read once and reused by every module.",
          },
          {
            heading: "Activate to analyse",
            body: "Walk through the short questionnaire, then activate. After that every module on the sidebar can run on this project.",
          },
        ]}
      />

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
                  <CardContent>
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
