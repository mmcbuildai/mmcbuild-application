"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateCourseContent } from "@/app/(dashboard)/train/actions";
import { Plus, Sparkles, Trash2 } from "lucide-react";

interface AIGenerateFormProps {
  courseId: string;
}

export function AIGenerateForm({ courseId }: AIGenerateFormProps) {
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
    const validTitles = titles.filter((t) => t.trim().length >= 3);
    if (validTitles.length === 0) return;

    setLoading(true);
    setStatus("generating");
    setError(null);

    try {
      const result = await generateCourseContent(courseId, validTitles);
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
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Lesson Titles</Label>
        <p className="text-xs text-muted-foreground">
          Enter the titles for each lesson. AI will generate the content and quiz questions.
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

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addTitle}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add Lesson
        </Button>
        <Button
          type="button"
          onClick={handleGenerate}
          disabled={loading || titles.every((t) => t.trim().length < 3)}
          className="bg-purple-600 hover:bg-purple-700"
        >
          <Sparkles className="mr-1 h-3.5 w-3.5" />
          {loading ? "Generating..." : "Generate with AI"}
        </Button>
      </div>

      {status === "done" && (
        <p className="text-sm text-green-600 bg-green-50 rounded-md px-3 py-2 dark:bg-green-950/20 dark:text-green-400">
          Content generation started. Lessons will appear shortly as they are generated.
          Refresh the page to see new lessons.
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
