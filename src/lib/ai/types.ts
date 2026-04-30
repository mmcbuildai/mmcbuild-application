export type ContributorDiscipline =
  | "architect"
  | "structural_engineer"
  | "hydraulic_engineer"
  | "energy_consultant"
  | "building_surveyor"
  | "geotechnical_engineer"
  | "acoustic_engineer"
  | "fire_engineer"
  | "landscape_architect"
  | "builder"
  | "other";

export const DISCIPLINE_LABELS: Record<ContributorDiscipline, string> = {
  architect: "Architect",
  structural_engineer: "Structural Engineer",
  hydraulic_engineer: "Hydraulic Engineer",
  energy_consultant: "Energy Consultant",
  building_surveyor: "Building Surveyor",
  geotechnical_engineer: "Geotechnical Engineer",
  acoustic_engineer: "Acoustic Engineer",
  fire_engineer: "Fire Engineer",
  landscape_architect: "Landscape Architect",
  builder: "Builder",
  other: "Other",
};

export const CATEGORY_DEFAULT_DISCIPLINE: Record<string, ContributorDiscipline> = {
  fire_safety: "fire_engineer",
  structural: "structural_engineer",
  energy_efficiency: "energy_consultant",
  accessibility: "architect",
  waterproofing: "hydraulic_engineer",
  ventilation: "architect",
  glazing: "architect",
  termite: "builder",
  bushfire: "fire_engineer",
  weatherproofing: "builder",
  health_amenity: "architect",
  safe_movement: "architect",
  ancillary: "builder",
  livable_housing: "architect",
};

export type FindingReviewStatus = "pending" | "accepted" | "amended" | "rejected" | "sent";

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
  responsible_discipline?: ContributorDiscipline;
  remediation_action?: string;
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
  rerank_score?: number;
}

export interface ComplianceFindingWithMeta extends ComplianceFinding {
  source_chunk_ids?: string[];
  validation_tier?: number;
  agreement_score?: number;
  secondary_model?: string;
  was_reconciled?: boolean;
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

// ── Design Optimisation types ──

export type ImplementationComplexity = "low" | "medium" | "high";

export const COMPLEXITY_LABELS: Record<ImplementationComplexity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const COMPLEXITY_COLOURS: Record<ImplementationComplexity, string> = {
  low: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
};

export const MMC_TECHNOLOGY_CATEGORIES = [
  { key: "prefabricated_wall_panels", label: "Prefabricated Wall Panels" },
  { key: "sip_panels", label: "SIP Panels" },
  { key: "clt_mass_timber", label: "CLT / Mass Timber" },
  { key: "modular_pods", label: "Modular Pods (Bathrooms/Kitchens)" },
  { key: "prefab_roof_trusses", label: "Prefabricated Roof Trusses" },
  { key: "precast_concrete", label: "Precast Concrete Elements" },
  { key: "steel_framing", label: "Light-Gauge Steel Framing" },
  { key: "hybrid_systems", label: "Hybrid / Other MMC Systems" },
] as const;

export type MmcTechnologyCategory = (typeof MMC_TECHNOLOGY_CATEGORIES)[number]["key"];

export function getTechnologyLabel(category: string): string {
  const cat = MMC_TECHNOLOGY_CATEGORIES.find((c) => c.key === category);
  return cat?.label ?? category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface DesignSuggestion {
  technology_category: string;
  current_approach: string;
  suggested_alternative: string;
  benefits: string;
  estimated_time_savings: number;
  estimated_cost_savings: number;
  estimated_waste_reduction: number;
  implementation_complexity: ImplementationComplexity;
  confidence: number;
  /** Wall IDs from spatial_layout.walls[].id the suggestion applies to. Empty when no spatial layout was available. */
  affected_wall_ids?: string[];
  /** Room IDs from spatial_layout.rooms[].id the suggestion applies to. */
  affected_room_ids?: string[];
}

export interface DesignOptimisationResult {
  suggestions: DesignSuggestion[];
}

// ── Cost Estimation types ──

export type CostLineSource = "ai_estimated" | "reference" | "user_override";

export const COST_CATEGORIES = [
  { key: "preliminaries", label: "Preliminaries" },
  { key: "substructure", label: "Substructure" },
  { key: "frame", label: "Frame" },
  { key: "roof", label: "Roof" },
  { key: "external_walls", label: "External Walls & Cladding" },
  { key: "windows_doors", label: "Windows & External Doors" },
  { key: "internal_walls", label: "Internal Walls & Partitions" },
  { key: "internal_doors", label: "Internal Doors" },
  { key: "wall_finishes", label: "Wall Finishes" },
  { key: "floor_finishes", label: "Floor Finishes" },
  { key: "ceiling_finishes", label: "Ceiling Finishes" },
  { key: "fitments", label: "Fitments" },
  { key: "plumbing", label: "Plumbing & Drainage" },
  { key: "electrical", label: "Electrical" },
  { key: "mechanical", label: "Mechanical (HVAC)" },
  { key: "fire_services", label: "Fire Services" },
  { key: "external_works", label: "External Works" },
  { key: "contingency", label: "Contingency" },
] as const;

export type CostCategory = (typeof COST_CATEGORIES)[number]["key"];

export function getCostCategoryLabel(category: string): string {
  const cat = COST_CATEGORIES.find((c) => c.key === category);
  return cat?.label ?? category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface CostLineItem {
  cost_category: string;
  element_description: string;
  quantity: number;
  unit: string;
  traditional_rate: number;
  traditional_total: number;
  mmc_rate: number | null;
  mmc_total: number | null;
  mmc_alternative: string | null;
  savings_pct: number | null;
  source: CostLineSource;
  confidence: number;
  rate_source_name: string | null;
  rate_source_detail: string | null;
}

export interface CostCategoryResult {
  category: string;
  line_items: CostLineItem[];
}

export interface CostEstimationResult {
  categories: CostCategoryResult[];
}

/** Regional multipliers relative to NSW baseline (1.0) */
export const REGIONAL_MULTIPLIERS: Record<string, number> = {
  NSW: 1.0,
  VIC: 0.95,
  QLD: 0.88,
  WA: 0.92,
  SA: 0.82,
  TAS: 0.85,
  ACT: 1.02,
  NT: 1.15,
};

/** Cost estimation execution phases — categories in the same phase run concurrently */
export const COST_EXECUTION_PHASES: CostCategory[][] = [
  // Phase A: Independent foundations
  ["preliminaries", "substructure"],
  // Phase B: Superstructure depends on substructure
  ["frame", "roof", "external_walls"],
  // Phase C: Depends on envelope
  ["windows_doors", "internal_walls", "internal_doors"],
  // Phase D: Services depend on layout
  ["plumbing", "electrical", "mechanical", "fire_services"],
  // Phase E: Finishes & fitments
  ["wall_finishes", "floor_finishes", "ceiling_finishes", "fitments"],
  // Phase F: External works + contingency rollup
  ["external_works", "contingency"],
];

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
