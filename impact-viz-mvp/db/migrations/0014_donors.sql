-- =============================================================================
-- 0014_donors.sql
-- Donor CRM — the people/entities who give TO this organization.
-- Scoped at org level (donors are org-wide, not per-portfolio).
-- Module-gated: org_has_module(org_id, 'donors').
--
-- NOT to be confused with owner_tax_profiles (0012), which is the portfolio
-- owner's personal tax data. This table is about external donors.
-- Depends on: 0001, 0002
-- =============================================================================

CREATE TYPE donor_tier_enum AS ENUM (
  'major',      -- e.g. $100k+ lifetime
  'mid',        -- e.g. $10k-$100k lifetime
  'recurring',  -- regular givers regardless of amount
  'annual',     -- annual fund donors
  'lapsed',     -- gave before, not recently
  'prospect'    -- not yet a donor
);

CREATE TYPE donor_recency_enum AS ENUM (
  'active',   -- gave within 12 months
  'lapsed',   -- gave 12-36 months ago
  'lost'      -- no gift in 36+ months
);

-- ---------------------------------------------------------------------------
-- donors
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS donors (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identity
  first_name          text,
  last_name           text,
  organization_name   text,        -- for corporate / foundation donors
  is_organization     boolean NOT NULL DEFAULT false,
  preferred_name      text,

  -- Contact
  email               text,
  phone               text,
  address_line1       text,
  address_line2       text,
  city                text,
  state               text,
  zip                 text,
  country             text DEFAULT 'US',

  -- CRM metadata
  tier                donor_tier_enum NOT NULL DEFAULT 'prospect',
  recency_status      donor_recency_enum NOT NULL DEFAULT 'active',
  relationship_manager uuid REFERENCES auth.users(id),

  -- Computed / cached (updated by trigger or background job)
  lifetime_giving     numeric(20,2) NOT NULL DEFAULT 0,
  largest_gift        numeric(20,2),
  first_gift_date     date,
  last_gift_date      date,
  gift_count          int NOT NULL DEFAULT 0,

  -- Notes & tags
  notes               text,
  tags                text[],
  custom_fields       jsonb NOT NULL DEFAULT '{}',

  -- Source tracking
  source              text,        -- 'blackbaud', 'manual', 'import', 'web_form'
  external_id         text,        -- ID in source system

  -- Soft-delete
  deleted_at          timestamptz,
  deleted_by          uuid REFERENCES auth.users(id),

  UNIQUE (org_id, external_id) -- prevent duplicate imports
);

CREATE INDEX idx_donors_org_id          ON donors (org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_donors_email           ON donors (org_id, email) WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_donors_tier            ON donors (org_id, tier) WHERE deleted_at IS NULL;
CREATE INDEX idx_donors_recency         ON donors (org_id, recency_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_donors_last_gift_date  ON donors (org_id, last_gift_date DESC NULLS LAST) WHERE deleted_at IS NULL;
CREATE INDEX idx_donors_lifetime_giving ON donors (org_id, lifetime_giving DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_donors_tags            ON donors USING GIN (tags);
-- Full-text name search
CREATE INDEX idx_donors_name_trgm       ON donors USING GIN (
  (coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(organization_name,''))
  gin_trgm_ops
);

CREATE TRIGGER trg_donors_updated_at
  BEFORE UPDATE ON donors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- contributions_received — gifts received FROM donors TO the org
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contributions_received (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  donor_id            uuid NOT NULL REFERENCES donors(id) ON DELETE CASCADE,

  contribution_date   date NOT NULL,
  amount              numeric(20,2) NOT NULL,
  currency            text NOT NULL DEFAULT 'USD',
  gift_type           text NOT NULL DEFAULT 'cash',
  -- 'cash', 'check', 'credit_card', 'securities', 'daf_grant', 'in_kind', 'pledge', 'bequest'

  -- Designation
  fund_designation    text,        -- 'general', 'endowment', 'specific_program', etc.
  is_restricted       boolean NOT NULL DEFAULT false,
  restriction_purpose text,

  -- Pledge tracking
  pledge_id           uuid,        -- self-reference for pledge payments
  is_pledge           boolean NOT NULL DEFAULT false,
  pledge_amount       numeric(20,2),
  pledge_fulfilled_at timestamptz,

  -- Acknowledgment
  acknowledged_at     timestamptz,
  acknowledgment_sent boolean NOT NULL DEFAULT false,

  -- External
  external_id         text,
  source_system       text,
  notes               text,
  receipt_url         text
);

CREATE INDEX idx_contributions_received_org_id      ON contributions_received (org_id);
CREATE INDEX idx_contributions_received_donor_id    ON contributions_received (donor_id);
CREATE INDEX idx_contributions_received_date        ON contributions_received (contribution_date DESC);
CREATE INDEX idx_contributions_received_fund        ON contributions_received (fund_designation) WHERE fund_designation IS NOT NULL;

CREATE TRIGGER trg_contributions_received_updated_at
  BEFORE UPDATE ON contributions_received
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-update donor aggregate fields after contribution insert/update/delete
CREATE OR REPLACE FUNCTION update_donor_aggregates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_donor_id uuid := COALESCE(NEW.donor_id, OLD.donor_id);
BEGIN
  UPDATE donors SET
    lifetime_giving  = agg.total,
    largest_gift     = agg.largest,
    first_gift_date  = agg.first_date,
    last_gift_date   = agg.last_date,
    gift_count       = agg.cnt,
    recency_status   = CASE
      WHEN agg.last_date >= (CURRENT_DATE - interval '12 months') THEN 'active'
      WHEN agg.last_date >= (CURRENT_DATE - interval '36 months') THEN 'lapsed'
      ELSE 'lost'
    END::donor_recency_enum
  FROM (
    SELECT
      SUM(amount)   AS total,
      MAX(amount)   AS largest,
      MIN(contribution_date) AS first_date,
      MAX(contribution_date) AS last_date,
      COUNT(*)      AS cnt
    FROM contributions_received
    WHERE donor_id = v_donor_id AND NOT is_pledge
  ) agg
  WHERE id = v_donor_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_update_donor_aggregates
  AFTER INSERT OR UPDATE OR DELETE ON contributions_received
  FOR EACH ROW EXECUTE FUNCTION update_donor_aggregates();

-- ---------------------------------------------------------------------------
-- v_donor_summary — rich view used by CRM list
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_donor_summary AS
SELECT
  d.*,
  d.first_name || ' ' || COALESCE(d.last_name, '') AS full_name
FROM donors d
WHERE d.deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE donors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "donors: org members can view + module check"
  ON donors FOR SELECT
  USING (can_view_org(org_id) AND org_has_module(org_id, 'donors') AND deleted_at IS NULL);

CREATE POLICY "donors: org members (member+) can manage + module check"
  ON donors FOR ALL
  USING (can_edit_org(org_id) AND org_has_module(org_id, 'donors') AND deleted_at IS NULL)
  WITH CHECK (can_edit_org(org_id) AND org_has_module(org_id, 'donors'));

ALTER TABLE contributions_received ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contributions_received: org members can view + module check"
  ON contributions_received FOR SELECT
  USING (can_view_org(org_id) AND org_has_module(org_id, 'donors'));

CREATE POLICY "contributions_received: org members (member+) can manage"
  ON contributions_received FOR ALL
  USING (can_edit_org(org_id) AND org_has_module(org_id, 'donors'))
  WITH CHECK (can_edit_org(org_id) AND org_has_module(org_id, 'donors'));
