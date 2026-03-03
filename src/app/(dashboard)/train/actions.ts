"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";
import { courseSchema, lessonSchema } from "@/lib/train/validators";
import { QUIZ_PASS_THRESHOLD, COURSES_PER_PAGE } from "@/lib/train/constants";
import type {
  Course,
  Lesson,
  Enrollment,
  EnrollmentWithCourse,
  CertificateWithCourse,
  CourseWithEnrollment,
  LessonWithCompletion,
  QuizQuestion,
  Certificate,
} from "@/lib/train/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

function db() {
  return createAdminClient() as unknown as AnyDb;
}

async function getAuthProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id, role, full_name")
    .eq("user_id", user.id)
    .single();

  return profile as { id: string; org_id: string; role: string; full_name: string } | null;
}

function isAdmin(role: string) {
  return role === "owner" || role === "admin";
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

// ============================================================
// Admin: Course CRUD
// ============================================================

export async function createCourse(data: {
  title: string;
  description?: string;
  category: string;
  difficulty: string;
  estimated_duration_minutes: number;
}) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };
  if (!isAdmin(profile.role)) return { error: "Admin access required" };

  const parsed = courseSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.message };

  const slug = slugify(data.title) + "-" + Date.now().toString(36);

  const { data: course, error } = await db()
    .from("courses")
    .insert({
      title: parsed.data.title,
      slug,
      description: parsed.data.description || null,
      category: parsed.data.category,
      difficulty: parsed.data.difficulty,
      estimated_duration_minutes: parsed.data.estimated_duration_minutes,
      status: "draft",
      created_by_profile_id: profile.id,
      created_by_org_id: profile.org_id,
    })
    .select("id")
    .single();

  if (error || !course) {
    return { error: `Failed to create course: ${(error as { message: string })?.message}` };
  }

  return { courseId: (course as { id: string }).id };
}

export async function updateCourse(
  courseId: string,
  data: {
    title?: string;
    description?: string;
    category?: string;
    difficulty?: string;
    estimated_duration_minutes?: number;
  }
) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };
  if (!isAdmin(profile.role)) return { error: "Admin access required" };

  const { error } = await db()
    .from("courses")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", courseId)
    .eq("created_by_org_id", profile.org_id);

  if (error) return { error: (error as { message: string }).message };
  return { success: true };
}

export async function deleteCourse(courseId: string) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };
  if (!isAdmin(profile.role)) return { error: "Admin access required" };

  const { error } = await db()
    .from("courses")
    .delete()
    .eq("id", courseId)
    .eq("created_by_org_id", profile.org_id);

  if (error) return { error: (error as { message: string }).message };
  return { success: true };
}

export async function publishCourse(courseId: string) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };
  if (!isAdmin(profile.role)) return { error: "Admin access required" };

  const { error } = await db()
    .from("courses")
    .update({ status: "published", updated_at: new Date().toISOString() })
    .eq("id", courseId)
    .eq("created_by_org_id", profile.org_id);

  if (error) return { error: (error as { message: string }).message };
  return { success: true };
}

export async function archiveCourse(courseId: string) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };
  if (!isAdmin(profile.role)) return { error: "Admin access required" };

  const { error } = await db()
    .from("courses")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", courseId)
    .eq("created_by_org_id", profile.org_id);

  if (error) return { error: (error as { message: string }).message };
  return { success: true };
}

export async function getAllCoursesAdmin() {
  const profile = await getAuthProfile();
  if (!profile) return [];
  if (!isAdmin(profile.role)) return [];

  const { data } = await db()
    .from("courses")
    .select("*")
    .eq("created_by_org_id", profile.org_id)
    .order("created_at", { ascending: false });

  return (data ?? []) as Course[];
}

// ============================================================
// Admin: Lesson CRUD
// ============================================================

export async function createLesson(
  courseId: string,
  data: {
    title: string;
    content: string;
    sort_order: number;
    quiz_questions: QuizQuestion[];
    estimated_reading_minutes: number;
  }
) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };
  if (!isAdmin(profile.role)) return { error: "Admin access required" };

  const parsed = lessonSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.message };

  const { data: lesson, error } = await db()
    .from("lessons")
    .insert({
      course_id: courseId,
      title: parsed.data.title,
      content: parsed.data.content,
      sort_order: parsed.data.sort_order,
      quiz_questions: JSON.stringify(parsed.data.quiz_questions),
      estimated_reading_minutes: parsed.data.estimated_reading_minutes,
    })
    .select("id")
    .single();

  if (error || !lesson) {
    return { error: `Failed to create lesson: ${(error as { message: string })?.message}` };
  }

  return { lessonId: (lesson as { id: string }).id };
}

