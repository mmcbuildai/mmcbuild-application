"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { HelpCircle, Send, Loader2, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type Message = { role: "user" | "assistant"; content: string };

const GREETING: Message = {
  role: "assistant",
  content:
    "Hi — I'm the MMC Build assistant. Ask me about any module, what a step does, or what you should do next on this page.",
};

// SayFix escalation — same hosted intake the old floating widget used. Surfaced
// INSIDE the assistant as a triage step: the user asks the assistant first, and
// only escalates to "Report a problem" if they're still stuck (so questions
// don't get logged as problems). Renders nothing if the env var is unset.
const SAYFIX_BASE = process.env.NEXT_PUBLIC_SAYFIX_BASE_URL?.replace(/\/+$/, "");
const SAYFIX_URL = SAYFIX_BASE
  ? `${SAYFIX_BASE}/welcome?product=mmcbuild-application`
  : null;

export function HelpButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Only offer the "report a problem" escalation once the user has actually
  // engaged the assistant (asked at least one question) and is still in the
  // conversation — triage, not a front-and-centre "I have a problem" button.
  const hasAsked = messages.some((m) => m.role === "user");

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, pending]);

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || pending) return;

    const next: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setPending(true);
    setError(null);

    try {
      // Use the knowledge-base-backed (RAG) help endpoint — same backend the
      // floating widget used — so the static assistant gives the richer,
      // knowledge-grounded answers, rendered as markdown below.
      const res = await fetch("/api/help-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: messages.filter((m) => m !== GREETING),
          pathname,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const data = (await res.json()) as { response: string };
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.response },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
    } finally {
      setPending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <HelpCircle className="h-4 w-4" />
          <span className="hidden sm:inline">Need help?</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>MMC Build assistant</SheetTitle>
          <SheetDescription>
            Ask about any module, step, or what to do next on this page.
          </SheetDescription>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                  : "mr-auto max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm"
              }
            >
              {m.role === "assistant" ? (
                <div className="space-y-2 [&_a]:text-teal-700 [&_a]:underline [&_li]:ml-4 [&_li]:list-disc [&_ol_li]:list-decimal [&_p]:leading-relaxed [&_strong]:font-semibold">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              ) : (
                m.content
              )}
            </div>
          ))}
          {pending && (
            <div className="mr-auto flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking…
            </div>
          )}
          {error && (
            <div className="mr-auto max-w-[85%] rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        {SAYFIX_URL && hasAsked && (
          <div className="border-t bg-amber-50/50 px-4 py-2">
            <a
              href={SAYFIX_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 hover:underline"
            >
              <Flag className="h-3.5 w-3.5" />
              Still stuck? Report a problem
            </a>
          </div>
        )}

        <div className="border-t p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask a question…"
              rows={2}
              className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={pending}
            />
            <Button
              onClick={send}
              size="icon"
              disabled={!input.trim() || pending}
              aria-label="Send"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
