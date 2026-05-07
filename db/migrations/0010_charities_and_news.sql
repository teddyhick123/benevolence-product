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
