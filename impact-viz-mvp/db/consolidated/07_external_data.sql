-- ============================================================================
-- EXTERNAL DATA MODULE
-- ============================================================================
-- Description: Third-party data integrations (Charity Navigator, Candid, etc.)
-- Tables: charities, charity_rating_cache, charity_activity_feed,
--         charity_impact_stories, news_articles, geocode_cache,
--         generated_financial_analyses
-- ============================================================================

-- ============================================================================
-- 1. CHARITIES TABLE (Global Charity Database)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.charities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ein TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  legal_name TEXT,
  website TEXT,

  -- Classification
  sector TEXT,
  ntee_code TEXT,
  impact_focus TEXT[],

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
  program_expense_ratio NUMERIC,

  -- Ratings (JSONB for flexibility)
  charity_navigator_rating JSONB,
  candid_rating JSONB,

  -- Impact Metrics
  impact_metrics JSONB,

  -- Contact
  contact_email TEXT,
  contact_phone TEXT,
  contact_name TEXT,

  -- Metadata
  irs_deductibility_status TEXT,
  irs_status_date DATE,
  last_form_990_date DATE,

  -- Data freshness
  data_source TEXT,
  data_last_updated TIMESTAMPTZ DEFAULT NOW(),
  ratings_last_updated TIMESTAMPTZ,

  -- Search optimization
  search_vector TSVECTOR,

  -- Soft delete
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_charities_ein ON public.charities(ein);
CREATE INDEX IF NOT EXISTS idx_charities_name ON public.charities(name);
CREATE INDEX IF NOT EXISTS idx_charities_sector ON public.charities(sector);
CREATE INDEX IF NOT EXISTS idx_charities_state ON public.charities(state);
CREATE INDEX IF NOT EXISTS idx_charities_search ON public.charities USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_charities_active ON public.charities(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_charities_sector_state ON public.charities(sector, state) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_charities_revenue ON public.charities(annual_revenue DESC NULLS LAST) WHERE is_active = true;

COMMENT ON TABLE public.charities IS 'Global database of charitable organizations with ratings and impact data';

-- Full-text search trigger
CREATE OR REPLACE FUNCTION public.charities_search_vector_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('pg_catalog.english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('pg_catalog.english', COALESCE(NEW.mission_statement, '')), 'B') ||
    setweight(to_tsvector('pg_catalog.english', COALESCE(NEW.description, '')), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS charities_search_vector_update ON public.charities;
CREATE TRIGGER charities_search_vector_update
  BEFORE INSERT OR UPDATE OF name, mission_statement, description
  ON public.charities
  FOR EACH ROW
  EXECUTE FUNCTION public.charities_search_vector_trigger();

-- Updated_at trigger
DROP TRIGGER IF EXISTS charities_updated_at_trigger ON public.charities;
CREATE TRIGGER charities_updated_at_trigger
  BEFORE UPDATE ON public.charities
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 2. CHARITY RATING CACHE TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.charity_rating_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charity_id UUID REFERENCES public.charities(id) ON DELETE CASCADE,
  ein TEXT NOT NULL,
  source TEXT NOT NULL,  -- charity_navigator, candid, guidestar
  rating_data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_valid BOOLEAN DEFAULT true,
  UNIQUE(ein, source)
);

CREATE INDEX IF NOT EXISTS idx_charity_rating_cache_ein ON public.charity_rating_cache(ein);
CREATE INDEX IF NOT EXISTS idx_charity_rating_cache_expires ON public.charity_rating_cache(expires_at) WHERE is_valid = true;

COMMENT ON TABLE public.charity_rating_cache IS 'Cached ratings from external providers';

-- Cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_expired_rating_cache()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.charity_rating_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. CHARITY ACTIVITY FEED TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.charity_activity_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charity_id UUID NOT NULL REFERENCES public.charities(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,  -- news, grant_received, milestone, financial_update
  title TEXT NOT NULL,
  summary TEXT,
  source_url TEXT,
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_charity_activity_charity ON public.charity_activity_feed(charity_id);
CREATE INDEX IF NOT EXISTS idx_charity_activity_type ON public.charity_activity_feed(activity_type);
CREATE INDEX IF NOT EXISTS idx_charity_activity_date ON public.charity_activity_feed(published_at DESC);

COMMENT ON TABLE public.charity_activity_feed IS 'Recent charity news and updates';

-- ============================================================================
-- 4. CHARITY IMPACT STORIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.charity_impact_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charity_id UUID NOT NULL REFERENCES public.charities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  story TEXT NOT NULL,
  beneficiaries_impacted INTEGER,
  location TEXT,
  story_date DATE,
  media_urls TEXT[],
  ai_generated BOOLEAN DEFAULT false,
  source TEXT,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_charity_stories_charity ON public.charity_impact_stories(charity_id);
CREATE INDEX IF NOT EXISTS idx_charity_stories_featured ON public.charity_impact_stories(is_featured) WHERE is_featured = true;

COMMENT ON TABLE public.charity_impact_stories IS 'Impact narratives from charities';

-- ============================================================================
-- 5. NEWS ARTICLES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.news_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT,
  source_name TEXT,
  source_url TEXT,
  author TEXT,
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),

  -- Relevance
  related_charity_ids UUID[],
  related_holding_ids UUID[],
  topics TEXT[],
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),

  -- Metadata
  image_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_articles_published ON public.news_articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_articles_source ON public.news_articles(source_name);

COMMENT ON TABLE public.news_articles IS 'Aggregated news relevant to philanthropy';

-- ============================================================================
-- 6. GEOCODE CACHE TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.geocode_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address_hash TEXT NOT NULL UNIQUE,  -- Hash of normalized address
  address_input TEXT NOT NULL,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  formatted_address TEXT,
  place_name TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  confidence NUMERIC,
  provider TEXT DEFAULT 'nominatim',
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'not_found', 'error', 'pending')),
  error_message TEXT,
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '90 days',
  hit_count INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_geocode_cache_hash ON public.geocode_cache(address_hash);
