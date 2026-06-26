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
export const SAMPLE_DESIGNS: SampleDesign[] = [
  {
    id: "terrace",
    name: "2-storey terrace house (Class 1)",
    description:
      "A two-storey attached terrace (Carter Williamson, NSW Pattern Book) — a Class 1 residential form. Renders as a multi-storey 3D model with a per-floor selector.",
    samplePath:
      "71d9fefc-97ec-442c-b22c-eb01be1c5583/929b572f-0bfd-469e-8068-683c1a7cbe7e/1781405698797_TH01_Terraces_01_by_Carter_Williamson-01.pdf",
    fileName: "Sample — 2-storey terrace house.pdf",
    fileKind: "pdf",
    sizeBytes: 33_430_484,
  },
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
