-- =============================================================================
-- 0007_investment_tracking.sql
-- Investment-specific tracking: valuations, transactions, capital calls,
-- distributions, co-investors.
-- Depends on: 0001, 0006
-- =============================================================================

-- ---------------------------------------------------------------------------
-- holding_valuations — point-in-time NAV / fair value marks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS holding_valuations (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),

  holding_id      uuid NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
  valued_at       date NOT NULL,
  value           numeric(20,4) NOT NULL,
  currency        text NOT NULL DEFAULT 'USD',
  valuation_type  text NOT NULL DEFAULT 'mark_to_market',
  -- 'mark_to_market', 'mark_to_model', 'cost_basis', 'appraisal', 'manager_reported'
  notes           text,
  source          text,

  UNIQUE (holding_id, valued_at, valuation_type)
);

CREATE INDEX idx_holding_valuations_holding_id ON holding_valuations (holding_id, valued_at DESC);

-- ---------------------------------------------------------------------------
-- holding_transactions — capital calls, distributions, fees
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS holding_transactions (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  holding_id      uuid NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
  transaction_date date NOT NULL,
  transaction_type text NOT NULL,
  -- 'capital_call', 'distribution', 'fee', 'interest', 'dividend',
  -- 'return_of_capital', 'write_down', 'write_up'
  amount          numeric(20,4) NOT NULL,
  currency        text NOT NULL DEFAULT 'USD',
  notes           text,
  external_id     text  -- reference in source system
);

CREATE INDEX idx_holding_transactions_holding_id ON holding_transactions (holding_id, transaction_date DESC);
CREATE INDEX idx_holding_transactions_type       ON holding_transactions (transaction_type);

CREATE TRIGGER trg_holding_transactions_updated_at
  BEFORE UPDATE ON holding_transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- holding_co_investors — track syndication partners
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS holding_co_investors (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),

  holding_id      uuid NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
  investor_name   text NOT NULL,
  relationship    text,           -- 'lead', 'co-investor', 'LP', 'GP'
  committed_amount numeric(20,4),
  currency        text NOT NULL DEFAULT 'USD',
  notes           text
);

CREATE INDEX idx_holding_co_investors_holding_id ON holding_co_investors (holding_id);

-- ---------------------------------------------------------------------------
-- RLS: inherit from portfolio_id via holding
-- Helper macro: inline portfolio lookup
-- ---------------------------------------------------------------------------

ALTER TABLE holding_valuations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "holding_valuations: inherit from holding"
  ON holding_valuations FOR SELECT
  USING (can_view_portfolio((SELECT portfolio_id FROM holdings WHERE id = holding_id)));
CREATE POLICY "holding_valuations: members can manage"
  ON holding_valuations FOR ALL
  USING (can_edit_portfolio((SELECT portfolio_id FROM holdings WHERE id = holding_id)))
  WITH CHECK (can_edit_portfolio((SELECT portfolio_id FROM holdings WHERE id = holding_id)));

ALTER TABLE holding_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "holding_transactions: inherit from holding"
  ON holding_transactions FOR SELECT
  USING (can_view_portfolio((SELECT portfolio_id FROM holdings WHERE id = holding_id)));
CREATE POLICY "holding_transactions: members can manage"
  ON holding_transactions FOR ALL
  USING (can_edit_portfolio((SELECT portfolio_id FROM holdings WHERE id = holding_id)))
  WITH CHECK (can_edit_portfolio((SELECT portfolio_id FROM holdings WHERE id = holding_id)));

ALTER TABLE holding_co_investors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "holding_co_investors: inherit from holding"
  ON holding_co_investors FOR SELECT
  USING (can_view_portfolio((SELECT portfolio_id FROM holdings WHERE id = holding_id)));
CREATE POLICY "holding_co_investors: members can manage"
  ON holding_co_investors FOR ALL
  USING (can_edit_portfolio((SELECT portfolio_id FROM holdings WHERE id = holding_id)))
  WITH CHECK (can_edit_portfolio((SELECT portfolio_id FROM holdings WHERE id = holding_id)));
