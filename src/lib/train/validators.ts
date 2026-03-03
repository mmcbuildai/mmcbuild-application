import { z } from "zod";
import { COURSE_CATEGORIES, DIFFICULTIES } from "./constants";

export const courseSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  category: z.enum(COURSE_CATEGORIES),
  difficulty: z.enum(DIFFICULTIES),
  estimated_duration_minutes: z.number().int().min(5).max(1200),
});

export const lessonSchema = z.object({
  title: z.string().min(3).max(200),
  content: z.string().max(50000),
  sort_order: z.number().int().min(0),
  quiz_questions: z.array(
    z.object({
      question: z.string().min(5),
      options: z.array(z.string().min(1)).min(2).max(6),
      correct_index: z.number().int().min(0),
      explanation: z.string().min(1),
    })
  ),
  estimated_reading_minutes: z.number().int().min(1).max(120),
});

export const quizAnswerSchema = z.object({
  lessonId: z.string().uuid(),
  answers: z.array(z.number().int().min(0)),
});

export const aiGenerateSchema = z.object({
  courseId: z.string().uuid(),
  lessonTitles: z.array(z.string().min(3)).min(1).max(20),
});

export type CourseInput = z.infer<typeof courseSchema>;
export type LessonInput = z.infer<typeof lessonSchema>;
export type QuizAnswerInput = z.infer<typeof quizAnswerSchema>;
export type AIGenerateInput = z.infer<typeof aiGenerateSchema>;
