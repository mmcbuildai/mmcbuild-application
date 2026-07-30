import { describe, it, expect, afterEach } from "vitest";
import { is3dRenderingEnabled } from "@/lib/build/render-3d";

/**
 * Go Live 1 (client call 2026-07-29): the 3D renders are switched off because a
 * two-storey duplex draws its upper floor at the wrong size with a partial roof,
 * and a visibly wrong render discredits the compliance/comparison output that is
 * correct ("if the 3D looks wrong, they'll go, okay, is the data wrong?").
 *
 * Two properties matter and are locked here:
 *  1. DEFAULT-ON — merging the toggle must change nothing until the env var is
 *     deliberately set, so an unset/absent value keeps 3D visible.
 *  2. Only the exact string "false" disables it — a truthy-looking "0"/"no" must
 *     NOT silently hide 3D, and equally must not silently FAIL to hide it. The
 *     one accepted off-switch is the literal "false" (mirrors the beta gate in
 *     src/lib/beta/enabled.ts so both flags behave identically).
 *
 * The helper reads process.env at CALL time (not module scope), so these cases
 * need no dynamic re-import — the module-cache flakiness documented in
 * src/lib/email/resend.ts does not apply.
 */
describe("is3dRenderingEnabled", () => {
  const original = process.env.NEXT_PUBLIC_3D_RENDERING_ENABLED;

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_3D_RENDERING_ENABLED;
    else process.env.NEXT_PUBLIC_3D_RENDERING_ENABLED = original;
  });

  it("defaults to ENABLED when the var is absent (merging the toggle changes nothing)", () => {
    delete process.env.NEXT_PUBLIC_3D_RENDERING_ENABLED;
    expect(is3dRenderingEnabled()).toBe(true);
  });

  it("disables 3D on the literal string 'false' (the Go Live setting)", () => {
    process.env.NEXT_PUBLIC_3D_RENDERING_ENABLED = "false";
    expect(is3dRenderingEnabled()).toBe(false);
  });

  it("stays ENABLED on 'true'", () => {
    process.env.NEXT_PUBLIC_3D_RENDERING_ENABLED = "true";
    expect(is3dRenderingEnabled()).toBe(true);
  });

  it("stays ENABLED on an empty value (an unset var in Vercel must not hide 3D)", () => {
    process.env.NEXT_PUBLIC_3D_RENDERING_ENABLED = "";
    expect(is3dRenderingEnabled()).toBe(true);
  });

  it("does NOT treat other falsey-looking strings as off", () => {
    for (const value of ["0", "no", "off", "FALSE", "False"]) {
      process.env.NEXT_PUBLIC_3D_RENDERING_ENABLED = value;
      expect(is3dRenderingEnabled(), `value: ${value}`).toBe(true);
    }
  });
});
