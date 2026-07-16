"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { completeLesson } from "@/app/(dashboard)/train/actions";

interface LessonNavProps {
  courseId: string;
  currentLessonId: string;
  prevLessonId: string | null;
  nextLessonId: string | null;
}

/**
 * Lesson footer navigation (SCRUM-338).
 *
 * - "Next" auto-saves the current lesson as complete before advancing, so a
 *   learner no longer has to separately click "Mark as Complete".
 * - Quiz-gated lessons refuse completion until the quiz is passed
 *   (completeLesson returns an error in that case); we intentionally ignore that
 *   error so Next is never blocked — the explicit "Mark as Complete" flow in
 *   LessonInteraction remains the path for quiz lessons.
 * - On the last lesson the action becomes "Finish Course", which saves
 *   completion and takes the learner OUT of the course to the catalog, instead
 *   of the old "Back to Course" that looped to the same course overview.
 */
export function LessonNav({
  courseId,
  currentLessonId,
  prevLessonId,
  nextLessonId,
}: LessonNavProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function completeAndGo(target: string) {
    startTransition(async () => {
      await completeLesson(currentLessonId);
      router.push(target);
    });
  }

  return (
    <div className="flex justify-between items-center mt-8 pt-4 border-t">
      {prevLessonId ? (
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => router.push(`/train/${courseId}/${prevLessonId}`)}
        >
          <ArrowLeft className="mr-1 h-3.5 w-3.5" />
          Previous
        </Button>
      ) : (
        <div />
      )}

      {nextLessonId ? (
        <Button
          size="sm"
          className="bg-purple-600 hover:bg-purple-700"
          disabled={isPending}
          onClick={() => completeAndGo(`/train/${courseId}/${nextLessonId}`)}
        >
          {isPending ? "Saving..." : "Next"}
          <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      ) : (
        <Button
          size="sm"
          className="bg-purple-600 hover:bg-purple-700"
          disabled={isPending}
          onClick={() => completeAndGo("/train")}
        >
          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
          {isPending ? "Saving..." : "Finish Course"}
        </Button>
      )}
    </div>
  );
}
