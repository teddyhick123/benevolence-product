-- Migration: External Data Cache Tables
-- Description: Creates charity_rating_cache and geocode_cache tables with RPCs
--              get_geocode_cache_stats() and clean_expired_geocode_cache().
--              Fixes Ch-B1.
-- Date: 2026-06-02

-- ---------------------------------------------------------------------------
-- charity_rating_cache — cached provider ratings for charities
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.charity_rating_cache (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  charity_id  uuid        NOT NULL REFERENCES public.charities(id) ON DELETE CASCADE,
  provider    text        NOT NULL
              CHECK (provider IN ('charity_navigator', 'candid', 'give_well', 'give_org', 'other')),
  rating_data jsonb       NOT NULL DEFAULT '{}',
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),

  UNIQUE (charity_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_charity_rating_cache_charity_id ON public.charity_rating_cache (charity_id);
CREATE INDEX IF NOT EXISTS idx_charity_rating_cache_expires    ON public.charity_rating_cache (expires_at)
  WHERE expires_at > now();

ALTER TABLE public.charity_rating_cache ENABLE ROW LEVEL SECURITY;

-- Ratings are read-only reference data for authenticated users; writes via service role only
CREATE POLICY "charity_rating_cache: authenticated can read"
  ON public.charity_rating_cache FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "charity_rating_cache: service role full access"
  ON public.charity_rating_cache FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON public.charity_rating_cache TO authenticated;
GRANT ALL ON public.charity_rating_cache TO service_role;

CREATE TRIGGER set_charity_rating_cache_updated_at
  BEFORE UPDATE ON public.charity_rating_cache
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- geocode_cache — deduplicated geocoding results to avoid repeated API calls
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.geocode_cache (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cached_at    timestamptz NOT NULL DEFAULT now(),

  location_key text        NOT NULL UNIQUE,  -- normalized address string used as cache key
  result       jsonb,                         -- full geocoding response (lat, lng, formatted_address, …)
  error        text,                          -- populated when the geocoding request failed
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS idx_geocode_cache_key     ON public.geocode_cache (location_key);
CREATE INDEX IF NOT EXISTS idx_geocode_cache_expires ON public.geocode_cache (expires_at);

ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "geocode_cache: authenticated can read"
  ON public.geocode_cache FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "geocode_cache: service role full access"
  ON public.geocode_cache FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON public.geocode_cache TO authenticated;
GRANT ALL ON public.geocode_cache TO service_role;

-- ---------------------------------------------------------------------------
-- get_geocode_cache_stats() — stats RPC for admin/monitoring
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_geocode_cache_stats()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT jsonb_build_object(
    'total_entries',   COUNT(*),
    'valid_entries',   COUNT(*) FILTER (WHERE expires_at > now() AND error IS NULL),
    'expired_entries', COUNT(*) FILTER (WHERE expires_at <= now()),
    'error_entries',   COUNT(*) FILTER (WHERE error IS NOT NULL),
    'oldest_entry',    MIN(cached_at),
    'newest_entry',    MAX(cached_at)
  )
  FROM public.geocode_cache;
$$;

GRANT EXECUTE ON FUNCTION public.get_geocode_cache_stats() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- clean_expired_geocode_cache() — maintenance RPC, returns deleted count
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clean_expired_geocode_cache()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.geocode_cache
  WHERE expires_at <= now();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clean_expired_geocode_cache() TO service_role;
