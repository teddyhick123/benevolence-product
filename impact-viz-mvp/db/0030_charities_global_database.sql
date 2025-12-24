-- Migration: Create global charities database
-- Description: Core table for centralized charity data with full-text search optimization
-- Date: 2025-12-21

-- Create charities table
CREATE TABLE IF NOT EXISTS charities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ein TEXT UNIQUE NOT NULL,  -- IRS Employer ID (primary identifier)
  name TEXT NOT NULL,
  legal_name TEXT,  -- Official IRS name
  website TEXT,

  -- Classification
  sector TEXT,  -- Education, Health, Environment, etc.
  ntee_code TEXT,  -- National Taxonomy of Exempt Entities
  impact_focus TEXT[],  -- Array: ["Climate Action", "Youth Programs"]

  -- Location
  street_address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  country TEXT DEFAULT 'United States',

  -- Description
  mission_statement TEXT,
  description TEXT,

  -- Size & Financials (from Form 990)
  annual_revenue NUMERIC,
  annual_expenses NUMERIC,
  assets NUMERIC,
  program_expense_ratio NUMERIC,  -- What % goes to programs vs overhead

  -- Ratings (JSONB for flexibility)
  charity_navigator_rating JSONB,  -- {score: 95, rating: "A+", accountability: 98, ...}
  candid_rating JSONB,  -- {seal: "platinum", transparency: "high", ...}

  -- Impact Metrics (JSONB)
  impact_metrics JSONB,  -- {beneficiaries_served: 50000, outcomes: {...}}

  -- Contact
  contact_email TEXT,
  contact_phone TEXT,
  contact_name TEXT,

  -- Metadata
  irs_deductibility_status TEXT,  -- 501(c)(3) public charity, private foundation, etc.
  irs_status_date DATE,
  last_form_990_date DATE,

  -- Data freshness
  data_source TEXT,  -- "propublica", "charity_navigator", "manual"
  data_last_updated TIMESTAMPTZ DEFAULT NOW(),
  ratings_last_updated TIMESTAMPTZ,

  -- Search optimization
  search_vector TSVECTOR,  -- Full-text search index

  -- Soft delete
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_charities_ein ON charities(ein);
CREATE INDEX IF NOT EXISTS idx_charities_name ON charities(name);
CREATE INDEX IF NOT EXISTS idx_charities_sector ON charities(sector);
CREATE INDEX IF NOT EXISTS idx_charities_state ON charities(state);
CREATE INDEX IF NOT EXISTS idx_charities_search ON charities USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_charities_active ON charities(is_active) WHERE is_active = true;

-- Composite index for common queries (sector + state filtering)
CREATE INDEX IF NOT EXISTS idx_charities_sector_state ON charities(sector, state) WHERE is_active = true;

-- Index for revenue-based queries
CREATE INDEX IF NOT EXISTS idx_charities_revenue ON charities(annual_revenue DESC NULLS LAST) WHERE is_active = true;

-- Full-text search trigger function
-- This automatically updates the search_vector whenever name, mission_statement, or description changes
CREATE OR REPLACE FUNCTION charities_search_vector_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('pg_catalog.english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('pg_catalog.english', COALESCE(NEW.mission_statement, '')), 'B') ||
    setweight(to_tsvector('pg_catalog.english', COALESCE(NEW.description, '')), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS charities_search_vector_update ON charities;
CREATE TRIGGER charities_search_vector_update
  BEFORE INSERT OR UPDATE OF name, mission_statement, description
  ON charities
  FOR EACH ROW
  EXECUTE FUNCTION charities_search_vector_trigger();

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_charities_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS charities_updated_at_trigger ON charities;
CREATE TRIGGER charities_updated_at_trigger
  BEFORE UPDATE ON charities
  FOR EACH ROW
  EXECUTE FUNCTION update_charities_updated_at();

-- Row Level Security (RLS) for charities
ALTER TABLE charities ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read active charities
CREATE POLICY "Authenticated users can view active charities"
  ON charities
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Policy: Only service role can insert/update/delete charities
-- (This will be done via API routes with proper authorization)
CREATE POLICY "Service role can manage charities"
  ON charities
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON charities TO authenticated;
GRANT ALL ON charities TO service_role;

-- Add helpful comments
COMMENT ON TABLE charities IS 'Global database of charitable organizations with ratings, financials, and impact data';
COMMENT ON COLUMN charities.ein IS 'IRS Employer Identification Number - unique identifier for US nonprofits';
COMMENT ON COLUMN charities.search_vector IS 'Full-text search index automatically generated from name, mission, and description';
COMMENT ON COLUMN charities.charity_navigator_rating IS 'JSONB containing Charity Navigator scores and ratings';
COMMENT ON COLUMN charities.candid_rating IS 'JSONB containing Candid (GuideStar) seal and transparency data';
