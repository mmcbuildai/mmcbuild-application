"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateCourseContent } from "@/app/(dashboard)/train/actions";
import { Plus, Sparkles, Trash2 } from "lucide-react";

interface AIGenerateFormProps {
  courseId: string;
  courseTitle: string;
  courseDescription: string | null;
}

export function AIGenerateForm({ courseId, courseTitle, courseDescription }: AIGenerateFormProps) {
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [titles, setTitles] = useState<string[]>([""]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "generating" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function addTitle() {
    setTitles([...titles, ""]);
  }

  function removeTitle(index: number) {
    if (titles.length <= 1) return;
    setTitles(titles.filter((_, i) => i !== index));
  }

  function updateTitle(index: number, value: string) {
    const updated = [...titles];
    updated[index] = value;
    setTitles(updated);
  }

  async function handleGenerate() {
    setLoading(true);
    setStatus("generating");
    setError(null);

    try {
      const lessonTitles =
        mode === "manual"
          ? titles.filter((t) => t.trim().length >= 3)
          : undefined;

      const result = await generateCourseContent(courseId, lessonTitles);
      if (result.error) {
        setError(result.error);
        setStatus("error");
        return;
      }
      setStatus("done");
    } catch {
      setError("Failed to start generation");
      setStatus("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Course summary */}
      <div className="rounded-md border bg-muted/30 p-4">
        <p className="text-sm font-medium mb-1">{courseTitle}</p>
        {courseDescription && (
          <p className="text-xs text-muted-foreground">{courseDescription}</p>
        )}
      </div>

      {/* Mode selector */}
      <div className="space-y-2">
        <Label>Generation Mode</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={mode === "auto" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("auto")}
            className={mode === "auto" ? "bg-purple-600 hover:bg-purple-700" : ""}
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            Auto (Recommended)
          </Button>
          <Button
            type="button"
            variant={mode === "manual" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("manual")}
            className={mode === "manual" ? "bg-purple-600 hover:bg-purple-700" : ""}
          >
            Manual Titles
          </Button>
        </div>
      </div>

      {mode === "auto" ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            AI will analyse the course title and description to create a complete training
            programme with appropriate lessons, content, and quiz questions.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Lesson Titles</Label>
            <p className="text-xs text-muted-foreground">
              Specify your own lesson titles. AI will generate the content and quiz for each.
            </p>
          </div>
          <div className="space-y-2">
            {titles.map((title, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground w-6 text-right">{i + 1}.</span>
                <Input
                  value={title}
                  onChange={(e) => updateTitle(i, e.target.value)}
                  placeholder={`Lesson ${i + 1} title`}
                  className="flex-1"
                />
                {titles.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeTitle(i)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addTitle}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add Lesson
          </Button>
        </div>
      )}

      <Button
        type="button"
        onClick={handleGenerate}
        disabled={
          loading ||
          (mode === "manual" && titles.every((t) => t.trim().length < 3))
        }
        className="bg-purple-600 hover:bg-purple-700"
      >
        <Sparkles className="mr-1 h-3.5 w-3.5" />
        {loading
          ? "Generating..."
          : mode === "auto"
            ? "Generate Full Course"
            : "Generate Lessons"}
      </Button>

      {status === "done" && (
        <p className="text-sm text-green-600 bg-green-50 rounded-md px-3 py-2 dark:bg-green-950/20 dark:text-green-400">
          Course generation started. AI is planning the lesson structure and creating content
          for each lesson. This may take a few minutes. Refresh the page to see progress.
        </p>
      )}
      {status === "error" && error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
