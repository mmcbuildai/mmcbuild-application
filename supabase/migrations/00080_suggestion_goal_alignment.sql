-- SCRUM-170 — re-weight design suggestions by the project owner's stated goals.
--
-- The optimiser now receives the questionnaire's project_goals and, per
-- suggestion, emits how well it serves each goal. Store that as goal_alignment:
-- an array of { goal, score (0–1), rationale }. Nullable + defaulted so legacy
-- suggestions (and projects without goals) are unaffected. Idempotent.

ALTER TABLE design_suggestions
  ADD COLUMN IF NOT EXISTS goal_alignment JSONB;

COMMENT ON COLUMN design_suggestions.goal_alignment IS
  'SCRUM-170: per-goal fit — [{goal, score 0-1, rationale}]. Null when the project has no stated goals.';
