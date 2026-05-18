-- =============================================================================
-- 0043_tax_cpa_sharing.sql
-- CPA collaboration share links and access logging.
-- Module-gated: requires org_has_module(org_id, 'tax').
-- Depends on: 0001, 0004, 0013
-- =============================================================================

-- ---------------------------------------------------------------------------
-- cpa_share_links — one row per CPA access grant.
-- The raw bearer token is NEVER stored here; only the SHA-256 hash is kept.
-- The raw token is shown once at creation time and must not be persisted.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cpa_share_links (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id      UUID        NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  org_id            UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token_hash        TEXT        NOT NULL UNIQUE, -- SHA-256 of raw token; raw token is never stored
  cpa_name          TEXT,
  cpa_email         TEXT,
  cpa_firm          TEXT,
  allowed_tax_years INTEGER[]   NOT NULL DEFAULT '{}',
  permissions       JSONB       NOT NULL DEFAULT '{}',
  expires_at        TIMESTAMPTZ,
  max_access_count  INTEGER     CHECK (max_access_count IS NULL OR max_access_count > 0),
  access_count      INTEGER     NOT NULL DEFAULT 0 CHECK (access_count >= 0),
  revoked_at        TIMESTAMPTZ,
  created_by        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cpa_share_links_portfolio_id
  ON public.cpa_share_links(portfolio_id);

CREATE INDEX IF NOT EXISTS idx_cpa_share_links_org_id
  ON public.cpa_share_links(org_id);

CREATE TRIGGER trg_cpa_share_links_updated_at
  BEFORE UPDATE ON public.cpa_share_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- cpa_access_logs — append-only audit trail of CPA portal activity.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cpa_access_logs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  share_link_id  UUID        NOT NULL REFERENCES public.cpa_share_links(id) ON DELETE CASCADE,
  action         TEXT        NOT NULL,
  resource       TEXT,
  ip_address     TEXT,
  user_agent     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cpa_access_logs_share_link_id
  ON public.cpa_access_logs(share_link_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.cpa_share_links  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpa_access_logs  ENABLE ROW LEVEL SECURITY;

-- cpa_share_links: portfolio members can read; portfolio editors can write.
CREATE POLICY "cpa_share_links_read" ON public.cpa_share_links
  FOR SELECT TO authenticated
  USING (
    public.can_view_portfolio(portfolio_id)
    AND public.org_has_module(org_id, 'tax')
  );

CREATE POLICY "cpa_share_links_write" ON public.cpa_share_links
  FOR ALL TO authenticated
  USING (
    public.can_edit_portfolio(portfolio_id)
    AND public.org_has_module(org_id, 'tax')
  )
  WITH CHECK (
    public.can_edit_portfolio(portfolio_id)
    AND public.org_has_module(org_id, 'tax')
  );

CREATE POLICY "cpa_share_links_service" ON public.cpa_share_links
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- cpa_access_logs: no direct portfolio_id — derive access rights via parent share link.
CREATE POLICY "cpa_access_logs_read" ON public.cpa_access_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.cpa_share_links l
      WHERE l.id = share_link_id
        AND public.can_view_portfolio(l.portfolio_id)
    )
  );

CREATE POLICY "cpa_access_logs_write" ON public.cpa_access_logs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.cpa_share_links l
      WHERE l.id = share_link_id
        AND public.can_edit_portfolio(l.portfolio_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.cpa_share_links l
      WHERE l.id = share_link_id
        AND public.can_edit_portfolio(l.portfolio_id)
    )
  );

CREATE POLICY "cpa_access_logs_service" ON public.cpa_access_logs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cpa_share_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cpa_access_logs  TO authenticated;

GRANT ALL ON public.cpa_share_links TO service_role;
GRANT ALL ON public.cpa_access_logs  TO service_role;

COMMENT ON TABLE  public.cpa_share_links IS 'Secure share links for CPA/tax-professional access to portfolio tax data. Stores only a SHA-256 token_hash — the raw bearer token is never persisted.';
COMMENT ON COLUMN public.cpa_share_links.token_hash IS 'SHA-256 hex digest of the raw bearer token. The raw token is shown once at creation and must not be stored anywhere.';
COMMENT ON TABLE  public.cpa_access_logs IS 'Append-only audit log of every CPA portal action against a share link.';
