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
      <div className="flex items-start gap-3 rounded-md border bg-muted/30 px-4 py-3">
        <div className="rounded-md bg-teal-500/10 p-2 text-teal-600 dark:text-teal-400">
          <Wrench className="h-5 w-5" />
        </div>
        <div className="space-y-0.5">
          <h1 className="text-base font-semibold leading-tight">MMC Build</h1>
          <p className="text-sm text-muted-foreground">
            Select an active project to analyse its plans. MMC Build reviews
            your design and flags opportunities to use prefabrication, SIP
            panels, CLT, or modular components — with estimated cost and time
            impact for each.
          </p>
        </div>
      </div>

      <ExplainerVideo
        module="build"
        title="Designing with MMC instead of retrofitting it"
        description="MMC = Modern Methods of Construction. Once your drawing set is locked, swapping in factory-built elements means redrawing — wall thicknesses, span tables, service routing all shift. MMC Build analyses your concept or schematic plans and tells you which methods would actually pay back on this project, while you can still change them."
        bullets={[
          {
            heading: "Prefab & Volumetric",
            body: "Whole rooms or pods built in a factory, craned in. Designs around repeatable bays, tight site access, or fast programmes lend themselves here.",
          },
          {
            heading: "SIP & CLT Panels",
            body: "Structural panels for walls, floors, roof. SIPs deliver insulation; CLT delivers structure plus carbon credentials — designers use them for clear spans and Passivhaus pathways.",
          },
          {
            heading: "Hybrid",
            body: "Mix MMC with traditional trades — the most common real-world answer. Build flags which elements pay back and which to leave conventional, so you draw once.",
          },
        ]}
      />

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
