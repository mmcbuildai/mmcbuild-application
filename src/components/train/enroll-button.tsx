"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { enrollInCourse } from "@/app/(dashboard)/train/actions";

interface EnrollButtonProps {
  courseId: string;
  isEnrolled: boolean;
  /**
   * Lesson to open when starting/continuing — the first incomplete lesson (or
   * the first lesson). Null only when the course has no lessons. Fixes the
   * "Continue Learning does nothing" bug (SCRUM-338), where the button pushed to
   * the course page it was already on.
   */
  resumeLessonId: string | null;
}

export function EnrollButton({
  courseId,
  isEnrolled,
  resumeLessonId,
}: EnrollButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const lessonHref = resumeLessonId
    ? `/train/${courseId}/${resumeLessonId}`
    : `/train/${courseId}`;

  async function handleEnroll() {
    setLoading(true);
    try {
      const result = await enrollInCourse(courseId);
      if (result.error) {
        console.error(result.error);
        return;
      }
      // Drop the learner straight into the first lesson (Start Course) rather
      // than leaving them on the detail page unsure how to begin.
      router.push(lessonHref);
    } finally {
      setLoading(false);
    }
  }

  if (isEnrolled) {
    return (
      <Button
        className="bg-purple-600 hover:bg-purple-700"
        onClick={() => router.push(lessonHref)}
      >
        Continue Learning
      </Button>
    );
  }

  return (
    <Button
      className="bg-purple-600 hover:bg-purple-700"
      onClick={handleEnroll}
      disabled={loading}
    >
      {loading ? "Enrolling..." : "Enrol Now"}
    </Button>
  );
}
