import { PlanDropzone } from "@/components/projects/plan-dropzone";
import { PlanList } from "@/components/projects/plan-list";
import { CertificationUpload } from "@/components/projects/certification-upload";

interface Plan {
  id: string;
  file_name: string;
  status: string;
  file_size_bytes: number;
  page_count: number | null;
}

interface ExistingCert {
  id: string;
  cert_type: string;
  file_name: string;
  status: string;
  issuer_name: string | null;
  issue_date: string | null;
  notes?: string | null;
  error_message: string | null;
  created_at: string;
}

interface DocumentsTabProps {
  projectId: string;
  plans: Plan[];
  certifications: ExistingCert[];
}

export function DocumentsTab({ projectId, plans, certifications }: DocumentsTabProps) {
  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="mb-1 text-lg font-semibold">Building Plans</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Upload PDF building plans for compliance analysis
        </p>
        <PlanDropzone projectId={projectId} />
        <div className="mt-4">
          <PlanList plans={plans} />
        </div>
      </div>

      <div>
        <h2 className="mb-1 text-lg font-semibold">Engineering Certifications</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Upload engineering certificates and state-specific forms (optional)
        </p>
        <CertificationUpload projectId={projectId} existingCerts={certifications} />
      </div>
    </div>
  );
}
