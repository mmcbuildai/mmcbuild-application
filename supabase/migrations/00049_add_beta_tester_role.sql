-- SCRUM-239: Add beta_tester role for beta testing weekend
-- Gives full user permissions to bypass module launch gates

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'beta';
