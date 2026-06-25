/**
 * Ready-made sample designs a beta tester can use to create a project when they
 * don't have their own plan to upload. Picking one copies the file into the
 * tester's new project and processes it exactly like a normal upload.
 *
 * For the beta these point directly at existing, processed plans (which are
 * referenced by live projects, so the storage-trim script keeps them). The
 * trade-off: if that source project is deleted, that sample stops working —
 * acceptable for the beta. Post Pro-upgrade we move these into a stable
 * `plan-uploads/samples/` folder (scripts/seed-sample-designs.mjs) so they're
 * independent of any tester's project.
 *
 * Keep the list curated to plans that extract cleanly (good 3D / Comply / Quote).
 */
export interface SampleDesign {
  id: string;
  name: string;
  description: string;
  /** Path within the plan-uploads bucket (stable samples/ folder). */
  samplePath: string;
  /** File name shown on the tester's plan once copied in. */
  fileName: string;
  fileKind: "pdf" | "dwg";
  /** Approximate size for the plan record (not load-bearing). */
  sizeBytes: number;
}

// PRUNED 2026-06-25: every available sample was MULTI-STOREY, and Build 3D only
// renders a single storey today — so a tester picking a sample hit a 3D step
// that rendered the design wrong (an incomplete ground-floor-only model). Rather
// than offer designs we know mis-render, the picker is empty until we add
// single-storey rich designs (sourcing single-storey patterns from the NSW
// Housing Pattern Book — same free source as TH01). The create-project dialog
// hides the sample section when this list is empty, leaving "upload your own".
//
// Removed entries (restore by re-pointing at single-storey plans once verified):
//  - "terrace"     → TH01 Terraces (Carter Williamson), 2–3 storey. Keep TH01 for
//                    EXTRACTION testing only (Class 1a / typology / BASIX pre-fill),
//                    not as a beta-pickable design.
//      path: 71d9fefc-…/929b572f-…/1781405698797_TH01_Terraces_01_by_Carter_Williamson-01.pdf
//  - "townhouses"  → Mittagong multi-dwelling DA set, 2-storey.
//      path: 71d9fefc-…/39ec1435-…/1780455022360_Mittagong_Townhouses_Architectural_DA_20241018.pdf
export const SAMPLE_DESIGNS: SampleDesign[] = [];

export function getSampleDesign(id: string): SampleDesign | undefined {
  return SAMPLE_DESIGNS.find((s) => s.id === id);
}
