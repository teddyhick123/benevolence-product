-- =============================================================================
-- 0032_fix_v_donor_summary.sql
-- Rebuild v_donor_summary with correct column aliases used by API routes.
-- Fixes: display_name, total_lifetime_giving, computed_tier, has_pending_acknowledgments
-- Depends on: 0014_donors.sql
-- =============================================================================

DROP VIEW IF EXISTS v_donor_summary;

CREATE OR REPLACE VIEW v_donor_summary AS
SELECT
  d.*,
  -- Display name used by UI and API list route
  CASE
    WHEN d.is_organization THEN COALESCE(d.organization_name, 'Unknown Organization')
    ELSE TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, ''))
  END AS display_name,
  -- Alias for lifetime_giving (what routes call "total_lifetime_giving")
  d.lifetime_giving AS total_lifetime_giving,
  -- Alias for tier (what routes call "computed_tier")
  d.tier AS computed_tier,
  -- Pending acknowledgments: contributions not yet acknowledged
  EXISTS (
    SELECT 1 FROM contributions_received cr
    WHERE cr.donor_id = d.id
      AND cr.acknowledgment_sent = false
      AND cr.is_pledge = false
  ) AS has_pending_acknowledgments
FROM donors d
WHERE d.deleted_at IS NULL;
