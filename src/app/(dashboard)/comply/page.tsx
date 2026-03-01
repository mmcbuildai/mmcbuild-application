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
import { ShieldCheck, Plus, ArrowRight } from "lucide-react";
import Link from "next/link";
import { ModuleHero } from "@/components/shared/module-hero";
import { ComplyPreviewCard } from "@/components/comply/comply-preview-card";

export default async function ComplyPage() {
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, address, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <div>
      <ModuleHero
        module="comply"
        heading={
          <>
            Compliance Made{" "}
            <span className="text-cyan-400">Simple</span>
          </>
        }
        description="AI-powered NCC compliance checking for Australian residential construction. Upload plans, answer a few questions, and get instant analysis."
        showDemoButton
        previewCard={<ComplyPreviewCard />}
      />

      <div className="space-y-6">
        {projects && projects.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/comply/${project.id}`}
              >
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{project.name}</CardTitle>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <CardDescription>
                      {project.address ?? "No address"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="capitalize">
                        {project.status}
                      </Badge>
                      <p className="text-xs text-muted-foreground">
                        {new Date(project.created_at).toLocaleDateString("en-AU")}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="flex flex-col items-center justify-center py-12">
            <ShieldCheck className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">No projects yet</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Create a project first, then run compliance checks.
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
