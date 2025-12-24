-- Migration: Normalize all metric_code values to uppercase for consistent querying
-- This migration ensures case-insensitive matching works correctly across the system
-- Safe to run multiple times (idempotent)

BEGIN;

-- Step 1: Update metric_facts table - normalize all metric_codes to uppercase
UPDATE public.metric_facts
SET metric_code = UPPER(metric_code)
WHERE metric_code IS NOT NULL
  AND metric_code != UPPER(metric_code);

-- Step 2: Update kpi_definitions table - normalize all metric_codes to uppercase
UPDATE public.kpi_definitions
SET metric_code = UPPER(metric_code)
WHERE metric_code IS NOT NULL
  AND metric_code != UPPER(metric_code);

-- Step 3: Update metrics table - normalize all codes to uppercase
UPDATE public.metrics
SET code = UPPER(code)
WHERE code IS NOT NULL
  AND code != UPPER(code);

-- Step 4: Add check constraint to ensure future metric_codes are uppercase (optional but recommended)
-- This prevents lowercase metric codes from being inserted in the future

-- For metric_facts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'metric_facts_metric_code_uppercase_check'
  ) THEN
    ALTER TABLE public.metric_facts
    ADD CONSTRAINT metric_facts_metric_code_uppercase_check
    CHECK (metric_code IS NULL OR metric_code = UPPER(metric_code));
  END IF;
END $$;

-- For kpi_definitions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'kpi_definitions_metric_code_uppercase_check'
  ) THEN
    ALTER TABLE public.kpi_definitions
    ADD CONSTRAINT kpi_definitions_metric_code_uppercase_check
    CHECK (metric_code IS NULL OR metric_code = UPPER(metric_code));
  END IF;
END $$;

-- For metrics
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'metrics_code_uppercase_check'
  ) THEN
    ALTER TABLE public.metrics
    ADD CONSTRAINT metrics_code_uppercase_check
    CHECK (code IS NULL OR code = UPPER(code));
  END IF;
END $$;

COMMIT;

-- Verification queries (uncomment to check results):
-- SELECT DISTINCT metric_code FROM public.metric_facts ORDER BY metric_code;
-- SELECT DISTINCT metric_code FROM public.kpi_definitions ORDER BY metric_code;
-- SELECT code FROM public.metrics ORDER BY code;
