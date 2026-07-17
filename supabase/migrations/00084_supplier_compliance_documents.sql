-- SCRUM-175 — MMC Direct: supplier compliance-document portal.
--
-- Karen (2026-05-01): "when I bring on board all of my suppliers, I actually can
-- get their compliance documentation and upload that as well, so we can have
-- only the compliant products." Directory listings had profile data but no path
-- for compliance docs (CodeMark certs, NCC reports, datasheets).
--
-- A supplier (an org owning an approved `professionals` listing) uploads docs,
-- optionally tagged to one of its `supplier_products`; an operator verifies them;
-- verified + unexpired docs surface publicly. Reuses the `directory-uploads`
-- storage bucket (SCRUM-57). Safe to re-run.

CREATE TABLE IF NOT EXISTS public.supplier_compliance_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  -- Optional tag to a specific product in the supplier's catalogue.
  product_id      uuid REFERENCES public.supplier_products(id) ON DELETE SET NULL,
  -- One of the COMPLIANCE_DOC_TYPES keys (src/lib/direct/compliance-docs.ts).
  doc_type        text NOT NULL DEFAULT 'other',
  title           text NOT NULL,
  file_url        text NOT NULL,
  file_name       text,
  issued_at       date,
  expires_at      date,
  verified        boolean NOT NULL DEFAULT false,
  verified_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at     timestamptz,
  -- Set when the 30-day expiry reminder has been emailed, so the cron never
  -- double-sends for the same document.
  reminder_sent_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_compliance_docs_professional
  ON public.supplier_compliance_documents(professional_id);
CREATE INDEX IF NOT EXISTS idx_supplier_compliance_docs_product
  ON public.supplier_compliance_documents(product_id);
CREATE INDEX IF NOT EXISTS idx_supplier_compliance_docs_expiry
  ON public.supplier_compliance_documents(expires_at)
  WHERE verified AND expires_at IS NOT NULL;

ALTER TABLE public.supplier_compliance_documents ENABLE ROW LEVEL SECURITY;

-- Public read: a VERIFIED, UNEXPIRED doc of an APPROVED supplier is visible to
-- any authenticated user (so the directory + Build can surface it). The owning
-- org additionally sees ALL its own docs (unverified / expired included) to
-- manage them. (The operator verification actions run as service role and
-- bypass RLS.)
DROP POLICY IF EXISTS "supplier_compliance_docs_read" ON public.supplier_compliance_documents;
CREATE POLICY "supplier_compliance_docs_read" ON public.supplier_compliance_documents
  FOR SELECT USING (
    org_id = public.get_user_org_id()
    OR (
      verified
      AND (expires_at IS NULL OR expires_at >= CURRENT_DATE)
      AND EXISTS (
        SELECT 1 FROM public.professionals p
        WHERE p.id = supplier_compliance_documents.professional_id
          AND p.status = 'approved'
      )
    )
  );

-- The owning org uploads + removes its own docs. It may update metadata on its
-- own rows, but the `verified`/`verified_by`/`verified_at` fields are only ever
-- set by the operator verification action (service role) — never by the owner.
DROP POLICY IF EXISTS "supplier_compliance_docs_insert" ON public.supplier_compliance_documents;
CREATE POLICY "supplier_compliance_docs_insert" ON public.supplier_compliance_documents
  FOR INSERT WITH CHECK (org_id = public.get_user_org_id() AND verified = false);

DROP POLICY IF EXISTS "supplier_compliance_docs_update" ON public.supplier_compliance_documents;
CREATE POLICY "supplier_compliance_docs_update" ON public.supplier_compliance_documents
  FOR UPDATE USING (org_id = public.get_user_org_id())
  WITH CHECK (org_id = public.get_user_org_id());

DROP POLICY IF EXISTS "supplier_compliance_docs_delete" ON public.supplier_compliance_documents;
CREATE POLICY "supplier_compliance_docs_delete" ON public.supplier_compliance_documents
  FOR DELETE USING (org_id = public.get_user_org_id());

COMMENT ON TABLE public.supplier_compliance_documents IS
  'Supplier compliance docs (CodeMark, NCC, datasheets) uploaded via the Direct portal, operator-verified, surfaced publicly when verified + unexpired (SCRUM-175).';
