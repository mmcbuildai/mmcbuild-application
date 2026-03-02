export interface ComplianceFinding {
  ncc_section: string;
  category: string;
  title: string;
  description: string;
  recommendation: string;
  severity: "compliant" | "advisory" | "non_compliant" | "critical";
  confidence: number;
  ncc_citation: string;
  page_references: number[];
}

export interface ComplianceSectionResult {
  category: string;
  findings: ComplianceFinding[];
}

export interface ComplianceReport {
  summary: string;
  overall_risk: "low" | "medium" | "high" | "critical";
  sections: ComplianceSectionResult[];
  disclaimer: string;
}

export interface EmbeddingResult {
  embedding: number[];
  tokens_used: number;
}

export interface DocumentChunk {
  content: string;
  metadata: Record<string, unknown>;
  chunk_index: number;
}

export interface RetrievedDocument {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  source_type: string;
  source_id: string;
  chunk_index: number;
  similarity: number;
}

export type NccCategory =
  | "fire_safety"
  | "structural"
  | "energy_efficiency"
  | "accessibility"
  | "waterproofing"
  | "ventilation"
  | "glazing"
  | "termite"
  | "bushfire"
  | "weatherproofing"
  | "health_amenity"
  | "safe_movement"
  | "ancillary"
  | "livable_housing";

export type NccVolume = 1 | 2;

export const NCC_CATEGORIES: {
  key: NccCategory;
  label: string;
  volume: NccVolume;
}[] = [
  { key: "fire_safety", label: "Fire Safety", volume: 2 },
  { key: "structural", label: "Structural", volume: 2 },
  { key: "energy_efficiency", label: "Energy Efficiency", volume: 2 },
  { key: "accessibility", label: "Accessibility", volume: 1 },
  { key: "waterproofing", label: "Waterproofing", volume: 2 },
  { key: "ventilation", label: "Ventilation", volume: 2 },
  { key: "glazing", label: "Glazing", volume: 2 },
  { key: "termite", label: "Termite Management", volume: 2 },
  { key: "bushfire", label: "Bushfire", volume: 2 },
  { key: "weatherproofing", label: "Building Envelope (H2)", volume: 2 },
  { key: "health_amenity", label: "Health & Amenity (H4)", volume: 2 },
  { key: "safe_movement", label: "Safe Movement & Access (H5)", volume: 2 },
  { key: "ancillary", label: "Ancillary Provisions (H7)", volume: 2 },
  { key: "livable_housing", label: "Livable Housing Design (H8)", volume: 2 },
];

export function getCategoryVolume(category: string): NccVolume {
  const cat = NCC_CATEGORIES.find((c) => c.key === category);
  return cat?.volume ?? 2;
}

export function getCategoryLabel(category: string): string {
  const cat = NCC_CATEGORIES.find((c) => c.key === category);
  return cat?.label ?? category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export type CategoryStatus = "passed" | "issues" | "failed";

export function getCategoryStatus(
  findings: { severity: string }[]
): CategoryStatus {
  const hasCritical = findings.some(
    (f) => f.severity === "critical" || f.severity === "non_compliant"
  );
  if (hasCritical) return "failed";
  const hasAdvisory = findings.some((f) => f.severity === "advisory");
  if (hasAdvisory) return "issues";
  return "passed";
}
