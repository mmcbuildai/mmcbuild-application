/**
 * Client-side gate for the inline "Run Design Optimisation" action in the Build
 * preview panel.
 *
 * Design Optimisation needs two things, both of which are known on the client
 * the moment they become true:
 *   1. a reconstructed design  — the preview panel is in its `ready` phase, and
 *   2. at least one saved construction system to optimise against.
 *
 * The button is anchored to these client signals ON PURPOSE. It previously lived
 * in a separate, server-rendered card whose gate only re-evaluated when a
 * `router.refresh()` landed. On a multi-storey plan the 3D extraction runs for
 * minutes in-place, so unlocking the button depended entirely on that in-place
 * refresh — and when it didn't propagate, the button stayed dead even though the
 * design was ready and a system was selected (Karen, 2026-07-05: single-storey
 * optimisation ran, the identical two-storey flow never activated the button).
 * Gating on client state removes that race.
 */
export function canRunOptimisationInline(params: {
  /** The preview panel has a reconstructed design (phase === "ready"). */
  designReady: boolean;
  /** Construction systems persisted on the project. */
  savedSystems: string[];
}): boolean {
  return params.designReady && params.savedSystems.length > 0;
}
