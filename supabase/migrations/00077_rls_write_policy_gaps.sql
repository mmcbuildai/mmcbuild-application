-- 00077_rls_write_policy_gaps.sql
--
-- SCRUM-344 (Step 2, policy-gap-fill) — complete the RLS write policies so RLS is
-- a full tenant-isolation backstop on the org-scoped tables. Confirmed against the
-- LIVE policy state (pg_policies, 2026-07-10): SELECT is already scoped on every
-- table and most CRUD is present; only the verbs below are missing (= deny-all
-- under RLS) or open.
--
-- App writes to these tables currently go through the service-role client, which
-- bypasses RLS entirely, so adding/tightening these policies does NOT change any
-- current behaviour — it only makes the DB the boundary too (defence-in-depth,
-- and correctness if any of these ever move to the RLS client per SCRUM-344).
--
-- Idempotent: DROP POLICY IF EXISTS before each CREATE. Predicates mirror the
-- existing SELECT policy on each table exactly (verified from 00002/00017/00018).

-- ============================================================
-- compliance_findings — add UPDATE (missing); tighten INSERT (was WITH CHECK true)
-- ============================================================

-- Scoped UPDATE via the parent check's org (findings have no org_id column).
DROP POLICY IF EXISTS "Users can update findings via check org" ON compliance_findings;
CREATE POLICY "Users can update findings via check org"
  ON compliance_findings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM compliance_checks
      WHERE compliance_checks.id = compliance_findings.check_id
        AND compliance_checks.org_id = get_user_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM compliance_checks
      WHERE compliance_checks.id = compliance_findings.check_id
        AND compliance_checks.org_id = get_user_org_id()
    )
  );

-- Tighten the open INSERT (was `WITH CHECK (true)` — any authenticated RLS client
-- could insert a finding into any org's check). The compliance pipeline inserts
-- findings via the service role (bypasses RLS), so this is safe.
DROP POLICY IF EXISTS "System can insert findings" ON compliance_findings;
CREATE POLICY "System can insert findings"
  ON compliance_findings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM compliance_checks
      WHERE compliance_checks.id = compliance_findings.check_id
        AND compliance_checks.org_id = get_user_org_id()
    )
  );

-- ============================================================
-- cost_estimates — add DELETE (missing)
-- ============================================================
DROP POLICY IF EXISTS "Users can delete own org cost estimates" ON cost_estimates;
CREATE POLICY "Users can delete own org cost estimates"
  ON cost_estimates FOR DELETE
  USING (org_id = get_user_org_id());

-- ============================================================
-- cost_line_items — add UPDATE + DELETE (missing), scoped via parent estimate
-- ============================================================
DROP POLICY IF EXISTS "Users can update own org cost line items" ON cost_line_items;
CREATE POLICY "Users can update own org cost line items"
  ON cost_line_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM cost_estimates ce
      WHERE ce.id = cost_line_items.estimate_id
        AND ce.org_id = get_user_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cost_estimates ce
      WHERE ce.id = cost_line_items.estimate_id
        AND ce.org_id = get_user_org_id()
    )
  );

DROP POLICY IF EXISTS "Users can delete own org cost line items" ON cost_line_items;
CREATE POLICY "Users can delete own org cost line items"
  ON cost_line_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM cost_estimates ce
      WHERE ce.id = cost_line_items.estimate_id
        AND ce.org_id = get_user_org_id()
    )
  );

-- ============================================================
-- design_checks — add DELETE (missing)
-- ============================================================
DROP POLICY IF EXISTS "Users can delete own org design checks" ON design_checks;
CREATE POLICY "Users can delete own org design checks"
  ON design_checks FOR DELETE
  USING (org_id = get_user_org_id());

-- ============================================================
-- design_suggestions — add DELETE (missing), scoped via parent check
-- ============================================================
DROP POLICY IF EXISTS "Users can delete own org design suggestions" ON design_suggestions;
CREATE POLICY "Users can delete own org design suggestions"
  ON design_suggestions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM design_checks dc
      WHERE dc.id = design_suggestions.check_id
        AND dc.org_id = get_user_org_id()
    )
  );

-- ============================================================
-- questionnaire_responses — add DELETE (missing)
-- ============================================================
DROP POLICY IF EXISTS "Users can delete questionnaires in their org" ON questionnaire_responses;
CREATE POLICY "Users can delete questionnaires in their org"
  ON questionnaire_responses FOR DELETE
  USING (org_id = get_user_org_id());
