-- Migration: QuickBooks Online Integration
-- Creates tables for QB connections and synced chart-of-accounts data

-- ============================================================================
-- 1. QUICKBOOKS CONNECTIONS — stores OAuth tokens per portfolio
-- ============================================================================
CREATE TABLE IF NOT EXISTS quickbooks_connections (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id    UUID        NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  realm_id        TEXT        NOT NULL,
  access_token    TEXT        NOT NULL,
  refresh_token   TEXT        NOT NULL,
  token_expiry    TIMESTAMPTZ NOT NULL,
  connected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sync_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(portfolio_id)
);

COMMENT ON TABLE  quickbooks_connections IS 'Stores QuickBooks Online OAuth tokens per portfolio';
COMMENT ON COLUMN quickbooks_connections.realm_id      IS 'QuickBooks company ID (realmId)';
COMMENT ON COLUMN quickbooks_connections.token_expiry  IS 'Access token expiry time; client auto-refreshes within 30 days';
COMMENT ON COLUMN quickbooks_connections.last_sync_at  IS 'Timestamp of the last successful chart-of-accounts sync';

CREATE INDEX IF NOT EXISTS idx_qb_connections_portfolio ON quickbooks_connections(portfolio_id);

ALTER TABLE quickbooks_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Portfolio members can view QB connections"
  ON quickbooks_connections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM portfolio_members pm
      WHERE pm.portfolio_id = quickbooks_connections.portfolio_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Portfolio members can insert QB connections"
  ON quickbooks_connections FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM portfolio_members pm
      WHERE pm.portfolio_id = quickbooks_connections.portfolio_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Portfolio members can update QB connections"
  ON quickbooks_connections FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM portfolio_members pm
      WHERE pm.portfolio_id = quickbooks_connections.portfolio_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Portfolio members can delete QB connections"
  ON quickbooks_connections FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM portfolio_members pm
      WHERE pm.portfolio_id = quickbooks_connections.portfolio_id
        AND pm.user_id = auth.uid()
    )
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION _qb_connections_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_qb_connections_updated_at ON quickbooks_connections;
CREATE TRIGGER trg_qb_connections_updated_at
  BEFORE UPDATE ON quickbooks_connections
  FOR EACH ROW EXECUTE FUNCTION _qb_connections_set_updated_at();

-- ============================================================================
-- 2. QB ACCOUNTS — synced chart-of-accounts entries
-- ============================================================================
CREATE TABLE IF NOT EXISTS qb_accounts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id    UUID        NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  qb_account_id   TEXT        NOT NULL,
  name            TEXT        NOT NULL,
  type            TEXT        NOT NULL,
  subtype         TEXT,
  current_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  synced_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(portfolio_id, qb_account_id)
);

COMMENT ON TABLE  qb_accounts IS 'QuickBooks Online Chart of Accounts entries synced per portfolio';
COMMENT ON COLUMN qb_accounts.qb_account_id IS 'The Id field from the QuickBooks Account object';
COMMENT ON COLUMN qb_accounts.type          IS 'AccountType from QBO (e.g. Expense, Bank, Other Current Asset)';
COMMENT ON COLUMN qb_accounts.subtype       IS 'AccountSubType from QBO';

CREATE INDEX IF NOT EXISTS idx_qb_accounts_portfolio ON qb_accounts(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_qb_accounts_type      ON qb_accounts(portfolio_id, type);

ALTER TABLE qb_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Portfolio members can view QB accounts"
  ON qb_accounts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM portfolio_members pm
      WHERE pm.portfolio_id = qb_accounts.portfolio_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Portfolio members can insert QB accounts"
  ON qb_accounts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM portfolio_members pm
      WHERE pm.portfolio_id = qb_accounts.portfolio_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Portfolio members can update QB accounts"
  ON qb_accounts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM portfolio_members pm
      WHERE pm.portfolio_id = qb_accounts.portfolio_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Portfolio members can delete QB accounts"
  ON qb_accounts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM portfolio_members pm
      WHERE pm.portfolio_id = qb_accounts.portfolio_id
        AND pm.user_id = auth.uid()
    )
  );
