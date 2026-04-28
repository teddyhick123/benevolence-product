-- Replace staging_metric_facts view with a proper table
-- This table acts as a staging/review area for AI-extracted metrics
-- After admin review, data is promoted to metric_facts table

-- Step 1: Drop the existing view if it exists
DROP VIEW IF EXISTS public.staging_metric_facts CASCADE;

-- Step 2: Create staging table that mirrors metric_facts structure
-- Additional fields: upload_id for tracking, approved flag for workflow
CREATE TABLE IF NOT EXISTS public.staging_metric_facts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  upload_id uuid REFERENCES public.uploads(id) ON DELETE CASCADE,

  -- Fields that match metric_facts
  investee_id uuid REFERENCES public.investees(id),
  holding_id uuid REFERENCES public.holdings(id),
  metric_code text REFERENCES public.metrics(code),
  period_start date,
  period_end date,
  value numeric,
  source text,
  verification_level text,
  data_quality_score numeric,
  unit text,

  -- Staging-specific fields
  approved boolean DEFAULT false,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now(),

  -- Extra context from extraction
  raw jsonb
);

-- Step 3: Enable RLS
ALTER TABLE public.staging_metric_facts ENABLE ROW LEVEL SECURITY;

-- Step 4: Create policies
CREATE POLICY "staging_readable" ON public.staging_metric_facts
  FOR SELECT USING (true);

CREATE POLICY "staging_insertable" ON public.staging_metric_facts
  FOR INSERT WITH CHECK (true);

-- Step 5: Add helpful indexes
CREATE INDEX IF NOT EXISTS idx_staging_metric_facts_upload_id
  ON public.staging_metric_facts(upload_id);

CREATE INDEX IF NOT EXISTS idx_staging_metric_facts_holding_id
  ON public.staging_metric_facts(holding_id);

CREATE INDEX IF NOT EXISTS idx_staging_metric_facts_metric_code
  ON public.staging_metric_facts(metric_code);

CREATE INDEX IF NOT EXISTS idx_staging_metric_facts_approved
  ON public.staging_metric_facts(approved) WHERE NOT approved;
