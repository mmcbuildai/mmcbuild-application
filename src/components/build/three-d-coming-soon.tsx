import { Box } from "lucide-react";

/**
 * Temporary notice shown on the Design Optimisation report while 3D rendering
 * is switched off for Go Live 1 (Karen, 2026-08-01: "A temporary message on the
 * Design Optimization page to say 3D rendering coming soon").
 *
 * It exists because absence is ambiguous: with the render and the three
 * geometry exports gone, a user who has seen the product before — or read the
 * marketing — is left wondering whether the feature broke, was removed, or was
 * never there. Saying so plainly is the difference between "not built yet" and
 * "built badly", and only one of those is true.
 *
 * Deliberately does NOT promise a date. Switching 3D back on is gated on
 * SCRUM-163 (the two-storey overlay acceptance test), which has no date yet.
 *
 * Delete this component when the flag is retired — it is scaffolding, not a
 * permanent feature.
 */
export function ThreeDComingSoon() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-brand-200 bg-brand-50 p-4">
      <Box className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
      <div>
        <h3 className="text-sm font-semibold text-brand-900">
          3D rendering — coming soon
        </h3>
        <p className="mt-1 text-sm text-brand-800">
          The 3D model view and the CAD/BIM exports are temporarily unavailable
          while we improve how multi-storey plans are reconstructed. Your plan is
          still read in full, and every suggestion, saving and compliance flag in
          this report is based on it — only the 3D picture is hidden.
        </p>
      </div>
    </div>
  );
}
