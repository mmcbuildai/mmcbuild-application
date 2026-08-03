import { FileText, Box, Info } from "lucide-react";
import { ReportExportButton } from "@/components/shared/report-export-button";
import { DaeDownloadButton } from "./dae-download-button";
import { DxfDownloadButton } from "./dxf-download-button";
import { IfcDownloadButton } from "./ifc-download-button";
import {
  EXPORT_FORMATS,
  NO_GEOMETRY_REASON,
  type ExportFormatGuidance,
} from "@/lib/build/export-formats";

/**
 * Build design-report exports, in two independent groups (SCRUM-354 §2.1/§2.2).
 *
 * Karthik, 21 July: the exports rendered as one flat right-aligned row of five
 * buttons, which read as a single undifferentiated action and looked poor. They
 * are two different things — the written analysis, and the geometry — and a user
 * usually wants one or the other. Neither group gates the other.
 *
 * Each format states which software opens it, from the single-sourced table in
 * lib/build/export-formats, so a downloaded .ifc is not a dead end.
 */

/** One format's guidance line under its control. */
function FormatNote({ guidance }: { guidance: ExportFormatGuidance }) {
  return (
    <p className="text-[11px] leading-relaxed text-muted-foreground">
      <span className="font-medium text-foreground/70">Opens in:</span>{" "}
      {guidance.opensIn}
      {guidance.note ? ` — ${guidance.note}` : ""}
      {guidance.viewerUrl && (
        <>
          {" "}
          <a
            href={guidance.viewerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {guidance.viewerLabel ?? "Free online viewer"}
          </a>
        </>
      )}
    </p>
  );
}

function GroupHeading({
  icon,
  title,
  blurb,
}: {
  icon: React.ReactNode;
  title: string;
  blurb: string;
}) {
  return (
    <div className="mb-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">{blurb}</p>
    </div>
  );
}

interface ExportPanelProps {
  checkId: string;
  /** True when a spatial layout was extracted — the 3D exports depend on it. */
  hasGeometry: boolean;
  /**
   * Whether the geometry group is shown at all. The geometry exports are built
   * from the same spatial layout as the 3D render, so they are hidden with it
   * (Karen, 2026-08-01). The report group is unaffected — it is the analysis,
   * not the geometry.
   */
  showGeometryGroup: boolean;
}

export function ExportPanel({
  checkId,
  hasGeometry,
  showGeometryGroup,
}: ExportPanelProps) {
  const shortId = checkId.slice(0, 8);

  return (
    // Single column on mobile, two side by side from md. `items-start` so a
    // taller group does not stretch the other.
    <div
      className={`grid items-start gap-4 ${
        showGeometryGroup ? "md:grid-cols-2" : "md:grid-cols-1"
      }`}
    >
      {/* ---------------- Download report ---------------- */}
      {/* 44px minimum touch target on mobile, relaxing to the compact size from
          sm: upwards — applied here rather than in each button so the shared
          components keep their existing sizing everywhere else. */}
      <section className="rounded-lg border bg-white p-4 [&_button]:min-h-11 sm:[&_button]:min-h-9">
        <GroupHeading
          icon={<FileText className="h-4 w-4 text-brand-700" />}
          title="Download report"
          blurb="The written analysis — suggestions, savings and compliance notes."
        />
        <div className="flex flex-wrap gap-2">
          <ReportExportButton
            url={`/api/build/report/${checkId}`}
            fallbackFilename={`mmc-build-report-${shortId}.pdf`}
          />
        </div>
        <div className="mt-3 space-y-1.5">
          <FormatNote guidance={EXPORT_FORMATS["report-pdf"]} />
          <FormatNote guidance={EXPORT_FORMATS["report-docx"]} />
        </div>
      </section>

      {/* ---------------- Download 3D rendering ---------------- */}
      {showGeometryGroup && (
        <section className="rounded-lg border bg-white p-4 [&_button]:min-h-11 sm:[&_button]:min-h-9">
          <GroupHeading
            icon={<Box className="h-4 w-4 text-brand-700" />}
            title="Download 3D rendering"
            blurb="The model geometry, for CAD and BIM software."
          />

          {hasGeometry ? (
            <>
              <div className="flex flex-wrap gap-2">
                <IfcDownloadButton
                  checkId={checkId}
                  fallbackFilename={`mmc-build-${shortId}.ifc`}
                  available
                  showHelper={false}
                />
                <DaeDownloadButton
                  checkId={checkId}
                  fallbackFilename={`mmc-build-${shortId}.dae`}
                  available
                  showHelper={false}
                />
                <DxfDownloadButton
                  checkId={checkId}
                  fallbackFilename={`mmc-build-modified-${shortId}.dxf`}
                  available
                  showHelper={false}
                />
              </div>
              <div className="mt-3 space-y-1.5">
                <FormatNote guidance={EXPORT_FORMATS.ifc} />
                <FormatNote guidance={EXPORT_FORMATS.dae} />
                <FormatNote guidance={EXPORT_FORMATS.dxf} />
              </div>
            </>
          ) : (
            // Previously this rendered nothing at all, so the exports appeared
            // to have vanished with no way to tell whether that was a bug
            // (SCRUM-354: say why it is unavailable rather than just greying out).
            <div className="flex gap-2 rounded-md border border-dashed bg-muted/40 p-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {NO_GEOMETRY_REASON}
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
