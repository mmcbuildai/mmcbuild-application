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

// RESTORED 2026-06-27: the picker was emptied 2026-06-25 because every sample was
// MULTI-STOREY while Build 3D could only render a single storey, so a tester
// picking a sample hit a 3D step that rendered an incomplete ground-floor-only
// model. The multi-storey extraction + rendering rebuild (PR #52) now reads all
// floor pages, stacks the storeys, and offers a per-floor selector — and TH01 was
// prod-verified end-to-end (project setup + multi-storey 3D + Comply) on
// 2026-06-26 — so the multi-storey samples render correctly again. The
// create-project dialog shows the sample section whenever this list is non-empty
// (it's the "choose one of these, or upload your own" popup).
//
// Both objects verified present on the live project (lztzyfeivpsbqbsfzctw,
// plan-uploads) on 2026-06-27, sizes matching below. TH01 is 33.4MB — over
// Anthropic's 32MB document ceiling — but pdf-vision-prep shrinks it under the
// limit (the exact TH01 case it was built for), so the Build 3D step succeeds.
// REMOVED 2026-07-03: the "2-storey terrace house" sample was the Carter
// Williamson NSW Pattern Book — a 33.4MB / 70-page CATALOGUE of several different
// terrace designs (LMR / Non-LMR / Rear-Lane / Tunnel-Back adaptations), not a
// single dwelling. That made it an extraction outlier with a high failure rate:
// the 3D extraction returned a valid layout only intermittently (storeys=2 or 3
// on some runs, layout-null on others), which left Design Optimisation gated off
// unpredictably for testers. Pulled from the picker so testers only ever see
// plans that extract cleanly (the curation rule above). A pattern book is the
// wrong shape for a per-building tool; if we want a terrace sample back, use a
// SINGLE-dwelling terrace DA set, not a multi-design catalogue.
export const SAMPLE_DESIGNS: SampleDesign[] = [
  {
    id: "townhouses",
    name: "Multi-dwelling townhouses (DA set)",
    description:
      "A two-storey multi-dwelling townhouse DA set (Mittagong) — a multi-page architectural set of attached dwellings. Renders all storeys in 3D.",
    samplePath:
      "71d9fefc-97ec-442c-b22c-eb01be1c5583/39ec1435-5b31-411a-b658-c0c9e858bf24/1780455022360_Mittagong_Townhouses_Architectural_DA_20241018.pdf",
    fileName: "Sample — Multi-dwelling townhouses.pdf",
    fileKind: "pdf",
    sizeBytes: 14_828_942,
  },
];

export function getSampleDesign(id: string): SampleDesign | undefined {
  return SAMPLE_DESIGNS.find((s) => s.id === id);
}
