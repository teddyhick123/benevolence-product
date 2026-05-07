-- Migration: AI action source column
-- Description: Adds initiated_by to ai_actions to distinguish AI-triggered vs user-triggered changes
-- Date: 2026-05-06

ALTER TABLE public.ai_actions
  ADD COLUMN IF NOT EXISTS initiated_by TEXT NOT NULL DEFAULT 'ai'
    CHECK (initiated_by IN ('ai', 'user', 'import', 'system'));

COMMENT ON COLUMN public.ai_actions.initiated_by IS 'Source of the action: ai = AI assistant, user = direct user action, import = ETL import, system = automated process';

-- Backfill: all existing rows are AI-initiated
UPDATE public.ai_actions SET initiated_by = 'ai' WHERE initiated_by IS NULL;

CREATE INDEX IF NOT EXISTS ai_actions_initiated_by_idx ON public.ai_actions(initiated_by);
