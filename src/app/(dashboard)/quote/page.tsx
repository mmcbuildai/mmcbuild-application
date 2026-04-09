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
import { Calculator, Plus, ArrowRight } from "lucide-react";
import Link from "next/link";
import { ModuleHero } from "@/components/shared/module-hero";

function QuotePreviewCard() {
  return (
    <div className="bg-white/[0.08] border border-white/15 rounded-2xl backdrop-blur-xl p-6 shadow-2xl">
      <div className="flex items-center gap-3 mb-4">
        <Calculator className="w-5 h-5 text-white/70" />
        <span className="text-base font-medium text-white/90">
          AI Cost Analysis
        </span>
      </div>
      <div className="space-y-3">
        <div className="bg-white/[0.06] border border-white/10 rounded-xl px-5 py-4">
          <p className="text-xs uppercase text-white/60">Base Cost</p>
          <p className="text-2xl font-bold text-white">$485,000</p>
        </div>
        <div className="bg-white/[0.06] border border-white/10 rounded-xl px-5 py-4">
          <p className="text-xs uppercase text-white/60">MMC Alternative</p>
          <p className="text-2xl font-bold text-green-400">$445,000</p>
          <p className="text-sm text-green-400">&#8595; 8% savings</p>
        </div>
      </div>
    </div>
  );
}

export default async function QuotePage() {
  const supabase = await createClient();

  const { data: hasProjects } = await supabase
    .from("projects")
    .select("id")
    .limit(1);

  if (!hasProjects || hasProjects.length === 0) {
    redirect("/projects?prompt=create");
  }

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, address, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <div>
      <ModuleHero
        module="quote"
        heading={
          <>
            <span className="text-violet-400">Intelligent</span> Quoting Made
            Simple
          </>
        }
        description="Generate itemised cost breakdowns using AI analysis. Compare traditional vs MMC construction costs instantly."
        previewCard={<QuotePreviewCard />}
      />

      <div className="space-y-6">
        {projects && projects.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => {
              const isDraft = project.status === "draft";
              return (
                <Link
                  key={project.id}
                  href={
                    isDraft
                      ? `/projects/${project.id}`
                      : `/quote/${project.id}`
                  }
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
                            Setup required
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
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <Card className="flex flex-col items-center justify-center py-12">
            <Calculator className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">No projects yet</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Create a project first, then run cost estimation.
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
