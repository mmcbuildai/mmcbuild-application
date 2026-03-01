"use client";

import { useState, useRef } from "react";
import {
  registerKbDocument,
  uploadKbManualText,
  uploadKbUrl,
} from "@/app/(dashboard)/settings/knowledge/actions";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileText, Globe, Type } from "lucide-react";

const ACCEPTED_EXTENSIONS =
  ".pdf,.dwg,.ifc,.jpg,.jpeg,.png,.doc,.docx,.pln,.txt";

function getMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    pdf: "application/pdf",
    dwg: "application/acad",
    ifc: "application/x-step",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pln: "application/octet-stream",
    txt: "text/plain",
  };
  return mimeMap[ext ?? ""] ?? "application/octet-stream";
}

export function KbDocumentUpload({ kbId }: { kbId: string }) {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // URL state
  const [url, setUrl] = useState("");
  const [urlTitle, setUrlTitle] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);

  // Manual text state
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const [textLoading, setTextLoading] = useState(false);

  async function handleFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setUploading(true);
    setUploadStatus(`Uploading ${fileArray.length} file(s)...`);

    const supabase = createClient();
    let successCount = 0;

    try {
      for (const file of fileArray) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filePath = `${kbId}/${Date.now()}_${safeName}`;

        setUploadStatus(
          `Uploading ${file.name} (${successCount + 1}/${fileArray.length})...`
        );

        // Upload directly to Supabase Storage from browser
        const { error: storageError } = await supabase.storage
          .from("kb-uploads")
          .upload(filePath, file, {
            contentType: getMimeType(file.name),
          });

        if (storageError) {
          console.error(
            `Storage upload failed for ${file.name}:`,
            storageError.message
          );
          setUploadStatus(`Failed to upload ${file.name}: ${storageError.message}`);
          continue;
        }

        // Register in DB + trigger Inngest via lightweight server action
        try {
          await registerKbDocument(kbId, file.name, filePath, file.size);
          successCount++;
        } catch (err) {
          console.error(`Register failed for ${file.name}:`, err);
        }
      }

      if (successCount > 0) {
        setUploadStatus(
          `Uploaded ${successCount} file(s). Processing in background...`
        );
      } else {
        setUploadStatus("No files were uploaded. Check formats and try again.");
      }
      setTimeout(() => setUploadStatus(null), 5000);
    } catch (err) {
      console.error("Upload failed:", err);
      setUploadStatus("Upload failed. Check file size and format.");
      setTimeout(() => setUploadStatus(null), 5000);
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleUrlSubmit() {
    if (!url.trim()) return;
    setUrlLoading(true);
    try {
      await uploadKbUrl(kbId, url, urlTitle);
      setUrl("");
      setUrlTitle("");
      setUploadStatus("URL content saved. Processing in background...");
      setTimeout(() => setUploadStatus(null), 5000);
    } catch (err) {
      console.error("URL fetch failed:", err);
      setUploadStatus("Failed to fetch URL. Check the address and try again.");
      setTimeout(() => setUploadStatus(null), 5000);
    } finally {
      setUrlLoading(false);
    }
  }

  async function handleTextSubmit() {
    if (!textTitle.trim() || !textContent.trim()) return;
    setTextLoading(true);
    try {
      await uploadKbManualText(kbId, textTitle, textContent);
      setTextTitle("");
      setTextContent("");
      setUploadStatus("Text saved. Processing in background...");
      setTimeout(() => setUploadStatus(null), 5000);
    } catch (err) {
      console.error("Text save failed:", err);
      setUploadStatus("Failed to save text.");
      setTimeout(() => setUploadStatus(null), 5000);
    } finally {
      setTextLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Tabs defaultValue="files">
        <TabsList>
          <TabsTrigger value="files">
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Files
          </TabsTrigger>
          <TabsTrigger value="url">
            <Globe className="mr-1.5 h-3.5 w-3.5" />
            URL
          </TabsTrigger>
          <TabsTrigger value="text">
            <Type className="mr-1.5 h-3.5 w-3.5" />
            Manual Text
          </TabsTrigger>
        </TabsList>

        <TabsContent value="files">
          <Card
            className={`border-2 border-dashed transition-colors ${
              dragOver
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25"
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
                    {uploadStatus ?? "Uploading..."}
                  </p>
                </>
              ) : (
                <>
                  <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-1">
                    Drag & drop files here, or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    PDF, DWG, IFC, JPG, PNG, Word, PLN, TXT — multiple files
                    supported
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => inputRef.current?.click()}
                  >
                    Select Files
                  </Button>
                  <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPTED_EXTENSIONS}
                    multiple
                    className="hidden"
                    onChange={handleInputChange}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="url">
          <Card>
            <CardContent className="space-y-3 pt-4">
              <div className="space-y-2">
                <Label htmlFor="url-title">Title (optional)</Label>
                <Input
                  id="url-title"
                  placeholder="e.g. NCC Volume 2 Online"
                  value={urlTitle}
                  onChange={(e) => setUrlTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="url-input">URL</Label>
                <Input
                  id="url-input"
                  type="url"
                  placeholder="https://..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                onClick={handleUrlSubmit}
                disabled={urlLoading || !url.trim()}
              >
                {urlLoading ? "Fetching..." : "Add URL"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="text">
          <Card>
            <CardContent className="space-y-3 pt-4">
              <div className="space-y-2">
                <Label htmlFor="text-title">Title</Label>
                <Input
                  id="text-title"
                  placeholder="e.g. NCC Amendment Notes"
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="text-content">Content</Label>
                <Textarea
                  id="text-content"
                  placeholder="Paste or type content here..."
                  rows={8}
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                onClick={handleTextSubmit}
                disabled={
                  textLoading || !textTitle.trim() || !textContent.trim()
                }
              >
                {textLoading ? "Saving..." : "Add Text"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {uploadStatus && !uploading && (
        <p className="text-sm text-muted-foreground text-center">
          {uploadStatus}
        </p>
      )}
    </div>
  );
}
