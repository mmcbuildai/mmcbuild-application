"use client";

import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CourseForm } from "./course-form";
import { LessonForm } from "./lesson-form";
import { AIGenerateForm } from "./ai-generate-form";
import { publishCourse, archiveCourse, deleteLesson } from "@/app/(dashboard)/train/actions";
import type { Course, Lesson } from "@/lib/train/types";
import { Trash2 } from "lucide-react";
import { useState } from "react";

interface CourseEditClientProps {
  course: Course;
  lessons: Lesson[];
}

export function CourseEditClient({ course, lessons }: CourseEditClientProps) {
  const router = useRouter();
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [showNewLesson, setShowNewLesson] = useState(false);

  async function handlePublish() {
    await publishCourse(course.id);
    router.refresh();
  }

  async function handleArchive() {
    await archiveCourse(course.id);
    router.refresh();
  }

  async function handleDeleteLesson(lessonId: string) {
    if (!confirm("Delete this lesson?")) return;
    await deleteLesson(lessonId);
    router.refresh();
  }

  const statusColor =
    course.status === "published"
      ? "bg-green-600"
      : course.status === "archived"
        ? "bg-gray-500"
        : "bg-amber-500";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{course.title}</h1>
          <Badge className={statusColor}>{course.status}</Badge>
        </div>
        <div className="flex gap-2">
          {course.status === "draft" && (
            <Button onClick={handlePublish} className="bg-green-600 hover:bg-green-700">
              Publish
            </Button>
          )}
          {course.status === "published" && (
            <Button onClick={handleArchive} variant="outline">
              Archive
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="lessons">Lessons ({lessons.length})</TabsTrigger>
          <TabsTrigger value="ai-generate">AI Generate</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="mt-4">
          <CourseForm course={course} />
        </TabsContent>

        <TabsContent value="lessons" className="mt-4">
          <div className="space-y-4">
            {lessons.map((lesson) => (
              <div key={lesson.id} className="border rounded-md p-4">
                {editingLessonId === lesson.id ? (
                  <LessonForm
                    courseId={course.id}
                    lesson={lesson}
                    sortOrder={lesson.sort_order}
                    onSaved={() => {
                      setEditingLessonId(null);
                      router.refresh();
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{lesson.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {lesson.estimated_reading_minutes} min read
                        {" | "}
                        {(typeof lesson.quiz_questions === "string"
                          ? JSON.parse(lesson.quiz_questions)
                          : lesson.quiz_questions
                        )?.length ?? 0}{" "}
                        quiz questions
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingLessonId(lesson.id)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteLesson(lesson.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {showNewLesson ? (
              <div className="border rounded-md p-4">
                <LessonForm
                  courseId={course.id}
                  sortOrder={lessons.length}
                  onSaved={() => {
                    setShowNewLesson(false);
                    router.refresh();
                  }}
                />
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => setShowNewLesson(true)}
              >
                Add Lesson
              </Button>
            )}
          </div>
        </TabsContent>

        <TabsContent value="ai-generate" className="mt-4">
          <AIGenerateForm courseId={course.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
