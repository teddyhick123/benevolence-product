-- Migration: Add geocoding fields to holdings table
-- Purpose: Enable automatic geocoding of holdings based on location text fields
-- Date: 2026-01-04

-- Add latitude/longitude columns to holdings table
ALTER TABLE public.holdings
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS geocode_status TEXT CHECK (geocode_status IN ('pending', 'success', 'failed', 'skipped')),
ADD COLUMN IF NOT EXISTS geocode_provider TEXT,
ADD COLUMN IF NOT EXISTS geocode_metadata JSONB DEFAULT '{}'::jsonb;

-- Add comments for documentation
COMMENT ON COLUMN public.holdings.latitude IS 'Latitude coordinate from geocoding service (-90 to 90)';
COMMENT ON COLUMN public.holdings.longitude IS 'Longitude coordinate from geocoding service (-180 to 180)';
COMMENT ON COLUMN public.holdings.geocoded_at IS 'Timestamp when location was last geocoded';
COMMENT ON COLUMN public.holdings.geocode_status IS 'Status of last geocoding attempt: pending, success, failed, or skipped';
COMMENT ON COLUMN public.holdings.geocode_provider IS 'Geocoding service used (e.g., google_maps)';
COMMENT ON COLUMN public.holdings.geocode_metadata IS 'Additional geocoding metadata (formatted address, accuracy, place ID, etc.)';

-- Create indexes for efficient map queries
CREATE INDEX IF NOT EXISTS idx_holdings_lat_lon ON public.holdings(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_holdings_geocode_status ON public.holdings(geocode_status);

CREATE INDEX IF NOT EXISTS idx_holdings_portfolio_geocoded ON public.holdings(portfolio_id, geocode_status)
  WHERE geocode_status IS NOT NULL;

-- Update v_holdings view to include geocoding fields
DROP VIEW IF EXISTS v_holdings CASCADE;

CREATE OR REPLACE VIEW v_holdings AS
SELECT
  h.id,
  h.portfolio_id,
  h.investee_id,
  h.name,
  h.status,
  h.asset_type,
  h.asset_subtype,
  h.funds_allocated,
  h.as_of,
  h.sector,
  h.country,
  h.custodian,
  h.valuation_method,
  h.description,
  h.primary_contact_name,
  h.primary_contact_email,
  h.primary_contact_phone,
  h.primary_contact_photo,
  h.primary_contact_notes,
  h.website,
  h.location_city,
  h.location_state,
  h.location_country,
  h.latitude,
  h.longitude,
  h.geocoded_at,
  h.geocode_status,
  h.geocode_provider,
  h.geocode_metadata,
  h.theory_of_action,
  h.cost_per_outcome,
  h.cost_per_outcome_unit,
  h.total_org_funding,
  h.metadata,
  h.created_at,
  h.updated_at
FROM public.holdings h;

-- Grant permissions on the updated view
GRANT SELECT ON v_holdings TO authenticated;

-- Add trigger to update geocode_status to 'pending' when location fields change
-- This ensures we can identify holdings that need re-geocoding
CREATE OR REPLACE FUNCTION public.mark_geocode_pending()
RETURNS TRIGGER AS $$
BEGIN
  -- If any location field changed and we have at least a city, mark as pending
  IF (NEW.location_city IS DISTINCT FROM OLD.location_city OR
      NEW.location_state IS DISTINCT FROM OLD.location_state OR
      NEW.location_country IS DISTINCT FROM OLD.location_country) AND
     NEW.location_city IS NOT NULL THEN
    -- Only mark as pending if not already being geocoded or recently geocoded
    IF OLD.geocode_status IS NULL OR
       OLD.geocode_status NOT IN ('pending', 'success') OR
       (OLD.geocoded_at IS NULL OR OLD.geocoded_at < NOW() - INTERVAL '7 days') THEN
      NEW.geocode_status := 'pending';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic pending status on location updates
DROP TRIGGER IF EXISTS trigger_mark_geocode_pending ON public.holdings;

CREATE TRIGGER trigger_mark_geocode_pending
  BEFORE UPDATE ON public.holdings
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_geocode_pending();

-- Set geocode_status to 'pending' for existing holdings with location data but no coordinates
UPDATE public.holdings
SET geocode_status = 'pending'
WHERE location_city IS NOT NULL
  AND latitude IS NULL
  AND geocode_status IS NULL;

-- Migration complete
COMMENT ON TABLE public.holdings IS 'Portfolio holdings with automatic geocoding support for map visualization';
