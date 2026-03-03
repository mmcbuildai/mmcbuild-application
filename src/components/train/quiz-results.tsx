"use client";

import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle } from "lucide-react";

interface QuizResult {
  question: string;
  userAnswer: number;
  correctAnswer: number;
  isCorrect: boolean;
  explanation: string;
}

interface QuizResultsProps {
  score: number;
  passed: boolean;
  correct: number;
  total: number;
  results: QuizResult[];
}

export function QuizResults({ score, passed, correct, total, results }: QuizResultsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-lg font-semibold">Quiz Results</h3>
        <Badge
          variant={passed ? "default" : "destructive"}
          className={passed ? "bg-green-600" : ""}
        >
          {passed ? "Passed" : "Failed"}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Score: {correct}/{total} ({Math.round(score * 100)}%)
        {!passed && " — You need 70% to pass."}
      </p>
      <div className="space-y-3">
        {results.map((r, i) => (
          <div
            key={i}
            className={`rounded-md border p-3 ${
              r.isCorrect
                ? "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20"
                : "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20"
            }`}
          >
            <div className="flex items-start gap-2">
              {r.isCorrect ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              )}
              <div>
                <p className="text-sm font-medium">{r.question}</p>
                {!r.isCorrect && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {r.explanation}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
