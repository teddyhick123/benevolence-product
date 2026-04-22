-- Migration 0028: CPA Collaboration Portal
-- Purpose: Enable secure sharing of tax data with CPAs and tax professionals
-- Author: Claude Code
-- Date: 2024-11-29

BEGIN;

-- ============================================================================
-- 1. CPA Share Links Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cpa_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,

  -- Security
  share_token TEXT NOT NULL UNIQUE,  -- Secure random token

  -- CPA Information
  cpa_name TEXT,
  cpa_email TEXT,
  cpa_firm TEXT,

  -- Access Control
  tax_years INTEGER[] NOT NULL,  -- Which years to share
  expires_at TIMESTAMPTZ,        -- Optional expiration
  max_accesses INTEGER,          -- Optional access limit
  access_count INTEGER DEFAULT 0 NOT NULL,

  -- Permissions (JSONB for flexibility)
  permissions JSONB NOT NULL DEFAULT '{
    "view_contributions": true,
    "view_carryforwards": true,
    "view_donor_profile": false,
    "view_tax_summary": true,
    "download_form8283": true,
    "download_turbotax": true
  }'::jsonb,

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_accessed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,

  CONSTRAINT valid_tax_years CHECK (array_length(tax_years, 1) > 0),
  CONSTRAINT valid_max_accesses CHECK (max_accesses IS NULL OR max_accesses > 0)
);

CREATE INDEX idx_cpa_share_links_portfolio ON public.cpa_share_links(portfolio_id);
CREATE INDEX idx_cpa_share_links_token ON public.cpa_share_links(share_token);
CREATE INDEX idx_cpa_share_links_expires ON public.cpa_share_links(expires_at) WHERE expires_at IS NOT NULL AND revoked_at IS NULL;

COMMENT ON TABLE public.cpa_share_links IS
  'Secure share links for CPA access to tax data';

-- ============================================================================
-- 2. CPA Access Logs Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cpa_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_link_id UUID NOT NULL REFERENCES public.cpa_share_links(id) ON DELETE CASCADE,

  -- Access Details
  accessed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  ip_address INET,
  user_agent TEXT,

  -- Action
  action TEXT NOT NULL CHECK (action IN ('view', 'download_form8283', 'download_turbotax', 'download_csv')),
  resource TEXT,  -- Optional specific resource accessed

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_cpa_access_logs_share_link ON public.cpa_access_logs(share_link_id);
CREATE INDEX idx_cpa_access_logs_accessed_at ON public.cpa_access_logs(accessed_at);

COMMENT ON TABLE public.cpa_access_logs IS
  'Audit log of CPA access to shared tax data';

-- ============================================================================
-- 3. Row Level Security (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE public.cpa_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpa_access_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Portfolio owners can manage their share links
CREATE POLICY cpa_share_links_owner_all ON public.cpa_share_links
  FOR ALL USING (
    portfolio_id IN (
      SELECT portfolio_id FROM public.profiles
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Public can view share links by token (for CPA access)
CREATE POLICY cpa_share_links_public_view_by_token ON public.cpa_share_links
  FOR SELECT USING (
    share_token IS NOT NULL
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > NOW())
  );

-- Policy: Portfolio owners can view their access logs
CREATE POLICY cpa_access_logs_owner_view ON public.cpa_access_logs
  FOR SELECT USING (
    share_link_id IN (
      SELECT id FROM public.cpa_share_links
      WHERE portfolio_id IN (
        SELECT portfolio_id FROM public.profiles
        WHERE user_id = auth.uid()
      )
    )
  );

-- Policy: System can insert access logs (no user auth required)
CREATE POLICY cpa_access_logs_insert_any ON public.cpa_access_logs
  FOR INSERT WITH CHECK (true);

-- ============================================================================
-- 4. Helper Functions
-- ============================================================================

/**
 * Increment access count and update last accessed time
 */
CREATE OR REPLACE FUNCTION increment_share_link_access(
  p_share_token TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.cpa_share_links
  SET
    access_count = access_count + 1,
    last_accessed_at = NOW()
  WHERE share_token = p_share_token
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > NOW());
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_share_link_access(TEXT) IS
  'Increment access count and update last accessed time for a share link';

/**
 * Revoke a share link
 */
CREATE OR REPLACE FUNCTION revoke_share_link(
  p_share_link_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.cpa_share_links
  SET revoked_at = NOW()
  WHERE id = p_share_link_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION revoke_share_link(UUID) IS
  'Revoke a CPA share link';

/**
 * Get share link by token (with validation)
 */
CREATE OR REPLACE FUNCTION get_valid_share_link(
  p_share_token TEXT
)
RETURNS TABLE (
  id UUID,
  portfolio_id UUID,
  share_token TEXT,
  cpa_name TEXT,
  cpa_email TEXT,
  cpa_firm TEXT,
  tax_years INTEGER[],
  expires_at TIMESTAMPTZ,
  max_accesses INTEGER,
  access_count INTEGER,
  permissions JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sl.id,
    sl.portfolio_id,
    sl.share_token,
    sl.cpa_name,
    sl.cpa_email,
    sl.cpa_firm,
    sl.tax_years,
    sl.expires_at,
    sl.max_accesses,
    sl.access_count,
    sl.permissions,
    sl.notes,
    sl.created_at,
    sl.last_accessed_at
  FROM public.cpa_share_links sl
  WHERE sl.share_token = p_share_token
    AND sl.revoked_at IS NULL
    AND (sl.expires_at IS NULL OR sl.expires_at > NOW())
    AND (sl.max_accesses IS NULL OR sl.access_count < sl.max_accesses);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_valid_share_link(TEXT) IS
  'Get a valid (non-revoked, non-expired) share link by token';

COMMIT;

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Create a test share link
-- INSERT INTO public.cpa_share_links (
--   portfolio_id,
--   share_token,
--   cpa_name,
--   cpa_email,
--   tax_years,
--   expires_at
-- ) VALUES (
--   'your-portfolio-id'::UUID,
--   'test-token-' || gen_random_uuid()::TEXT,
--   'John Smith CPA',
--   'john@cpafirm.com',
--   ARRAY[2024],
--   NOW() + INTERVAL '30 days'
-- );

-- View share links for a portfolio
-- SELECT * FROM public.cpa_share_links
-- WHERE portfolio_id = 'your-portfolio-id'::UUID
-- ORDER BY created_at DESC;

-- View access logs for a share link
-- SELECT * FROM public.cpa_access_logs
-- WHERE share_link_id = 'your-share-link-id'::UUID
-- ORDER BY accessed_at DESC;
