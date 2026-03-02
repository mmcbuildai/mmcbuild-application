-- Migration: Remediation Sharing
-- Adds finding share tokens for external contributor responses

-- New enum for remediation tracking
CREATE TYPE remediation_status AS ENUM (
  'awaiting',
  'acknowledged',
  'in_progress',
  'completed',
  'disputed'
);

-- Share tokens table — each row = one share of a finding to a contributor
CREATE TABLE finding_share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID NOT NULL REFERENCES compliance_findings(id) ON DELETE CASCADE,
  contributor_id UUID NOT NULL REFERENCES project_contributors(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  email_to TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  remediation_status remediation_status NOT NULL DEFAULT 'awaiting',
  response_notes TEXT,
  response_file_path TEXT,
  response_file_name TEXT,
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_finding_share_tokens_token ON finding_share_tokens(token);
CREATE INDEX idx_finding_share_tokens_finding ON finding_share_tokens(finding_id);
CREATE INDEX idx_finding_share_tokens_org ON finding_share_tokens(org_id);

-- RLS
ALTER TABLE finding_share_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finding_share_tokens_select" ON finding_share_tokens
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "finding_share_tokens_insert" ON finding_share_tokens
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "finding_share_tokens_update" ON finding_share_tokens
  FOR UPDATE USING (org_id = get_user_org_id());

-- Add remediation status columns to compliance_findings
ALTER TABLE compliance_findings
  ADD COLUMN IF NOT EXISTS remediation_status remediation_status,
  ADD COLUMN IF NOT EXISTS remediation_responded_at TIMESTAMPTZ;
