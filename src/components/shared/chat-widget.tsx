"use client";

import { MessageCircle } from "lucide-react";

export function ChatWidget() {
  return (
    <button
      className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
      aria-label="Open chat"
    >
      <MessageCircle className="w-6 h-6 text-white" />
    </button>
  );
}
