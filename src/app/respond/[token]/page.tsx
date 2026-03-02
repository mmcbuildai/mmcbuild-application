import { createAdminClient } from "@/lib/supabase/admin";
import { ResponseForm } from "./response-form";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function RespondPage({ params }: PageProps) {
  const { token } = await params;
  const admin = createAdminClient();

  // Load share token
  const { data: shareToken } = await admin
    .from("finding_share_tokens" as never)
    .select("*")
    .eq("token", token)
    .single();

  if (!shareToken) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center">
        <h2 className="text-lg font-semibold text-gray-900">Link Not Found</h2>
        <p className="mt-2 text-sm text-gray-500">
          This remediation link is invalid or has been removed.
        </p>
      </div>
    );
  }

  const st = shareToken as Record<string, unknown>;

  // Check expiry
  if (new Date(st.expires_at as string) < new Date()) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center">
        <h2 className="text-lg font-semibold text-gray-900">Link Expired</h2>
        <p className="mt-2 text-sm text-gray-500">
          This remediation link has expired. Please contact the builder for a new link.
        </p>
      </div>
    );
  }

  // Load finding
  const { data: finding } = await admin
    .from("compliance_findings")
    .select("*")
    .eq("id", st.finding_id as string)
    .single();

  if (!finding) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center">
        <h2 className="text-lg font-semibold text-gray-900">Finding Not Found</h2>
        <p className="mt-2 text-sm text-gray-500">
          The compliance finding associated with this link could not be found.
        </p>
      </div>
    );
  }

  const f = finding as Record<string, unknown>;

  // Load project name
  const { data: project } = await admin
    .from("projects")
    .select("name")
    .eq("id", st.project_id as string)
    .single();

  const findingData = {
    title: f.title as string,
    description: ((f.amended_description as string) ?? f.description) as string,
    severity: f.severity as string,
    ncc_section: f.ncc_section as string,
    ncc_citation: f.ncc_citation as string | null,
    category: f.category as string,
    remediation_action: ((f.amended_action as string) ?? f.remediation_action) as string | null,
  };

  return (
    <ResponseForm
      token={token}
      finding={findingData}
      projectName={project?.name ?? "Unknown Project"}
      currentStatus={st.remediation_status as string}
      previousNotes={st.response_notes as string | null}
    />
  );
}
