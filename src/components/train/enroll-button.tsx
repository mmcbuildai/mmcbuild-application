"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { enrollInCourse } from "@/app/(dashboard)/train/actions";

interface EnrollButtonProps {
  courseId: string;
  isEnrolled: boolean;
}

export function EnrollButton({ courseId, isEnrolled }: EnrollButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleEnroll() {
    setLoading(true);
    try {
      const result = await enrollInCourse(courseId);
      if (result.error) {
        console.error(result.error);
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (isEnrolled) {
    return (
      <Button
        className="bg-purple-600 hover:bg-purple-700"
        onClick={() => router.push(`/train/${courseId}`)}
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
