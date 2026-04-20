/**
 * Anthropic provider — wraps the Anthropic SDK for chat + tool_use.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ModelDefinition } from "../registry";
import type { ModelCallOptions, ModelCallResult, ToolUseBlock } from "../call";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return client;
}

export async function callAnthropic(
  model: ModelDefinition,
  options: ModelCallOptions
): Promise<ModelCallResult> {
  const anthropic = getClient();

  const rawMessages = (options.messages ?? []).filter((m) => m.role !== "system");

  // If cacheUserPrefix is set, inject it as a cached content block on the
  // FIRST user message. Subsequent calls with the same prefix within the
  // 5-minute TTL will read from cache at 10% of the input cost.
  const messages = rawMessages.map((m, idx) => {
    const isFirstUser =
      options.cacheUserPrefix &&
      m.role === "user" &&
      rawMessages.findIndex((x) => x.role === "user") === idx;

    if (isFirstUser) {
      return {
        role: "user" as const,
        content: [
          {
            type: "text" as const,
            text: options.cacheUserPrefix!,
            cache_control: { type: "ephemeral" as const },
          },
          { type: "text" as const, text: m.content },
        ],
      };
    }

    return { role: m.role as "user" | "assistant", content: m.content };
  });

  const systemPrompt =
    options.system ??
    options.messages?.find((m) => m.role === "system")?.content;

  const params: Anthropic.MessageCreateParams = {
    model: model.modelId,
    max_tokens: options.maxTokens ?? model.maxOutput,
    messages: messages as Anthropic.MessageCreateParams["messages"],
  };

  if (systemPrompt) {
    params.system = systemPrompt;
  }

  if (options.tools && options.tools.length > 0) {
    params.tools = options.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool.InputSchema,
    }));
  }

  const response = await anthropic.messages.create(params);

  const textBlocks = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text);

  const toolCalls = response.content
    .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
    .map(
      (b): ToolUseBlock => ({
        type: "tool_use",
        id: b.id,
        name: b.name,
        input: b.input as Record<string, unknown>,
      })
    );

  return {
    text: textBlocks.join(""),
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    stopReason: response.stop_reason ?? undefined,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationTokens: response.usage.cache_creation_input_tokens ?? undefined,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? undefined,
    },
  };
}
