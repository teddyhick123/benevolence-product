-- Add website URL field to holdings table
ALTER TABLE public.holdings
ADD COLUMN IF NOT EXISTS website text;

COMMENT ON COLUMN public.holdings.website IS 'Website URL for the holding organization';
