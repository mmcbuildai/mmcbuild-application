/**
 * Cross-Validator — runs secondary model analysis on safety-critical categories
 * and reconciles disagreements between primary and secondary models.
 */

import { callModel, type AIFunction } from "@/lib/ai/models";
import { extractJson } from "@/lib/ai/extract-json";
import { COMPLIANCE_SYSTEM_PROMPT } from "@/lib/ai/prompts/compliance-system";
import { buildSectionAnalysisBlocks } from "@/lib/ai/prompts/compliance-section";
import { SECONDARY_ANALYSIS_PREAMBLE } from "@/lib/ai/prompts/validation-secondary";
import { reconcileFindings } from "./reconciler";
import type { ComplianceSectionResult, NccCategory, ComplianceFinding } from "@/lib/ai/types";

export interface Disagreement {
  findingIndex: number;
  primarySeverity: string;
  secondarySeverity: string;
  description: string;
}

export interface ValidationResult {
  primary: ComplianceSectionResult;
  secondary: ComplianceSectionResult | null;
  reconciled: ComplianceSectionResult;
  agreement_score: number;
  disagreements: Disagreement[];
  secondary_model: string | null;
  was_reconciled: boolean;
}

/**
 * Validation tier assignment per category.
 * Tier 1: safety-critical — always cross-validate
 * Tier 2: high-impact — cross-validate
 * Tier 3: standard — primary only unless critical findings
 */
const CATEGORY_TIERS: Record<string, 1 | 2 | 3> = {
  fire_safety: 1,
  structural: 1,
  bushfire: 1,
  energy_efficiency: 2,
  waterproofing: 2,
  weatherproofing: 2,
  ventilation: 3,
  glazing: 3,
  termite: 3,
  health_amenity: 3,
  safe_movement: 3,
  ancillary: 3,
  livable_housing: 3,
  accessibility: 3,
};

export function getValidationTier(category: string): 1 | 2 | 3 {
  return CATEGORY_TIERS[category] ?? 3;
}

/**
 * Should this category be cross-validated given the configured max tier?
 */
export function shouldCrossValidate(
  category: string,
  maxTier: number,
  primaryResult?: ComplianceSectionResult
): boolean {
  const tier = getValidationTier(category);

  // Always validate if within configured tier
  if (tier <= maxTier) return true;

  // Tier 3 categories: validate if there are critical findings
  if (primaryResult) {
    const hasCritical = primaryResult.findings.some(
      (f) => f.severity === "critical" || f.severity === "non_compliant"
    );
    if (hasCritical) return true;
  }

  return false;
}

const SEVERITY_LEVELS: Record<string, number> = {
  compliant: 0,
  advisory: 1,
  non_compliant: 2,
  critical: 3,
};

/**
 * Run cross-validation on a primary analysis result.
 * Returns the validated (potentially reconciled) result.
 */
