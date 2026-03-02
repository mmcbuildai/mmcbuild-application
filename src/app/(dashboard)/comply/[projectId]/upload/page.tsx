import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PlanDropzone } from "@/components/comply/plan-dropzone";
import { PlanList } from "@/components/comply/plan-list";
import { getProjectPlans } from "../../actions";

export default async function UploadPage({
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

  const plans = await getProjectPlans(projectId);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link
          href={`/comply/${projectId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          &larr; Back to {project.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Upload Building Plan</h1>
        <p className="text-muted-foreground">
          Upload a PDF of your building plans for compliance analysis
        </p>
      </div>

      <PlanDropzone projectId={projectId} />

      <PlanList plans={plans} />
    </div>
  );
}