export async function updateLesson(
  lessonId: string,
  data: {
    title?: string;
    content?: string;
    sort_order?: number;
    quiz_questions?: QuizQuestion[];
    estimated_reading_minutes?: number;
  }
) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };
  if (!isAdmin(profile.role)) return { error: "Admin access required" };

  const updateData: Record<string, unknown> = {
    ...data,
    updated_at: new Date().toISOString(),
  };
  if (data.quiz_questions) {
    updateData.quiz_questions = JSON.stringify(data.quiz_questions);
  }

  const { error } = await db()
    .from("lessons")
    .update(updateData)
    .eq("id", lessonId);

  if (error) return { error: (error as { message: string }).message };
  return { success: true };
}

export async function deleteLesson(lessonId: string) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };
  if (!isAdmin(profile.role)) return { error: "Admin access required" };

  const { error } = await db()
    .from("lessons")
    .delete()
    .eq("id", lessonId);

  if (error) return { error: (error as { message: string }).message };
  return { success: true };
}

// ============================================================
// Catalog (public to authed)
// ============================================================

export async function searchCourses(filters?: {
  query?: string;
  category?: string;
  difficulty?: string;
  page?: number;
}) {
  const profile = await getAuthProfile();
  if (!profile) return { courses: [], total: 0 };

  const page = filters?.page ?? 1;
  const offset = (page - 1) * COURSES_PER_PAGE;

  let query = db()
    .from("courses")
    .select("*", { count: "exact" })
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .range(offset, offset + COURSES_PER_PAGE - 1);

  if (filters?.query) {
    query = query.textSearch("fts", filters.query, { type: "websearch" });
  }
  if (filters?.category) {
    query = query.eq("category", filters.category);
  }
  if (filters?.difficulty) {
    query = query.eq("difficulty", filters.difficulty);
  }

  const { data, count } = await query;

  // Get user enrollments for these courses
  const courses = (data ?? []) as Course[];
  const courseIds = courses.map((c) => c.id);

  let enrollments: Enrollment[] = [];
  if (courseIds.length > 0) {
    const { data: enrs } = await db()
      .from("enrollments")
      .select("*")
      .eq("profile_id", profile.id)
      .in("course_id", courseIds);
    enrollments = (enrs ?? []) as Enrollment[];
  }

  const enrollmentMap = new Map(enrollments.map((e) => [e.course_id, e]));
  const coursesWithEnrollment: CourseWithEnrollment[] = courses.map((c) => ({
    ...c,
    enrollment: enrollmentMap.get(c.id) ?? null,
  }));

  return { courses: coursesWithEnrollment, total: count ?? 0 };
}

export async function getCourseDetail(courseId: string) {
  const profile = await getAuthProfile();
  if (!profile) return null;

  const { data: course } = await db()
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .single();

  if (!course) return null;

  const c = course as Course;

  // Non-published courses only visible to creator org admin
  if (c.status !== "published" && c.created_by_org_id !== profile.org_id) {
    return null;
  }

  // Get lessons (without full content for listing)
  const { data: lessons } = await db()
    .from("lessons")
    .select("id, course_id, title, sort_order, estimated_reading_minutes, created_at, updated_at")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: true });

  // Get enrollment if exists
  const { data: enrollment } = await db()
    .from("enrollments")
    .select("*")
    .eq("course_id", courseId)
    .eq("profile_id", profile.id)
    .single();

  // Get completions if enrolled
  let completedLessonIds: string[] = [];
  if (enrollment) {
    const { data: completions } = await db()
      .from("lesson_completions")
      .select("lesson_id")
      .eq("enrollment_id", (enrollment as Enrollment).id);
    completedLessonIds = ((completions ?? []) as { lesson_id: string }[]).map((c) => c.lesson_id);
  }

  return {
    course: c,
    lessons: (lessons ?? []) as Lesson[],
    enrollment: enrollment as Enrollment | null,
    completedLessonIds,
  };
}

