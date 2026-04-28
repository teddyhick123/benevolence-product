-- Migration: Move QuickBooks connections to org level
-- Sprint 3: QB rewire

-- ============================================================================
-- 1. DATA MIGRATION — populate org_id on existing connections
-- ============================================================================
-- Ensure quickbooks_connections.org_id is populated from portfolio_id where possible
-- This is a data migration for existing connections
UPDATE public.quickbooks_connections qc
SET org_id = p.org_id
FROM public.portfolios p
WHERE qc.portfolio_id = p.id
  AND qc.org_id IS NULL
  AND p.org_id IS NOT NULL;

-- ============================================================================
-- 2. DDL — make portfolio_id nullable (connection is now keyed by org_id)
-- ============================================================================
ALTER TABLE public.quickbooks_connections
  ALTER COLUMN portfolio_id DROP NOT NULL;

-- Add unique constraint on org_id so we can upsert by it
ALTER TABLE public.quickbooks_connections
  DROP CONSTRAINT IF EXISTS quickbooks_connections_org_id_key;

ALTER TABLE public.quickbooks_connections
  ADD CONSTRAINT quickbooks_connections_org_id_key UNIQUE (org_id);

-- ============================================================================
-- 3. qb_accounts — add org_id column and update constraints
-- ============================================================================
ALTER TABLE public.qb_accounts
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Populate org_id on existing qb_accounts via their portfolio
UPDATE public.qb_accounts qa
SET org_id = p.org_id
FROM public.portfolios p
WHERE qa.portfolio_id = p.id
  AND qa.org_id IS NULL
  AND p.org_id IS NOT NULL;

-- Make portfolio_id nullable on qb_accounts too
ALTER TABLE public.qb_accounts
  ALTER COLUMN portfolio_id DROP NOT NULL;

-- Add unique constraint for (org_id, qb_account_id) upserts
ALTER TABLE public.qb_accounts
  DROP CONSTRAINT IF EXISTS qb_accounts_org_id_qb_account_id_key;

ALTER TABLE public.qb_accounts
  ADD CONSTRAINT qb_accounts_org_id_qb_account_id_key UNIQUE (org_id, qb_account_id);

CREATE INDEX IF NOT EXISTS idx_qb_accounts_org_id ON public.qb_accounts(org_id);
