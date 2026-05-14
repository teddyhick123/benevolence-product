-- =============================================================================
-- 0039_alignment_fixes.sql
-- Schema alignment: receipt_status column and module aliases
-- Depends on: 0014, 0038
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Fix 1: Add receipt_status column to contributions_received
-- ---------------------------------------------------------------------------
-- Status tracking for donation receipts: pending → generated → sent
ALTER TABLE public.contributions_received
  ADD COLUMN IF NOT EXISTS receipt_status text NOT NULL DEFAULT 'pending'
    CHECK (receipt_status IN ('pending', 'generated', 'sent'));

-- Back-fill receipt_status based on acknowledgment state
UPDATE public.contributions_received
SET receipt_status = CASE
  WHEN acknowledgment_sent = true THEN 'sent'
  WHEN acknowledgment_sent = false AND acknowledged_at IS NOT NULL THEN 'generated'
  ELSE 'pending'
END
WHERE receipt_status = 'pending';

-- Index for efficient filtering on non-sent receipts
CREATE INDEX IF NOT EXISTS idx_contributions_received_receipt_status
  ON public.contributions_received (org_id, receipt_status)
  WHERE receipt_status != 'sent';

-- ---------------------------------------------------------------------------
-- Fix 2: Extend org_has_module function with reporting/core aliases
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.org_has_module(p_org_id uuid, p_module text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (modules->>(
        CASE p_module
          WHEN 'pledge_tracking'       THEN 'pledges'
          WHEN 'donor_management'      THEN 'donors'
          WHEN 'tax_optimization'      THEN 'tax'
          WHEN 'compliance_regulatory' THEN 'compliance'
          WHEN 'reporting'             THEN 'reports'
          WHEN 'core'                  THEN 'portfolio'
          ELSE p_module
        END
      ))::boolean
      FROM organizations
      WHERE id = p_org_id
    ),
    false
  );
$$;
