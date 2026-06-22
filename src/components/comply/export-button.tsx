"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2, FileText } from "lucide-react";

interface ExportButtonProps {
  checkId: string;
}

export function ExportButton({ checkId }: ExportButtonProps) {
  const [loading, setLoading] = useState<"pdf" | "docx" | null>(null);

  const handleExport = async (format: "pdf" | "docx") => {
    setLoading(format);
    try {
      const url = format === "docx"
        ? `/api/comply/report/${checkId}?format=docx`
        : `/api/comply/report/${checkId}`;
      const res = await fetch(url);
      if (!res.ok) {
        // Surface the real reason from the route (Diagnostic Integrity) rather
        // than a generic "failed".
        let reason = `Failed to export ${format.toUpperCase()} report. Please try again.`;
        try {
          const body = await res.json();
          if (body?.error) reason = body.error;
        } catch {
          // non-JSON body — keep the generic message
        }
        alert(reason);
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download =
        res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ??
        `compliance-report-${checkId.slice(0, 8)}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      alert(`Failed to export ${format.toUpperCase()} report. Please try again.`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={() => handleExport("pdf")} disabled={loading !== null}>
        {loading === "pdf" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
        Export PDF
      </Button>
      <Button variant="outline" size="sm" onClick={() => handleExport("docx")} disabled={loading !== null}>
        {loading === "docx" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
        Export Word
      </Button>
    </div>
  );
}
