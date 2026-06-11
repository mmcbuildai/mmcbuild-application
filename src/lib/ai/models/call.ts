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
  /**
   * Image attachments to embed into the first user message. Used for vision
   * tasks (e.g. extracting plan content from JPG/PNG drawings). Each entry is
   * raw bytes plus its MIME type — providers convert to the format they
   * expect (Anthropic: base64 source block; OpenAI: data URL).
   */
  images?: { data: Buffer; mimeType: string }[];
  /**
   * A PDF document to attach to the first user message (vision tasks like plan
   * extraction). Anthropic reads PDFs natively (a `document` content block).
   * OpenAI's chat API CANNOT read PDFs — so for an OpenAI model this requires
   * `rasterizePdf` to turn pages into images; if it's absent the OpenAI provider
   * throws a clear error rather than silently dropping the document.
   */
  pdf?: { data: Buffer };
  /**
   * Provider-neutral PDF→image rasteriser, injected by the caller (the AI layer
   * deliberately has no dependency on the plans/CloudConvert module). Only used
   * by providers that can't read PDFs natively (OpenAI). The caller bakes in any
   * page cap / DPI / page-hint logic and returns the page images in order.
   */
  rasterizePdf?: (pdf: Buffer) => Promise<{ data: Buffer; mimeType: string }[]>;
  /**
   * Extended-thinking budget (tokens). Anthropic enables interleaved thinking;
   * max_tokens is raised above the budget if needed. Ignored by providers
   * without an equivalent (OpenAI) — the fallback runs without thinking.
   */
  thinkingBudget?: number;
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
