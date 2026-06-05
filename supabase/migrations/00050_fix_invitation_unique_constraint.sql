-- ============================================================
-- 00050 — Fix org_invitations unique constraint (SCRUM bug: revoke fails)
-- ============================================================
-- The original constraint (00013) was:
--     CONSTRAINT unique_pending_invite UNIQUE (org_id, email, status)
-- It enforces uniqueness across ALL statuses, so revoking an invitation
-- (UPDATE status = 'revoked') for an email that already has a 'revoked' row
-- throws "duplicate key value violates unique constraint unique_pending_invite".
-- It also blocks re-inviting an email after a prior revoke/accept.
--
-- Correct semantics: at most ONE *pending* invite per (org, email). Revoked and
-- accepted rows may repeat freely. That's a PARTIAL unique index, not a full
-- constraint. (Matches inviteUser()'s in-code "pending invite already exists"
-- check in settings/organisation/actions.ts.)
--
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. Drop the over-broad constraint first, so the dedupe step below can rewrite
--    duplicate rows without tripping the very rule we're removing.
ALTER TABLE org_invitations
  DROP CONSTRAINT IF EXISTS unique_pending_invite;

-- 2. Dedupe any pre-existing duplicate PENDING rows (migration leftovers):
--    keep the most recent pending invite per (org_id, email); demote the rest
--    to 'revoked' so the partial unique index can be created cleanly.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY org_id, lower(email)
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM org_invitations
  WHERE status = 'pending'
)
UPDATE org_invitations o
SET status = 'revoked'
FROM ranked r
WHERE o.id = r.id
  AND r.rn > 1;

-- 3. Create the correct partial unique index: one pending invite per email/org.
--    lower(email) so case variants don't sneak a second pending invite through.
CREATE UNIQUE INDEX IF NOT EXISTS unique_pending_invite_per_email
  ON org_invitations (org_id, lower(email))
  WHERE status = 'pending';
