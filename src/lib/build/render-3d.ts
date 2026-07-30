/**
 * 3D rendering visibility gate (Go Live 1 — client call 2026-07-29).
 *
 * The reconstructed-3D visuals in MMC Build (the Build Sequence storyboard, the
 * Standard Model view, the per-system canvases in Compare Systems, the curated
 * design render on the optimisation report, and the /build/test-3d dev harness)
 * are switched OFF for Go Live 1. The extraction itself is NOT disabled: it
 * still runs, still gates Design Optimisation, and still feeds the system
 * comparison — only the rendered geometry is hidden.
 *
 * Why: on a two-storey duplex the upper floor renders at the wrong size with a
 * partial roof (Karen, 2026-07-29). Her concern is trust contagion, not
 * aesthetics — "if the 3D looks wrong, they'll go, okay, is the data wrong?".
 * A visibly wrong render discredits the compliance and comparison output that
 * IS correct, so it is worth more hidden than shown.
 *
 * Karen's scope, verbatim: "do we just not have a 3D in here, but have all the
 * other components — all the pros and the cons". So Compare Systems keeps its
 * metrics, pros/cons and suitability; only its canvases go.
 *
 * DEFAULT = ENABLED. Absent or any value other than the literal string "false"
 * keeps 3D visible, so merging this change alters nothing in the current
 * environment. To hide it at Go Live, set
 *   NEXT_PUBLIC_3D_RENDERING_ENABLED=false
 * in the environment (production + preview) and redeploy. Flip it back to
 * re-enable — nothing is deleted, matching the beta-module treatment
 * (see src/lib/beta/enabled.ts, SCRUM-351).
 *
 * NEXT_PUBLIC_* is readable in both server and client components, so this one
 * helper gates every surface (server pages/copy + client views).
 */
export function is3dRenderingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_3D_RENDERING_ENABLED !== "false";
}
