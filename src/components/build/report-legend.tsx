"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Info } from "lucide-react";

export function ReportLegend() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-md border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        <Info className="h-4 w-4 text-brand-600" />
        <span>How to read this report</span>
      </button>

      {open && (
        <div className="border-t px-4 py-3 space-y-3 text-sm">
          <Row
            term="Effort (Low / Medium / High)"
            definition="How disruptive the change would be to implement — structural impact, design rework, trade availability, schedule. NOT a cost or time number; those are separate."
          />
          <Row
            term="Confidence (0–100%)"
            definition="The AI's confidence that this suggestion fits this specific plan and would deliver the claimed savings. Calibrated by your team's past feedback — categories you've accepted before get a small boost, ones you've rejected get a penalty."
          />
          <Row
            term="Time Savings (%)"
            definition="Estimated reduction in build programme weeks vs traditional construction for this element. Based on typical Australian residential projects."
          />
          <Row
            term="Cost Savings (%)"
            definition="Estimated reduction in total cost-of-build for this element vs traditional construction. Includes labour, transport, and crane time, not just material rate."
          />
          <Row
            term="Waste Reduction (%)"
            definition="Estimated reduction in on-site material waste vs traditional construction (by mass)."
          />
          <Row
            term="Pursuing / Considering / Rejected"
            definition="Your decision per suggestion. Pursuing + Considering forms your shortlist — the savings totals at the top recompute to that subset, so you can model your real strategy rather than the AI's full menu."
          />
        </div>
      )}
    </div>
  );
}

function Row({ term, definition }: { term: string; definition: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
        {term}
      </p>
      <p className="text-sm text-muted-foreground leading-snug">{definition}</p>
    </div>
  );
}
