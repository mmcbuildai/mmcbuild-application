"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Video, Upload, X, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  ACCEPTED_VIDEO_EXTENSIONS,
  validateVideoFile,
  formatBytes,
} from "@/lib/train/video";

interface VideoUploadProps {
  /** Path prefix — the lesson's course id keeps a tenant-agnostic folder. */
  courseId: string;
  value?: { url: string; name: string } | null;
  onUploaded: (file: { url: string; name: string } | null) => void;
}

// SCRUM-59 — upload a lesson video to the training-videos bucket. Validates type
// + size client-side (mirrors the bucket limits) before the upload starts.
export function VideoUpload({ courseId, value, onUploaded }: VideoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    const check = validateVideoFile({ type: file.type, size: file.size });
    if (!check.ok) {
      setError(check.error);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading(true);
    const supabase = createClient();
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${courseId}/${timestamp}_${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("training-videos")
      .upload(filePath, file, { contentType: file.type });

    if (uploadError) {
      setUploading(false);
      setError(`Upload failed: ${uploadError.message}`);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("training-videos")
      .getPublicUrl(filePath);

    onUploaded({ url: urlData.publicUrl, name: file.name });
    setUploading(false);
  };

  const clear = () => {
    onUploaded(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      {value?.url ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{value.name || "Lesson video"}</span>
            <button
              type="button"
              onClick={clear}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Remove video"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <video
            src={value.url}
            controls
            preload="metadata"
            className="max-h-48 w-full rounded-md border bg-black"
          />
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Upload lesson video
            </>
          )}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        MP4, WebM, MOV or M4V — up to {formatBytes(500 * 1024 * 1024)}.
      </p>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_VIDEO_EXTENSIONS}
        onChange={handleUpload}
        className="hidden"
      />
    </div>
  );
}
