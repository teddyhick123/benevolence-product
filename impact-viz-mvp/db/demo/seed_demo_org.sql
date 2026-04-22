-- =============================================================================
-- db/demo/seed_demo_org.sql
-- DEMO DATA ONLY — never run by the migration runner in production.
-- Creates a sample organization, portfolio, and holdings for local dev/QA.
--
-- Usage:
--   psql $DATABASE_URL -f db/demo/seed_demo_org.sql
-- Or via the provision script:
--   scripts/provision.sh --seed-demo
-- =============================================================================

DO $$
DECLARE
  v_org_id        uuid := uuid_generate_v4();
  v_portfolio_id  uuid := uuid_generate_v4();
  v_user_id       uuid;  -- first user in auth.users (dev only)
BEGIN

  -- Grab the first user in dev (skip if none exist)
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No users found — create a user first, then re-run this seed.';
    RETURN;
  END IF;

  -- ----------------------------------------------------
  -- Demo Organization: Thornwood Family Foundation
  -- ----------------------------------------------------
  INSERT INTO organizations (
    id, name, ein, org_type,
    modules,
    branding,
    city, state, country
  ) VALUES (
    v_org_id,
    'Thornwood Family Foundation',
    '12-3456789',
    'private_foundation',
    '{"portfolio":true,"tax":true,"compliance":true,"import":true,"reports":true,"ai_assistant":true}'::jsonb,
    '{"primary_color":"#1a3a4a","logo_url":null}'::jsonb,
    'San Francisco', 'CA', 'US'
  ) ON CONFLICT DO NOTHING;

  -- Add user as owner
  INSERT INTO organization_members (org_id, user_id, role, accepted_at)
  VALUES (v_org_id, v_user_id, 'owner', now())
  ON CONFLICT (org_id, user_id) DO NOTHING;

  -- ----------------------------------------------------
  -- Demo Portfolio
  -- ----------------------------------------------------
  INSERT INTO portfolios (id, org_id, owner_id, name, description)
  VALUES (
    v_portfolio_id,
    v_org_id,
    v_user_id,
    'Thornwood Impact Portfolio',
    'Primary philanthropic portfolio for the Thornwood Family Foundation'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO portfolio_members (portfolio_id, user_id, role)
  VALUES (v_portfolio_id, v_user_id, 'owner')
  ON CONFLICT DO NOTHING;

  -- ----------------------------------------------------
  -- Demo Holdings
  -- ----------------------------------------------------
  INSERT INTO holdings (
    portfolio_id, org_id, asset_type, status, name, ein,
    amount_invested, current_value, currency,
    investment_date, focus_area, impact_score
  ) VALUES
    (v_portfolio_id, v_org_id, 'foundation_grant', 'active',
     'Khan Academy', '26-1544963',
     500000, 500000, 'USD',
     '2023-01-15', ARRAY['education'], 92),
    (v_portfolio_id, v_org_id, 'foundation_grant', 'active',
     'GiveDirectly', '27-2661647',
     250000, 250000, 'USD',
     '2023-06-01', ARRAY['poverty_alleviation','economic_mobility'], 98),
    (v_portfolio_id, v_org_id, 'mission_related_investment', 'active',
     'Climate Tech Fund II', NULL,
     1000000, 1150000, 'USD',
     '2022-09-01', ARRAY['climate','clean_energy'], 78),
    (v_portfolio_id, v_org_id, 'equity', 'active',
     'Apple Inc.', NULL,
     500000, 621000, 'USD',
     '2021-01-10', NULL, NULL),
    (v_portfolio_id, v_org_id, 'donation', 'active',
     'Local Food Bank', NULL,
     10000, 10000, 'USD',
     '2024-12-01', ARRAY['hunger','community'], 85)
  ON CONFLICT DO NOTHING;

  -- Demo KPI definitions
  INSERT INTO kpi_definitions (org_id, name, slug, unit, aggregation, direction) VALUES
    (v_org_id, 'Students Served',     'students_served',   'students', 'sum', 'higher_is_better'),
    (v_org_id, 'Meals Distributed',   'meals_distributed', 'meals',    'sum', 'higher_is_better'),
    (v_org_id, 'CO2 Reduced (tons)',  'co2_reduced_tons',  'tons',     'sum', 'higher_is_better'),
    (v_org_id, 'Jobs Created',        'jobs_created',      'jobs',     'sum', 'higher_is_better')
  ON CONFLICT (org_id, slug) DO NOTHING;

  RAISE NOTICE 'Demo org provisioned: org_id=%, portfolio_id=%', v_org_id, v_portfolio_id;

END;
$$;
