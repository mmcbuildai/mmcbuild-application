import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wrench, Plus, ArrowRight } from "lucide-react";
import Link from "next/link";
import { ExplainerVideo } from "@/components/shared/explainer-video";
import { BetaTaskPanel } from "@/components/beta/beta-task-panel";

export default async function BuildPage() {
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, address, status, created_at")
    .order("created_at", { ascending: false });

  if (!projects || projects.length === 0) {
    redirect("/projects?prompt=create");
  }

  return (
    <div className="space-y-6">
      <BetaTaskPanel moduleId="build" />
      <ExplainerVideo module="build" videoUrl="/videos/build-explainer.mp4" />

      <div className="space-y-6">
        {projects && projects.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => {
              const isDraft = project.status === "draft";
              return (
                <Link
                  key={project.id}
                  href={isDraft ? `/projects/${project.id}` : `/build/${project.id}`}
                >
                  <Card
                    className={`transition-shadow cursor-pointer ${isDraft ? "opacity-60" : "hover:shadow-md"}`}
                  >
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">
                          {project.name}
                        </CardTitle>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <CardDescription>
                        {project.address ?? "No address"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        {isDraft ? (
                          <Badge
                            variant="outline"
                            className="border-amber-500 text-amber-600"
                          >
                            Not activated
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="capitalize">
                            {project.status}
                          </Badge>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {new Date(project.created_at).toLocaleDateString(
                            "en-AU"
                          )}
                        </p>
                      </div>
                      {isDraft && (
                        <p className="mt-3 text-xs text-amber-700 dark:text-amber-500">
                          Go to Projects and activate the project before
                          running a Build analysis.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <Card className="flex flex-col items-center justify-center py-12">
            <Wrench className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">No projects yet</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Create a project first, then run design optimisation.
            </p>
            <Link href="/projects">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Go to Projects
              </Button>
            </Link>
          </Card>
        )}
      </div>
    </div>
  );
}
