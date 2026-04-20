/**
 * Unified model call dispatcher — routes to the correct provider.
 */

import type { ModelDefinition } from "./registry";
import { callAnthropic } from "./providers/anthropic";
import { callOpenAI, callOpenAIEmbedding } from "./providers/openai";
import { callHuggingFaceReranker } from "./providers/huggingface";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ModelCallOptions {
  messages?: ChatMessage[];
  system?: string;
  maxTokens?: number;
  tools?: ToolDefinition[];
  /**
   * Anthropic prompt caching: a stable prefix to prepend to the final user
   * message as a cached content block. Subsequent calls with the same prefix
   * within the 5-minute TTL pay 10% of the normal input cost for this portion.
   * Ignored by non-Anthropic providers.
   */
  cacheUserPrefix?: string;
  // For embeddings
  input?: string | string[];
  dimensions?: number;
  // For reranking
  query?: string;
  documents?: string[];
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ModelCallResult {
  text: string;
  toolCalls?: ToolUseBlock[];
  stopReason?: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    /** Tokens written to the prompt cache on this call (billed at 125% of base input). */
    cacheCreationTokens?: number;
    /** Tokens read from the prompt cache on this call (billed at 10% of base input). */
    cacheReadTokens?: number;
  };
  // For embeddings
  embeddings?: number[][];
  // For reranking
  scores?: number[];
}

export async function callProvider(
  model: ModelDefinition,
  options: ModelCallOptions
): Promise<ModelCallResult> {
  switch (model.provider) {
    case "anthropic":
      return callAnthropic(model, options);
    case "openai":
      if (model.capabilities.includes("embedding") && options.input) {
        return callOpenAIEmbedding(model, options);
      }
      return callOpenAI(model, options);
    case "huggingface":
      if (model.capabilities.includes("reranking") && options.query && options.documents) {
        return callHuggingFaceReranker(model, options);
      }
      throw new Error(`HuggingFace model ${model.id} called without reranking parameters`);
    default:
      throw new Error(`Unknown provider: ${model.provider}`);
  }
}
