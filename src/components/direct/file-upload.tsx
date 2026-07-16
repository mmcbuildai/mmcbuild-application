"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface FileUploadProps {
  orgId: string;
  onUploaded: (file: { url: string; name: string }) => void;
  accept?: string;
  label?: string;
}

/**
 * Document upload (SCRUM-57) — mirrors ImageUpload's Supabase Storage flow but
 * shows a filename chip instead of an image preview, so PDFs/brochures upload
 * and display sensibly. Returns both the public URL and the original filename.
 */
export function FileUpload({
  orgId,
  onUploaded,
  accept = "application/pdf,image/jpeg,image/png,.doc,.docx",
  label = "Upload File",
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<{ url: string; name: string } | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const supabase = createClient();
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${orgId}/${timestamp}_${safeName}`;

    const { error } = await supabase.storage
      .from("directory-uploads")
      .upload(filePath, file, { contentType: file.type });

    if (error) {
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("directory-uploads")
      .getPublicUrl(filePath);

    const result = { url: urlData.publicUrl, name: file.name };
    setUploaded(result);
    onUploaded(result);
    setUploading(false);
  };

  const clear = () => {
    setUploaded(null);
    onUploaded({ url: "", name: "" });
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      {uploaded ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{uploaded.name}</span>
          <button
            type="button"
            onClick={clear}
            className="text-muted-foreground hover:text-destructive"
            aria-label="Remove file"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="mr-2 h-4 w-4" />
          {uploading ? "Uploading..." : label}
        </Button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleUpload}
        className="hidden"
      />
    </div>
  );
}