CREATE INDEX IF NOT EXISTS idx_geocode_cache_expires ON public.geocode_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_geocode_cache_status ON public.geocode_cache(status);

COMMENT ON TABLE public.geocode_cache IS 'Geocoding API cache to reduce API calls';

-- Mark geocode as pending
CREATE OR REPLACE FUNCTION public.mark_geocode_pending(p_address_hash TEXT, p_address_input TEXT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.geocode_cache (address_hash, address_input, status)
  VALUES (p_address_hash, p_address_input, 'pending')
  ON CONFLICT (address_hash) DO UPDATE SET
    status = 'pending',
    cached_at = NOW();
END;
$$ LANGUAGE SQL;

-- Clean expired cache
CREATE OR REPLACE FUNCTION public.clean_expired_geocode_cache()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.geocode_cache WHERE expires_at < NOW() AND status != 'pending';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Get cache stats
CREATE OR REPLACE FUNCTION public.get_geocode_cache_stats()
RETURNS TABLE (
  total_entries BIGINT,
  success_entries BIGINT,
  pending_entries BIGINT,
  error_entries BIGINT,
  avg_hit_count NUMERIC
) AS $$
  SELECT
    COUNT(*) as total_entries,
    COUNT(*) FILTER (WHERE status = 'success') as success_entries,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_entries,
    COUNT(*) FILTER (WHERE status = 'error') as error_entries,
    AVG(hit_count) as avg_hit_count
  FROM public.geocode_cache;
$$ LANGUAGE SQL STABLE;

-- ============================================================================
-- 7. GENERATED FINANCIAL ANALYSES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.generated_financial_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charity_id UUID NOT NULL REFERENCES public.charities(id) ON DELETE CASCADE,
  analysis_type TEXT NOT NULL,  -- efficiency, growth, sustainability
  summary TEXT NOT NULL,
  full_analysis TEXT,
  key_metrics JSONB DEFAULT '{}'::jsonb,
  recommendations JSONB DEFAULT '[]'::jsonb,
  ai_model TEXT,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_analyses_charity ON public.generated_financial_analyses(charity_id);
CREATE INDEX IF NOT EXISTS idx_financial_analyses_type ON public.generated_financial_analyses(analysis_type);

COMMENT ON TABLE public.generated_financial_analyses IS 'AI-generated financial analyses of charities';

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Charities with statistics
CREATE OR REPLACE VIEW public.charities_with_stats AS
SELECT
  c.*,
  (SELECT COUNT(*) FROM public.charity_activity_feed caf WHERE caf.charity_id = c.id) as activity_count,
  (SELECT COUNT(*) FROM public.charity_impact_stories cis WHERE cis.charity_id = c.id) as story_count,
  (SELECT rating_data FROM public.charity_rating_cache crc
   WHERE crc.charity_id = c.id AND crc.source = 'charity_navigator' AND crc.is_valid = true
   ORDER BY crc.fetched_at DESC LIMIT 1) as latest_cn_rating
FROM public.charities c
WHERE c.is_active = true;

COMMENT ON VIEW public.charities_with_stats IS 'Charities with activity and story counts';

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.charities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charity_rating_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charity_activity_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charity_impact_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_financial_analyses ENABLE ROW LEVEL SECURITY;

-- Charities - public read for authenticated users
DROP POLICY IF EXISTS "charities_read" ON public.charities;
CREATE POLICY "charities_read" ON public.charities
  FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "charities_service" ON public.charities;
CREATE POLICY "charities_service" ON public.charities
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Charity Rating Cache
DROP POLICY IF EXISTS "charity_rating_cache_read" ON public.charity_rating_cache;
CREATE POLICY "charity_rating_cache_read" ON public.charity_rating_cache
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "charity_rating_cache_service" ON public.charity_rating_cache;
CREATE POLICY "charity_rating_cache_service" ON public.charity_rating_cache
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Charity Activity Feed
DROP POLICY IF EXISTS "charity_activity_read" ON public.charity_activity_feed;
CREATE POLICY "charity_activity_read" ON public.charity_activity_feed
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "charity_activity_service" ON public.charity_activity_feed;
CREATE POLICY "charity_activity_service" ON public.charity_activity_feed
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Charity Impact Stories
DROP POLICY IF EXISTS "charity_stories_read" ON public.charity_impact_stories;
CREATE POLICY "charity_stories_read" ON public.charity_impact_stories
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "charity_stories_service" ON public.charity_impact_stories;
CREATE POLICY "charity_stories_service" ON public.charity_impact_stories
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- News Articles
DROP POLICY IF EXISTS "news_articles_read" ON public.news_articles;
CREATE POLICY "news_articles_read" ON public.news_articles
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "news_articles_service" ON public.news_articles;
CREATE POLICY "news_articles_service" ON public.news_articles
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Geocode Cache
DROP POLICY IF EXISTS "geocode_cache_read" ON public.geocode_cache;
CREATE POLICY "geocode_cache_read" ON public.geocode_cache
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "geocode_cache_service" ON public.geocode_cache;
CREATE POLICY "geocode_cache_service" ON public.geocode_cache
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Generated Financial Analyses
DROP POLICY IF EXISTS "financial_analyses_read" ON public.generated_financial_analyses;
CREATE POLICY "financial_analyses_read" ON public.generated_financial_analyses
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "financial_analyses_service" ON public.generated_financial_analyses;
CREATE POLICY "financial_analyses_service" ON public.generated_financial_analyses
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT SELECT ON public.charities TO authenticated;
GRANT SELECT ON public.charity_rating_cache TO authenticated;
GRANT SELECT ON public.charity_activity_feed TO authenticated;
GRANT SELECT ON public.charity_impact_stories TO authenticated;
GRANT SELECT ON public.news_articles TO authenticated;
GRANT SELECT ON public.geocode_cache TO authenticated;
GRANT SELECT ON public.generated_financial_analyses TO authenticated;

GRANT ALL ON public.charities TO service_role;
GRANT ALL ON public.charity_rating_cache TO service_role;
GRANT ALL ON public.charity_activity_feed TO service_role;
GRANT ALL ON public.charity_impact_stories TO service_role;
GRANT ALL ON public.news_articles TO service_role;
GRANT ALL ON public.geocode_cache TO service_role;
GRANT ALL ON public.generated_financial_analyses TO service_role;

-- Functions
GRANT EXECUTE ON FUNCTION public.cleanup_expired_rating_cache() TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_geocode_pending(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.clean_expired_geocode_cache() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_geocode_cache_stats() TO authenticated;

-- Views
GRANT SELECT ON public.charities_with_stats TO authenticated;
