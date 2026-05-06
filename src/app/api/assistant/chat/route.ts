import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callModel } from "@/lib/ai/models/router";
import { sanitize } from "@/lib/security-gate";
import { chatRequestSchema } from "@/lib/assistant/validators";
import { buildSystemPrompt } from "@/lib/assistant/system-prompt";
import type { ChatMessage } from "@/lib/ai/models/call";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { messages: rawMessages, pathname } = parsed.data;

  const messages: ChatMessage[] = rawMessages.map((m) => {
    if (m.role === "user") {
      const { sanitized } = sanitize(m.content);
      return { role: "user", content: sanitized };
    }
    return { role: "assistant", content: m.content };
  });

  const system = buildSystemPrompt(pathname);

  let orgId: string | undefined;
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();
  if (profile?.org_id) orgId = profile.org_id;

  try {
    const result = await callModel("assistant", {
      system,
      messages,
      maxTokens: 800,
      orgId,
    });
    return NextResponse.json({ reply: result.text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[assistant/chat] callModel failed:", message);
    return NextResponse.json(
      { error: "Assistant unavailable. Please try again." },
      { status: 503 }
    );
  }
}
