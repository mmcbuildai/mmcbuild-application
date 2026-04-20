import { callModel } from "./models";
import { COMPLIANCE_SYSTEM_PROMPT } from "./prompts/compliance-system";
import { buildSectionAnalysisBlocks } from "./prompts/compliance-section";
import { extractJson } from "./extract-json";
import { runAgentAnalysis, type CrossCategoryDependency } from "./agent/compliance-agent";
import type { ComplianceSectionResult, NccCategory } from "./types";

export async function analyseCompliance(
  category: NccCategory,
  planContent: string,
  projectContext: string,
  nccContext: string,
  options?: { orgId?: string; checkId?: string; fewShotExamples?: string }
): Promise<ComplianceSectionResult> {
  const { cachedPrefix, query } = buildSectionAnalysisBlocks(
    category,
    planContent,
    projectContext,
    nccContext,
    options?.fewShotExamples
  );

  const result = await callModel("compliance_primary", {
    system: COMPLIANCE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: query }],
    cacheUserPrefix: cachedPrefix,
    maxTokens: 4096,
    orgId: options?.orgId,
    checkId: options?.checkId,
  });

  const parsed = extractJson<ComplianceSectionResult>(result.text);

  console.log(
    `[Compliance] ${category}: ${parsed.findings.length} findings, ` +
      `tokens: ${result.usage.inputTokens}+${result.usage.outputTokens}`
  );

  return parsed;
}

export async function generateSummary(
  findings: ComplianceSectionResult[],
  projectContext: string,
  options?: { orgId?: string; checkId?: string }
): Promise<{ summary: string; overall_risk: "low" | "medium" | "high" | "critical" }> {
  const findingsSummary = findings
    .flatMap((s) => s.findings)
    .map(
      (f) =>
        `[${f.severity.toUpperCase()}] ${f.category} — ${f.title}: ${f.description}`
    )
    .join("\n");

  const result = await callModel("summary", {
    system: COMPLIANCE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Based on the following compliance findings, provide an overall summary and risk rating.

${projectContext}

FINDINGS:
${findingsSummary}

Respond with JSON:
{
  "summary": "string — 2-4 sentence executive summary of compliance status",
  "overall_risk": "low | medium | high | critical"
}

Return ONLY valid JSON.`,
      },
    ],
    maxTokens: 1024,
    orgId: options?.orgId,
    checkId: options?.checkId,
  });

  return extractJson<{ summary: string; overall_risk: "low" | "medium" | "high" | "critical" }>(
    result.text
  );
}

export { runAgentAnalysis, type CrossCategoryDependency };
