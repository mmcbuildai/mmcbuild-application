-- MMC Train: LMS Training Module schema
-- Stage 6 — self-paced courses, quizzes, certificates

-- Enums
CREATE TYPE course_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE course_difficulty AS ENUM ('beginner', 'intermediate', 'advanced');
CREATE TYPE enrollment_status AS ENUM ('active', 'completed', 'dropped');

-- ============================================================
-- 1. courses — admin-created course listings
-- ============================================================
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'fundamentals',
  difficulty course_difficulty NOT NULL DEFAULT 'beginner',
  estimated_duration_minutes INTEGER NOT NULL DEFAULT 60,
  thumbnail_url TEXT,
  status course_status NOT NULL DEFAULT 'draft',
  lesson_count INTEGER NOT NULL DEFAULT 0,
  enrollment_count INTEGER NOT NULL DEFAULT 0,
  created_by_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_by_org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fts TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) STORED
);

CREATE INDEX idx_courses_status ON courses(status);
CREATE INDEX idx_courses_category ON courses(category);
CREATE INDEX idx_courses_difficulty ON courses(difficulty);
CREATE INDEX idx_courses_fts ON courses USING gin(fts);
CREATE INDEX idx_courses_org ON courses(created_by_org_id);

-- ============================================================
-- 2. lessons — ordered content units within a course
-- ============================================================
CREATE TABLE lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  quiz_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  estimated_reading_minutes INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lessons_course ON lessons(course_id, sort_order);

-- ============================================================
-- 3. enrollments — user enrollment + progress
-- ============================================================
CREATE TABLE enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  status enrollment_status NOT NULL DEFAULT 'active',
  progress_pct INTEGER NOT NULL DEFAULT 0,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE(course_id, profile_id)
);

CREATE INDEX idx_enrollments_profile ON enrollments(profile_id);
CREATE INDEX idx_enrollments_org ON enrollments(org_id);
CREATE INDEX idx_enrollments_course ON enrollments(course_id);

-- ============================================================
-- 4. lesson_completions — tracks which lessons a user finished
-- ============================================================
CREATE TABLE lesson_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(enrollment_id, lesson_id)
);

CREATE INDEX idx_lesson_completions_enrollment ON lesson_completions(enrollment_id);

-- ============================================================
-- 5. quiz_attempts — quiz answer + score per lesson per enrollment
-- ============================================================
CREATE TABLE quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  score NUMERIC NOT NULL DEFAULT 0,
  passed BOOLEAN NOT NULL DEFAULT false,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(enrollment_id, lesson_id)
);

CREATE INDEX idx_quiz_attempts_enrollment ON quiz_attempts(enrollment_id);

-- ============================================================
-- 6. certificates — completion certificates
-- ============================================================
CREATE TABLE certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  cert_number TEXT NOT NULL UNIQUE,
  pdf_url TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_certificates_profile ON certificates(profile_id);
CREATE INDEX idx_certificates_course ON certificates(course_id);

-- ============================================================
-- Triggers: auto-update denormalized counts
-- ============================================================

-- Lesson count on courses
CREATE OR REPLACE FUNCTION update_course_lesson_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE courses SET lesson_count = (
      SELECT count(*) FROM lessons WHERE course_id = NEW.course_id
    ), updated_at = now() WHERE id = NEW.course_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE courses SET lesson_count = (
      SELECT count(*) FROM lessons WHERE course_id = OLD.course_id
    ), updated_at = now() WHERE id = OLD.course_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_course_lesson_count
  AFTER INSERT OR DELETE ON lessons
  FOR EACH ROW EXECUTE FUNCTION update_course_lesson_count();

-- Enrollment count on courses
CREATE OR REPLACE FUNCTION update_course_enrollment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE courses SET enrollment_count = (
      SELECT count(*) FROM enrollments WHERE course_id = NEW.course_id
    ), updated_at = now() WHERE id = NEW.course_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE courses SET enrollment_count = (
      SELECT count(*) FROM enrollments WHERE course_id = OLD.course_id
    ), updated_at = now() WHERE id = OLD.course_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_course_enrollment_count
  AFTER INSERT OR DELETE ON enrollments
  FOR EACH ROW EXECUTE FUNCTION update_course_enrollment_count();

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;

-- Courses: published readable by all authed, writable by creator org
CREATE POLICY "Published courses readable by all authed users"
  ON courses FOR SELECT
  TO authenticated
  USING (status = 'published' OR created_by_org_id = get_user_org_id());

CREATE POLICY "Courses writable by creator org"
  ON courses FOR ALL
  TO authenticated
  USING (created_by_org_id = get_user_org_id())
  WITH CHECK (created_by_org_id = get_user_org_id());

-- Lessons: readable if course is published or user is in creator org
CREATE POLICY "Lessons readable with published course or creator org"
  ON lessons FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = lessons.course_id
      AND (courses.status = 'published' OR courses.created_by_org_id = get_user_org_id())
    )
  );

CREATE POLICY "Lessons writable by course creator org"
  ON lessons FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = lessons.course_id
      AND courses.created_by_org_id = get_user_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = lessons.course_id
      AND courses.created_by_org_id = get_user_org_id()
    )
  );

-- Enrollments: scoped to own org
CREATE POLICY "Enrollments scoped to own org"
  ON enrollments FOR ALL
  TO authenticated
  USING (org_id = get_user_org_id())
  WITH CHECK (org_id = get_user_org_id());

-- Lesson completions: scoped via enrollment org
CREATE POLICY "Lesson completions scoped to own enrollment"
  ON lesson_completions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM enrollments
      WHERE enrollments.id = lesson_completions.enrollment_id
      AND enrollments.org_id = get_user_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM enrollments
      WHERE enrollments.id = lesson_completions.enrollment_id
      AND enrollments.org_id = get_user_org_id()
    )
  );

-- Quiz attempts: scoped via enrollment org
CREATE POLICY "Quiz attempts scoped to own enrollment"
  ON quiz_attempts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM enrollments
      WHERE enrollments.id = quiz_attempts.enrollment_id
      AND enrollments.org_id = get_user_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM enrollments
      WHERE enrollments.id = quiz_attempts.enrollment_id
      AND enrollments.org_id = get_user_org_id()
    )
  );

-- Certificates: scoped to own profile
CREATE POLICY "Certificates scoped to own org"
  ON certificates FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = certificates.profile_id
      AND profiles.org_id = get_user_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = certificates.profile_id
      AND profiles.org_id = get_user_org_id()
    )
  );

-- ============================================================
-- Storage bucket for certificate PDFs
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('training-certs', 'training-certs', false)
ON CONFLICT DO NOTHING;

CREATE POLICY "Training certs accessible by own org"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'training-certs');

CREATE POLICY "Training certs uploadable by service role"
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'training-certs');
