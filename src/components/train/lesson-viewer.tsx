"use client";

import Markdown from "react-markdown";

interface LessonViewerProps {
  title: string;
  content: string;
  /** SCRUM-59 — optional lesson video, shown above the written content. */
  videoUrl?: string | null;
}

export function LessonViewer({ title, content, videoUrl }: LessonViewerProps) {
  return (
    <article className="prose prose-sm dark:prose-invert max-w-none">
      <h1 className="text-2xl font-bold mb-6">{title}</h1>
      {videoUrl && (
        <div className="not-prose mb-6">
          <video
            src={videoUrl}
            controls
            preload="metadata"
            className="w-full rounded-lg border bg-black"
          />
        </div>
      )}
      <Markdown>{content}</Markdown>
    </article>
  );
}
