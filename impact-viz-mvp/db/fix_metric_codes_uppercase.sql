-- Fix metric codes to be uppercase to match UI expectations
-- This updates both the metrics table and any existing metric_facts data

BEGIN;

-- Step 1: Temporarily disable the foreign key constraint
ALTER TABLE public.metric_facts DROP CONSTRAINT IF EXISTS metric_facts_metric_code_fkey;

-- Step 2: Update metric_facts table - change all metric_codes to uppercase
UPDATE public.metric_facts
SET metric_code = UPPER(metric_code)
WHERE metric_code != UPPER(metric_code);

-- Step 3: Update metrics table - change all codes to uppercase
UPDATE public.metrics
SET code = UPPER(code)
WHERE code != UPPER(code);

-- Step 4: Re-add the foreign key constraint
ALTER TABLE public.metric_facts
ADD CONSTRAINT metric_facts_metric_code_fkey
FOREIGN KEY (metric_code) REFERENCES public.metrics(code);

-- Verify the changes
SELECT code, name FROM public.metrics ORDER BY code;

COMMIT;

-- You should see:
-- BENEFICIARIES_REACHED
-- CO2_AVOIDED_TONS
-- CURRICULUM_MODULES_CREATED
-- ENERGY_SAVINGS_KWH
-- HOUSING_UNITS_CREATED
-- JOBS_CREATED
-- MEALS_DISTRIBUTED
-- MEDIA_MENTIONS
-- POLICY_WINS
-- REVENUE_USD
-- STUDENTS_GRADUATED
-- TEACHERS_TRAINED
