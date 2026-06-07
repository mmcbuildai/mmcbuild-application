import { PlanDropzone } from "@/components/projects/plan-dropzone";
import { PlanList } from "@/components/projects/plan-list";
import { CertificationUpload } from "@/components/projects/certification-upload";

interface Plan {
  id: string;
  file_name: string;
  status: string;
  file_size_bytes: number;
  page_count: number | null;
  error_message?: string | null;
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
          Upload your architectural plans. MMC Build reads these to reconstruct
          your design in 3D and run compliance and optimisation analysis.
        </p>

        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <p className="font-medium text-amber-900">What to upload</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-900">
            <li>
              A <strong>complete plan set</strong> — floor plan(s),
              elevations, and a section. The floor plan is required; elevations
              and a section let us read roof form and storey heights for an
              accurate 3D model.
            </li>
            <li>
              A <strong>readable, scaled drawing</strong> — a vector PDF (or
              DWG / RVT / SKP / DOCX, converted automatically). A scanned or
              photographed image-only PDF has no geometry we can extract.
            </li>
            <li>
              Up to 50&nbsp;MB. Multi-page plan sets are fine — we find the
              floor-plan sheet automatically.
            </li>
          </ul>
          <p className="mt-2 text-xs text-amber-800">
            If a design can&apos;t be reconstructed in 3D it can&apos;t be
            processed — you&apos;ll be told why and asked to fix and re-upload it.
          </p>
        </div>

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
