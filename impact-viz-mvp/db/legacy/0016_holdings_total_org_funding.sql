-- Add total_org_funding column to holdings table for proportional impact attribution
-- This represents the total annual budget/funding of the organization
-- Used to calculate: attributed_outcomes = total_outcomes * (your_funding / total_org_funding)

ALTER TABLE public.holdings
ADD COLUMN IF NOT EXISTS total_org_funding NUMERIC;

-- Add comment explaining the field
COMMENT ON COLUMN public.holdings.total_org_funding IS
'Total annual funding/budget of the organization in USD. Used for proportional impact attribution when calculating cost per outcome.';
