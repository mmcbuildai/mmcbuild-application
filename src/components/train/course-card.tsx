import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "./progress-bar";
import { COURSE_CATEGORY_LABELS, DIFFICULTY_LABELS } from "@/lib/train/constants";
import type { CourseWithEnrollment } from "@/lib/train/types";
import { BookOpen, Clock, Users } from "lucide-react";

interface CourseCardProps {
  course: CourseWithEnrollment;
}

export function CourseCard({ course }: CourseCardProps) {
  const categoryLabel = COURSE_CATEGORY_LABELS[course.category] ?? course.category;
  const difficultyLabel = DIFFICULTY_LABELS[course.difficulty] ?? course.difficulty;

  return (
    <Link href={`/train/${course.id}`}>
      <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="secondary" className="text-xs">
              {categoryLabel}
            </Badge>
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
          <CardTitle className="text-base line-clamp-2">{course.title}</CardTitle>
        </CardHeader>
        <CardContent>
          {course.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
              {course.description}
            </p>
          )}
          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
            <span className="flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5" />
              {course.lesson_count} lessons
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {course.estimated_duration_minutes} min
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {course.enrollment_count}
            </span>
          </div>
          {course.enrollment && (
            <ProgressBar value={course.enrollment.progress_pct} />
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