export async function getCourseWithLessons(courseId: string) {
  const profile = await getAuthProfile();
  if (!profile) return null;
  if (!isAdmin(profile.role)) return null;

  const { data: course } = await db()
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .eq("created_by_org_id", profile.org_id)
    .single();

  if (!course) return null;

  const { data: lessons } = await db()
    .from("lessons")
    .select("*")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: true });

  return {
    course: course as Course,
    lessons: ((lessons ?? []) as Lesson[]).map((l) => ({
      ...l,
      quiz_questions:
        typeof l.quiz_questions === "string"
          ? JSON.parse(l.quiz_questions)
          : l.quiz_questions,
    })),
  };
}

// ============================================================
// Enrollment
// ============================================================

export async function enrollInCourse(courseId: string) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };

  // Verify course is published
  const { data: course } = await db()
    .from("courses")
    .select("id, status")
    .eq("id", courseId)
    .eq("status", "published")
    .single();

  if (!course) return { error: "Course not found or not available" };

  const { data: enrollment, error } = await db()
    .from("enrollments")
    .upsert(
      {
        course_id: courseId,
        profile_id: profile.id,
        org_id: profile.org_id,
        status: "active",
      },
      { onConflict: "course_id,profile_id" }
    )
    .select("id")
    .single();

  if (error || !enrollment) {
    return { error: `Failed to enroll: ${(error as { message: string })?.message}` };
  }

  return { enrollmentId: (enrollment as { id: string }).id };
}

export async function getMyEnrollments() {
  const profile = await getAuthProfile();
  if (!profile) return [];

  const { data } = await db()
    .from("enrollments")
    .select("*, course:courses(*)")
    .eq("profile_id", profile.id)
    .order("enrolled_at", { ascending: false });

  return ((data ?? []) as unknown as EnrollmentWithCourse[]).map((e) => ({
    ...e,
    course: Array.isArray(e.course) ? e.course[0] : e.course,
  }));
}

export async function getLessonContent(courseId: string, lessonId: string) {
  const profile = await getAuthProfile();
  if (!profile) return null;

  // Get enrollment
  const { data: enrollment } = await db()
    .from("enrollments")
    .select("id")
    .eq("course_id", courseId)
    .eq("profile_id", profile.id)
    .single();

  if (!enrollment) return null;

  const enrollmentId = (enrollment as { id: string }).id;

  // Get lesson
  const { data: lesson } = await db()
    .from("lessons")
    .select("*")
    .eq("id", lessonId)
    .eq("course_id", courseId)
    .single();

  if (!lesson) return null;

  const l = lesson as Lesson;
  const parsedLesson: Lesson = {
    ...l,
    quiz_questions:
      typeof l.quiz_questions === "string"
        ? JSON.parse(l.quiz_questions as unknown as string)
        : l.quiz_questions,
  };

  // Get completion status
  const { data: completion } = await db()
    .from("lesson_completions")
    .select("id")
    .eq("enrollment_id", enrollmentId)
    .eq("lesson_id", lessonId)
    .single();

  // Get quiz attempt
  const { data: quizAttempt } = await db()
    .from("quiz_attempts")
    .select("*")
    .eq("enrollment_id", enrollmentId)
    .eq("lesson_id", lessonId)
    .single();

  return {
    lesson: parsedLesson,
    completed: !!completion,
    quizAttempt: quizAttempt ?? null,
    enrollmentId,
  };
}

// ============================================================
// Progress
// ============================================================

