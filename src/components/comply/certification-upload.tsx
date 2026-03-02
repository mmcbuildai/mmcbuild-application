"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileCheck, Loader2 } from "lucide-react";
import { registerCertification } from "@/app/(dashboard)/comply/actions";
import { createClient } from "@/lib/supabase/client";

const CERT_TYPE_OPTIONS = [
  { group: "Engineering", options: [
    { value: "structural", label: "Structural Engineering" },
    { value: "geotechnical", label: "Geotechnical" },
    { value: "energy_nathers", label: "Energy (NatHERS)" },
    { value: "energy_jv3", label: "Energy (JV3)" },
    { value: "bushfire_bal", label: "Bushfire / BAL" },
    { value: "acoustic", label: "Acoustic" },
    { value: "hydraulic", label: "Hydraulic" },
    { value: "electrical", label: "Electrical" },
    { value: "waterproofing", label: "Waterproofing" },
  ]},
  { group: "QLD Forms", options: [
    { value: "form_15_qld", label: "Form 15 (QLD)" },
    { value: "form_16_qld", label: "Form 16 (QLD)" },
    { value: "form_21_qld", label: "Form 21 (QLD)" },
  ]},
  { group: "NSW Forms", options: [
    { value: "cdc_nsw", label: "CDC (NSW)" },
    { value: "cc_nsw", label: "CC (NSW)" },
    { value: "oc_nsw", label: "OC (NSW)" },
  ]},
  { group: "VIC Forms", options: [
    { value: "building_permit_vic", label: "Building Permit (VIC)" },
    { value: "reg_126_vic", label: "Reg 126 (VIC)" },
  ]},
  { group: "Other States", options: [
    { value: "design_compliance_wa", label: "Design Compliance (WA)" },
    { value: "building_rules_sa", label: "Building Rules (SA)" },
    { value: "likely_compliance_tas", label: "Likely Compliance (TAS)" },
  ]},
  { group: "Other", options: [
    { value: "other", label: "Other" },
  ]},
];

const ACCEPTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
];

interface CertificationUploadProps {
  projectId: string;
  existingCerts?: {
    id: string;
    cert_type: string;
    file_name: string;
    status: string;
    issuer_name: string | null;
    issue_date: string | null;
    error_message: string | null;
    created_at: string;
  }[];
}

function certTypeLabel(certType: string): string {
  for (const group of CERT_TYPE_OPTIONS) {
    const opt = group.options.find((o) => o.value === certType);
    if (opt) return opt.label;
  }
  return certType;
}

export function CertificationUpload({ projectId, existingCerts = [] }: CertificationUploadProps) {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [certType, setCertType] = useState("structural");
  const [issuerName, setIssuerName] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [notes, setNotes] = useState("");

  const handleFile = useCallback(async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Only PDF, JPEG, PNG, and TIFF files are accepted");
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      setError("File size must be under 100MB");
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const supabase = createClient();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Not authenticated");
        setUploading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("user_id", user.id)
        .single();

      if (!profile) {
        setError("Profile not found");
        setUploading(false);
        return;
      }

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${profile.org_id}/${projectId}/${Date.now()}_${safeName}`;

      const { error: storageError } = await supabase.storage
        .from("engineering-certs")
        .upload(filePath, file, {
          contentType: file.type,
        });

      if (storageError) {
        setError(`Upload failed: ${storageError.message}`);
        setUploading(false);
        return;
      }

      const result = await registerCertification(
        projectId,
        file.name,
        filePath,
        file.size,
        certType,
        {
          issuerName: issuerName || undefined,
          issueDate: issueDate || undefined,
          notes: notes || undefined,
        }
      );

      setUploading(false);

      if (result.error) {
        setError(result.error);
      } else {
        setIssuerName("");
        setIssueDate("");
        setNotes("");
        router.refresh();
      }
    } catch (err) {
      console.error("Upload failed:", err);
      setError("Upload failed. Please try again.");
      setUploading(false);
    }
  }, [projectId, certType, issuerName, issueDate, notes, router]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="space-y-6">
      {/* Upload form */}
      <div className="space-y-4">
        <div>
          <Label>Certification Type</Label>
          <select
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            value={certType}
            onChange={(e) => setCertType(e.target.value)}
          >
            {CERT_TYPE_OPTIONS.map((group) => (
              <optgroup key={group.group} label={group.group}>
                {group.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Issuer Name (optional)</Label>
            <Input
              placeholder="e.g., Smith Engineering"
              value={issuerName}
              onChange={(e) => setIssuerName(e.target.value)}
            />
          </div>
          <div>
            <Label>Issue Date (optional)</Label>
            <Input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label>Notes (optional)</Label>
          <Input
            placeholder="e.g., Rev B, updated for wind region change"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      {/* Dropzone */}
      <Card
        className={`border-2 border-dashed transition-colors ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          {uploading ? (
            <>
              <Loader2 className="mb-3 h-10 w-10 animate-spin text-primary" />
              <p className="text-sm font-medium">Uploading certification...</p>
            </>
          ) : (
            <>
              <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium">
                Drag and drop certification file here
              </p>
              <p className="mb-3 text-xs text-muted-foreground">
                PDF, JPEG, PNG, or TIFF — max 100MB
              </p>
              <Button variant="outline" size="sm" asChild>
                <label className="cursor-pointer">
                  Browse Files
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif"
                    className="hidden"
                    onChange={handleInputChange}
                  />
                </label>
              </Button>
            </>
          )}

          {error && (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          )}
        </CardContent>
      </Card>

      {/* Existing certifications */}
      {existingCerts.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold">Uploaded Certifications</h3>
          <div className="space-y-2">
            {existingCerts.map((cert) => (
              <div
                key={cert.id}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{cert.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {certTypeLabel(cert.cert_type)}
                      {cert.issuer_name && ` — ${cert.issuer_name}`}
                    </p>
                  </div>
                </div>
                <Badge
                  variant={
                    cert.status === "ready"
                      ? "default"
                      : cert.status === "error"
                      ? "destructive"
                      : "secondary"
                  }
                  className="text-xs capitalize shrink-0"
                >
                  {cert.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
