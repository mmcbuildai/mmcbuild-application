"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { QuizQuestion } from "@/lib/train/types";

interface QuizFormProps {
  questions: QuizQuestion[];
  onSubmit: (answers: number[]) => Promise<void>;
  disabled?: boolean;
}

export function QuizForm({ questions, onSubmit, disabled }: QuizFormProps) {
  const [answers, setAnswers] = useState<(number | null)[]>(
    new Array(questions.length).fill(null)
  );
  const [submitting, setSubmitting] = useState(false);

  const allAnswered = answers.every((a) => a !== null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allAnswered) return;
    setSubmitting(true);
    try {
      await onSubmit(answers as number[]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h3 className="text-lg font-semibold">Quiz</h3>
      {questions.map((q, qi) => (
        <div key={qi} className="space-y-2">
          <p className="text-sm font-medium">
            {qi + 1}. {q.question}
          </p>
          <div className="space-y-1.5 ml-4">
            {q.options.map((opt, oi) => (
              <label
                key={oi}
                className="flex items-center gap-2 text-sm cursor-pointer"
              >
                <input
                  type="radio"
                  name={`q-${qi}`}
                  value={oi}
                  checked={answers[qi] === oi}
                  onChange={() => {
                    const next = [...answers];
                    next[qi] = oi;
                    setAnswers(next);
                  }}
                  disabled={disabled || submitting}
                  className="accent-purple-600"
                />
                {opt}
              </label>
            ))}
          </div>
        </div>
      ))}
      <Button
        type="submit"
        disabled={!allAnswered || disabled || submitting}
        className="bg-purple-600 hover:bg-purple-700"
      >
        {submitting ? "Submitting..." : "Submit Quiz"}
      </Button>
    </form>
  );
}
