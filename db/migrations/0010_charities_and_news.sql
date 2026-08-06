-- =============================================================================
-- 0010_charities_and_news.sql
-- Charity lookup database (2M+ nonprofits from public sources) and
-- news article cache for portfolio holdings.
-- This data is shared / public — minimal RLS, org-scoped annotations.
-- Depends on: 0001, 0002, 0006
-- =============================================================================

-- ---------------------------------------------------------------------------
-- charities — public nonprofit data (seeded from IRS BMF, Charity Navigator,
-- GiveWell, ProPublica, Candid)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS charities (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Identity
  ein             text UNIQUE NOT NULL,
  name            text NOT NULL,
  also_known_as   text,
  mission         text,
  website         text,
  phone           text,
  email           text,

  -- Classification
  ntee_code       text,           -- NTEE major group
  subsection_code text,           -- IRS 501(c) type
  foundation_code text,
  ruling_year     int,

  -- Address
  address_line1   text,
  city            text,
  state           text,
  zip             text,
  country         text DEFAULT 'US',
  latitude        double precision,
  longitude       double precision,

  -- Financials (from IRS BMF / Form 990)
  total_revenue   numeric(20,2),
  total_expenses  numeric(20,2),
  net_assets      numeric(20,2),
  fiscal_year     int,

  -- Ratings (from third-party APIs — updated periodically)
  charity_navigator_score  numeric(5,2),
  charity_navigator_rating int,
  give_well_top_charity    boolean DEFAULT false,
  candid_seal              text,   -- 'platinum', 'gold', 'silver', 'bronze'
  propublica_score         numeric(5,2),

  -- Status
  is_active       boolean DEFAULT true,
  deductibility_code text,

  -- Search
  search_vector   tsvector
);

CREATE INDEX idx_charities_ein         ON charities (ein);
CREATE INDEX idx_charities_name_trgm   ON charities USING GIN (name gin_trgm_ops);
CREATE INDEX idx_charities_search      ON charities USING GIN (search_vector);
CREATE INDEX idx_charities_ntee        ON charities (ntee_code) WHERE ntee_code IS NOT NULL;
CREATE INDEX idx_charities_state       ON charities (state) WHERE is_active;
CREATE INDEX idx_charities_location    ON charities (latitude, longitude) WHERE latitude IS NOT NULL;

-- Auto-update search vector
CREATE OR REPLACE FUNCTION update_charity_search_vector()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.also_known_as, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.mission, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW.ntee_code, '')), 'D');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_charities_search_vector
  BEFORE INSERT OR UPDATE ON charities
  FOR EACH ROW EXECUTE FUNCTION update_charity_search_vector();

CREATE TRIGGER trg_charities_updated_at
  BEFORE UPDATE ON charities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: charities are public read, service-role write
ALTER TABLE charities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "charities: public read"
  ON charities FOR SELECT USING (true);
CREATE POLICY "charities: no user write"
  ON charities FOR INSERT WITH CHECK (false);
CREATE POLICY "charities: no user update"
  ON charities FOR UPDATE USING (false);

-- ---------------------------------------------------------------------------
-- investees — canonical investee/grantee entity registry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS investees (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  ein          text UNIQUE,  -- nullable: non-US entities may not have EINs
  display_name text NOT NULL,
  sector       text,
  city         text,
  state        text,
  country      text NOT NULL DEFAULT 'US',
  website      text,
  charity_id   uuid REFERENCES charities(id) ON DELETE SET NULL,
  notes        text
);

CREATE INDEX idx_investees_ein ON investees (ein) WHERE ein IS NOT NULL;
CREATE INDEX idx_investees_display_name ON investees (lower(display_name));
CREATE INDEX idx_investees_charity_id ON investees (charity_id);
CREATE INDEX idx_investees_sector ON investees (sector) WHERE sector IS NOT NULL;

CREATE TRIGGER trg_investees_updated_at
  BEFORE UPDATE ON investees
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE investees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "investees: authenticated can read"
  ON investees FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "investees: service role full access"
  ON investees FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON investees TO authenticated;
GRANT ALL ON investees TO service_role;

-- Complete the canonical holding → investee relationship after investees exists
-- (holdings is created earlier in 0006).
ALTER TABLE holdings
  ADD CONSTRAINT holdings_investee_id_fkey
  FOREIGN KEY (investee_id) REFERENCES investees(id) ON DELETE SET NULL;

CREATE INDEX idx_holdings_investee_id
  ON holdings (investee_id)
  WHERE investee_id IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- charity_rating_cache — cached provider ratings for charities
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS charity_rating_cache (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  charity_id  uuid NOT NULL REFERENCES charities(id) ON DELETE CASCADE,
  provider    text NOT NULL
              CHECK (provider IN ('charity_navigator', 'candid', 'give_well', 'give_org', 'other')),
  rating_data jsonb NOT NULL DEFAULT '{}',
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),

  UNIQUE (charity_id, provider)
);

CREATE INDEX idx_charity_rating_cache_charity_id ON charity_rating_cache (charity_id);
CREATE INDEX idx_charity_rating_cache_expires ON charity_rating_cache (expires_at);

