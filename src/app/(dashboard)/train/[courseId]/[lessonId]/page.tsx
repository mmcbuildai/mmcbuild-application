import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LessonList } from "@/components/train/lesson-list";
import { LessonViewer } from "@/components/train/lesson-viewer";
import { LessonInteraction } from "@/components/train/lesson-interaction";
import { LessonNav } from "@/components/train/lesson-nav";
import { getLessonContent, getCourseLessonsWithProgress } from "../../actions";
import { ArrowLeft, ChevronLeft } from "lucide-react";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { courseId, lessonId } = await params;

  const [lessonData, allLessons] = await Promise.all([
    getLessonContent(courseId, lessonId),
    getCourseLessonsWithProgress(courseId),
  ]);

  if (!lessonData) {
    redirect(`/train/${courseId}`);
  }

  if (!allLessons.length) notFound();

  const { lesson, completed, quizAttempt } = lessonData;

  // Find prev/next
  const currentIndex = allLessons.findIndex((l) => l.id === lessonId);
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
  const nextLesson =
    currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;

  return (
    <div className="flex min-h-[calc(100dvh-4rem)]">
      {/* Sidebar */}
      <aside className="hidden shrink-0 w-72 overflow-y-auto border-r p-4 lg:block">
        <Link
          href={`/train/${courseId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Course Overview
        </Link>
        <LessonList
          courseId={courseId}
          lessons={allLessons.map((l) => ({
            id: l.id,
            title: l.title,
            sort_order: l.sort_order,
            estimated_reading_minutes: l.estimated_reading_minutes,
            completed: l.completed,
          }))}
        />
      </aside>

      {/* Main content */}
      <main className="flex-1 px-4 sm:px-8 py-6 max-w-3xl">
        {/* Mobile back link */}
        <Link
          href={`/train/${courseId}`}
          className="lg:hidden inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to course
        </Link>

        <LessonViewer title={lesson.title} content={lesson.content} />

        <LessonInteraction
          lessonId={lesson.id}
          quizQuestions={lesson.quiz_questions}
          completed={completed}
          existingAttempt={quizAttempt}
        />

        {/* Navigation — autosaves completion on Next, exits on Finish (SCRUM-338) */}
        <LessonNav
          courseId={courseId}
          currentLessonId={lessonId}
          prevLessonId={prevLesson?.id ?? null}
          nextLessonId={nextLesson?.id ?? null}
        />
      </main>
    </div>
  );
}