export async function crossValidate(
  category: NccCategory,
  primaryResult: ComplianceSectionResult,
  planContent: string,
  projectContext: string,
  nccContext: string,
  options?: { orgId?: string; checkId?: string }
): Promise<ValidationResult> {
  // Run secondary analysis with a different model. The cacheable prefix
  // (project context + plan extracts) is shared with the primary call, so
  // validator runs within the same 5-minute TTL pay 10% of input cost on it.
  const { cachedPrefix, query } = buildSectionAnalysisBlocks(
    category,
    planContent,
    projectContext,
    nccContext
  );
  const secondaryPrompt = SECONDARY_ANALYSIS_PREAMBLE + "\n\n" + query;

  const secondaryResult = await callModel("compliance_validator" as AIFunction, {
    system: COMPLIANCE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: secondaryPrompt }],
    cacheUserPrefix: cachedPrefix,
    maxTokens: 4096,
    orgId: options?.orgId,
    checkId: options?.checkId,
  });

  let secondary: ComplianceSectionResult;
  try {
    secondary = extractJson<ComplianceSectionResult>(secondaryResult.text);
  } catch {
    console.warn(`[CrossValidator] Failed to parse secondary result for ${category}`);
    return {
      primary: primaryResult,
      secondary: null,
      reconciled: primaryResult,
      agreement_score: 1.0,
      disagreements: [],
      secondary_model: null,
      was_reconciled: false,
    };
  }

  // Compare findings
  const disagreements = findDisagreements(primaryResult, secondary);
  const agreementScore = calculateAgreementScore(primaryResult, secondary);

  // Determine if reconciliation is needed
  const needsReconciliation = disagreements.some((d) => {
    const primaryLevel = SEVERITY_LEVELS[d.primarySeverity] ?? 0;
    const secondaryLevel = SEVERITY_LEVELS[d.secondarySeverity] ?? 0;
    return Math.abs(primaryLevel - secondaryLevel) >= 2;
  });

  let reconciled: ComplianceSectionResult;
  let wasReconciled = false;

  if (needsReconciliation) {
    reconciled = await reconcileFindings(
      category,
      primaryResult,
      secondary,
      nccContext,
      options
    );
    wasReconciled = true;
  } else if (disagreements.length > 0) {
    // Minor disagreement: use more conservative severity
    reconciled = mergeConservative(primaryResult, secondary);
  } else {
    // Agreement: use primary with high confidence
    reconciled = primaryResult;
  }

  return {
    primary: primaryResult,
    secondary,
    reconciled,
    agreement_score: agreementScore,
    disagreements,
    secondary_model: "gpt-4o", // from routing table
    was_reconciled: wasReconciled,
  };
}

function findDisagreements(
  primary: ComplianceSectionResult,
  secondary: ComplianceSectionResult
): Disagreement[] {
  const disagreements: Disagreement[] = [];

  // Match findings by NCC section
  for (let i = 0; i < primary.findings.length; i++) {
    const pf = primary.findings[i];
    const sf = secondary.findings.find(
      (f) =>
        f.ncc_section === pf.ncc_section ||
        f.title.toLowerCase() === pf.title.toLowerCase()
    );

    if (sf && sf.severity !== pf.severity) {
      disagreements.push({
        findingIndex: i,
        primarySeverity: pf.severity,
        secondarySeverity: sf.severity,
        description: `Finding "${pf.title}" (${pf.ncc_section}): primary=${pf.severity}, secondary=${sf.severity}`,
      });
    }
  }

  return disagreements;
}

function calculateAgreementScore(
  primary: ComplianceSectionResult,
  secondary: ComplianceSectionResult
): number {
  if (primary.findings.length === 0 && secondary.findings.length === 0) return 1.0;
  if (primary.findings.length === 0 || secondary.findings.length === 0) return 0.5;

  let matches = 0;
  let total = primary.findings.length;

  for (const pf of primary.findings) {
    const sf = secondary.findings.find(
      (f) =>
        f.ncc_section === pf.ncc_section ||
        f.title.toLowerCase() === pf.title.toLowerCase()
    );

    if (sf) {
      const pLevel = SEVERITY_LEVELS[pf.severity] ?? 0;
      const sLevel = SEVERITY_LEVELS[sf.severity] ?? 0;
      const diff = Math.abs(pLevel - sLevel);
      matches += diff === 0 ? 1.0 : diff === 1 ? 0.5 : 0.0;
    }
  }

  return matches / total;
}

function mergeConservative(
  primary: ComplianceSectionResult,
  secondary: ComplianceSectionResult
): ComplianceSectionResult {
  const mergedFindings: ComplianceFinding[] = primary.findings.map((pf) => {
    const sf = secondary.findings.find(
      (f) =>
        f.ncc_section === pf.ncc_section ||
        f.title.toLowerCase() === pf.title.toLowerCase()
    );

    if (!sf) return pf;

    const pLevel = SEVERITY_LEVELS[pf.severity] ?? 0;
    const sLevel = SEVERITY_LEVELS[sf.severity] ?? 0;

    // Use more conservative (higher) severity
    if (sLevel > pLevel) {
      return { ...pf, severity: sf.severity, confidence: Math.min(pf.confidence, sf.confidence) };
    }
    return pf;
  });

  return { category: primary.category, findings: mergedFindings };
}