export async function submitQuiz(lessonId: string, answers: number[]) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };

  // Get lesson with quiz
  const { data: lesson } = await db()
    .from("lessons")
    .select("id, course_id, quiz_questions")
    .eq("id", lessonId)
    .single();

  if (!lesson) return { error: "Lesson not found" };

  const l = lesson as { id: string; course_id: string; quiz_questions: QuizQuestion[] | string };
  const questions: QuizQuestion[] =
    typeof l.quiz_questions === "string"
      ? JSON.parse(l.quiz_questions)
      : l.quiz_questions;

  if (!questions.length) return { error: "No quiz for this lesson" };

  // Get enrollment
  const { data: enrollment } = await db()
    .from("enrollments")
    .select("id")
    .eq("course_id", l.course_id)
    .eq("profile_id", profile.id)
    .single();

  if (!enrollment) return { error: "Not enrolled" };

  const enrollmentId = (enrollment as { id: string }).id;

  // Score
  let correct = 0;
  for (let i = 0; i < questions.length; i++) {
    if (answers[i] === questions[i].correct_index) correct++;
  }
  const score = questions.length > 0 ? correct / questions.length : 0;
  const passed = score >= QUIZ_PASS_THRESHOLD;

  // Upsert quiz attempt
  const { error } = await db()
    .from("quiz_attempts")
    .upsert(
      {
        enrollment_id: enrollmentId,
        lesson_id: lessonId,
        answers: JSON.stringify(answers),
        score,
        passed,
        attempted_at: new Date().toISOString(),
      },
      { onConflict: "enrollment_id,lesson_id" }
    );

  if (error) return { error: (error as { message: string }).message };

  return {
    score,
    passed,
    correct,
    total: questions.length,
    results: questions.map((q, i) => ({
      question: q.question,
      userAnswer: answers[i],
      correctAnswer: q.correct_index,
      isCorrect: answers[i] === q.correct_index,
      explanation: q.explanation,
    })),
  };
}

export async function completeLesson(lessonId: string) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };

  // Get lesson
  const { data: lesson } = await db()
    .from("lessons")
    .select("id, course_id, quiz_questions")
    .eq("id", lessonId)
    .single();

  if (!lesson) return { error: "Lesson not found" };

  const l = lesson as { id: string; course_id: string; quiz_questions: QuizQuestion[] | string };

  // Get enrollment
  const { data: enrollment } = await db()
    .from("enrollments")
    .select("id, course_id")
    .eq("course_id", l.course_id)
    .eq("profile_id", profile.id)
    .single();

  if (!enrollment) return { error: "Not enrolled" };

  const enrollmentId = (enrollment as { id: string }).id;

  // Check quiz passed if lesson has quiz
  const questions: QuizQuestion[] =
    typeof l.quiz_questions === "string"
      ? JSON.parse(l.quiz_questions)
      : l.quiz_questions;

  if (questions.length > 0) {
    const { data: attempt } = await db()
      .from("quiz_attempts")
      .select("passed")
      .eq("enrollment_id", enrollmentId)
      .eq("lesson_id", lessonId)
      .single();

    if (!attempt || !(attempt as { passed: boolean }).passed) {
      return { error: "You must pass the quiz before completing this lesson" };
    }
  }

  // Upsert completion
  await db()
    .from("lesson_completions")
    .upsert(
      {
        enrollment_id: enrollmentId,
        lesson_id: lessonId,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "enrollment_id,lesson_id" }
    );

  // Update progress percentage
  const { data: allLessons } = await db()
    .from("lessons")
    .select("id")
    .eq("course_id", l.course_id);

  const { data: completions } = await db()
    .from("lesson_completions")
    .select("lesson_id")
    .eq("enrollment_id", enrollmentId);

  const totalLessons = ((allLessons ?? []) as { id: string }[]).length;
  const completedCount = ((completions ?? []) as { lesson_id: string }[]).length;
  const progressPct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  const isComplete = progressPct === 100;

  await db()
    .from("enrollments")
    .update({
      progress_pct: progressPct,
      status: isComplete ? "completed" : "active",
      completed_at: isComplete ? new Date().toISOString() : null,
    })
    .eq("id", enrollmentId);

  // Fire certificate event if complete
  if (isComplete) {
    await inngest.send({
      name: "train/certificate.issue",
      data: {
        enrollmentId,
        courseId: l.course_id,
        profileId: profile.id,
        profileName: profile.full_name,
      },
    });
  }

  return { success: true, progressPct, isComplete };
}

export async function getMyProgress(courseId: string) {
  const profile = await getAuthProfile();
  if (!profile) return null;

  const { data: enrollment } = await db()
    .from("enrollments")
    .select("*")
    .eq("course_id", courseId)
    .eq("profile_id", profile.id)
    .single();

  if (!enrollment) return null;

  const enrollmentId = (enrollment as Enrollment).id;

  const { data: completions } = await db()
    .from("lesson_completions")
    .select("*")
    .eq("enrollment_id", enrollmentId);

  const { data: quizAttempts } = await db()
    .from("quiz_attempts")
    .select("*")
    .eq("enrollment_id", enrollmentId);

  return {
    enrollment: enrollment as Enrollment,
    completions: (completions ?? []) as { lesson_id: string; completed_at: string }[],
    quizAttempts: (quizAttempts ?? []) as { lesson_id: string; score: number; passed: boolean }[],
  };
}

