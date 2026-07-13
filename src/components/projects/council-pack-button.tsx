"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";

// SCRUM-333: download the council-ready pack (zip of current drawings + certs +
// latest compliance report). Mirrors the comply export-button download pattern.
export function CouncilPackButton({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/council-pack`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Couldn't compile the pack. Please try again.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition");
      a.download = cd?.match(/filename="(.+)"/)?.[1] ?? "council-pack.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Couldn't compile the pack. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        onClick={download}
        disabled={loading}
        title="Download a zip of the latest drawings, certifications and compliance report, ready for council submission"
      >
        {loading ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <Download className="mr-1.5 h-4 w-4" />
        )}
        Council pack
      </Button>
      {error && (
        <span className="max-w-xs text-right text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
