-- Add RLS policies for holding_contributions table
-- Matches the pattern from 012_roles_and_policies.sql

-- Enable RLS
ALTER TABLE public.holding_contributions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS holding_contributions_read ON public.holding_contributions;
DROP POLICY IF EXISTS holding_contributions_write ON public.holding_contributions;

-- Read policy: viewers, editors, owners, and admins can read
CREATE POLICY holding_contributions_read ON public.holding_contributions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.portfolio_members m
    WHERE m.portfolio_id = holding_contributions.portfolio_id
    AND m.user_id = auth.uid()
  )
);

-- Write policy: only editors, owners, and admins can insert/update/delete
CREATE POLICY holding_contributions_write ON public.holding_contributions
FOR ALL TO authenticated
USING (public.can_edit_portfolio(holding_contributions.portfolio_id))
WITH CHECK (public.can_edit_portfolio(holding_contributions.portfolio_id));