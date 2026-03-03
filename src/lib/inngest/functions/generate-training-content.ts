import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { callModel } from "@/lib/ai/models/router";
import { COURSE_CATEGORY_LABELS, DIFFICULTY_LABELS } from "@/lib/train/constants";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

function db() {
  return createAdminClient() as unknown as AnyDb;
}

export const generateTrainingContent = inngest.createFunction(
  {
    id: "generate-training-content",
    name: "Generate Training Content",
    retries: 1,
  },
  { event: "train/content.generate" },
  async ({ event, step }) => {
    const {
      courseId,
      courseTitle,
      courseCategory,
      courseDifficulty,
      lessonTitles,
      orgId,
    } = event.data;

    const categoryLabel =
      COURSE_CATEGORY_LABELS[courseCategory] ?? courseCategory;
    const difficultyLabel =
      DIFFICULTY_LABELS[courseDifficulty] ?? courseDifficulty;

    // Validate course exists
    await step.run("validate-course", async () => {
      const { data: course } = await db()
        .from("courses")
        .select("id")
        .eq("id", courseId)
        .single();

      if (!course) throw new Error("Course not found");
      return true;
    });

    // Generate each lesson
    for (let i = 0; i < lessonTitles.length; i++) {
      const lessonTitle = lessonTitles[i];

      await step.run(`generate-lesson-${i}`, async () => {
        const result = await callModel("training_content", {
          system: `You are an expert Australian construction educator specialising in modern methods of construction (MMC). You create detailed, practical training content for construction professionals.

Always use Australian English spelling and terminology. Reference Australian standards (NCC, AS/NZS) where relevant.

Output format: Return a JSON object with exactly these keys:
- "content": A detailed markdown lesson (1500-2500 words) with clear headings, bullet points, practical examples, and Australian context
- "quiz_questions": An array of exactly 5 multiple-choice questions, each with: "question" (string), "options" (array of 4 strings), "correct_index" (0-3), "explanation" (string)
- "estimated_reading_minutes": number (estimated reading time)

Return ONLY the JSON object, no other text.`,
          messages: [
            {
              role: "user",
              content: `Generate a training lesson for:
Course: "${courseTitle}"
Category: ${categoryLabel}
Difficulty: ${difficultyLabel}
Lesson ${i + 1} of ${lessonTitles.length}: "${lessonTitle}"

${i > 0 ? `Previous lessons in this course: ${lessonTitles.slice(0, i).join(", ")}` : "This is the first lesson in the course."}

Create comprehensive, practical content appropriate for Australian construction professionals at the ${difficultyLabel.toLowerCase()} level.`,
            },
          ],
          maxTokens: 4096,
          orgId,
        });

        // Parse the AI response
        let parsed: {
          content: string;
          quiz_questions: {
            question: string;
            options: string[];
            correct_index: number;
            explanation: string;
          }[];
          estimated_reading_minutes: number;
        };

        try {
          // Try to extract JSON from the response
          const text = result.text;
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error("No JSON found in response");
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          // Fallback: use the raw text as content
          parsed = {
            content: result.text,
            quiz_questions: [],
            estimated_reading_minutes: 10,
          };
        }

        // Upsert lesson
        const { error } = await db()
          .from("lessons")
          .insert({
            course_id: courseId,
            title: lessonTitle,
            content: parsed.content,
            sort_order: i,
            quiz_questions: JSON.stringify(parsed.quiz_questions ?? []),
            estimated_reading_minutes: parsed.estimated_reading_minutes ?? 10,
          });

        if (error) {
          console.error(`[TrainGen] Failed to insert lesson "${lessonTitle}":`, error);
          throw error;
        }
      });
    }

    return {
      courseId,
      lessonsGenerated: lessonTitles.length,
    };
  }
);
