"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createLesson, updateLesson } from "@/app/(dashboard)/train/actions";
import type { Lesson, QuizQuestion } from "@/lib/train/types";
import { Plus, Trash2 } from "lucide-react";

interface LessonFormProps {
  courseId: string;
  lesson?: Lesson;
  sortOrder: number;
  onSaved?: () => void;
}

function emptyQuestion(): QuizQuestion {
  return {
    question: "",
    options: ["", "", "", ""],
    correct_index: 0,
    explanation: "",
  };
}

export function LessonForm({ courseId, lesson, sortOrder, onSaved }: LessonFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(lesson?.title ?? "");
  const [content, setContent] = useState(lesson?.content ?? "");
  const [readingTime, setReadingTime] = useState(lesson?.estimated_reading_minutes ?? 5);
  const [questions, setQuestions] = useState<QuizQuestion[]>(
    lesson?.quiz_questions?.length ? lesson.quiz_questions : []
  );

  function addQuestion() {
    setQuestions([...questions, emptyQuestion()]);
  }

  function removeQuestion(index: number) {
    setQuestions(questions.filter((_, i) => i !== index));
  }

  function updateQuestion(index: number, field: string, value: unknown) {
    const updated = [...questions];
    if (field === "option") {
      const { optIndex, text } = value as { optIndex: number; text: string };
      updated[index] = {
        ...updated[index],
        options: updated[index].options.map((o, i) => (i === optIndex ? text : o)),
      };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setQuestions(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const data = {
      title,
      content,
      sort_order: sortOrder,
      quiz_questions: questions.filter((q) => q.question.trim()),
      estimated_reading_minutes: readingTime,
    };

    try {
      const result = lesson
        ? await updateLesson(lesson.id, data)
        : await createLesson(courseId, data);

      if (result.error) {
        setError(result.error);
        return;
      }
      onSaved?.();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <div className="space-y-1.5">
        <Label>Lesson Title</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="Lesson title"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Content (Markdown)</Label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={12}
          placeholder="Write your lesson content in markdown..."
          className="font-mono text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Estimated Reading Time (minutes)</Label>
        <Input
          type="number"
          min={1}
          max={120}
          value={readingTime}
          onChange={(e) => setReadingTime(Number(e.target.value))}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Quiz Questions</Label>
          <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add Question
          </Button>
        </div>

        {questions.map((q, qi) => (
          <div key={qi} className="border rounded-md p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Question {qi + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeQuestion(qi)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Input
              value={q.question}
              onChange={(e) => updateQuestion(qi, "question", e.target.value)}
              placeholder="Question text"
            />
            {q.options.map((opt, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`correct-${qi}`}
                  checked={q.correct_index === oi}
                  onChange={() => updateQuestion(qi, "correct_index", oi)}
                  className="accent-purple-600"
                />
                <Input
                  value={opt}
                  onChange={(e) =>
                    updateQuestion(qi, "option", { optIndex: oi, text: e.target.value })
                  }
                  placeholder={`Option ${oi + 1}`}
                  className="flex-1"
                />
              </div>
            ))}
            <Input
              value={q.explanation}
              onChange={(e) => updateQuestion(qi, "explanation", e.target.value)}
              placeholder="Explanation (shown when incorrect)"
            />
          </div>
        ))}
      </div>

      <Button type="submit" disabled={loading} className="bg-purple-600 hover:bg-purple-700">
        {loading ? "Saving..." : lesson ? "Update Lesson" : "Create Lesson"}
      </Button>
    </form>
  );
}
