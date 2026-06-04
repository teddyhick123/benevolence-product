-- db/migrations/0026_builder_enhancement.sql
-- Builder Enhancement Sprint C
-- Adds: organizations.ai_instructions, builder_proposals phase columns

-- 1. Per-org AI assistant instructions
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ai_instructions TEXT;

-- 2. Scaffold phase state machine
ALTER TABLE public.builder_proposals
  ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS plan_content JSONB,
  ADD COLUMN IF NOT EXISTS review_report JSONB;

-- Valid phases: pending | planning | plan_ready | building | build_ready
--               reviewing | ready_to_apply | applied
-- Existing proposals keep phase='pending'; new scaffold proposals use the full machine.

CREATE INDEX IF NOT EXISTS builder_proposals_phase_idx
  ON public.builder_proposals (phase, created_at DESC);

-- 3. GitHub pull request URL for Builder v2 apply path
ALTER TABLE public.builder_proposals
  ADD COLUMN IF NOT EXISTS pr_url TEXT;
