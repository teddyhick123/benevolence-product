-- =============================================================================
-- 0017_quickbooks.sql
-- QuickBooks Online integration — org-scoped (one QB connection per org).
-- No portfolio_id column. Module-gated: org_has_module(org_id, 'quickbooks').
-- Depends on: 0001, 0002
-- =============================================================================

-- ---------------------------------------------------------------------------
-- quickbooks_connections — OAuth tokens per org
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quickbooks_connections (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- One connection per org
  org_id              uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,

  -- QB OAuth
  realm_id            text NOT NULL,   -- QB company ID
  access_token        text NOT NULL,
  refresh_token       text NOT NULL,
  token_type          text NOT NULL DEFAULT 'bearer',
  expires_at          timestamptz NOT NULL,
  refresh_expires_at  timestamptz,

  -- QB company info (cached)
  company_name        text,
  company_country     text,
  base_currency       text DEFAULT 'USD',

  -- Sync state
  last_sync_at        timestamptz,
  last_sync_status    text,           -- 'success', 'partial', 'failed'
  sync_cursor         text,           -- for incremental sync (CDCTime)
  sync_error          text,

  -- Settings
  sync_enabled        boolean NOT NULL DEFAULT true,
  sync_interval_hours int NOT NULL DEFAULT 24,
  auto_categorize     boolean NOT NULL DEFAULT true,

  connected_by        uuid NOT NULL REFERENCES auth.users(id),
  disconnected_at     timestamptz,
  disconnected_by     uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_qb_connections_org_id  ON quickbooks_connections (org_id);
CREATE INDEX idx_qb_connections_realm   ON quickbooks_connections (realm_id);

CREATE TRIGGER trg_qb_connections_updated_at
  BEFORE UPDATE ON quickbooks_connections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- qb_accounts — chart of accounts mirror from QB
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qb_accounts (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id   uuid NOT NULL REFERENCES quickbooks_connections(id) ON DELETE CASCADE,

  -- QB fields
  qb_id           text NOT NULL,
  qb_name         text NOT NULL,
  qb_type         text,            -- 'Bank', 'Expense', 'Income', 'Asset', etc.
  qb_subtype      text,
  account_number  text,
  is_active       boolean NOT NULL DEFAULT true,
  current_balance numeric(20,2),
  currency        text DEFAULT 'USD',
  description     text,

  -- Mapping to holdings (optional: account can be linked to a holding)
  holding_id      uuid REFERENCES holdings(id) ON DELETE SET NULL,

  synced_at       timestamptz NOT NULL DEFAULT now(),

  UNIQUE (org_id, qb_id)
);

CREATE INDEX idx_qb_accounts_org_id       ON qb_accounts (org_id) WHERE is_active;
CREATE INDEX idx_qb_accounts_connection   ON qb_accounts (connection_id);
CREATE INDEX idx_qb_accounts_holding_id   ON qb_accounts (holding_id) WHERE holding_id IS NOT NULL;

CREATE TRIGGER trg_qb_accounts_updated_at
  BEFORE UPDATE ON qb_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- qb_transactions — raw transaction mirror from QB
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qb_transactions (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),

  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id   uuid NOT NULL REFERENCES quickbooks_connections(id) ON DELETE CASCADE,
  account_id      uuid REFERENCES qb_accounts(id) ON DELETE SET NULL,

  qb_id           text NOT NULL,
  qb_type         text NOT NULL,   -- 'Payment', 'Deposit', 'JournalEntry', etc.
  transaction_date date NOT NULL,
  amount          numeric(20,2) NOT NULL,
  currency        text DEFAULT 'USD',
  memo            text,
  name            text,
  category        text,

  -- Link to holdings after categorization
  holding_id      uuid REFERENCES holdings(id) ON DELETE SET NULL,
  is_categorized  boolean NOT NULL DEFAULT false,
  categorized_at  timestamptz,
  categorized_by  uuid REFERENCES auth.users(id),

  raw_payload     jsonb,          -- full QB API response for this transaction
  synced_at       timestamptz NOT NULL DEFAULT now(),

  UNIQUE (org_id, qb_id)
);

CREATE INDEX idx_qb_transactions_org_id    ON qb_transactions (org_id, transaction_date DESC);
CREATE INDEX idx_qb_transactions_account   ON qb_transactions (account_id);
CREATE INDEX idx_qb_transactions_holding   ON qb_transactions (holding_id) WHERE holding_id IS NOT NULL;
CREATE INDEX idx_qb_transactions_uncat     ON qb_transactions (org_id) WHERE NOT is_categorized;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE quickbooks_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qb_connections: org admins only + module check"
  ON quickbooks_connections FOR SELECT
  USING (is_org_admin(org_id) AND org_has_module(org_id, 'quickbooks'));
CREATE POLICY "qb_connections: org admins can manage + module check"
  ON quickbooks_connections FOR ALL
  USING (is_org_admin(org_id) AND org_has_module(org_id, 'quickbooks'))
  WITH CHECK (is_org_admin(org_id) AND org_has_module(org_id, 'quickbooks'));

ALTER TABLE qb_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qb_accounts: org members can view + module check"
  ON qb_accounts FOR SELECT
  USING (can_view_org(org_id) AND org_has_module(org_id, 'quickbooks'));
CREATE POLICY "qb_accounts: org admins can manage"
  ON qb_accounts FOR ALL
  USING (is_org_admin(org_id) AND org_has_module(org_id, 'quickbooks'))
  WITH CHECK (is_org_admin(org_id) AND org_has_module(org_id, 'quickbooks'));

ALTER TABLE qb_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qb_transactions: org members can view + module check"
  ON qb_transactions FOR SELECT
  USING (can_view_org(org_id) AND org_has_module(org_id, 'quickbooks'));
CREATE POLICY "qb_transactions: org admins can manage"
  ON qb_transactions FOR ALL
  USING (is_org_admin(org_id) AND org_has_module(org_id, 'quickbooks'))
  WITH CHECK (is_org_admin(org_id) AND org_has_module(org_id, 'quickbooks'));
