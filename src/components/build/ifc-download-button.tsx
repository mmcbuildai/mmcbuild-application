"use client";

import { useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface IfcDownloadButtonProps {
  checkId: string;
  fallbackFilename: string;
  /** Hide entirely if no spatial layout was extracted */
  available: boolean;
}

export function IfcDownloadButton({
  checkId,
  fallbackFilename,
  available,
}: IfcDownloadButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!available) return null;

  const handleDownload = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/build/report/${checkId}/ifc`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to generate IFC model");
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download =
        res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ??
        fallbackFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownload}
        disabled={loading}
        title="Open the .ifc in Revit, then Save As .rvt"
      >
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Building2 className="mr-2 h-4 w-4" />
        )}
        Export to Revit (.ifc)
      </Button>
      <span className="text-[11px] text-muted-foreground">
        BIM model — open in Revit / ArchiCAD, then Save As .rvt. Also imports into
        SketchUp Pro.
      </span>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
