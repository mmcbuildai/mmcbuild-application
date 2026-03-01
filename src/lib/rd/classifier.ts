import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "@/lib/ai/extract-json";
import { RD_STAGES, RD_DELIVERABLES } from "@/lib/rd-constants";
import type { RdTag } from "@/lib/supabase/types";
import type { FileMapping } from "./mapper";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export interface ClassificationResult {
  stage: string;
  deliverable: string;
  rd_tag: RdTag;
  confidence: number;
  reasoning: string;
  estimated_hours: number;
}

export async function classifyCommit(opts: {
  sha: string;
  message: string;
  filesChanged: unknown;
  branch: string;
  fileMappings: FileMapping[];
}): Promise<ClassificationResult> {
  const stageDefinitions = RD_STAGES.map(
    (s) => `${s.value}: ${s.label}`
  ).join("\n");

  const deliverableDefinitions = RD_DELIVERABLES.map(
    (d) => `${d.value}: ${d.label}`
  ).join("\n");

  const mappingRules =
    opts.fileMappings.length > 0
      ? opts.fileMappings
          .map(
            (m) =>
              `${m.pattern} → stage=${m.stage}, deliverable=${m.deliverable}, tag=${m.rd_tag} (priority ${m.priority})`
          )
          .join("\n")
      : "No file mapping rules configured.";

  const prompt = `You are an R&D tax classification assistant for Australian software companies.
Given a git commit, classify it for R&D Tax Incentive (Section 355-25 ITAA 1997).

Project stages:
${stageDefinitions}

Deliverables:
${deliverableDefinitions}

File mapping rules:
${mappingRules}

Commit: ${opts.sha}
Message: ${opts.message}
Files changed: ${JSON.stringify(opts.filesChanged)}
Branch: ${opts.branch}

Respond with JSON:
{
  "stage": "stage_1",
  "deliverable": "ai_compliance_engine",
  "rd_tag": "core_rd",
  "confidence": 0.85,
  "reasoning": "Brief justification for classification",
  "estimated_hours": 0.5
}

Classification guidelines:
- core_rd: Novel technical uncertainty — AI/ML experiments, algorithm design, RAG tuning, prompt engineering, new technical approaches
- rd_supporting: Directly enables core R&D — test harnesses for R&D, data pipelines feeding R&D, infrastructure for experiments
- not_eligible: Standard development — UI styling, config changes, dependency updates, documentation, routine bug fixes

Return ONLY valid JSON.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  const result = extractJson<ClassificationResult>(textBlock.text);

  console.log(
    `[RD Classifier] ${opts.sha.slice(0, 7)}: ${result.rd_tag} (${result.confidence}) — ${result.reasoning.slice(0, 80)}`
  );

  return result;
}
