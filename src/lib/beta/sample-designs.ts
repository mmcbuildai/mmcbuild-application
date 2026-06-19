/**
 * Ready-made sample designs a beta tester can use to create a project when they
 * don't have their own plan to upload. Each points at a stable file in the
 * `plan-uploads/samples/` storage folder (seeded once via
 * scripts/seed-sample-designs.mjs). Picking one copies it into the tester's new
 * project and processes it exactly like a normal upload.
 *
 * Keep this list curated to plans that extract cleanly (good 3D / Comply / Quote
 * results). Add/replace entries here, then add the matching file to samples/.
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
    name: "Two-storey home — Gladesville",
    description:
      "A standard two-storey detached house. A good all-round sample for Comply, Build and Quote.",
    samplePath: "samples/gladesville-two-storey.pdf",
    fileName: "Sample — Gladesville two-storey.pdf",
    fileKind: "pdf",
    sizeBytes: 36_000_000,
  },
  {
    id: "manor-home",
    name: "Manor home",
    description: "A larger single-dwelling architectural set.",
    samplePath: "samples/manor-home.pdf",
    fileName: "Sample — Manor home.pdf",
    fileKind: "pdf",
    sizeBytes: 24_000_000,
  },
  {
    id: "terrace",
    name: "Terrace house",
    description: "A narrow two-storey terrace.",
    samplePath: "samples/terrace.pdf",
    fileName: "Sample — Terrace house.pdf",
    fileKind: "pdf",
    sizeBytes: 32_000_000,
  },
];

export function getSampleDesign(id: string): SampleDesign | undefined {
  return SAMPLE_DESIGNS.find((s) => s.id === id);
}
