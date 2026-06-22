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

export const SAMPLE_DESIGNS: SampleDesign[] = [
  {
    id: "gladesville",
    name: "5-storey boarding house (Class 3)",
    description:
      "A large, dense 5-storey Class 3 boarding house (Gladesville). Multi-unit and multi-page — good for testing NCC Volume One compliance and large-set extraction. Note: this is NOT a simple house.",
    samplePath:
      "fef03b67-2f82-4250-93de-87ded6e297ef/0484d6cf-7d4a-49f2-9f83-858c5cf0e236/1781779368183_1780977413263_260603_Architectural_Drawings.pdf",
    fileName: "Sample — 5-storey boarding house (Gladesville).pdf",
    fileKind: "pdf",
    sizeBytes: 37_668_141,
  },
  {
    id: "terrace",
    name: "2-storey terrace house (Class 1)",
    description:
      "A narrow two-storey attached terrace (Carter Williamson) — a Class 1 residential form, good for tighter attached layouts.",
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
      "A multi-dwelling townhouse DA set (Mittagong) — a smaller, multi-page architectural set of attached dwellings.",
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
