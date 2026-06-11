import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * SCRUM-290 — vision additions to the model providers so the 3D extractor can
 * route through the router (Claude→GPT-4o fallback) instead of the Anthropic
 * SDK directly. Covers: Anthropic PDF document block + extended thinking;
 * OpenAI PDF→image rasterise via the injected rasteriser + the hard error when
 * a PDF is sent to OpenAI without one.
 */
const anthropicCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: anthropicCreate };
  },
}));

const openaiCreate = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: openaiCreate } };
    embeddings = { create: vi.fn() };
  },
}));

import { callAnthropic } from "@/lib/ai/models/providers/anthropic";
import { callOpenAI } from "@/lib/ai/models/providers/openai";
import { MODEL_REGISTRY } from "@/lib/ai/models/registry";

const sonnet = MODEL_REGISTRY["claude-sonnet-4"];
const gpt4o = MODEL_REGISTRY["gpt-4o"];

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.OPENAI_API_KEY = "test-key";
  anthropicCreate.mockReset();
  openaiCreate.mockReset();
  anthropicCreate.mockResolvedValue({
    content: [{ type: "text", text: "{}" }],
    stop_reason: "end_turn",
    usage: { input_tokens: 1, output_tokens: 1 },
  });
  openaiCreate.mockResolvedValue({
    choices: [{ message: { content: "{}" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  });
});

describe("Anthropic provider — PDF + thinking", () => {
  it("attaches a PDF as a document block on the first user message", async () => {
    await callAnthropic(sonnet, {
      messages: [{ role: "user", content: "extract" }],
      pdf: { data: Buffer.from("%PDF-1.4 fake") },
    });
    const params = anthropicCreate.mock.calls[0][0];
    const firstUser = params.messages[0];
    expect(Array.isArray(firstUser.content)).toBe(true);
    expect(
      firstUser.content.some(
        (b: { type: string; source?: { media_type?: string } }) =>
          b.type === "document" && b.source?.media_type === "application/pdf",
      ),
    ).toBe(true);
  });

  it("enables thinking and raises max_tokens above the budget", async () => {
    await callAnthropic(sonnet, {
      messages: [{ role: "user", content: "x" }],
      thinkingBudget: 4000,
      maxTokens: 1000, // below the budget → must be raised
    });
    const params = anthropicCreate.mock.calls[0][0];
    expect(params.thinking).toEqual({ type: "enabled", budget_tokens: 4000 });
    expect(params.max_tokens).toBeGreaterThan(4000);
  });

  it("leaves thinking off when no budget is set", async () => {
    await callAnthropic(sonnet, { messages: [{ role: "user", content: "x" }] });
    expect(anthropicCreate.mock.calls[0][0].thinking).toBeUndefined();
  });
});

describe("OpenAI provider — PDF handling", () => {
  it("throws when a PDF is supplied without a rasteriser (no silent drop)", async () => {
    await expect(
      callOpenAI(gpt4o, {
        messages: [{ role: "user", content: "x" }],
        pdf: { data: Buffer.from("%PDF fake") },
      }),
    ).rejects.toThrow(/rasterizePdf|cannot read PDFs/i);
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it("rasterises the PDF to image parts via the injected rasteriser", async () => {
    const rasterizePdf = vi.fn().mockResolvedValue([
      { data: Buffer.from("png1"), mimeType: "image/png" },
      { data: Buffer.from("png2"), mimeType: "image/png" },
    ]);
    await callOpenAI(gpt4o, {
      messages: [{ role: "user", content: "extract" }],
      pdf: { data: Buffer.from("%PDF fake") },
      rasterizePdf,
    });
    expect(rasterizePdf).toHaveBeenCalledOnce();
    const params = openaiCreate.mock.calls[0][0];
    const firstUser = params.messages.find(
      (m: { role: string }) => m.role === "user",
    );
    const imageParts = firstUser.content.filter(
      (p: { type: string }) => p.type === "image_url",
    );
    expect(imageParts).toHaveLength(2);
  });
});
