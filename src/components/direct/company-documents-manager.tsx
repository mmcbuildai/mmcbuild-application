"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { FileUpload } from "./file-upload";
import { FileText, Plus, Trash2 } from "lucide-react";
import {
  addCompanyDocument,
  deleteCompanyDocument,
} from "@/app/(dashboard)/direct/actions";
import type { CompanyDocument } from "@/lib/direct/types";

/**
 * Manage brochures / capability statements on a Direct listing (SCRUM-57).
 * Mirrors PortfolioManager but for downloadable documents.
 */
export function CompanyDocumentsManager({
  professionalId,
  orgId,
  documents,
}: {
  professionalId: string;
  orgId: string;
  documents: CompanyDocument[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<{ url: string; name: string }>({
    url: "",
    name: "",
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!file.url) {
      setError("Please upload a file.");
      return;
    }
    setLoading(true);
    const res = await addCompanyDocument(professionalId, {
      title,
      file_url: file.url,
      file_name: file.name || undefined,
    });
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setAdding(false);
    setTitle("");
    setFile({ url: "", name: "" });
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    await deleteCompanyDocument(id);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Company documents</h3>
        <p className="text-sm text-muted-foreground">
          Brochures, capability statements and datasheets shown on your public
          listing.
        </p>
      </div>

      {documents.length > 0 && (
        <div className="space-y-2">
          {documents.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="flex items-center gap-3 p-3">
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {doc.title}
                  </a>
                  {doc.file_name && (
                    <p className="truncate text-xs text-muted-foreground">
                      {doc.file_name}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-red-500"
                  onClick={() => handleDelete(doc.id)}
                  aria-label="Delete document"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {adding ? (
        <Card>
          <CardContent className="p-4">
            <form onSubmit={handleAdd} className="space-y-3">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. 2026 Product Brochure"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>File *</Label>
                <FileUpload
                  orgId={orgId}
                  onUploaded={setFile}
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
                  onClick={() => setAdding(false)}
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
          Add Document
        </Button>
      )}
    </div>
  );
}
