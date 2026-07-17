-- SCRUM-59 — MMC Train: per-lesson video. Course/lesson authoring already
-- exists (train/admin/*); this adds the "video uploading facilities" — a video
-- per lesson, stored in a dedicated public bucket and played in the lesson
-- viewer. Safe to re-run.

-- 1. Lesson video columns --------------------------------------------------
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS video_file_name TEXT;

-- 2. Storage bucket for lesson videos --------------------------------------
-- Public read (lessons are shown to enrolled users); 500 MB cap; common web
-- video types only. Mirrors the directory-uploads bucket pattern (00021).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'training-videos',
  'training-videos',
  true,
  524288000, -- 500 MB
  ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authed users can upload training videos" ON storage.objects;
CREATE POLICY "Authed users can upload training videos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'training-videos'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "Authed users can replace training videos" ON storage.objects;
CREATE POLICY "Authed users can replace training videos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'training-videos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Anyone can view training videos" ON storage.objects;
CREATE POLICY "Anyone can view training videos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'training-videos');
