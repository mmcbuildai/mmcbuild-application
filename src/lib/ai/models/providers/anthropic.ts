/**
 * Anthropic provider — wraps the Anthropic SDK for chat + tool_use.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ModelDefinition } from "../registry";
import type { ModelCallOptions, ModelCallResult, ToolUseBlock } from "../call";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const k = process.env.ANTHROPIC_API_KEY;
    console.log(
      `[Anthropic] init — keyPresent=${!!k} len=${k?.length ?? 0} last4=${k?.slice(-4) ?? "NONE"}`
    );
    client = new Anthropic({ apiKey: k! });
  }
  return client;
}

export async function callAnthropic(
  model: ModelDefinition,
  options: ModelCallOptions
): Promise<ModelCallResult> {
  const anthropic = getClient();

  const rawMessages = (options.messages ?? []).filter((m) => m.role !== "system");
  const firstUserIdx = rawMessages.findIndex((x) => x.role === "user");

  // If cacheUserPrefix and/or images are set, the first user message becomes
  // a content-block array. Caching prefix is at 10% input cost on hit;
  // images attach as base64 source blocks before the user's text.
  const messages = rawMessages.map((m, idx) => {
    const isFirstUser = m.role === "user" && idx === firstUserIdx;
    const hasPrefix = isFirstUser && options.cacheUserPrefix;
    const hasImages = isFirstUser && options.images && options.images.length > 0;
    const hasPdf = isFirstUser && options.pdf;

    if (hasPrefix || hasImages || hasPdf) {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (hasPrefix) {
        blocks.push({
          type: "text",
          text: options.cacheUserPrefix!,
          cache_control: { type: "ephemeral" },
        });
      }
      if (hasPdf) {
        // Anthropic reads PDFs natively — attach as a document block before the
        // question text so the model sees the whole (multi-page) plan.
        blocks.push({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: options.pdf!.data.toString("base64"),
          },
        });
      }
      if (hasImages) {
        for (const img of options.images!) {
          blocks.push({
            type: "image",
            source: {
              type: "base64",
              media_type: img.mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
              data: img.data.toString("base64"),
            },
          });
        }
      }
      blocks.push({ type: "text", text: m.content });
      return { role: "user" as const, content: blocks };
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

  // Extended thinking. max_tokens MUST exceed the thinking budget (the budget is
  // spent before any visible output), so raise the ceiling if the caller's
  // max_tokens doesn't leave room for a real answer on top of the budget.
  if (options.thinkingBudget && options.thinkingBudget > 0) {
    params.thinking = { type: "enabled", budget_tokens: options.thinkingBudget };
    const minOutput = options.thinkingBudget + 4096;
    if (params.max_tokens < minOutput) params.max_tokens = minOutput;
  }

  // Temperature — apply only when the caller asked for one AND extended thinking
  // is OFF. Anthropic requires temperature = 1 while thinking is enabled, so
  // setting a low temp alongside a thinking budget 400s. A low temperature makes
  // structured extraction / classification far more deterministic run-to-run.
  if (options.temperature !== undefined && !params.thinking) {
    params.temperature = options.temperature;
  }

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
