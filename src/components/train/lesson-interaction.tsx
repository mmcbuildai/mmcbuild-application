"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { QuizForm } from "./quiz-form";
import { QuizResults } from "./quiz-results";
import { submitQuiz, completeLesson } from "@/app/(dashboard)/train/actions";
import type { QuizQuestion, QuizAttempt } from "@/lib/train/types";
import { CheckCircle2 } from "lucide-react";

interface QuizResultData {
  score: number;
  passed: boolean;
  correct: number;
  total: number;
  results: {
    question: string;
    userAnswer: number;
    correctAnswer: number;
    isCorrect: boolean;
    explanation: string;
  }[];
}

interface LessonInteractionProps {
  lessonId: string;
  quizQuestions: QuizQuestion[];
  completed: boolean;
  existingAttempt: QuizAttempt | null;
}

export function LessonInteraction({
  lessonId,
  quizQuestions,
  completed,
  existingAttempt,
}: LessonInteractionProps) {
  const router = useRouter();
  const [quizResult, setQuizResult] = useState<QuizResultData | null>(null);
  const [completing, setCompleting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(completed);

  const hasQuiz = quizQuestions.length > 0;
  const quizPassed = existingAttempt?.passed || quizResult?.passed;
  const canComplete = !hasQuiz || quizPassed;

  async function handleQuizSubmit(answers: number[]) {
    const result = await submitQuiz(lessonId, answers);
    if ("error" in result) {
      console.error(result.error);
      return;
    }
    setQuizResult(result as QuizResultData);
  }

  async function handleComplete() {
    setCompleting(true);
    try {
      const result = await completeLesson(lessonId);
      if (result.error) {
        console.error(result.error);
        return;
      }
      setIsCompleted(true);
      router.refresh();
    } finally {
      setCompleting(false);
    }
  }

  if (isCompleted) {
    return (
      <div className="flex items-center gap-2 text-green-600 py-4">
        <CheckCircle2 className="h-5 w-5" />
        <span className="font-medium">Lesson completed</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 border-t pt-6 mt-8">
      {hasQuiz && !quizResult && !existingAttempt?.passed && (
        <QuizForm
          questions={quizQuestions}
          onSubmit={handleQuizSubmit}
        />
      )}

      {quizResult && (
        <QuizResults
          score={quizResult.score}
          passed={quizResult.passed}
          correct={quizResult.correct}
          total={quizResult.total}
          results={quizResult.results}
        />
      )}

      {existingAttempt?.passed && !quizResult && (
        <p className="text-sm text-green-600">
          Quiz passed (Score: {Math.round(Number(existingAttempt.score) * 100)}%)
        </p>
      )}

      {!quizResult?.passed && quizResult && (
        <QuizForm
          questions={quizQuestions}
          onSubmit={handleQuizSubmit}
        />
      )}

      <Button
        onClick={handleComplete}
        disabled={!canComplete || completing}
        className="bg-purple-600 hover:bg-purple-700"
      >
        {completing
          ? "Completing..."
          : canComplete
            ? "Mark as Complete"
            : "Pass the quiz to complete this lesson"}
      </Button>
    </div>
  );
}