// ============================================================
// Certificates
// ============================================================

export async function getMyCertificates() {
  const profile = await getAuthProfile();
  if (!profile) return [];

  const { data } = await db()
    .from("certificates")
    .select("*, course:courses(id, title, category, difficulty)")
    .eq("profile_id", profile.id)
    .order("issued_at", { ascending: false });

  return ((data ?? []) as unknown as CertificateWithCourse[]).map((c) => ({
    ...c,
    course: Array.isArray(c.course) ? c.course[0] : c.course,
  }));
}

export async function getCertificate(certId: string) {
  const profile = await getAuthProfile();
  if (!profile) return null;

  const { data } = await db()
    .from("certificates")
    .select("*, course:courses(id, title, category, difficulty)")
    .eq("id", certId)
    .eq("profile_id", profile.id)
    .single();

  if (!data) return null;

  const cert = data as unknown as CertificateWithCourse;
  return {
    ...cert,
    course: Array.isArray(cert.course) ? cert.course[0] : cert.course,
  };
}

// ============================================================
// AI Generation
// ============================================================

export async function generateCourseContent(
  courseId: string,
  lessonTitles: string[]
) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };
  if (!isAdmin(profile.role)) return { error: "Admin access required" };

  // Verify course exists and belongs to org
  const { data: course } = await db()
    .from("courses")
    .select("id, title, category, difficulty")
    .eq("id", courseId)
    .eq("created_by_org_id", profile.org_id)
    .single();

  if (!course) return { error: "Course not found" };

  await inngest.send({
    name: "train/content.generate",
    data: {
      courseId,
      courseTitle: (course as Course).title,
      courseCategory: (course as Course).category,
      courseDifficulty: (course as Course).difficulty,
      lessonTitles,
      orgId: profile.org_id,
    },
  });

  return { success: true };
}

// ============================================================
// Helper: get all lessons with completion for course viewer
// ============================================================

export async function getCourseLessonsWithProgress(
  courseId: string
): Promise<LessonWithCompletion[]> {
  const profile = await getAuthProfile();
  if (!profile) return [];

  const { data: lessons } = await db()
    .from("lessons")
    .select("*")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: true });

  if (!lessons || !(lessons as Lesson[]).length) return [];

  // Get enrollment
  const { data: enrollment } = await db()
    .from("enrollments")
    .select("id")
    .eq("course_id", courseId)
    .eq("profile_id", profile.id)
    .single();

  if (!enrollment) {
    return (lessons as Lesson[]).map((l) => ({
      ...l,
      quiz_questions:
        typeof l.quiz_questions === "string"
          ? JSON.parse(l.quiz_questions as unknown as string)
          : l.quiz_questions,
      completed: false,
      quiz_attempt: null,
    }));
  }

  const enrollmentId = (enrollment as { id: string }).id;

  const { data: completions } = await db()
    .from("lesson_completions")
    .select("lesson_id")
    .eq("enrollment_id", enrollmentId);

  const { data: quizAttempts } = await db()
    .from("quiz_attempts")
    .select("*")
    .eq("enrollment_id", enrollmentId);

  const completedSet = new Set(
    ((completions ?? []) as { lesson_id: string }[]).map((c) => c.lesson_id)
  );
  const attemptMap = new Map(
    ((quizAttempts ?? []) as { lesson_id: string }[]).map((a) => [
      a.lesson_id,
      a,
    ])
  );

  return (lessons as Lesson[]).map((l) => ({
    ...l,
    quiz_questions:
      typeof l.quiz_questions === "string"
        ? JSON.parse(l.quiz_questions as unknown as string)
        : l.quiz_questions,
    completed: completedSet.has(l.id),
    quiz_attempt: (attemptMap.get(l.id) as LessonWithCompletion["quiz_attempt"]) ?? null,
  }));
}
