"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DxfDownloadButtonProps {
  checkId: string;
  fallbackFilename: string;
  /** Hide entirely if no spatial layout was extracted. */
  available: boolean;
}

/**
 * Export the modified plan as a DXF/DWG (SCRUM-173): the source plan with the
 * user's pursued MMC changes applied (original dotted, changes solid). Paid-tier
 * only — the API returns 403 with a message for trial/expired orgs, surfaced here.
 */
export function DxfDownloadButton({
  checkId,
  fallbackFilename,
  available,
}: DxfDownloadButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!available) return null;

  const handleDownload = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/build/report/${checkId}/dxf`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to export the modified plan");
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
        title="Export the plan with your pursued MMC changes applied — opens in AutoCAD, BricsCAD, DraftSight"
      >
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <FileDown className="mr-2 h-4 w-4" />
        )}
        Export modified plan (DWG)
      </Button>
      <span className="text-[11px] text-muted-foreground">
        DXF with your pursued changes — original dotted, changes solid
      </span>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
