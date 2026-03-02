import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { QuestionnaireForm } from "@/components/comply/questionnaire-form";
import { getProjectQuestionnaire } from "../../actions";
import { getProjectSiteIntel } from "@/app/(dashboard)/projects/actions";

export default async function QuestionnairePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .single();

  if (!project) {
    redirect("/comply");
  }

  const [questionnaire, siteIntel] = await Promise.all([
    getProjectQuestionnaire(projectId),
    getProjectSiteIntel(projectId),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link
          href={`/comply/${projectId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          &larr; Back to {project.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Project Questionnaire</h1>
        <p className="text-muted-foreground">
          Provide details about your project for more accurate compliance analysis
        </p>
      </div>

      <QuestionnaireForm
        projectId={projectId}
        existingResponses={
          questionnaire?.responses as Record<string, unknown> | null
        }
        siteIntel={
          siteIntel
            ? {
                climate_zone: siteIntel.climate_zone,
                bal_rating: siteIntel.bal_rating,
                wind_region: siteIntel.wind_region,
              }
            : null
        }
      />
    </div>
  );
}
