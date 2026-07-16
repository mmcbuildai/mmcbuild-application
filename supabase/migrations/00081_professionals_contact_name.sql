-- SCRUM-56: MMC Direct — capture a named contact person on a directory listing.
-- The listing already stores a business email + phone; this adds the *name* of
-- the person a buyer should ask for. Nullable free text, safe to re-run.

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS contact_name TEXT;

COMMENT ON COLUMN public.professionals.contact_name IS
  'Name of the contact person for this business listing (SCRUM-56).';
