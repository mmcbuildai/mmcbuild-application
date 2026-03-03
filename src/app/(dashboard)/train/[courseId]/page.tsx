import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EnrollButton } from "@/components/train/enroll-button";
import { ProgressBar } from "@/components/train/progress-bar";
import { getCourseDetail } from "../actions";
import { COURSE_CATEGORY_LABELS, DIFFICULTY_LABELS } from "@/lib/train/constants";
import { ArrowLeft, BookOpen, CheckCircle2, Circle, Clock } from "lucide-react";

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const data = await getCourseDetail(courseId);

  if (!data) notFound();

  const { course, lessons, enrollment, completedLessonIds } = data;
  const categoryLabel = COURSE_CATEGORY_LABELS[course.category] ?? course.category;
  const difficultyLabel = DIFFICULTY_LABELS[course.difficulty] ?? course.difficulty;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-4xl mx-auto">
      <Link
        href="/train"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Catalog
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="secondary">{categoryLabel}</Badge>
          <Badge
            variant="outline"
            className={
              course.difficulty === "advanced"
                ? "border-red-200 text-red-700"
                : course.difficulty === "intermediate"
                  ? "border-amber-200 text-amber-700"
                  : "border-green-200 text-green-700"
            }
          >
            {difficultyLabel}
          </Badge>
        </div>
        <h1 className="text-3xl font-bold mb-2">{course.title}</h1>
        {course.description && (
          <p className="text-muted-foreground mb-4">{course.description}</p>
        )}
        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
          <span className="flex items-center gap-1">
            <BookOpen className="h-4 w-4" />
            {course.lesson_count} lessons
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {course.estimated_duration_minutes} min
          </span>
        </div>

        {enrollment && (
          <ProgressBar value={enrollment.progress_pct} className="mb-4 max-w-md" />
        )}

        <EnrollButton courseId={course.id} isEnrolled={!!enrollment} />
      </div>

      <div className="space-y-1">
        <h2 className="text-lg font-semibold mb-3">Lessons</h2>
        {lessons.map((lesson, i) => {
          const isCompleted = completedLessonIds.includes(lesson.id);
          const href = enrollment ? `/train/${course.id}/${lesson.id}` : undefined;

          return (
            <div key={lesson.id}>
              {href ? (
                <Link
                  href={href}
                  className="flex items-center gap-3 px-3 py-3 rounded-md hover:bg-muted transition-colors"
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
                  )}
                  <span className="flex-1 font-medium text-sm">
                    {i + 1}. {lesson.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {lesson.estimated_reading_minutes} min
                  </span>
                </Link>
              ) : (
                <div className="flex items-center gap-3 px-3 py-3 rounded-md opacity-60">
                  <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
                  <span className="flex-1 font-medium text-sm">
                    {i + 1}. {lesson.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {lesson.estimated_reading_minutes} min
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {!enrollment && lessons.length > 0 && (
          <p className="text-sm text-muted-foreground mt-4 px-3">
            Enrol in this course to access lesson content.
          </p>
        )}
      </div>
    </div>
  );
}
