export const COURSE_CATEGORIES = [
  "fundamentals",
  "clt-mass-timber",
  "modular-construction",
  "prefab-systems",
  "sustainability-compliance",
  "project-management",
  "digital-construction",
  "safety-quality",
] as const;

export const COURSE_CATEGORY_LABELS: Record<string, string> = {
  fundamentals: "Fundamentals",
  "clt-mass-timber": "CLT & Mass Timber",
  "modular-construction": "Modular Construction",
  "prefab-systems": "Prefab Systems",
  "sustainability-compliance": "Sustainability & Compliance",
  "project-management": "Project Management",
  "digital-construction": "Digital Construction",
  "safety-quality": "Safety & Quality",
};

export const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;

export const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export const QUIZ_PASS_THRESHOLD = 0.7;

export const COURSES_PER_PAGE = 12;
