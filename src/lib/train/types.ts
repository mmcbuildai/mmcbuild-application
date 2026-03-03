export type CourseStatus = "draft" | "published" | "archived";
export type CourseDifficulty = "beginner" | "intermediate" | "advanced";
export type EnrollmentStatus = "active" | "completed" | "dropped";

export interface QuizQuestion {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

export interface Course {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  category: string;
  difficulty: CourseDifficulty;
  estimated_duration_minutes: number;
  thumbnail_url: string | null;
  status: CourseStatus;
  lesson_count: number;
  enrollment_count: number;
  created_by_profile_id: string;
  created_by_org_id: string;
  created_at: string;
  updated_at: string;
}

export interface Lesson {
  id: string;
  course_id: string;
  title: string;
  content: string;
  sort_order: number;
  quiz_questions: QuizQuestion[];
  estimated_reading_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface Enrollment {
  id: string;
  course_id: string;
  profile_id: string;
  org_id: string;
  status: EnrollmentStatus;
  progress_pct: number;
  enrolled_at: string;
  completed_at: string | null;
}

export interface LessonCompletion {
  id: string;
  enrollment_id: string;
  lesson_id: string;
  completed_at: string;
}

export interface QuizAttempt {
  id: string;
  enrollment_id: string;
  lesson_id: string;
  answers: number[];
  score: number;
  passed: boolean;
  attempted_at: string;
}

export interface Certificate {
  id: string;
  enrollment_id: string;
  profile_id: string;
  course_id: string;
  cert_number: string;
  pdf_url: string | null;
  issued_at: string;
}

// Joined types for UI
export interface EnrollmentWithCourse extends Enrollment {
  course: Course;
}

export interface CertificateWithCourse extends Certificate {
  course: Course;
}

export interface CourseWithEnrollment extends Course {
  enrollment?: Enrollment | null;
}

export interface LessonWithCompletion extends Lesson {
  completed: boolean;
  quiz_attempt?: QuizAttempt | null;
}
