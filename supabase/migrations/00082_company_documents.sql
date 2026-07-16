-- SCRUM-57: MMC Direct — let a business attach documents (brochures, capability
-- statements, datasheets) to its directory listing. Distinct from portfolio_items
-- (which are images rendered inline) — these carry a filename + download link.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.company_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  title text NOT NULL,
  file_url text NOT NULL,
  file_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_documents_professional
  ON public.company_documents(professional_id);

ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;

-- Readable when the listing is approved (public directory) OR owned by the caller.
DROP POLICY IF EXISTS "company_documents_read" ON public.company_documents;
CREATE POLICY "company_documents_read" ON public.company_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = company_documents.professional_id
        AND (p.status = 'approved' OR p.org_id = public.get_user_org_id())
    )
  );

-- Only the owning org can add/remove its documents.
DROP POLICY IF EXISTS "company_documents_insert" ON public.company_documents;
CREATE POLICY "company_documents_insert" ON public.company_documents
  FOR INSERT WITH CHECK (org_id = public.get_user_org_id());

DROP POLICY IF EXISTS "company_documents_delete" ON public.company_documents;
CREATE POLICY "company_documents_delete" ON public.company_documents
  FOR DELETE USING (org_id = public.get_user_org_id());

COMMENT ON TABLE public.company_documents IS
  'Downloadable documents (brochures, capability statements) attached to a Direct listing (SCRUM-57).';
