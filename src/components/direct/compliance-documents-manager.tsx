"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FileUpload } from "./file-upload";
import { ShieldCheck, Plus, Trash2, Clock, AlertTriangle } from "lucide-react";
import {
  addComplianceDocument,
  deleteComplianceDocument,
} from "@/app/(dashboard)/direct/actions";
import {
  COMPLIANCE_DOC_TYPES,
  complianceDocTypeLabel,
  expiryStatus,
  daysUntilExpiry,
} from "@/lib/direct/compliance-docs";
import type { SupplierComplianceDocument } from "@/lib/direct/types";

// SCRUM-175 — the supplier portal: upload compliance docs (CodeMark, NCC, etc.),
// tag to a product, set an expiry; an operator verifies them before they show
// publicly. Reuses the SCRUM-57 FileUpload + directory-uploads bucket.
export function ComplianceDocumentsManager({
  professionalId,
  orgId,
  documents,
  products,
}: {
  professionalId: string;
  orgId: string;
  documents: SupplierComplianceDocument[];
  products: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState<string>(COMPLIANCE_DOC_TYPES[0].key);
  const [productId, setProductId] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState<{ url: string; name: string }>({
    url: "",
    name: "",
  });

  function resetForm() {
    setTitle("");
    setDocType(COMPLIANCE_DOC_TYPES[0].key);
    setProductId("");
    setExpiresAt("");
    setFile({ url: "", name: "" });
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!file.url) {
      setError("Please upload a file.");
      return;
    }
    setLoading(true);
    const res = await addComplianceDocument(professionalId, {
      title,
      doc_type: docType,
      file_url: file.url,
      file_name: file.name || undefined,
      product_id: productId || undefined,
      expires_at: expiresAt || undefined,
    });
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setAdding(false);
    resetForm();
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    await deleteComplianceDocument(id);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Compliance documents</h3>
        <p className="text-sm text-muted-foreground">
          Upload CodeMark certificates, NCC compliance reports and datasheets. Our
          team verifies each document before it appears on your public listing.
          Verified documents past their expiry date are automatically hidden.
        </p>
      </div>

      {documents.length > 0 && (
        <div className="space-y-2">
          {documents.map((doc) => (
            <ComplianceDocRow key={doc.id} doc={doc} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {adding ? (
        <Card>
          <CardContent className="p-4">
            <form onSubmit={handleAdd} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Document type *</Label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="min-h-11 w-full rounded-md border bg-background px-2 text-sm"
                  >
                    {COMPLIANCE_DOC_TYPES.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Expiry date (optional)</Label>
                  <Input
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="min-h-11"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. CodeMark Certificate CM40234"
                  required
                />
              </div>
              {products.length > 0 && (
                <div className="space-y-2">
                  <Label>Tag to a product (optional)</Label>
                  <select
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                    className="min-h-11 w-full rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="">Not tied to a specific product</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-2">
                <Label>File *</Label>
                <FileUpload
                  orgId={orgId}
                  onUploaded={setFile}
                  accept="application/pdf,.doc,.docx,image/jpeg,image/png"
                  label="Upload PDF / document"
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={loading || !file.url}>
                  {loading ? "Adding..." : "Add Document"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAdding(false);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" onClick={() => setAdding(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add compliance document
        </Button>
      )}
    </div>
  );
}

function ComplianceDocRow({
  doc,
  onDelete,
}: {
  doc: SupplierComplianceDocument;
  onDelete: (id: string) => void;
}) {
  const status = expiryStatus(doc.expires_at);
  const days = daysUntilExpiry(doc.expires_at);

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <ShieldCheck
          className={`h-5 w-5 shrink-0 ${doc.verified ? "text-green-600" : "text-muted-foreground"}`}
        />
        <div className="min-w-0 flex-1">
          <a
            href={doc.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-sm font-medium hover:underline"
          >
            {doc.title}
          </a>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{complianceDocTypeLabel(doc.doc_type)}</span>
            {doc.verified ? (
              <Badge className="bg-green-600 hover:bg-green-600">Verified</Badge>
            ) : (
              <Badge variant="secondary">Pending verification</Badge>
            )}
            {status === "expired" && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> Expired
              </Badge>
            )}
            {status === "expiring_soon" && (
              <Badge className="gap-1 bg-amber-500 hover:bg-amber-500">
                <Clock className="h-3 w-3" /> Expires in {days}d
              </Badge>
            )}
            {status === "valid" && doc.expires_at && (
              <span>Expires {doc.expires_at}</span>
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-red-500"
          onClick={() => onDelete(doc.id)}
          aria-label="Delete document"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
