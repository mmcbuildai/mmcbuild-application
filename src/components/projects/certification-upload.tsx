"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Upload, FileCheck, Loader2, Pencil, Trash2, File, X } from "lucide-react";
import {
  registerCertification,
  updateCertification,
  deleteCertification,
} from "@/app/(dashboard)/projects/actions";
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

interface CertificationUploadProps {
  projectId: string;
  existingCerts?: ExistingCert[];
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

  const [stagedFile, setStagedFile] = useState<File | null>(null);

  const [certType, setCertType] = useState("structural");
  const [issuerName, setIssuerName] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [notes, setNotes] = useState("");

  const [editingCert, setEditingCert] = useState<ExistingCert | null>(null);
  const [editCertType, setEditCertType] = useState("");
  const [editIssuer, setEditIssuer] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const stageFile = useCallback((file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Only PDF, JPEG, PNG, and TIFF files are accepted");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError("File size must be under 100MB");
      return;
    }
    setError(null);
    setStagedFile(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) stageFile(file);
    },
    [stageFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) stageFile(file);
    },
    [stageFile]
  );

  function clearStaged() {
    setStagedFile(null);
    setError(null);
  }

  async function handleUploadAndSave() {
    if (!stagedFile) return;

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

      const safeName = stagedFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${profile.org_id}/${projectId}/${Date.now()}_${safeName}`;

      const { error: storageError } = await supabase.storage
        .from("engineering-certs")
        .upload(filePath, stagedFile, {
          contentType: stagedFile.type,
        });

      if (storageError) {
        setError(`Upload failed: ${storageError.message}`);
        setUploading(false);
        return;
      }

      const result = await registerCertification(
        projectId,
        stagedFile.name,
        filePath,
        stagedFile.size,
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
        setStagedFile(null);
        setCertType("structural");
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
  }

  function openEdit(cert: ExistingCert) {
    setEditingCert(cert);
    setEditCertType(cert.cert_type);
    setEditIssuer(cert.issuer_name ?? "");
    setEditDate(cert.issue_date ?? "");
    setEditNotes(cert.notes ?? "");
  }

  async function handleEditSave() {
    if (!editingCert) return;
    setEditSaving(true);
    const result = await updateCertification(editingCert.id, {
      certType: editCertType,
      issuerName: editIssuer,
      issueDate: editDate,
      notes: editNotes,
    });
    setEditSaving(false);
    if (!result.error) {
      setEditingCert(null);
      router.refresh();
    }
  }

  async function handleDelete(certId: string) {
    if (!confirm("Delete this certification? This cannot be undone.")) return;
    setDeletingId(certId);
    const result = await deleteCertification(certId);
    setDeletingId(null);
    if (!result.error) {
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      {!stagedFile ? (
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
            {error && !stagedFile && (
              <p className="mt-3 text-sm text-red-600">{error}</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-5 space-y-4">
            <div className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <File className="h-4 w-4 shrink-0 text-primary" />
                <span className="text-sm font-medium truncate">{stagedFile.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  ({(stagedFile.size / 1024 / 1024).toFixed(1)} MB)
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={clearStaged}
                disabled={uploading}
                title="Remove file"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div>
              <Label>Certification Type</Label>
              <select
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                value={certType}
                onChange={(e) => setCertType(e.target.value)}
                disabled={uploading}
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
                  disabled={uploading}
                />
              </div>
              <div>
                <Label>Issue Date (optional)</Label>
                <Input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  disabled={uploading}
                />
              </div>
            </div>

            <div>
              <Label>Notes (optional)</Label>
              <Input
                placeholder="e.g., Rev B, updated for wind region change"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={uploading}
              />
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <div className="flex items-center gap-2 pt-2">
              <Button
                onClick={handleUploadAndSave}
                disabled={uploading}
                className="flex-1"
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading & Saving...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload & Save
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={clearStaged}
                disabled={uploading}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openEdit(cert)}
                    title="Edit certification"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(cert.id)}
                    disabled={deletingId === cert.id}
                    title="Delete certification"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <Badge
                    variant={
                      cert.status === "ready"
                        ? "default"
                        : cert.status === "error"
                        ? "destructive"
                        : "secondary"
                    }
                    className="text-xs capitalize"
                  >
                    {cert.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={!!editingCert} onOpenChange={(open) => !open && setEditingCert(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Certification</DialogTitle>
            <DialogDescription>
              Update certification details for {editingCert?.file_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Certification Type</Label>
              <select
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                value={editCertType}
                onChange={(e) => setEditCertType(e.target.value)}
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
            <div>
              <Label>Issuer Name</Label>
              <Input
                value={editIssuer}
                onChange={(e) => setEditIssuer(e.target.value)}
              />
            </div>
            <div>
              <Label>Issue Date</Label>
              <Input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Input
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCert(null)}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={editSaving}>
              {editSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
