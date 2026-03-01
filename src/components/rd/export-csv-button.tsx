"use client";

import { exportTimeEntriesCsv } from "@/app/(dashboard)/settings/rd-tracking/actions";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export function ExportCsvButton() {
  async function handleExport() {
    const csv = await exportTimeEntriesCsv();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rd-time-entries-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download className="mr-2 h-4 w-4" />
      Export CSV
    </Button>
  );
}
