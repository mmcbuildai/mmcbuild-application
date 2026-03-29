-- Testing setup: Set all existing organisations to enterprise tier
-- so client testers have full access without billing restrictions.
-- This will be reverted before production launch.

UPDATE organisations
SET subscription_tier = 'enterprise',
    trial_ends_at = now() + INTERVAL '365 days',
    trial_usage_count = 0
WHERE subscription_tier = 'trial';
