/**
 * Model Registry — central definitions for all AI models available to the platform.
 * Decouples business logic from specific model IDs/providers.
 */

export type AIProvider = "anthropic" | "openai" | "huggingface";

export type ModelCapability =
  | "chat"
  | "tool_use"
  | "json_mode"
  | "embedding"
  | "reranking"
  | "classification";

export type AIFunction =
  | "compliance_primary"
  | "compliance_validator"
  | "design_primary"
  | "cost_primary"
  | "summary"
  | "rd_classification"
  | "embedding"
  | "reranking"
  | "reconciliation"
  | "training_content"
  | "plan_vision"
  | "cert_metadata";

export type QualityTier = "standard" | "high" | "premium";

export interface ModelDefinition {
  id: string;
  provider: AIProvider;
  modelId: string; // provider-specific model ID
  capabilities: ModelCapability[];
  contextWindow: number;
  maxOutput: number;
  costPer1MInput: number; // USD per 1,000,000 input tokens
  costPer1MOutput: number; // USD per 1,000,000 output tokens
  qualityTier: QualityTier;
  supportsToolUse: boolean;
  isAvailable: boolean; // feature flag
}

/**
 * All registered models. Add new models here.
 */
export const MODEL_REGISTRY: Record<string, ModelDefinition> = {
  "claude-sonnet-4": {
    id: "claude-sonnet-4",
    provider: "anthropic",
    modelId: "claude-sonnet-4-20250514",
    capabilities: ["chat", "tool_use", "json_mode"],
    contextWindow: 200000,
    maxOutput: 8192,
    costPer1MInput: 3,
    costPer1MOutput: 15,
    qualityTier: "premium",
    supportsToolUse: true,
    isAvailable: true,
  },
  "claude-haiku-4.5": {
    id: "claude-haiku-4.5",
    provider: "anthropic",
    modelId: "claude-haiku-4-5-20251001",
    capabilities: ["chat", "tool_use", "json_mode", "classification"],
    contextWindow: 200000,
    maxOutput: 8192,
    costPer1MInput: 1,
    costPer1MOutput: 5,
    qualityTier: "standard",
    supportsToolUse: true,
    isAvailable: true,
  },
  "gpt-4o": {
    id: "gpt-4o",
    provider: "openai",
    modelId: "gpt-4o",
    capabilities: ["chat", "tool_use", "json_mode"],
    contextWindow: 128000,
    maxOutput: 4096,
    costPer1MInput: 2.5,
    costPer1MOutput: 10,
    qualityTier: "high",
    supportsToolUse: true,
    isAvailable: true,
  },
  "gpt-4o-mini": {
    id: "gpt-4o-mini",
    provider: "openai",
    modelId: "gpt-4o-mini",
    capabilities: ["chat", "json_mode", "classification"],
    contextWindow: 128000,
    maxOutput: 4096,
    costPer1MInput: 0.15,
    costPer1MOutput: 0.6,
    qualityTier: "standard",
    supportsToolUse: false,
    isAvailable: true,
  },
  "text-embedding-3-small": {
    id: "text-embedding-3-small",
    provider: "openai",
    modelId: "text-embedding-3-small",
    capabilities: ["embedding"],
    contextWindow: 8191,
    maxOutput: 0,
    costPer1MInput: 0.02,
    costPer1MOutput: 0,
    qualityTier: "standard",
    supportsToolUse: false,
    isAvailable: true,
  },
  "bge-reranker-v2-m3": {
    id: "bge-reranker-v2-m3",
    provider: "huggingface",
    modelId: "BAAI/bge-reranker-v2-m3",
    capabilities: ["reranking"],
    contextWindow: 8192,
    maxOutput: 0,
    costPer1MInput: 0,
    costPer1MOutput: 0,
    qualityTier: "standard",
    supportsToolUse: false,
    isAvailable: true,
  },
};

export function getModel(id: string): ModelDefinition | undefined {
  return MODEL_REGISTRY[id];
}

export function getModelOrThrow(id: string): ModelDefinition {
  const model = MODEL_REGISTRY[id];
  if (!model) throw new Error(`Model not found in registry: ${id}`);
  return model;
}

export function getAvailableModels(): ModelDefinition[] {
  return Object.values(MODEL_REGISTRY).filter((m) => m.isAvailable);
}
