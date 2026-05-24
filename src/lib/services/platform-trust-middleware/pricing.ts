// Anthropic model pricing — USD per token
// Updated: 2026-03-30
// Source: https://docs.anthropic.com/en/docs/about-claude/models

export interface ModelPricing {
  inputPerToken: number
  outputPerToken: number
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-6': {
    inputPerToken: 0.000015,
    outputPerToken: 0.000075,
  },
  'claude-sonnet-4-6': {
    inputPerToken: 0.000003,
    outputPerToken: 0.000015,
  },
  'claude-haiku-4-5': {
    inputPerToken: 0.0000008,
    outputPerToken: 0.000004,
  },
  // OpenAI models (used in some projects for embeddings)
  'text-embedding-3-small': {
    inputPerToken: 0.00000002,
    outputPerToken: 0,
  },
  'text-embedding-3-large': {
    inputPerToken: 0.00000013,
    outputPerToken: 0,
  },
}

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model]
  if (!pricing) {
    console.warn(`Unknown model "${model}", using claude-sonnet-4-6 pricing as fallback`)
    const fallback = MODEL_PRICING['claude-sonnet-4-6']
    return inputTokens * fallback.inputPerToken + outputTokens * fallback.outputPerToken
  }
  return inputTokens * pricing.inputPerToken + outputTokens * pricing.outputPerToken
}
