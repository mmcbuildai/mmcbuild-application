"use client";

import { useState, useRef } from "react";
import { uploadKbDocument } from "@/app/(dashboard)/settings/knowledge/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, FileText } from "lucide-react";

export function KbDocumentUpload({ kbId }: { kbId: string }) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.name.endsWith(".pdf")) {
      alert("Only PDF files are supported");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("kbId", kbId);
      formData.set("file", file);
      await uploadKbDocument(formData);
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <Card
      className={`border-2 border-dashed transition-colors ${
        dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <CardContent className="flex flex-col items-center justify-center py-8">
        {uploading ? (
          <>
            <FileText className="mb-2 h-8 w-8 animate-pulse text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Uploading and processing...
            </p>
          </>
        ) : (
          <>
            <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-3">
              Drag & drop a PDF here, or click to browse
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
            >
              Select PDF
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={handleInputChange}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
