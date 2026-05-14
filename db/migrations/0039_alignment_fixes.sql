-- =============================================================================
-- 0039_alignment_fixes.sql
-- Schema alignment: receipt_status column and module aliases
-- Depends on: 0014, 0038
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Fix 1: Add receipt tracking columns to contributions_received
-- ---------------------------------------------------------------------------
-- Status tracking for donation receipts: pending → generated → sent
ALTER TABLE public.contributions_received
  ADD COLUMN IF NOT EXISTS quid_pro_quo_value numeric(20,2) NOT NULL DEFAULT 0;

ALTER TABLE public.contributions_received
  ADD COLUMN IF NOT EXISTS tax_deductible_amount numeric(20,2)
    GENERATED ALWAYS AS (GREATEST(amount - COALESCE(quid_pro_quo_value, 0), 0)) STORED;

ALTER TABLE public.contributions_received
  ADD COLUMN IF NOT EXISTS receipt_number text;

ALTER TABLE public.contributions_received
  ADD COLUMN IF NOT EXISTS receipt_generated_at timestamptz;

ALTER TABLE public.contributions_received
  ADD COLUMN IF NOT EXISTS receipt_sent_at timestamptz;

ALTER TABLE public.contributions_received
  ADD COLUMN IF NOT EXISTS payment_reference text;

ALTER TABLE public.contributions_received
  ADD COLUMN IF NOT EXISTS campaign text;

ALTER TABLE public.contributions_received
  ADD COLUMN IF NOT EXISTS receipt_status text NOT NULL DEFAULT 'pending'
    CHECK (receipt_status IN ('pending', 'generated', 'sent'));

-- Back-fill receipt_status based on acknowledgment state
UPDATE public.contributions_received
SET receipt_status = CASE
  WHEN receipt_sent_at IS NOT NULL OR acknowledgment_sent = true THEN 'sent'
  WHEN receipt_generated_at IS NOT NULL OR acknowledged_at IS NOT NULL THEN 'generated'
  ELSE 'pending'
END
WHERE receipt_status = 'pending';

-- Index for efficient filtering on non-sent receipts
CREATE INDEX IF NOT EXISTS idx_contributions_received_receipt_status
  ON public.contributions_received (org_id, receipt_status)
  WHERE receipt_status != 'sent';

CREATE UNIQUE INDEX IF NOT EXISTS idx_contributions_received_receipt_number
  ON public.contributions_received (org_id, receipt_number)
  WHERE receipt_number IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS public.receipt_number_seq;

CREATE OR REPLACE FUNCTION public.generate_receipt_number(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.can_edit_org(p_org_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN 'R-' || to_char(now(), 'YYYY') || '-' ||
    lpad(nextval('public.receipt_number_seq')::text, 6, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_receipt_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_receipt_number(uuid) TO service_role;

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
