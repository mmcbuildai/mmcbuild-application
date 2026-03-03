"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface LessonListItem {
  id: string;
  title: string;
  sort_order: number;
  estimated_reading_minutes: number;
  completed: boolean;
}

interface LessonListProps {
  courseId: string;
  lessons: LessonListItem[];
}

export function LessonList({ courseId, lessons }: LessonListProps) {
  const params = useParams();
  const activeLessonId = params.lessonId as string | undefined;

  return (
    <nav className="space-y-1">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">
        Lessons
      </h3>
      {lessons.map((lesson) => {
        const isActive = lesson.id === activeLessonId;

        return (
          <Link
            key={lesson.id}
            href={`/train/${courseId}/${lesson.id}`}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
              isActive
                ? "bg-purple-50 text-purple-700 font-medium dark:bg-purple-950/30 dark:text-purple-300"
                : "text-foreground hover:bg-muted"
            )}
          >
            {lesson.completed ? (
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <span className="line-clamp-1 flex-1">{lesson.title}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              {lesson.estimated_reading_minutes}m
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
