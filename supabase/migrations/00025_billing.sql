-- Stage 7: Billing & Subscriptions
-- Adds Stripe subscription tracking to organisations

-- Add billing fields to organisations
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'trial'
    CHECK (subscription_tier IN ('trial', 'basic', 'professional', 'enterprise')),
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '60 days');

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  stripe_customer_id     TEXT NOT NULL,
  plan_id         TEXT NOT NULL,  -- e.g. 'basic', 'professional', 'enterprise'
  status          TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'past_due', 'canceled', 'trialing', 'incomplete')),
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  usage_count     INTEGER NOT NULL DEFAULT 0,
  usage_limit     INTEGER NOT NULL DEFAULT 10,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_org_id ON subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS: users can read their own org's subscription
DROP POLICY IF EXISTS "Users can view own org subscription" ON subscriptions;
CREATE POLICY "Users can view own org subscription" ON subscriptions
  FOR SELECT USING (org_id = get_user_org_id());

-- Trial usage tracking (for orgs without a subscription)
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS trial_usage_count INTEGER NOT NULL DEFAULT 0;

-- Function to increment usage atomically
CREATE OR REPLACE FUNCTION increment_usage(p_org_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_sub subscriptions%ROWTYPE;
  v_new_count INTEGER;
BEGIN
  -- Check for active subscription first
  SELECT * INTO v_sub FROM subscriptions
    WHERE org_id = p_org_id AND status IN ('active', 'trialing')
    ORDER BY created_at DESC LIMIT 1;

  IF v_sub.id IS NOT NULL THEN
    UPDATE subscriptions SET usage_count = usage_count + 1, updated_at = now()
      WHERE id = v_sub.id
      RETURNING usage_count INTO v_new_count;
    RETURN v_new_count;
  ELSE
    -- Increment trial usage
    UPDATE organisations SET trial_usage_count = trial_usage_count + 1, updated_at = now()
      WHERE id = p_org_id
      RETURNING trial_usage_count INTO v_new_count;
    RETURN v_new_count;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
