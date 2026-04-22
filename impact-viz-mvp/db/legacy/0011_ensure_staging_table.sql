-- Ensure staging_metric_facts table exists with correct schema
-- This migration is idempotent and safe to run multiple times

CREATE TABLE IF NOT EXISTS public.staging_metric_facts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  upload_id uuid REFERENCES public.uploads(id) ON DELETE CASCADE,
  as_of_date date,
  portfolio_code text,
  holding_id text,
  holding_name text,
  sector text,
  country text,
  metric_name text,
  metric_value numeric,
  currency text,
  raw jsonb
);

-- Ensure RLS is enabled
ALTER TABLE public.staging_metric_facts ENABLE ROW LEVEL SECURITY;

-- Ensure policy exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'staging_metric_facts'
    AND policyname = 'staging readable'
  ) THEN
    CREATE POLICY "staging readable" ON public.staging_metric_facts
    FOR SELECT USING (true);
  END IF;
END $$;

-- Add index for faster upload lookups
CREATE INDEX IF NOT EXISTS idx_staging_metric_facts_upload_id
ON public.staging_metric_facts(upload_id);
