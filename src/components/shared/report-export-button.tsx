"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2, FileText, Check } from "lucide-react";

interface ReportExportButtonProps {
  url: string;
  fallbackFilename: string;
}

export function ReportExportButton({ url, fallbackFilename }: ReportExportButtonProps) {
  const [loading, setLoading] = useState<"pdf" | "docx" | null>(null);
  // Confirmation: a download is invisible (the browser saves silently), so the
  // user couldn't tell it worked (Karen, 2026-06-27: "it didn't show you that
  // you'd exported"). Show a "Downloaded ✓" state for a few seconds after a
  // successful export. Shared component, so every report gets it consistently.
  const [done, setDone] = useState<"pdf" | "docx" | null>(null);

  const handleExport = async (format: "pdf" | "docx") => {
    setLoading(format);
    setDone(null);
    try {
      const fetchUrl = format === "docx" ? `${url}${url.includes("?") ? "&" : "?"}format=docx` : url;
      const res = await fetch(fetchUrl);
      if (!res.ok) throw new Error("Failed to generate report");

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      const fallback = format === "docx" ? fallbackFilename.replace(/\.pdf$/i, ".docx") : fallbackFilename;
      a.download =
        res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? fallback;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      setDone(format);
      setTimeout(() => setDone((d) => (d === format ? null : d)), 4000);
    } catch {
      alert(`Failed to export ${format.toUpperCase()} report. Please try again.`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => handleExport("pdf")} disabled={loading !== null}>
          {loading === "pdf" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : done === "pdf" ? (
            <Check className="mr-2 h-4 w-4 text-green-600" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {done === "pdf" ? "Downloaded" : "Export PDF"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleExport("docx")} disabled={loading !== null}>
          {loading === "docx" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : done === "docx" ? (
            <Check className="mr-2 h-4 w-4 text-green-600" />
          ) : (
            <FileText className="mr-2 h-4 w-4" />
          )}
          {done === "docx" ? "Downloaded" : "Export Word"}
        </Button>
      </div>
      {done && (
        <p className="text-xs text-green-700">
          Downloaded to your device&rsquo;s downloads folder.
        </p>
      )}
    </div>
  );
}
