"use client";

import Markdown from "react-markdown";

interface LessonViewerProps {
  title: string;
  content: string;
}

export function LessonViewer({ title, content }: LessonViewerProps) {
  return (
    <article className="prose prose-sm dark:prose-invert max-w-none">
      <h1 className="text-2xl font-bold mb-6">{title}</h1>
      <Markdown>{content}</Markdown>
    </article>
  );
}
