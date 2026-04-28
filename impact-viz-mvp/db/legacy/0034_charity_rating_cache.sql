-- Migration: Create charity rating cache table
-- Description: Cache external API ratings with TTL for performance and cost optimization
-- Date: 2025-12-24

-- Create charity_rating_cache table
CREATE TABLE IF NOT EXISTS charity_rating_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charity_id UUID NOT NULL REFERENCES charities(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,  -- 'charity_navigator', 'candid', 'propublica'
  rating_data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,

  -- Ensure one cache entry per charity per provider
  UNIQUE(charity_id, provider),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rating_cache_charity ON charity_rating_cache(charity_id);
CREATE INDEX IF NOT EXISTS idx_rating_cache_provider ON charity_rating_cache(provider);
CREATE INDEX IF NOT EXISTS idx_rating_cache_expires ON charity_rating_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_rating_cache_charity_provider ON charity_rating_cache(charity_id, provider);

-- Index for cleanup of expired entries (simple index on expires_at for sorting)
CREATE INDEX IF NOT EXISTS idx_rating_cache_expired
  ON charity_rating_cache(expires_at);

-- Row Level Security
ALTER TABLE charity_rating_cache ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read cache
CREATE POLICY "Authenticated users can view rating cache"
  ON charity_rating_cache
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Service role can manage cache
CREATE POLICY "Service role can manage rating cache"
  ON charity_rating_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON charity_rating_cache TO authenticated;
GRANT ALL ON charity_rating_cache TO service_role;

-- Helpful comments
COMMENT ON TABLE charity_rating_cache IS 'Cached ratings from external APIs with TTL for performance optimization';
COMMENT ON COLUMN charity_rating_cache.provider IS 'External data provider: charity_navigator, candid, or propublica';
COMMENT ON COLUMN charity_rating_cache.rating_data IS 'JSONB containing provider-specific rating data';
COMMENT ON COLUMN charity_rating_cache.expires_at IS 'Cache expiration timestamp - data should be refreshed after this time';

-- Function to clean up expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_rating_cache() RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM charity_rating_cache
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_rating_cache IS 'Removes expired cache entries and returns count of deleted rows';

-- Optional: Create a scheduled job to run cleanup (using pg_cron if available)
-- SELECT cron.schedule('cleanup-rating-cache', '0 2 * * *', 'SELECT cleanup_expired_rating_cache();');
