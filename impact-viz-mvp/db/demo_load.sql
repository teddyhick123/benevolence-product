-- Benevolence Demo Data Loader
-- Run this after applying all migrations to load the three demo portfolios.
-- Safe to run multiple times (ON CONFLICT DO NOTHING on all inserts).
--
-- Usage:
--   psql $DATABASE_URL -f db/demo_load.sql
--
-- Or from the Supabase SQL editor:
--   \i db/demo_load.sql

\i db/demo_portfolios.sql

DO $$
BEGIN
  RAISE NOTICE '=========================================================';
  RAISE NOTICE 'Demo data load complete.';
  RAISE NOTICE '  Portfolios : Ashford Family Foundation';
  RAISE NOTICE '               Meridian Capital Philanthropy';
  RAISE NOTICE '               Brightwater Foundation';
  RAISE NOTICE '  Holdings   : 18 + 14 + 12 = 44 total';
  RAISE NOTICE '  Grants     : 4 + 3 + 4 = 11 grant_details records';
  RAISE NOTICE '  Metric facts: 80 quarterly records (Ashford, 2021-2025)';
  RAISE NOTICE '  PE cash flows: 24 holding_contributions (Meridian)';
  RAISE NOTICE '  Tax profiles : 3 (one per portfolio)';
  RAISE NOTICE '  Tax contribs : 14 + 32 + 8 = 54 total';
  RAISE NOTICE '  Import mapping: 1 (Brightwater Blackbaud RE NXT)';
  RAISE NOTICE '---------------------------------------------------------';
  RAISE NOTICE 'Companion CSV for import demo:';
  RAISE NOTICE '  db/demo_blackbaud_export.csv  (45 rows, intentional';
  RAISE NOTICE '  data quality issues for AI import walkthrough)';
  RAISE NOTICE '=========================================================';
END;
$$;
