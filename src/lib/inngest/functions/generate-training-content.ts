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
      courseDescription,
      courseCategory,
      courseDifficulty,
      courseDuration,
      lessonTitles: providedTitles,
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

    // Step 1: Plan lesson structure (if no titles provided)
    const lessonTitles: string[] = await step.run("plan-lessons", async () => {
      if (providedTitles && providedTitles.length > 0) {
        return providedTitles as string[];
      }

      // AI generates the full lesson plan from course metadata
      const result = await callModel("training_content", {
        system: `You are an expert Australian construction educator and curriculum designer specialising in modern methods of construction (MMC).

Your task is to design a comprehensive lesson plan for a training course. Consider the course title, description, target difficulty level, category, and estimated duration to determine the right number and scope of lessons.

Guidelines:
- For short courses (15-30 min): 3-5 lessons
- For medium courses (30-90 min): 5-8 lessons
- For long courses (90+ min): 8-12 lessons
- Each lesson should be focused on a single topic
- Lessons should flow logically from foundational to advanced concepts
- Include practical/applied lessons, not just theory
- Use Australian English

Return ONLY a JSON array of lesson title strings, e.g.:
["Lesson 1 Title", "Lesson 2 Title", ...]

No other text.`,
        messages: [
          {
            role: "user",
            content: `Design the lesson plan for this course:

Title: "${courseTitle}"
Description: "${courseDescription}"
Category: ${categoryLabel}
Difficulty: ${difficultyLabel}
Estimated Duration: ${courseDuration ?? 60} minutes

Generate a structured sequence of lesson titles that comprehensively covers this topic for Australian construction professionals.`,
          },
        ],
        maxTokens: 2048,
        orgId,
      });

      try {
        const text = result.text;
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error("No JSON array found");
        const titles = JSON.parse(jsonMatch[0]) as string[];
        if (!Array.isArray(titles) || titles.length === 0) {
          throw new Error("Empty or invalid titles array");
        }
        return titles;
      } catch (e) {
        console.error("[TrainGen] Failed to parse lesson plan:", e);
        // Fallback: generate generic structure
        return [
          `Introduction to ${courseTitle}`,
          `Key Concepts and Principles`,
          `Australian Standards and Compliance`,
          `Practical Applications`,
          `Case Studies and Best Practices`,
        ];
      }
    });

    // Step 2: Generate each lesson's content + quiz
    for (let i = 0; i < lessonTitles.length; i++) {
      const lessonTitle = lessonTitles[i];

      await step.run(`generate-lesson-${i}`, async () => {
        const result = await callModel("training_content", {
          system: `You are an expert Australian construction educator specialising in modern methods of construction (MMC). You create detailed, practical training content for construction professionals.

Always use Australian English spelling and terminology. Reference Australian standards (NCC, AS/NZS) where relevant.

Output format: Return a JSON object with exactly these keys:
- "content": A detailed markdown lesson (1500-2500 words) with clear headings (##, ###), bullet points, practical examples, and Australian context. Include real-world scenarios and actionable knowledge.
- "quiz_questions": An array of exactly 5 multiple-choice questions, each with: "question" (string), "options" (array of 4 strings), "correct_index" (0-3), "explanation" (string explaining why the correct answer is right)
- "estimated_reading_minutes": number (estimated reading time)

Return ONLY the JSON object, no other text.`,
          messages: [
            {
              role: "user",
              content: `Generate a training lesson for:
Course: "${courseTitle}"
${courseDescription ? `Course Description: "${courseDescription}"` : ""}
Category: ${categoryLabel}
Difficulty: ${difficultyLabel}
Lesson ${i + 1} of ${lessonTitles.length}: "${lessonTitle}"

Full lesson plan: ${lessonTitles.map((t, idx) => `${idx + 1}. ${t}`).join(", ")}

${i > 0 ? `Previous lessons covered: ${lessonTitles.slice(0, i).join(", ")}` : "This is the first lesson in the course."}
${i < lessonTitles.length - 1 ? `Next lessons will cover: ${lessonTitles.slice(i + 1).join(", ")}` : "This is the final lesson in the course — include a summary/wrap-up."}

Create comprehensive, practical content appropriate for Australian construction professionals at the ${difficultyLabel.toLowerCase()} level. Avoid repeating content from previous lessons.`,
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

        // Insert lesson
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
      lessonsPlanned: lessonTitles.length,
      lessonTitles,
    };
  }
);
