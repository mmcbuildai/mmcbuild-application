-- Add spatial mapping columns to design_suggestions so the 3D viewer overlays
-- can highlight which walls / rooms each suggestion affects.
--
-- Both columns are nullable arrays. Existing rows remain valid (NULL == "no
-- mapping known yet"). Code reads them as empty arrays when NULL, so the
-- ordering of "deploy code → run migration" is safe in either direction.

ALTER TABLE design_suggestions
  ADD COLUMN IF NOT EXISTS affected_wall_ids TEXT[] NULL,
  ADD COLUMN IF NOT EXISTS affected_room_ids TEXT[] NULL;

COMMENT ON COLUMN design_suggestions.affected_wall_ids IS
  'Wall IDs (from design_checks.spatial_layout.walls[].id) this suggestion applies to. Used by the 3D PlanComparison viewer to colour-code overlays.';

COMMENT ON COLUMN design_suggestions.affected_room_ids IS
  'Room IDs (from design_checks.spatial_layout.rooms[].id) this suggestion applies to. Used by the 3D PlanComparison viewer for room-level annotations.';
