/**
 * OpenAI provider — wraps the OpenAI SDK for chat + embeddings.
 */

import OpenAI from "openai";
import type { ModelDefinition } from "../registry";
import type { ModelCallOptions, ModelCallResult } from "../call";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  }
  return client;
}

export async function callOpenAI(
  model: ModelDefinition,
  options: ModelCallOptions
): Promise<ModelCallResult> {
  const openai = getClient();

  const baseMessages = options.messages ?? [];
  const firstUserIdx = baseMessages.findIndex((m) => m.role === "user");

  // OpenAI's chat API can't read PDFs. If the caller attached one, rasterise it
  // to page images via the injected rasteriser (the AI layer has no dependency
  // on the plans/CloudConvert module). Absent rasteriser = a hard, clear error
  // rather than silently dropping the document and "extracting" from nothing.
  const visionImages: { data: Buffer; mimeType: string }[] = [
    ...(options.images ?? []),
  ];
  if (options.pdf) {
    if (!options.rasterizePdf) {
      throw new Error(
        "OpenAI model received a PDF but no rasterizePdf was provided. " +
          "OpenAI cannot read PDFs natively; the caller must inject a rasteriser.",
      );
    }
    const pdfImages = await options.rasterizePdf(options.pdf.data);
    visionImages.push(...pdfImages);
  }
  const hasImages = visionImages.length > 0;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = baseMessages.map(
    (m, idx) => {
      if (m.role === "user" && idx === firstUserIdx && hasImages) {
        const parts: OpenAI.Chat.ChatCompletionContentPart[] = [
          { type: "text", text: m.content },
        ];
        for (const img of visionImages) {
          parts.push({
            type: "image_url",
            image_url: {
              url: `data:${img.mimeType};base64,${img.data.toString("base64")}`,
            },
          });
        }
        return { role: "user", content: parts };
      }
      return {
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      };
    },
  );

  if (options.system && !messages.some((m) => m.role === "system")) {
    messages.unshift({ role: "system", content: options.system });
  }

  const response = await openai.chat.completions.create({
    model: model.modelId,
    max_tokens: options.maxTokens ?? model.maxOutput,
    messages,
  });

  const choice = response.choices[0];

  return {
    text: choice?.message?.content ?? "",
    stopReason: choice?.finish_reason ?? undefined,
    usage: {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    },
  };
}

export async function callOpenAIEmbedding(
  model: ModelDefinition,
  options: ModelCallOptions
): Promise<ModelCallResult> {
  const openai = getClient();

  const input = options.input!;
  const dimensions = options.dimensions ?? 1536;

  const response = await openai.embeddings.create({
    model: model.modelId,
    input,
    dimensions,
  });

  return {
    text: "",
    embeddings: response.data.map((d) => d.embedding),
    usage: {
      inputTokens: response.usage.total_tokens,
      outputTokens: 0,
    },
  };
}
