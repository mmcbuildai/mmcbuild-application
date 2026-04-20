/**
 * Model Router — maps AI functions to the best available model with fallback chains.
 */

import { MODEL_REGISTRY, type AIFunction, type ModelDefinition } from "./registry";
import { callProvider, type ModelCallOptions, type ModelCallResult } from "./call";
import { trackUsage } from "./tracker";

/**
 * Fallback chains per AI function. First available model wins.
 */
const ROUTING_TABLE: Record<AIFunction, string[]> = {
  compliance_primary: ["claude-sonnet-4", "gpt-4o", "claude-haiku-4.5"],
  compliance_validator: ["gpt-4o", "claude-haiku-4.5", "gpt-4o-mini"],
  design_primary: ["claude-sonnet-4", "gpt-4o"],
  cost_primary: ["claude-sonnet-4", "gpt-4o", "claude-haiku-4.5"],
  summary: ["claude-sonnet-4", "gpt-4o"],
  rd_classification: ["claude-haiku-4.5", "gpt-4o-mini"],
  embedding: ["text-embedding-3-small"],
  reranking: ["bge-reranker-v2-m3"],
  reconciliation: ["claude-sonnet-4", "gpt-4o"],
  training_content: ["claude-sonnet-4", "gpt-4o", "claude-haiku-4.5"],
  plan_vision: ["claude-sonnet-4", "gpt-4o"],
};

/**
 * Resolve the best available model for a given AI function.
 */
export function route(fn: AIFunction): ModelDefinition {
  const chain = ROUTING_TABLE[fn];
  if (!chain || chain.length === 0) {
    throw new Error(`No routing chain configured for function: ${fn}`);
  }

  for (const modelId of chain) {
    const model = MODEL_REGISTRY[modelId];
    if (model?.isAvailable) return model;
  }

  throw new Error(
    `No available model for function: ${fn}. Tried: ${chain.join(", ")}`
  );
}

/**
 * Call an AI model with automatic fallback on provider failure.
 * Logs usage to ai_usage_log.
 */
export async function callModel(
  fn: AIFunction,
  options: ModelCallOptions & {
    orgId?: string;
    checkId?: string;
  }
): Promise<ModelCallResult> {
  const chain = ROUTING_TABLE[fn];
  let lastError: Error | null = null;

  for (let i = 0; i < chain.length; i++) {
    const model = MODEL_REGISTRY[chain[i]];
    if (!model?.isAvailable) continue;

    const isFallback = i > 0;
    const startTime = Date.now();

    try {
      const result = await callProvider(model, options);
      const latencyMs = Date.now() - startTime;

      if (result.usage.cacheCreationTokens || result.usage.cacheReadTokens) {
        console.log(
          `[Router] ${fn} (${model.id}) cache tokens: ` +
            `write=${result.usage.cacheCreationTokens ?? 0} ` +
            `read=${result.usage.cacheReadTokens ?? 0}`
        );
      }

      // Track usage (non-blocking)
      trackUsage({
        orgId: options.orgId,
        checkId: options.checkId,
        aiFunction: fn,
        modelId: model.id,
        provider: model.provider,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        estimatedCostUsd: estimateCost(model, result.usage.inputTokens, result.usage.outputTokens),
        latencyMs,
        wasFallback: isFallback,
      }).catch((e) => console.error("[Tracker] Failed to log usage:", e));

      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `[Router] ${model.id} failed for ${fn}: ${lastError.message}. ` +
          (i < chain.length - 1 ? `Trying fallback...` : `No more fallbacks.`)
      );

      // Track the failure
      trackUsage({
        orgId: options.orgId,
        checkId: options.checkId,
        aiFunction: fn,
        modelId: model.id,
        provider: model.provider,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
        latencyMs: Date.now() - startTime,
        wasFallback: isFallback,
        errorMessage: lastError.message,
      }).catch(() => {});
    }
  }

  throw lastError ?? new Error(`All models failed for function: ${fn}`);
}

function estimateCost(
  model: ModelDefinition,
  inputTokens: number,
  outputTokens: number
): number {
  return (
    (inputTokens / 1000) * model.costPer1kInput +
    (outputTokens / 1000) * model.costPer1kOutput
  );
}
