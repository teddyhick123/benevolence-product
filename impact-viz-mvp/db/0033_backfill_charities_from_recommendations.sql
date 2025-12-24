-- Migration: Backfill global charities database from existing portfolio recommendations
-- Description: Migrate existing portfolio_recommendations to global charities table and link them
-- Date: 2025-12-21

-- IMPORTANT: This script should be run AFTER migrations 0030, 0031, and 0032 are complete
-- It will create charity entries from existing recommendations and link them back

-- Step 1: Create charities from unique recommendations
-- This deduplicates by EIN and creates global charity entries
INSERT INTO charities (
  ein,
  name,
  website,
  sector,
  mission_statement,
  contact_email,
  contact_phone,
  data_source,
  is_active,
  created_at
)
SELECT DISTINCT ON (ein)
  ein,
  organization_name AS name,
  website,
  sector,
  description AS mission_statement,
  contact_info->>'email' AS contact_email,
  contact_info->>'phone' AS contact_phone,
  'backfill' AS data_source,
  true AS is_active,
  MIN(created_at) AS created_at
FROM portfolio_recommendations
WHERE ein IS NOT NULL
  AND ein != ''
  AND NOT EXISTS (
    -- Only insert if charity doesn't already exist in charities table
    SELECT 1 FROM charities WHERE charities.ein = portfolio_recommendations.ein
  )
GROUP BY
  ein,
  organization_name,
  website,
  sector,
  description,
  contact_info->>'email',
  contact_info->>'phone'
ORDER BY ein, MIN(created_at);

-- Step 2: Link existing portfolio_recommendations to global charities
-- Update charity_id foreign key for all recommendations that have a matching EIN
UPDATE portfolio_recommendations pr
SET charity_id = c.id
FROM charities c
WHERE pr.ein = c.ein
  AND pr.charity_id IS NULL;  -- Only update if not already linked

-- Step 3: Create helpful view for charities with recommendation counts
CREATE OR REPLACE VIEW charities_with_stats AS
SELECT
  c.*,
  COUNT(DISTINCT pr.portfolio_id) AS portfolio_count,
  COUNT(pr.id) AS total_recommendations,
  MAX(pr.recommended_at) AS last_recommended_at
FROM charities c
LEFT JOIN portfolio_recommendations pr ON c.id = pr.charity_id
GROUP BY c.id;

-- Grant permissions on view
GRANT SELECT ON charities_with_stats TO authenticated;
GRANT SELECT ON charities_with_stats TO service_role;

-- Add helpful comment
COMMENT ON VIEW charities_with_stats IS 'Charities with aggregated recommendation statistics across all portfolios';

-- Step 4: Create function to sync recommendation data to charity
-- This function updates the charity record when recommendation data changes
CREATE OR REPLACE FUNCTION sync_recommendation_to_charity() RETURNS TRIGGER AS $$
BEGIN
  -- If charity_id is set and basic info has changed, update the charity record
  IF NEW.charity_id IS NOT NULL THEN
    UPDATE charities
    SET
      name = COALESCE(NEW.organization_name, name),
      website = COALESCE(NEW.website, website),
      sector = COALESCE(NEW.sector, sector),
      mission_statement = COALESCE(NEW.description, mission_statement),
      contact_email = COALESCE(NEW.contact_info->>'email', contact_email),
      contact_phone = COALESCE(NEW.contact_info->>'phone', contact_phone),
      data_last_updated = NOW()
    WHERE id = NEW.charity_id
      AND data_source = 'backfill';  -- Only update backfilled charities, not ones with external data
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for syncing (optional - can be enabled if desired)
-- DROP TRIGGER IF EXISTS sync_recommendation_to_charity_trigger ON portfolio_recommendations;
-- CREATE TRIGGER sync_recommendation_to_charity_trigger
--   AFTER INSERT OR UPDATE OF organization_name, website, sector, description, contact_info
--   ON portfolio_recommendations
--   FOR EACH ROW
--   WHEN (NEW.charity_id IS NOT NULL)
--   EXECUTE FUNCTION sync_recommendation_to_charity();

-- Summary report of migration
-- Run this to see results:
/*
SELECT
  'Total charities created' AS metric,
  COUNT(*) AS value
FROM charities
WHERE data_source = 'backfill'
UNION ALL
SELECT
  'Total recommendations linked' AS metric,
  COUNT(*) AS value
FROM portfolio_recommendations
WHERE charity_id IS NOT NULL
UNION ALL
SELECT
  'Recommendations without charity_id (unlisted orgs)' AS metric,
  COUNT(*) AS value
FROM portfolio_recommendations
WHERE charity_id IS NULL;
*/

-- Notes for manual cleanup:
-- 1. Review charities with data_source = 'backfill' and enrich with external APIs
-- 2. Consider running ProPublica API to fetch additional details for backfilled charities
-- 3. Set up scheduled job to refresh ratings for popular charities
