import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CertificationUpload } from "@/components/comply/certification-upload";
import { getProjectCertifications } from "../../actions";

export default async function CertificationsPage({
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

  const certs = await getProjectCertifications(projectId);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link
          href={`/comply/${projectId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          &larr; Back to {project.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Engineering Certifications</h1>
        <p className="text-muted-foreground">
          Upload engineering certificates and state-specific forms for compliance analysis
        </p>
      </div>

      <CertificationUpload
        projectId={projectId}
        existingCerts={certs as {
          id: string;
          cert_type: string;
          file_name: string;
          status: string;
          issuer_name: string | null;
          issue_date: string | null;
          error_message: string | null;
          created_at: string;
        }[]}
      />
    </div>
  );
}
