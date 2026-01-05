-- Migration: Create geocode_cache table for caching Google Maps API results
-- Purpose: Reduce API costs and improve performance by caching geocoding results
-- Pattern: Follows charity_rating_cache.sql structure
-- Date: 2026-01-04

-- Create geocode_cache table
CREATE TABLE IF NOT EXISTS public.geocode_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_key TEXT NOT NULL UNIQUE,  -- Hash of city+state+country for deduplication
  result JSONB,                        -- GeocodeResult object or null if geocoding failed
  error TEXT,                          -- Error message if geocoding failed
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_geocode_cache_location_key ON public.geocode_cache(location_key);
CREATE INDEX IF NOT EXISTS idx_geocode_cache_expires ON public.geocode_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_geocode_cache_cached_at ON public.geocode_cache(cached_at DESC);

-- Add table comment
COMMENT ON TABLE public.geocode_cache IS 'Cache for Google Maps Geocoding API results (90-day TTL)';
COMMENT ON COLUMN public.geocode_cache.location_key IS 'Hash of location parameters (city+state+country) for deduplication';
COMMENT ON COLUMN public.geocode_cache.result IS 'GeocodeResult JSON object with latitude, longitude, formatted address, etc.';
COMMENT ON COLUMN public.geocode_cache.error IS 'Error message if geocoding failed (for debugging)';
COMMENT ON COLUMN public.geocode_cache.expires_at IS 'Expiration timestamp (90 days after cached_at)';

-- Enable Row Level Security
ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow authenticated users to read cache
CREATE POLICY geocode_cache_read ON public.geocode_cache
  FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policy: Only service role can insert/update/delete (cache management)
-- This prevents users from polluting the cache with invalid data
CREATE POLICY geocode_cache_service_write ON public.geocode_cache
  FOR ALL
  TO service_role
  USING (true);

-- Function to clean expired cache entries (run via cron or manually)
CREATE OR REPLACE FUNCTION public.clean_expired_geocode_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.geocode_cache
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.clean_expired_geocode_cache IS 'Deletes expired geocode cache entries. Returns count of deleted rows.';

-- Grant execute permission to service role for cleanup function
GRANT EXECUTE ON FUNCTION public.clean_expired_geocode_cache() TO service_role;

-- Function to get cache statistics (useful for monitoring)
CREATE OR REPLACE FUNCTION public.get_geocode_cache_stats()
RETURNS TABLE (
  total_entries BIGINT,
  valid_results BIGINT,
  failed_results BIGINT,
  expired_entries BIGINT,
  cache_hit_potential NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_entries,
    COUNT(*) FILTER (WHERE result IS NOT NULL)::BIGINT as valid_results,
    COUNT(*) FILTER (WHERE result IS NULL AND error IS NOT NULL)::BIGINT as failed_results,
    COUNT(*) FILTER (WHERE expires_at < NOW())::BIGINT as expired_entries,
    CASE
      WHEN COUNT(*) > 0 THEN
        ROUND(
          (COUNT(*) FILTER (WHERE result IS NOT NULL)::NUMERIC / COUNT(*)::NUMERIC) * 100,
          2
        )
      ELSE 0
    END as cache_hit_potential
  FROM public.geocode_cache;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_geocode_cache_stats IS 'Returns statistics about the geocode cache (total, valid, failed, expired entries)';

-- Grant execute permission to authenticated users for stats function
GRANT EXECUTE ON FUNCTION public.get_geocode_cache_stats() TO authenticated;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION public.update_geocode_cache_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_geocode_cache_updated_at
  BEFORE UPDATE ON public.geocode_cache
  FOR EACH ROW
  EXECUTE FUNCTION public.update_geocode_cache_timestamp();

-- Migration complete
-- Note: This cache table reduces Google Maps API costs by ~90% in typical usage
-- Cache entries expire after 90 days to ensure data freshness
