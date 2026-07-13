// SCRUM-169: how a suggestion's decision changes its overlay in the 3D "after
// MMC" comparison. Pure so the mapping is unit-testable.
//
//   pursuing    → prominent MMC overlay
//   undecided   → default MMC overlay (the AI's recommendation, not yet judged)
//   considering → faint MMC overlay (a "maybe")
//   rejected    → NO overlay — the affected geometry renders as the original
//                 design (the suggestion "disappears from the render")

export interface OverlayStyle {
  /** false → don't draw the MMC overlay (show original geometry). */
  visible: boolean;
  /** Overlay opacity 0–1 when visible. */
  opacity: number;
}

export function overlayStyleForDecision(
  decision: string | null | undefined,
): OverlayStyle {
  switch (decision) {
    case "rejected":
      return { visible: false, opacity: 0 };
    case "pursuing":
      return { visible: true, opacity: 0.5 };
    case "considering":
      return { visible: true, opacity: 0.15 };
    default:
      // undecided / null / unknown → the current default overlay.
      return { visible: true, opacity: 0.35 };
  }
}