CREATE TRIGGER trg_charity_rating_cache_updated_at
  BEFORE UPDATE ON charity_rating_cache
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE charity_rating_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "charity_rating_cache: authenticated can read"
  ON charity_rating_cache FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "charity_rating_cache: service role full access"
  ON charity_rating_cache FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON charity_rating_cache TO authenticated;
GRANT ALL ON charity_rating_cache TO service_role;

-- ---------------------------------------------------------------------------
-- geocode_cache — deduplicated geocoding results to avoid repeated API calls
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS geocode_cache (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  cached_at    timestamptz NOT NULL DEFAULT now(),

  location_key text NOT NULL UNIQUE,  -- normalized address string used as cache key
  result       jsonb,
  error        text,
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX idx_geocode_cache_key ON geocode_cache (location_key);
CREATE INDEX idx_geocode_cache_expires ON geocode_cache (expires_at);

ALTER TABLE geocode_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "geocode_cache: authenticated can read"
  ON geocode_cache FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "geocode_cache: service role full access"
  ON geocode_cache FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON geocode_cache TO authenticated;
GRANT ALL ON geocode_cache TO service_role;

CREATE OR REPLACE FUNCTION get_geocode_cache_stats()
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
  FROM geocode_cache;
$$;

GRANT EXECUTE ON FUNCTION get_geocode_cache_stats() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION clean_expired_geocode_cache()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM geocode_cache
  WHERE expires_at <= now();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION clean_expired_geocode_cache() TO service_role;

-- ---------------------------------------------------------------------------
-- news_articles — news/insights cache for portfolio holdings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS news_articles (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Linkage: can be linked to a holding OR directly to a charity EIN
  holding_id      uuid REFERENCES holdings(id) ON DELETE CASCADE,
  charity_ein     text REFERENCES charities(ein) ON DELETE CASCADE,
  org_id          uuid REFERENCES organizations(id) ON DELETE CASCADE,  -- for org-specific articles

  -- Content
  title           text NOT NULL,
  summary         text,
  url             text,
  source          text,
  published_at    timestamptz,
  fetched_at      timestamptz NOT NULL DEFAULT now(),

  -- Sentiment / tags
  sentiment       text,           -- 'positive', 'negative', 'neutral'
  relevance_score numeric(4,3),
  tags            text[],
  is_pinned       boolean NOT NULL DEFAULT false,

  -- Expiry for cache management
  expires_at      timestamptz
);

CREATE INDEX idx_news_articles_holding_id   ON news_articles (holding_id, published_at DESC)   WHERE holding_id IS NOT NULL;
CREATE INDEX idx_news_articles_charity_ein  ON news_articles (charity_ein, published_at DESC)  WHERE charity_ein IS NOT NULL;
CREATE INDEX idx_news_articles_org_id       ON news_articles (org_id, published_at DESC)       WHERE org_id IS NOT NULL;

CREATE TRIGGER trg_news_articles_updated_at
  BEFORE UPDATE ON news_articles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE news_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "news_articles: portfolio members can view via holding"
  ON news_articles FOR SELECT
  USING (
    (holding_id IS NOT NULL AND can_view_portfolio((SELECT portfolio_id FROM holdings WHERE id = holding_id)))
    OR (holding_id IS NULL AND charity_ein IS NOT NULL)  -- public charity news
    OR (org_id IS NOT NULL AND can_view_org(org_id))
  );
CREATE POLICY "news_articles: service role / admins can manage"
  ON news_articles FOR ALL
  USING (
    (holding_id IS NULL AND org_id IS NULL)
    OR (org_id IS NOT NULL AND is_org_admin(org_id))
  )
  WITH CHECK (
    (holding_id IS NULL AND org_id IS NULL)
    OR (org_id IS NOT NULL AND is_org_admin(org_id))
  );

-- ---------------------------------------------------------------------------
-- events — investee-level news and milestone events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at   timestamptz NOT NULL DEFAULT now(),

  investee_id  uuid REFERENCES investees(id) ON DELETE CASCADE,
  org_id       uuid REFERENCES organizations(id) ON DELETE CASCADE,

  event_date   date NOT NULL,
  headline     text NOT NULL,
  source_link  text,
  severity     text NOT NULL DEFAULT 'normal'
               CHECK (severity IN ('low', 'normal', 'high', 'critical')),
  event_type   text CHECK (event_type IN (
                 'news', 'filing', 'leadership', 'financial',
                 'legal', 'milestone', 'other'
               )),
  summary      text
);

CREATE INDEX idx_events_investee_id ON events (investee_id);
CREATE INDEX idx_events_org_id ON events (org_id);
CREATE INDEX idx_events_event_date ON events (event_date DESC);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events: view if holds investee in accessible portfolio"
  ON events FOR SELECT TO authenticated
  USING (
    org_id IS NULL
    OR can_view_org(org_id)
    OR EXISTS (
      SELECT 1
      FROM holdings h
      WHERE h.investee_id = events.investee_id
        AND can_view_portfolio(h.portfolio_id)
    )
  );

CREATE POLICY "events: service role full access"
  ON events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON events TO authenticated;
GRANT ALL ON events TO service_role;
