-- Update Demo Data: Add Time Series Metrics
-- Purpose: Replace single-point KPI data with time series showing performance over time
-- Safe to run multiple times - will clean up and recreate metric facts
-- Date: 2024-12-26

DO $$
DECLARE
  v_portfolio_id UUID := 'ee0c5a4f-d5a3-4ae4-bac7-20f056e26dbd';
  h_equity_saas UUID;
  h_equity_cleantech UUID;
  h_debt_community UUID;
  h_mri_housing UUID;
  h_grant_foundation_1 UUID;
  h_grant_foundation_2 UUID;
  h_grant_daf UUID;
BEGIN
  RAISE NOTICE 'Updating demo metrics with time series data...';

  -- Find the holdings by name (more reliable than hardcoding IDs)
  SELECT id INTO h_equity_saas FROM public.holdings
  WHERE portfolio_id = v_portfolio_id AND name = 'ImpactData Analytics';

  SELECT id INTO h_equity_cleantech FROM public.holdings
  WHERE portfolio_id = v_portfolio_id AND name = 'SolarForward Inc';

  SELECT id INTO h_debt_community FROM public.holdings
  WHERE portfolio_id = v_portfolio_id AND name = 'Community Development Note - Habitat Finance';

  SELECT id INTO h_mri_housing FROM public.holdings
  WHERE portfolio_id = v_portfolio_id AND name = 'Urban Housing REIT';

  SELECT id INTO h_grant_foundation_1 FROM public.holdings
  WHERE portfolio_id = v_portfolio_id AND name = 'Climate Action Network - Operating Grant';

  SELECT id INTO h_grant_foundation_2 FROM public.holdings
  WHERE portfolio_id = v_portfolio_id AND name = 'Youth Education Initiative - STEM Program';

  SELECT id INTO h_grant_daf FROM public.holdings
  WHERE portfolio_id = v_portfolio_id AND name = 'Community Food Bank - Emergency Relief';

  -- Delete existing metric_facts for these holdings to avoid duplicates
  DELETE FROM public.metric_facts WHERE holding_id IN (
    h_equity_saas, h_equity_cleantech, h_debt_community, h_mri_housing,
    h_grant_foundation_1, h_grant_foundation_2, h_grant_daf
  );

  RAISE NOTICE 'Cleared existing metrics for holdings';

  -- ============================================================================
  -- ImpactData Analytics - SaaS Company (9 quarters of growth)
  -- ============================================================================
  IF h_equity_saas IS NOT NULL THEN
    INSERT INTO public.metric_facts (holding_id, metric_code, value, period_start, period_end) VALUES
      -- Q3 2022
      (h_equity_saas, 'BENEFICIARIES_REACHED', 45000, '2022-07-01', '2022-09-30'),
      (h_equity_saas, 'JOBS_CREATED', 18, '2022-07-01', '2022-09-30'),
      (h_equity_saas, 'REVENUE_USD', 850000, '2022-07-01', '2022-09-30'),
      -- Q4 2022
      (h_equity_saas, 'BENEFICIARIES_REACHED', 58000, '2022-10-01', '2022-12-31'),
      (h_equity_saas, 'JOBS_CREATED', 22, '2022-10-01', '2022-12-31'),
      (h_equity_saas, 'REVENUE_USD', 1050000, '2022-10-01', '2022-12-31'),
      -- Q1 2023
      (h_equity_saas, 'BENEFICIARIES_REACHED', 72000, '2023-01-01', '2023-03-31'),
      (h_equity_saas, 'JOBS_CREATED', 28, '2023-01-01', '2023-03-31'),
      (h_equity_saas, 'REVENUE_USD', 1280000, '2023-01-01', '2023-03-31'),
      -- Q2 2023
      (h_equity_saas, 'BENEFICIARIES_REACHED', 89000, '2023-04-01', '2023-06-30'),
      (h_equity_saas, 'JOBS_CREATED', 32, '2023-04-01', '2023-06-30'),
      (h_equity_saas, 'REVENUE_USD', 1580000, '2023-04-01', '2023-06-30'),
      -- Q3 2023
      (h_equity_saas, 'BENEFICIARIES_REACHED', 108000, '2023-07-01', '2023-09-30'),
      (h_equity_saas, 'JOBS_CREATED', 36, '2023-07-01', '2023-09-30'),
      (h_equity_saas, 'REVENUE_USD', 1920000, '2023-07-01', '2023-09-30'),
      -- Q4 2023
      (h_equity_saas, 'BENEFICIARIES_REACHED', 125000, '2023-10-01', '2023-12-31'),
      (h_equity_saas, 'JOBS_CREATED', 40, '2023-10-01', '2023-12-31'),
      (h_equity_saas, 'REVENUE_USD', 2250000, '2023-10-01', '2023-12-31'),
      -- Q1 2024
      (h_equity_saas, 'BENEFICIARIES_REACHED', 138000, '2024-01-01', '2024-03-31'),
      (h_equity_saas, 'JOBS_CREATED', 42, '2024-01-01', '2024-03-31'),
      (h_equity_saas, 'REVENUE_USD', 2550000, '2024-01-01', '2024-03-31'),
      -- Q2 2024
      (h_equity_saas, 'BENEFICIARIES_REACHED', 162000, '2024-04-01', '2024-06-30'),
      (h_equity_saas, 'JOBS_CREATED', 48, '2024-04-01', '2024-06-30'),
      (h_equity_saas, 'REVENUE_USD', 3050000, '2024-04-01', '2024-06-30'),
      -- Q3 2024
      (h_equity_saas, 'BENEFICIARIES_REACHED', 185000, '2024-07-01', '2024-09-30'),
      (h_equity_saas, 'JOBS_CREATED', 52, '2024-07-01', '2024-09-30'),
      (h_equity_saas, 'REVENUE_USD', 3420000, '2024-07-01', '2024-09-30');
    RAISE NOTICE '✓ Added time series for ImpactData Analytics';
  END IF;

  -- ============================================================================
  -- SolarForward - Cleantech (6 quarters of growth)
  -- ============================================================================
  IF h_equity_cleantech IS NOT NULL THEN
    INSERT INTO public.metric_facts (holding_id, metric_code, value, period_start, period_end) VALUES
      -- Q2 2023
      (h_equity_cleantech, 'BENEFICIARIES_REACHED', 2100, '2023-04-01', '2023-06-30'),
      (h_equity_cleantech, 'CO2_AVOIDED_TONS', 320, '2023-04-01', '2023-06-30'),
      (h_equity_cleantech, 'ENERGY_SAVINGS_KWH', 780000, '2023-04-01', '2023-06-30'),
      -- Q3 2023
      (h_equity_cleantech, 'BENEFICIARIES_REACHED', 3500, '2023-07-01', '2023-09-30'),
      (h_equity_cleantech, 'CO2_AVOIDED_TONS', 520, '2023-07-01', '2023-09-30'),
      (h_equity_cleantech, 'ENERGY_SAVINGS_KWH', 1250000, '2023-07-01', '2023-09-30'),
      -- Q4 2023
      (h_equity_cleantech, 'BENEFICIARIES_REACHED', 4850, '2023-10-01', '2023-12-31'),
      (h_equity_cleantech, 'CO2_AVOIDED_TONS', 730, '2023-10-01', '2023-12-31'),
      (h_equity_cleantech, 'ENERGY_SAVINGS_KWH', 1780000, '2023-10-01', '2023-12-31'),
      -- Q1 2024
      (h_equity_cleantech, 'BENEFICIARIES_REACHED', 6200, '2024-01-01', '2024-03-31'),
      (h_equity_cleantech, 'CO2_AVOIDED_TONS', 920, '2024-01-01', '2024-03-31'),
      (h_equity_cleantech, 'ENERGY_SAVINGS_KWH', 2250000, '2024-01-01', '2024-03-31'),
      -- Q2 2024
      (h_equity_cleantech, 'BENEFICIARIES_REACHED', 7900, '2024-04-01', '2024-06-30'),
      (h_equity_cleantech, 'CO2_AVOIDED_TONS', 1180, '2024-04-01', '2024-06-30'),
      (h_equity_cleantech, 'ENERGY_SAVINGS_KWH', 2850000, '2024-04-01', '2024-06-30'),
      -- Q3 2024
      (h_equity_cleantech, 'BENEFICIARIES_REACHED', 9800, '2024-07-01', '2024-09-30'),
      (h_equity_cleantech, 'CO2_AVOIDED_TONS', 1480, '2024-07-01', '2024-09-30'),
      (h_equity_cleantech, 'ENERGY_SAVINGS_KWH', 3620000, '2024-07-01', '2024-09-30');
    RAISE NOTICE '✓ Added time series for SolarForward';
  END IF;

  -- ============================================================================
  -- Community Development Note (4 periods)
  -- ============================================================================
  IF h_debt_community IS NOT NULL THEN
    INSERT INTO public.metric_facts (holding_id, metric_code, value, period_start, period_end) VALUES
      -- H1 2023
      (h_debt_community, 'HOUSING_UNITS_CREATED', 15, '2023-01-01', '2023-06-30'),
      (h_debt_community, 'BENEFICIARIES_REACHED', 58, '2023-01-01', '2023-06-30'),
      -- H2 2023
      (h_debt_community, 'HOUSING_UNITS_CREATED', 24, '2023-07-01', '2023-12-31'),
      (h_debt_community, 'BENEFICIARIES_REACHED', 95, '2023-07-01', '2023-12-31'),
      -- H1 2024
      (h_debt_community, 'HOUSING_UNITS_CREATED', 35, '2024-01-01', '2024-06-30'),
      (h_debt_community, 'BENEFICIARIES_REACHED', 138, '2024-01-01', '2024-06-30'),
      -- H2 2024
      (h_debt_community, 'HOUSING_UNITS_CREATED', 48, '2024-07-01', '2024-12-31'),
      (h_debt_community, 'BENEFICIARIES_REACHED', 189, '2024-07-01', '2024-12-31');
    RAISE NOTICE '✓ Added time series for Community Development Note';
  END IF;

  -- ============================================================================
  -- Urban Housing REIT (4 periods)
  -- ============================================================================
  IF h_mri_housing IS NOT NULL THEN
    INSERT INTO public.metric_facts (holding_id, metric_code, value, period_start, period_end) VALUES
      -- 2023 Annual
      (h_mri_housing, 'BENEFICIARIES_REACHED', 2400, '2023-01-01', '2023-12-31'),
      (h_mri_housing, 'HOUSING_UNITS_CREATED', 320, '2023-01-01', '2023-12-31'),
      -- Q1 2024
      (h_mri_housing, 'BENEFICIARIES_REACHED', 2850, '2024-01-01', '2024-03-31'),
      (h_mri_housing, 'HOUSING_UNITS_CREATED', 380, '2024-01-01', '2024-03-31'),
      -- Q2 2024
      (h_mri_housing, 'BENEFICIARIES_REACHED', 3100, '2024-04-01', '2024-06-30'),
      (h_mri_housing, 'HOUSING_UNITS_CREATED', 425, '2024-04-01', '2024-06-30'),
      -- Q3 2024
      (h_mri_housing, 'BENEFICIARIES_REACHED', 3450, '2024-07-01', '2024-09-30'),
      (h_mri_housing, 'HOUSING_UNITS_CREATED', 485, '2024-07-01', '2024-09-30');
    RAISE NOTICE '✓ Added time series for Urban Housing REIT';
  END IF;

  -- ============================================================================
  -- Climate Action Network Grant (4 periods)
  -- ============================================================================
  IF h_grant_foundation_1 IS NOT NULL THEN
    INSERT INTO public.metric_facts (holding_id, metric_code, value, period_start, period_end) VALUES
      -- H1 2023
      (h_grant_foundation_1, 'BENEFICIARIES_REACHED', 1200000, '2023-01-01', '2023-06-30'),
      (h_grant_foundation_1, 'POLICY_WINS', 1, '2023-01-01', '2023-06-30'),
      (h_grant_foundation_1, 'MEDIA_MENTIONS', 42, '2023-01-01', '2023-06-30'),
      -- H2 2023
      (h_grant_foundation_1, 'BENEFICIARIES_REACHED', 1850000, '2023-07-01', '2023-12-31'),
      (h_grant_foundation_1, 'POLICY_WINS', 2, '2023-07-01', '2023-12-31'),
      (h_grant_foundation_1, 'MEDIA_MENTIONS', 78, '2023-07-01', '2023-12-31'),
      -- H1 2024
      (h_grant_foundation_1, 'BENEFICIARIES_REACHED', 2350000, '2024-01-01', '2024-06-30'),
      (h_grant_foundation_1, 'POLICY_WINS', 4, '2024-01-01', '2024-06-30'),
      (h_grant_foundation_1, 'MEDIA_MENTIONS', 115, '2024-01-01', '2024-06-30'),
      -- H2 2024
      (h_grant_foundation_1, 'BENEFICIARIES_REACHED', 2980000, '2024-07-01', '2024-12-31'),
      (h_grant_foundation_1, 'POLICY_WINS', 5, '2024-07-01', '2024-12-31'),
      (h_grant_foundation_1, 'MEDIA_MENTIONS', 163, '2024-07-01', '2024-12-31');
    RAISE NOTICE '✓ Added time series for Climate Action Network';
  END IF;

  -- ============================================================================
  -- Youth Education Initiative (3 quarters)
  -- ============================================================================
  IF h_grant_foundation_2 IS NOT NULL THEN
    INSERT INTO public.metric_facts (holding_id, metric_code, value, period_start, period_end) VALUES
      -- Q1 2024
      (h_grant_foundation_2, 'BENEFICIARIES_REACHED', 180, '2024-01-01', '2024-03-31'),
      (h_grant_foundation_2, 'TEACHERS_TRAINED', 12, '2024-01-01', '2024-03-31'),
      (h_grant_foundation_2, 'CURRICULUM_MODULES_CREATED', 6, '2024-01-01', '2024-03-31'),
      -- Q2 2024
      (h_grant_foundation_2, 'BENEFICIARIES_REACHED', 425, '2024-04-01', '2024-06-30'),
      (h_grant_foundation_2, 'TEACHERS_TRAINED', 25, '2024-04-01', '2024-06-30'),
      (h_grant_foundation_2, 'CURRICULUM_MODULES_CREATED', 12, '2024-04-01', '2024-06-30'),
      -- Q3 2024
      (h_grant_foundation_2, 'BENEFICIARIES_REACHED', 720, '2024-07-01', '2024-09-30'),
      (h_grant_foundation_2, 'TEACHERS_TRAINED', 38, '2024-07-01', '2024-09-30'),
      (h_grant_foundation_2, 'CURRICULUM_MODULES_CREATED', 18, '2024-07-01', '2024-09-30');
    RAISE NOTICE '✓ Added time series for Youth Education Initiative';
  END IF;

  -- ============================================================================
  -- Community Food Bank (3 quarters)
  -- ============================================================================
  IF h_grant_daf IS NOT NULL THEN
    INSERT INTO public.metric_facts (holding_id, metric_code, value, period_start, period_end) VALUES
      -- Q2 2024
      (h_grant_daf, 'BENEFICIARIES_REACHED', 4200, '2024-04-01', '2024-06-30'),
      (h_grant_daf, 'MEALS_DISTRIBUTED', 82000, '2024-04-01', '2024-06-30'),
      -- Q3 2024
      (h_grant_daf, 'BENEFICIARIES_REACHED', 6800, '2024-07-01', '2024-09-30'),
      (h_grant_daf, 'MEALS_DISTRIBUTED', 135000, '2024-07-01', '2024-09-30'),
      -- Q4 2024
      (h_grant_daf, 'BENEFICIARIES_REACHED', 9500, '2024-10-01', '2024-12-31'),
      (h_grant_daf, 'MEALS_DISTRIBUTED', 188000, '2024-10-01', '2024-12-31');
    RAISE NOTICE '✓ Added time series for Community Food Bank';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '✅ Demo metrics updated successfully with time series data!';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '  📊 ImpactData Analytics: 9 quarters (Q3 2022 - Q3 2024)';
  RAISE NOTICE '  🌞 SolarForward: 6 quarters (Q2 2023 - Q3 2024)';
  RAISE NOTICE '  🏘️  Community Development Note: 4 periods';
  RAISE NOTICE '  🏢 Urban Housing REIT: 4 periods';
  RAISE NOTICE '  🌍 Climate Action Network: 4 periods';
  RAISE NOTICE '  🎓 Youth Education Initiative: 3 quarters';
  RAISE NOTICE '  🍽️  Community Food Bank: 3 quarters';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Refresh your dashboard to see time series charts';
  RAISE NOTICE '  2. Check individual holding pages for performance trends';
  RAISE NOTICE '  3. View KPI widgets showing growth over time';

END $$;
