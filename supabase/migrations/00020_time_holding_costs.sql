-- Duration fields on cost_estimates
ALTER TABLE cost_estimates
  ADD COLUMN traditional_duration_weeks NUMERIC,
  ADD COLUMN mmc_duration_weeks NUMERIC;

-- User-configurable holding cost variables (per estimate)
CREATE TABLE holding_cost_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL UNIQUE REFERENCES cost_estimates(id) ON DELETE CASCADE,
  weekly_finance_cost NUMERIC NOT NULL DEFAULT 0,
  weekly_site_costs NUMERIC NOT NULL DEFAULT 0,
  weekly_insurance NUMERIC NOT NULL DEFAULT 0,
  weekly_opportunity_cost NUMERIC NOT NULL DEFAULT 0,
  weekly_council_fees NUMERIC NOT NULL DEFAULT 0,
  custom_items JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS via cost_estimates join (same pattern as cost_line_items)
ALTER TABLE holding_cost_variables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org holding cost variables"
  ON holding_cost_variables FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM cost_estimates ce
    WHERE ce.id = holding_cost_variables.estimate_id
      AND ce.org_id = get_user_org_id()
  ));

CREATE POLICY "Users can insert own org holding cost variables"
  ON holding_cost_variables FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM cost_estimates ce
    WHERE ce.id = holding_cost_variables.estimate_id
      AND ce.org_id = get_user_org_id()
  ));

CREATE POLICY "Users can update own org holding cost variables"
  ON holding_cost_variables FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM cost_estimates ce
    WHERE ce.id = holding_cost_variables.estimate_id
      AND ce.org_id = get_user_org_id()
  ));
