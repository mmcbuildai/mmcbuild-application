import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase/db";
import { callModel } from "@/lib/ai/models";
import { describePage } from "@/lib/assistant/page-context";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are a helpful assistant for MMC Build, an AI-powered compliance and construction intelligence platform for Australian residential construction.

You have access to knowledge base documents that contain information about:
- NCC (National Construction Code) compliance requirements
- Cost estimation and build checking
- MMC (Modern Methods of Construction) best practices
- Building regulations and standards
- Platform features and usage

Use the provided context from the knowledge base to answer questions accurately. 
If the context doesn't contain enough information to answer fully, provide what you know and suggest where to find more details.
Keep answers concise and practical.
If asked about topics outside your knowledge base, be honest and say you don't have that information.`;

export async function POST(req: NextRequest) {
  try {
    const { message, history, pathname } = (await req.json()) as {
      message: string;
      history: Message[];
      pathname?: string;
    };

    // Page-awareness: so "explain this page" / "what do I do here" can be
    // answered WITHOUT asking the user which page they're on.
    const page = describePage(pathname);
    const pageBlock = page
      ? `The user is currently on the ${page.module} page. ${page.summary}`
      : "";

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // RAG: Search knowledge documents for relevant context
    const searchQuery = message.toLowerCase().replace(/[^\w\s]/g, " ").trim();
    const searchTerms = searchQuery.split(" ").filter((t) => t.length > 2).slice(0, 5);

    // Query knowledge documents for relevant content
    const { data: documents } = await db()
      .from("knowledge_documents")
      .select("id, title, content, kb_id")
      .eq("status", "ready")
      .limit(5);

    // Simple keyword-based relevance scoring
    interface ScoredDoc {
      id: string;
      title: string | null;
      content: string | null;
      kb_id: string;
      score: number;
    }

    const relevantDocs: ScoredDoc[] = (documents ?? [])
      .map((doc: { id: string; title: string | null; content: string | null; kb_id: string }) => {
        const contentLower = (doc.content || "").toLowerCase();
        const titleLower = (doc.title || "").toLowerCase();
        let score = 0;
        for (const term of searchTerms) {
          if (contentLower.includes(term)) score += 2;
          if (titleLower.includes(term)) score += 3;
        }
        return { ...doc, score };
      })
      .filter((d: ScoredDoc) => d.score > 0)
      .sort((a: ScoredDoc, b: ScoredDoc) => b.score - a.score)
      .slice(0, 3);

    // Build context from relevant documents
    const context = relevantDocs
      ?.map((doc) => `--- ${doc.title} ---\n${(doc.content || "").slice(0, 2000)}`)
      .join("\n\n") || "No relevant documents found.";

    // Build conversation history for context
    const conversationHistory = history
      ?.slice(-6)
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n") || "";

    // Call AI with RAG context
    const prompt = `${SYSTEM_PROMPT}
${pageBlock ? `\nCurrent page (use this to answer "what is this page / what do I do here" directly, without asking):\n${pageBlock}\n` : ""}
Relevant knowledge base documents:
${context}

${conversationHistory ? `Recent conversation:\n${conversationHistory}\n` : ""}

Current question: ${message}

Please provide a helpful, concise answer based on the knowledge base above.`;

    const result = await callModel("assistant", {
      system: prompt,
      messages: [{ role: "user" as const, content: message }],
    });

    const response = result.text || "I couldn't generate a response. Please try again.";

    return NextResponse.json({ response });
  } catch (error) {
    console.error("[help-chat] Error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
