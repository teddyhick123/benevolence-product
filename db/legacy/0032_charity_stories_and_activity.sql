-- Migration: Create charity impact stories and activity feed tables
-- Description: Tables for storing impact stories, testimonials, and charity activity/news
-- Date: 2025-12-21

-- Create charity_impact_stories table
CREATE TABLE IF NOT EXISTS charity_impact_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charity_id UUID NOT NULL REFERENCES charities(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  story_text TEXT NOT NULL,
  story_type TEXT,  -- "success_story", "testimonial", "program_update", "annual_report"

  -- Metrics
  beneficiaries_impacted INTEGER,
  outcome_metrics JSONB,  -- {metric_name: value, metric_name2: value2}

  -- Media
  image_url TEXT,
  video_url TEXT,

  -- Source
  source TEXT,  -- "charity_website", "news_article", "manual_entry", "form_990"
  source_url TEXT,
  published_date DATE,

  -- Metadata
  is_verified BOOLEAN DEFAULT false,  -- Has this been verified by charity or admin
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for impact stories
CREATE INDEX IF NOT EXISTS idx_impact_stories_charity ON charity_impact_stories(charity_id);
CREATE INDEX IF NOT EXISTS idx_impact_stories_published ON charity_impact_stories(published_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_impact_stories_type ON charity_impact_stories(story_type);
CREATE INDEX IF NOT EXISTS idx_impact_stories_verified ON charity_impact_stories(is_verified) WHERE is_verified = true;

-- Create charity_activity_feed table
CREATE TABLE IF NOT EXISTS charity_activity_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charity_id UUID NOT NULL REFERENCES charities(id) ON DELETE CASCADE,

  activity_type TEXT NOT NULL,  -- "news", "announcement", "award", "program_launch", "partnership", "milestone"
  title TEXT NOT NULL,
  description TEXT,

  -- Source
  source TEXT,  -- "charity_website", "news_outlet", "press_release", "social_media"
  source_url TEXT,
  published_date DATE,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for activity feed
CREATE INDEX IF NOT EXISTS idx_activity_feed_charity ON charity_activity_feed(charity_id);
CREATE INDEX IF NOT EXISTS idx_activity_feed_date ON charity_activity_feed(published_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_activity_feed_type ON charity_activity_feed(activity_type);

-- Composite index for recent activity by charity
CREATE INDEX IF NOT EXISTS idx_activity_feed_charity_date
  ON charity_activity_feed(charity_id, published_date DESC);

-- Row Level Security
ALTER TABLE charity_impact_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE charity_activity_feed ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read
CREATE POLICY "Authenticated users can view impact stories"
  ON charity_impact_stories
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view activity feed"
  ON charity_activity_feed
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Service role can manage
CREATE POLICY "Service role can manage impact stories"
  ON charity_impact_stories
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage activity feed"
  ON charity_activity_feed
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON charity_impact_stories TO authenticated;
GRANT SELECT ON charity_activity_feed TO authenticated;
GRANT ALL ON charity_impact_stories TO service_role;
GRANT ALL ON charity_activity_feed TO service_role;

-- Add helpful comments
COMMENT ON TABLE charity_impact_stories IS 'Impact stories, testimonials, and program updates from charities';
COMMENT ON TABLE charity_activity_feed IS 'News, announcements, and recent activity from charities';
COMMENT ON COLUMN charity_impact_stories.outcome_metrics IS 'JSONB object with measurable outcomes, e.g., {"students_educated": 500, "meals_served": 10000}';
COMMENT ON COLUMN charity_impact_stories.is_verified IS 'True if verified by charity representative or admin';
