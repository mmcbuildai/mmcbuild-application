"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COURSE_CATEGORIES,
  COURSE_CATEGORY_LABELS,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
} from "@/lib/train/constants";
import { createCourse, updateCourse } from "@/app/(dashboard)/train/actions";
import type { Course } from "@/lib/train/types";

interface CourseFormProps {
  course?: Course;
}

export function CourseForm({ course }: CourseFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const data = {
      title: fd.get("title") as string,
      description: fd.get("description") as string,
      category: fd.get("category") as string,
      difficulty: fd.get("difficulty") as string,
      estimated_duration_minutes: Number(fd.get("estimated_duration_minutes")),
    };

    try {
      if (course) {
        const result = await updateCourse(course.id, data);
        if (result.error) {
          setError(result.error);
          return;
        }
        router.refresh();
      } else {
        const result = await createCourse(data);
        if (result.error) {
          setError(result.error);
          return;
        }
        router.push(`/train/admin/${result.courseId}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="title">Course Title</Label>
        <Input
          id="title"
          name="title"
          required
          defaultValue={course?.title ?? ""}
          placeholder="e.g. Introduction to Cross Laminated Timber"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={course?.description ?? ""}
          placeholder="Brief description of the course..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select name="category" defaultValue={course?.category ?? "fundamentals"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COURSE_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {COURSE_CATEGORY_LABELS[cat]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Difficulty</Label>
          <Select name="difficulty" defaultValue={course?.difficulty ?? "beginner"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIFFICULTIES.map((d) => (
                <SelectItem key={d} value={d}>
                  {DIFFICULTY_LABELS[d]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="estimated_duration_minutes">Estimated Duration (minutes)</Label>
        <Input
          id="estimated_duration_minutes"
          name="estimated_duration_minutes"
          type="number"
          min={5}
          max={1200}
          required
          defaultValue={course?.estimated_duration_minutes ?? 60}
        />
      </div>

      <Button type="submit" disabled={loading} className="bg-purple-600 hover:bg-purple-700">
        {loading ? "Saving..." : course ? "Update Course" : "Create Course"}
      </Button>
    </form>
  );
}
