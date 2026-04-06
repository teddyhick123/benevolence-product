-- ============================================================================
-- Benevolence Demo Data: Three Portfolio Showcase
-- ============================================================================
-- Portfolios:
--   · Ashford Family Foundation  (a1a1a1a1-…) — Environmental + Education, $42M
--   · Meridian Capital Philanthropy (b2b2b2b2-…) — Impact Investing, $75M
--   · Brightwater Foundation     (c3c3c3c3-…) — Youth/Workforce, $18M
--
-- Safe to run multiple times (ON CONFLICT DO NOTHING on all inserts).
-- Dependencies: all migrations through 0057 must be applied first.
-- ============================================================================

-- ============================================================================
-- SECTION 0: METRIC CODE PREREQUISITES
-- metric_facts.metric_code FK → metrics.code; codes must be UPPERCASE
-- ============================================================================

INSERT INTO public.metrics (code, name, unit, directionality, description)
VALUES
  ('CARBON_OFFSET_TONS',    'Carbon Offset (Metric Tons CO₂e)',  'tons CO₂e', 'higher_is_better', 'Quarterly carbon emissions offset attributable to portfolio clean-energy holdings'),
  ('STUDENTS_SERVED',       'Students Served (Quarterly)',        'students',  'higher_is_better', 'Unique students reached per quarter across education grantees'),
  ('PORTFOLIO_IRR',         'Portfolio Internal Rate of Return',  '%',         'higher_is_better', 'Trailing IRR across equity and PRI holdings'),
  ('GRANT_UTILIZATION_PCT', 'Grant Utilization Rate',             '%',         'higher_is_better', 'Percentage of allocated grant funds drawn down by grantee in the period')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- SECTION 1: PORTFOLIOS
-- ============================================================================

INSERT INTO public.portfolios (id, name, owner_family, base_currency)
VALUES
  ('a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1', 'Ashford Family Foundation',     'Ashford',    'USD'),
  ('b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', 'Meridian Capital Philanthropy', 'Meridian',   'USD'),
  ('c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3', 'Brightwater Foundation',        'Brightwater','USD')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SECTION 2: HOLDINGS — ASHFORD FAMILY FOUNDATION
-- Environmental conservation + education access focus  |  ~$42M endowment
-- 6 equities · 4 grants · 3 PRIs · 5 MRIs  =  18 holdings
-- ============================================================================

INSERT INTO public.holdings
  (id, portfolio_id, name, asset_type, asset_subtype, sector, country, funds_allocated, as_of, description)
VALUES
  -- ── Equities (6) ──────────────────────────────────────────────────────────
  ('a1100001-0000-0000-0000-000000000000', 'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
   'Sunrun Inc',             'equity_investment', 'Public Equity',
   'Clean Energy',           'United States', 1850000.00, '2025-03-31',
   'Residential solar and energy storage provider (NASDAQ: RUN)'),

  ('a1100002-0000-0000-0000-000000000000', 'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
   'First Solar Inc',        'equity_investment', 'Public Equity',
   'Clean Energy',           'United States', 2200000.00, '2025-03-31',
   'Utility-scale thin-film solar manufacturing (NASDAQ: FSLR)'),

  ('a1100003-0000-0000-0000-000000000000', 'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
   'ChargePoint Holdings',   'equity_investment', 'Public Equity',
   'Clean Transportation',   'United States',  950000.00, '2025-03-31',
   'EV charging network operator (NYSE: CHPT)'),

  ('a1100004-0000-0000-0000-000000000000', 'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
   'Rivian Automotive',      'equity_investment', 'Public Equity',
   'Clean Transportation',   'United States', 1200000.00, '2025-03-31',
   'Electric vehicle manufacturer (NASDAQ: RIVN)'),

  ('a1100005-0000-0000-0000-000000000000', 'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
   'Shoals Technologies',    'equity_investment', 'Public Equity',
   'Clean Energy',           'United States',  780000.00, '2025-03-31',
   'Solar power system components manufacturer (NASDAQ: SHLS)'),

  ('a1100006-0000-0000-0000-000000000000', 'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
   'SolarEdge Technologies', 'equity_investment', 'Public Equity',
   'Clean Energy',           'United States', 1650000.00, '2025-03-31',
   'Solar power optimization solutions (NASDAQ: SEDG)'),

  -- ── Foundation Grants (4) ─────────────────────────────────────────────────
  ('a1100007-0000-0000-0000-000000000000', 'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
   'The Nature Conservancy', 'foundation_grant', 'General Operating Grant',
   'Environment',            'United States', 3000000.00, '2025-03-31',
   'Global science-based conservation across land and water'),

  ('a1100008-0000-0000-0000-000000000000', 'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
   'Earthjustice',           'foundation_grant', 'Project Grant',
   'Environmental Justice',  'United States', 1200000.00, '2025-03-31',
   'Nonprofit environmental law organization litigating for a healthy environment'),

  ('a1100009-0000-0000-0000-000000000000', 'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
   'Khan Academy',           'foundation_grant', 'Capacity Building Grant',
   'Education',              'United States', 3000000.00, '2025-03-31',
   'Free world-class education for anyone, anywhere — K-12 through college'),

  ('a110000a-0000-0000-0000-000000000000', 'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
   'Room to Read',           'foundation_grant', 'Multi-Year Grant',
   'Education',              'United States', 1800000.00, '2025-03-31',
   'Girls education and literacy programs in low-income countries'),

  -- ── PRIs (3) ──────────────────────────────────────────────────────────────
  ('a110000b-0000-0000-0000-000000000000', 'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
   'Enterprise Community Partners', 'pri', 'Program-Related Investment',
   'Affordable Housing',     'United States', 3500000.00, '2025-03-31',
   'CDFI providing capital and expertise for affordable housing development'),

  ('a110000c-0000-0000-0000-000000000000', 'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
   'Low Income Investment Fund', 'pri', 'Program-Related Investment',
   'Community Development',  'United States', 2000000.00, '2025-03-31',
   'CDFI deploying capital into underserved communities across the US'),

  ('a110000d-0000-0000-0000-000000000000', 'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
   'National Housing Trust', 'pri', 'Program-Related Investment',
   'Affordable Housing',     'United States', 2500000.00, '2025-03-31',
   'Preserving and improving affordable rental housing nationwide'),

  -- ── MRIs / ESG Funds (5) ──────────────────────────────────────────────────
  ('a110000e-0000-0000-0000-000000000000', 'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
   'Calvert Research and Management', 'mri', 'ESG Equity Fund',
   'Responsible Investing',  'United States', 4500000.00, '2025-03-31',
   'Pioneer in ESG and responsible investing research and fund management'),

  ('a110000f-0000-0000-0000-000000000000', 'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
   'Parnassus Core Equity Fund', 'mri', 'ESG Equity Fund',
   'Responsible Investing',  'United States', 4100000.00, '2025-03-31',
   'Large-cap ESG equity fund combining fundamental analysis with impact screening'),

  ('a1100010-0000-0000-0000-000000000000', 'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
   'BlueHub Loan Fund',      'mri', 'CDFI Loan Fund',
   'Community Development',  'United States', 1500000.00, '2025-03-31',
   'Catalytic capital for affordable housing and community economic development'),

  ('a1100011-0000-0000-0000-000000000000', 'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
   'RSF Social Finance',     'mri', 'Social Investment Fund',
   'Social Entrepreneurship','United States', 2600000.00, '2025-03-31',
   'Transforming how we relate to money in service of social, ecological, and cultural life'),

  ('a1100012-0000-0000-0000-000000000000', 'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
   'Community Capital Management', 'mri', 'Fixed Income Fund',
   'Community Development',  'United States', 3400000.00, '2025-03-31',
   'Fixed income asset management focused on community development and affordable housing')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SECTION 3: HOLDINGS — MERIDIAN CAPITAL PHILANTHROPY
-- Impact investing + financial return  |  $75M family office
-- 3 PE · 4 public equities · 2 debt · 3 grants · 2 MRIs  =  14 holdings
-- ============================================================================

INSERT INTO public.holdings
  (id, portfolio_id, name, asset_type, asset_subtype, sector, country, funds_allocated, as_of, description)
VALUES
  -- ── Private Equity (3) ────────────────────────────────────────────────────
  ('b2100001-0000-0000-0000-000000000000', 'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
   'Breakthrough Energy Ventures', 'equity_investment', 'Private Equity / Venture',
   'Clean Technology',       'United States', 8000000.00, '2025-03-31',
   'Bill Gates-founded fund backing breakthrough clean energy technologies'),

  ('b2100002-0000-0000-0000-000000000000', 'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
   'Prelude Ventures Fund III', 'equity_investment', 'Private Equity / Venture',
   'Clean Technology',       'United States', 10000000.00, '2025-03-31',
   'Venture fund investing in sustainable innovation and clean technology'),

  ('b2100003-0000-0000-0000-000000000000', 'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
   'Generate Capital',       'equity_investment', 'Private Equity / Infrastructure',
   'Sustainable Infrastructure', 'United States', 12000000.00, '2025-03-31',
   'Infrastructure investor and operator accelerating the clean energy transition'),

  -- ── Public Equities (4) ───────────────────────────────────────────────────
  ('b2100004-0000-0000-0000-000000000000', 'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
   'Microsoft Corp',         'equity_investment', 'Public Equity',
   'Technology',             'United States', 6500000.00, '2025-03-31',
   'Technology company with strong ESG commitments and carbon-negative pledge'),

  ('b2100005-0000-0000-0000-000000000000', 'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
   'Apple Inc',              'equity_investment', 'Public Equity',
   'Technology',             'United States', 5500000.00, '2025-03-31',
   'Consumer technology company; 100% renewable energy operations since 2018'),

  ('b2100006-0000-0000-0000-000000000000', 'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
   'Salesforce Inc',         'equity_investment', 'Public Equity',
   'Technology',             'United States', 4200000.00, '2025-03-31',
   'CRM platform; stakeholder-capitalism model and 1-1-1 philanthropy pledge'),

  ('b2100007-0000-0000-0000-000000000000', 'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
   'Alphabet Inc',           'equity_investment', 'Public Equity',
   'Technology',             'United States', 5800000.00, '2025-03-31',
   'Google parent company; largest corporate purchaser of renewable energy'),

  -- ── Impact Debt (2) ───────────────────────────────────────────────────────
  ('b2100008-0000-0000-0000-000000000000', 'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
   'Calvert Impact Capital Note', 'debt_investment', 'Community Investment Note',
   'Community Development',  'United States', 3000000.00, '2025-03-31',
   'Fixed-income note funding CDFIs and community development organizations globally'),

  ('b2100009-0000-0000-0000-000000000000', 'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
   'RSF Social Finance Note', 'debt_investment', 'Social Enterprise Loan',
   'Social Entrepreneurship','United States', 2500000.00, '2025-03-31',
   'Direct lending to social enterprises in food, education, and ecological stewardship'),

  -- ── Foundation Grants (3) ─────────────────────────────────────────────────
  ('b210000a-0000-0000-0000-000000000000', 'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
   'Robin Hood Foundation',  'foundation_grant', 'General Operating Grant',
   'Poverty Alleviation',    'United States', 3500000.00, '2025-03-31',
   'New York City's largest poverty-fighting organization funding 200+ nonprofits'),

  ('b210000b-0000-0000-0000-000000000000', 'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
   'KIPP Foundation',        'foundation_grant', 'Capacity Building Grant',
   'Education',              'United States', 4000000.00, '2025-03-31',
   'Network of 280+ public charter schools serving 175,000+ students'),

  ('b210000c-0000-0000-0000-000000000000', 'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
   'Year Up',                'foundation_grant', 'Multi-Year Grant',
   'Workforce Development',  'United States', 3000000.00, '2025-03-31',
   'Closing the opportunity divide for young adults through skills training and employment'),

  -- ── MRIs (2) ──────────────────────────────────────────────────────────────
  ('b210000d-0000-0000-0000-000000000000', 'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
   'BlackRock Impact Systematic Equity', 'mri', 'ESG Equity Fund',
   'Responsible Investing',  'United States', 4000000.00, '2025-03-31',
   'Systematic equity strategy integrating ESG factors with quantitative analysis'),

  ('b210000e-0000-0000-0000-000000000000', 'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
   'Nuveen ESG Mid-Cap Growth', 'mri', 'ESG Equity Fund',
   'Responsible Investing',  'United States', 3000000.00, '2025-03-31',
   'Mid-cap growth equity fund with ESG screening and engagement overlay')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SECTION 4: HOLDINGS — BRIGHTWATER FOUNDATION
-- Youth development + workforce readiness  |  $18M
-- 4 grants · 3 PRIs · 3 equities · 2 debt/MRI  =  12 holdings
-- ============================================================================

INSERT INTO public.holdings
  (id, portfolio_id, name, asset_type, asset_subtype, sector, country, funds_allocated, as_of, description)
VALUES
  -- ── Foundation Grants (4) ─────────────────────────────────────────────────
  ('c3100001-0000-0000-0000-000000000000', 'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3',
   'Year Up United',         'foundation_grant', 'Multi-Year Grant',
   'Workforce Development',  'United States', 3000000.00, '2025-03-31',
   'Intensive workforce development program connecting young adults to tech careers'),

  ('c3100002-0000-0000-0000-000000000000', 'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3',
   'College Track',          'foundation_grant', 'General Operating Grant',
   'Education',              'United States', 2500000.00, '2025-03-31',
   'College completion program for students from underrepresented communities'),

  ('c3100003-0000-0000-0000-000000000000', 'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3',
   'Bottom Line',            'foundation_grant', 'Project Grant',
   'Education',              'United States', 2000000.00, '2025-03-31',
   'Guides first-generation college students from application through graduation'),

  ('c3100004-0000-0000-0000-000000000000', 'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3',
   'Per Scholas',            'foundation_grant', 'Capacity Building Grant',
   'Workforce Development',  'United States', 2000000.00, '2025-03-31',
   'Tech training and career development for adults from underrepresented communities'),

  -- ── PRIs (3) ──────────────────────────────────────────────────────────────
  ('c3100005-0000-0000-0000-000000000000', 'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3',
   'Community Reinvestment Fund', 'pri', 'Program-Related Investment',
   'Community Development',  'United States', 1500000.00, '2025-03-31',
   'CDFI connecting capital to underserved communities through secondary markets'),

  ('c3100006-0000-0000-0000-000000000000', 'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3',
   'Boston Community Capital', 'pri', 'Program-Related Investment',
   'Affordable Housing',     'United States', 1200000.00, '2025-03-31',
   'CDFI providing financing for affordable housing and economic opportunity in New England'),

  ('c3100007-0000-0000-0000-000000000000', 'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3',
   'Genesis LA',             'pri', 'Program-Related Investment',
   'Community Development',  'United States', 1000000.00, '2025-03-31',
   'Economic development lender catalyzing jobs and investment in underserved LA communities'),

  -- ── Public Equities (3) ───────────────────────────────────────────────────
  ('c3100008-0000-0000-0000-000000000000', 'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3',
   'JPMorgan Chase & Co',    'equity_investment', 'Public Equity',
   'Financial Services',     'United States', 1500000.00, '2025-03-31',
   'Global financial institution with $30B+ Racial Equity commitment'),

  ('c3100009-0000-0000-0000-000000000000', 'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3',
   'BlackRock Inc',          'equity_investment', 'Public Equity',
   'Financial Services',     'United States', 1200000.00, '2025-03-31',
   'World's largest asset manager; significant ESG integration and stewardship programs'),

  ('c310000a-0000-0000-0000-000000000000', 'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3',
   'Vanguard Total Stock Market', 'equity_investment', 'Public Equity / Index',
   'Diversified',            'United States', 1000000.00, '2025-03-31',
   'Broad market index fund providing diversified US equity exposure'),

  -- ── Debt / MRI (2) ────────────────────────────────────────────────────────
  ('c310000b-0000-0000-0000-000000000000', 'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3',
   'Calvert Bond Fund',      'mri', 'ESG Fixed Income Fund',
   'Responsible Investing',  'United States',  600000.00, '2025-03-31',
   'Investment-grade bond fund applying ESG screening across fixed income universe'),

  ('c310000c-0000-0000-0000-000000000000', 'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3',
   'TIAA Social Choice Bond', 'mri', 'ESG Fixed Income Fund',
   'Responsible Investing',  'United States',  500000.00, '2025-03-31',
   'Bond fund integrating ESG criteria with focus on community investing')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SECTION 5: GRANT DETAILS — ASHFORD
-- ============================================================================

INSERT INTO public.grant_details
  (id, holding_id, grant_period_start, grant_period_end, grant_type, renewal_eligible, renewal_date, reporting_frequency, next_report_due, deliverables)
VALUES
  ('a1300001-0000-0000-0000-000000000000', 'a1100007-0000-0000-0000-000000000000',
   '2022-01-01', '2024-12-31', 'general_operating', true, '2025-01-15', 'annual', '2025-06-30',
   'Annual impact report; science-based conservation metrics; carbon sequestration baseline update'),

  ('a1300002-0000-0000-0000-000000000000', 'a1100008-0000-0000-0000-000000000000',
   '2023-01-01', '2024-12-31', 'project', true, '2025-03-01', 'quarterly', '2025-06-30',
   'Quarterly litigation update; policy wins report; cases filed and outcomes tracker'),

  ('a1300003-0000-0000-0000-000000000000', 'a1100009-0000-0000-0000-000000000000',
   '2022-07-01', '2025-06-30', 'capacity_building', true, '2025-07-01', 'annual', '2025-09-30',
   'Platform usage metrics; students served; teacher adoption rates; content library expansion'),

  ('a1300004-0000-0000-0000-000000000000', 'a110000a-0000-0000-0000-000000000000',
   '2021-01-01', '2025-12-31', 'multi_year', true, '2026-01-01', 'annual', '2025-10-31',
   'Girls education enrollment; literacy assessment scores; program completion rates by country')
ON CONFLICT (holding_id) DO NOTHING;

-- ============================================================================
-- SECTION 6: GRANT DETAILS — MERIDIAN
-- ============================================================================

INSERT INTO public.grant_details
  (id, holding_id, grant_period_start, grant_period_end, grant_type, renewal_eligible, renewal_date, reporting_frequency, next_report_due, deliverables)
VALUES
  ('b2300001-0000-0000-0000-000000000000', 'b210000a-0000-0000-0000-000000000000',
   '2023-01-01', '2025-12-31', 'general_operating', true, '2026-01-01', 'annual', '2025-07-31',
   'Poverty metrics report; program outcomes; funds deployed to sub-grantees'),

  ('b2300002-0000-0000-0000-000000000000', 'b210000b-0000-0000-0000-000000000000',
   '2022-01-01', '2025-12-31', 'capacity_building', true, '2026-01-01', 'quarterly', '2025-06-30',
   'Student enrollment and retention; standardized test performance; teacher effectiveness data'),

  ('b2300003-0000-0000-0000-000000000000', 'b210000c-0000-0000-0000-000000000000',
   '2021-01-01', '2025-12-31', 'multi_year', true, '2026-01-01', 'annual', '2025-09-30',
   'Young adult placements; average starting salary; six-month job retention rate')
ON CONFLICT (holding_id) DO NOTHING;

-- ============================================================================
-- SECTION 7: GRANT DETAILS — BRIGHTWATER
-- ============================================================================

INSERT INTO public.grant_details
  (id, holding_id, grant_period_start, grant_period_end, grant_type, renewal_eligible, renewal_date, reporting_frequency, next_report_due, deliverables)
VALUES
  ('c3300001-0000-0000-0000-000000000000', 'c3100001-0000-0000-0000-000000000000',
   '2021-01-01', '2025-12-31', 'multi_year', true, '2026-01-01', 'quarterly', '2025-06-30',
   'Quarterly placement numbers; employer partners added; average wage at placement'),

  ('c3300002-0000-0000-0000-000000000000', 'c3100002-0000-0000-0000-000000000000',
   '2022-01-01', '2025-12-31', 'general_operating', true, '2026-01-01', 'annual', '2025-09-30',
   'Annual enrollment; 4-year college completion rate; first-generation student outcomes'),

  ('c3300003-0000-0000-0000-000000000000', 'c3100003-0000-0000-0000-000000000000',
   '2023-01-01', '2025-12-31', 'project', false, NULL, 'quarterly', '2025-06-30',
   'College enrollment; FAFSA completion; persistence rate through sophomore year'),

  ('c3300004-0000-0000-0000-000000000000', 'c3100004-0000-0000-0000-000000000000',
   '2022-07-01', '2025-06-30', 'capacity_building', true, '2025-07-01', 'annual', '2025-09-30',
   'Graduates placed in tech roles; partner employer count; average starting salary; diversity metrics')
ON CONFLICT (holding_id) DO NOTHING;

-- ============================================================================
-- SECTION 8: METRIC FACTS — ASHFORD (5 years × 4 quarters × 4 metrics = 80 rows)
-- Metrics anchored to representative holdings:
--   CARBON_OFFSET_TONS    → Sunrun Inc         (a1100001)
--   STUDENTS_SERVED       → Khan Academy       (a1100009)
--   PORTFOLIO_IRR         → SolarEdge Tech     (a1100006)
--   GRANT_UTILIZATION_PCT → Nature Conservancy (a1100007)
-- ============================================================================

INSERT INTO public.metric_facts
  (id, holding_id, metric_code, period_start, period_end, value, unit, source, verification_level)
VALUES
-- CARBON_OFFSET_TONS — Sunrun Inc — 2021-2025
('a1200001-0000-0000-0000-000000000000','a1100001-0000-0000-0000-000000000000','CARBON_OFFSET_TONS','2021-01-01','2021-03-31', 1182.4,'tons CO₂e','Fund Manager Report','verified'),
('a1200002-0000-0000-0000-000000000000','a1100001-0000-0000-0000-000000000000','CARBON_OFFSET_TONS','2021-04-01','2021-06-30', 1254.7,'tons CO₂e','Fund Manager Report','verified'),
('a1200003-0000-0000-0000-000000000000','a1100001-0000-0000-0000-000000000000','CARBON_OFFSET_TONS','2021-07-01','2021-09-30', 1318.2,'tons CO₂e','Fund Manager Report','verified'),
('a1200004-0000-0000-0000-000000000000','a1100001-0000-0000-0000-000000000000','CARBON_OFFSET_TONS','2021-10-01','2021-12-31', 1391.5,'tons CO₂e','Fund Manager Report','verified'),
('a1200005-0000-0000-0000-000000000000','a1100001-0000-0000-0000-000000000000','CARBON_OFFSET_TONS','2022-01-01','2022-03-31', 1458.8,'tons CO₂e','Fund Manager Report','verified'),
('a1200006-0000-0000-0000-000000000000','a1100001-0000-0000-0000-000000000000','CARBON_OFFSET_TONS','2022-04-01','2022-06-30', 1532.1,'tons CO₂e','Fund Manager Report','verified'),
('a1200007-0000-0000-0000-000000000000','a1100001-0000-0000-0000-000000000000','CARBON_OFFSET_TONS','2022-07-01','2022-09-30', 1614.9,'tons CO₂e','Fund Manager Report','verified'),
('a1200008-0000-0000-0000-000000000000','a1100001-0000-0000-0000-000000000000','CARBON_OFFSET_TONS','2022-10-01','2022-12-31', 1703.3,'tons CO₂e','Fund Manager Report','verified'),
('a1200009-0000-0000-0000-000000000000','a1100001-0000-0000-0000-000000000000','CARBON_OFFSET_TONS','2023-01-01','2023-03-31', 1781.6,'tons CO₂e','Third-Party Audit','third_party'),
('a120000a-0000-0000-0000-000000000000','a1100001-0000-0000-0000-000000000000','CARBON_OFFSET_TONS','2023-04-01','2023-06-30', 1842.0,'tons CO₂e','Third-Party Audit','third_party'),
('a120000b-0000-0000-0000-000000000000','a1100001-0000-0000-0000-000000000000','CARBON_OFFSET_TONS','2023-07-01','2023-09-30', 1918.4,'tons CO₂e','Third-Party Audit','third_party'),
('a120000c-0000-0000-0000-000000000000','a1100001-0000-0000-0000-000000000000','CARBON_OFFSET_TONS','2023-10-01','2023-12-31', 1976.8,'tons CO₂e','Third-Party Audit','third_party'),
('a120000d-0000-0000-0000-000000000000','a1100001-0000-0000-0000-000000000000','CARBON_OFFSET_TONS','2024-01-01','2024-03-31', 2043.2,'tons CO₂e','Third-Party Audit','third_party'),
('a120000e-0000-0000-0000-000000000000','a1100001-0000-0000-0000-000000000000','CARBON_OFFSET_TONS','2024-04-01','2024-06-30', 2108.7,'tons CO₂e','Third-Party Audit','third_party'),
('a120000f-0000-0000-0000-000000000000','a1100001-0000-0000-0000-000000000000','CARBON_OFFSET_TONS','2024-07-01','2024-09-30', 2179.4,'tons CO₂e','Third-Party Audit','third_party'),
('a1200010-0000-0000-0000-000000000000','a1100001-0000-0000-0000-000000000000','CARBON_OFFSET_TONS','2024-10-01','2024-12-31', 2251.9,'tons CO₂e','Third-Party Audit','third_party'),
('a1200011-0000-0000-0000-000000000000','a1100001-0000-0000-0000-000000000000','CARBON_OFFSET_TONS','2025-01-01','2025-03-31', 2318.5,'tons CO₂e','Fund Manager Report','preliminary'),
('a1200012-0000-0000-0000-000000000000','a1100001-0000-0000-0000-000000000000','CARBON_OFFSET_TONS','2025-04-01','2025-06-30', 2387.2,'tons CO₂e','Fund Manager Report','preliminary'),
('a1200013-0000-0000-0000-000000000000','a1100001-0000-0000-0000-000000000000','CARBON_OFFSET_TONS','2025-07-01','2025-09-30', 2441.6,'tons CO₂e','Fund Manager Report','preliminary'),
('a1200014-0000-0000-0000-000000000000','a1100001-0000-0000-0000-000000000000','CARBON_OFFSET_TONS','2025-10-01','2025-12-31', 2498.3,'tons CO₂e','Fund Manager Report','preliminary'),

-- STUDENTS_SERVED — Khan Academy — 2021-2025
('a1200015-0000-0000-0000-000000000000','a1100009-0000-0000-0000-000000000000','STUDENTS_SERVED','2021-01-01','2021-03-31', 4820,'students','Grantee Report','verified'),
('a1200016-0000-0000-0000-000000000000','a1100009-0000-0000-0000-000000000000','STUDENTS_SERVED','2021-04-01','2021-06-30', 5140,'students','Grantee Report','verified'),
('a1200017-0000-0000-0000-000000000000','a1100009-0000-0000-0000-000000000000','STUDENTS_SERVED','2021-07-01','2021-09-30', 5390,'students','Grantee Report','verified'),
('a1200018-0000-0000-0000-000000000000','a1100009-0000-0000-0000-000000000000','STUDENTS_SERVED','2021-10-01','2021-12-31', 5210,'students','Grantee Report','verified'),
('a1200019-0000-0000-0000-000000000000','a1100009-0000-0000-0000-000000000000','STUDENTS_SERVED','2022-01-01','2022-03-31', 5340,'students','Grantee Report','verified'),
('a120001a-0000-0000-0000-000000000000','a1100009-0000-0000-0000-000000000000','STUDENTS_SERVED','2022-04-01','2022-06-30', 5620,'students','Grantee Report','verified'),
('a120001b-0000-0000-0000-000000000000','a1100009-0000-0000-0000-000000000000','STUDENTS_SERVED','2022-07-01','2022-09-30', 5890,'students','Grantee Report','verified'),
('a120001c-0000-0000-0000-000000000000','a1100009-0000-0000-0000-000000000000','STUDENTS_SERVED','2022-10-01','2022-12-31', 5710,'students','Grantee Report','verified'),
('a120001d-0000-0000-0000-000000000000','a1100009-0000-0000-0000-000000000000','STUDENTS_SERVED','2023-01-01','2023-03-31', 5830,'students','Grantee Report','verified'),
('a120001e-0000-0000-0000-000000000000','a1100009-0000-0000-0000-000000000000','STUDENTS_SERVED','2023-04-01','2023-06-30', 6080,'students','Grantee Report','verified'),
('a120001f-0000-0000-0000-000000000000','a1100009-0000-0000-0000-000000000000','STUDENTS_SERVED','2023-07-01','2023-09-30', 6350,'students','Grantee Report','verified'),
('a1200020-0000-0000-0000-000000000000','a1100009-0000-0000-0000-000000000000','STUDENTS_SERVED','2023-10-01','2023-12-31', 6180,'students','Grantee Report','verified'),
('a1200021-0000-0000-0000-000000000000','a1100009-0000-0000-0000-000000000000','STUDENTS_SERVED','2024-01-01','2024-03-31', 6290,'students','Grantee Report','verified'),
('a1200022-0000-0000-0000-000000000000','a1100009-0000-0000-0000-000000000000','STUDENTS_SERVED','2024-04-01','2024-06-30', 6570,'students','Grantee Report','verified'),
('a1200023-0000-0000-0000-000000000000','a1100009-0000-0000-0000-000000000000','STUDENTS_SERVED','2024-07-01','2024-09-30', 6840,'students','Grantee Report','verified'),
('a1200024-0000-0000-0000-000000000000','a1100009-0000-0000-0000-000000000000','STUDENTS_SERVED','2024-10-01','2024-12-31', 6690,'students','Grantee Report','verified'),
('a1200025-0000-0000-0000-000000000000','a1100009-0000-0000-0000-000000000000','STUDENTS_SERVED','2025-01-01','2025-03-31', 6910,'students','Grantee Report','preliminary'),
('a1200026-0000-0000-0000-000000000000','a1100009-0000-0000-0000-000000000000','STUDENTS_SERVED','2025-04-01','2025-06-30', 7180,'students','Grantee Report','preliminary'),
('a1200027-0000-0000-0000-000000000000','a1100009-0000-0000-0000-000000000000','STUDENTS_SERVED','2025-07-01','2025-09-30', 7420,'students','Grantee Report','preliminary'),
('a1200028-0000-0000-0000-000000000000','a1100009-0000-0000-0000-000000000000','STUDENTS_SERVED','2025-10-01','2025-12-31', 7290,'students','Grantee Report','preliminary'),

-- PORTFOLIO_IRR — SolarEdge Technologies — 2021-2025
('a1200029-0000-0000-0000-000000000000','a1100006-0000-0000-0000-000000000000','PORTFOLIO_IRR','2021-01-01','2021-03-31',  8.24,'%','Internal Calculation','verified'),
('a120002a-0000-0000-0000-000000000000','a1100006-0000-0000-0000-000000000000','PORTFOLIO_IRR','2021-04-01','2021-06-30',  7.81,'%','Internal Calculation','verified'),
('a120002b-0000-0000-0000-000000000000','a1100006-0000-0000-0000-000000000000','PORTFOLIO_IRR','2021-07-01','2021-09-30',  9.12,'%','Internal Calculation','verified'),
('a120002c-0000-0000-0000-000000000000','a1100006-0000-0000-0000-000000000000','PORTFOLIO_IRR','2021-10-01','2021-12-31', 10.35,'%','Internal Calculation','verified'),
('a120002d-0000-0000-0000-000000000000','a1100006-0000-0000-0000-000000000000','PORTFOLIO_IRR','2022-01-01','2022-03-31',  6.48,'%','Internal Calculation','verified'),
('a120002e-0000-0000-0000-000000000000','a1100006-0000-0000-0000-000000000000','PORTFOLIO_IRR','2022-04-01','2022-06-30',  5.83,'%','Internal Calculation','verified'),
('a120002f-0000-0000-0000-000000000000','a1100006-0000-0000-0000-000000000000','PORTFOLIO_IRR','2022-07-01','2022-09-30',  7.21,'%','Internal Calculation','verified'),
('a1200030-0000-0000-0000-000000000000','a1100006-0000-0000-0000-000000000000','PORTFOLIO_IRR','2022-10-01','2022-12-31',  8.14,'%','Internal Calculation','verified'),
('a1200031-0000-0000-0000-000000000000','a1100006-0000-0000-0000-000000000000','PORTFOLIO_IRR','2023-01-01','2023-03-31',  9.33,'%','Internal Calculation','verified'),
('a1200032-0000-0000-0000-000000000000','a1100006-0000-0000-0000-000000000000','PORTFOLIO_IRR','2023-04-01','2023-06-30', 10.17,'%','Internal Calculation','verified'),
('a1200033-0000-0000-0000-000000000000','a1100006-0000-0000-0000-000000000000','PORTFOLIO_IRR','2023-07-01','2023-09-30', 11.24,'%','Internal Calculation','verified'),
('a1200034-0000-0000-0000-000000000000','a1100006-0000-0000-0000-000000000000','PORTFOLIO_IRR','2023-10-01','2023-12-31', 10.88,'%','Internal Calculation','verified'),
('a1200035-0000-0000-0000-000000000000','a1100006-0000-0000-0000-000000000000','PORTFOLIO_IRR','2024-01-01','2024-03-31', 11.52,'%','Internal Calculation','verified'),
('a1200036-0000-0000-0000-000000000000','a1100006-0000-0000-0000-000000000000','PORTFOLIO_IRR','2024-04-01','2024-06-30', 12.09,'%','Internal Calculation','verified'),
('a1200037-0000-0000-0000-000000000000','a1100006-0000-0000-0000-000000000000','PORTFOLIO_IRR','2024-07-01','2024-09-30', 11.78,'%','Internal Calculation','verified'),
('a1200038-0000-0000-0000-000000000000','a1100006-0000-0000-0000-000000000000','PORTFOLIO_IRR','2024-10-01','2024-12-31', 12.53,'%','Internal Calculation','verified'),
('a1200039-0000-0000-0000-000000000000','a1100006-0000-0000-0000-000000000000','PORTFOLIO_IRR','2025-01-01','2025-03-31', 13.21,'%','Internal Calculation','preliminary'),
('a120003a-0000-0000-0000-000000000000','a1100006-0000-0000-0000-000000000000','PORTFOLIO_IRR','2025-04-01','2025-06-30', 12.84,'%','Internal Calculation','preliminary'),
('a120003b-0000-0000-0000-000000000000','a1100006-0000-0000-0000-000000000000','PORTFOLIO_IRR','2025-07-01','2025-09-30', 13.47,'%','Internal Calculation','preliminary'),
('a120003c-0000-0000-0000-000000000000','a1100006-0000-0000-0000-000000000000','PORTFOLIO_IRR','2025-10-01','2025-12-31', 14.12,'%','Internal Calculation','preliminary'),

-- GRANT_UTILIZATION_PCT — The Nature Conservancy — 2021-2025
('a120003d-0000-0000-0000-000000000000','a1100007-0000-0000-0000-000000000000','GRANT_UTILIZATION_PCT','2021-01-01','2021-03-31', 82.1,'%','Grantee Report','verified'),
('a120003e-0000-0000-0000-000000000000','a1100007-0000-0000-0000-000000000000','GRANT_UTILIZATION_PCT','2021-04-01','2021-06-30', 87.4,'%','Grantee Report','verified'),
('a120003f-0000-0000-0000-000000000000','a1100007-0000-0000-0000-000000000000','GRANT_UTILIZATION_PCT','2021-07-01','2021-09-30', 91.2,'%','Grantee Report','verified'),
('a1200040-0000-0000-0000-000000000000','a1100007-0000-0000-0000-000000000000','GRANT_UTILIZATION_PCT','2021-10-01','2021-12-31', 88.6,'%','Grantee Report','verified'),
('a1200041-0000-0000-0000-000000000000','a1100007-0000-0000-0000-000000000000','GRANT_UTILIZATION_PCT','2022-01-01','2022-03-31', 89.3,'%','Grantee Report','verified'),
('a1200042-0000-0000-0000-000000000000','a1100007-0000-0000-0000-000000000000','GRANT_UTILIZATION_PCT','2022-04-01','2022-06-30', 93.1,'%','Grantee Report','verified'),
('a1200043-0000-0000-0000-000000000000','a1100007-0000-0000-0000-000000000000','GRANT_UTILIZATION_PCT','2022-07-01','2022-09-30', 95.4,'%','Grantee Report','verified'),
('a1200044-0000-0000-0000-000000000000','a1100007-0000-0000-0000-000000000000','GRANT_UTILIZATION_PCT','2022-10-01','2022-12-31', 91.7,'%','Grantee Report','verified'),
('a1200045-0000-0000-0000-000000000000','a1100007-0000-0000-0000-000000000000','GRANT_UTILIZATION_PCT','2023-01-01','2023-03-31', 92.8,'%','Grantee Report','verified'),
('a1200046-0000-0000-0000-000000000000','a1100007-0000-0000-0000-000000000000','GRANT_UTILIZATION_PCT','2023-04-01','2023-06-30', 94.5,'%','Grantee Report','verified'),
('a1200047-0000-0000-0000-000000000000','a1100007-0000-0000-0000-000000000000','GRANT_UTILIZATION_PCT','2023-07-01','2023-09-30', 96.2,'%','Grantee Report','verified'),
('a1200048-0000-0000-0000-000000000000','a1100007-0000-0000-0000-000000000000','GRANT_UTILIZATION_PCT','2023-10-01','2023-12-31', 93.4,'%','Grantee Report','verified'),
('a1200049-0000-0000-0000-000000000000','a1100007-0000-0000-0000-000000000000','GRANT_UTILIZATION_PCT','2024-01-01','2024-03-31', 94.1,'%','Grantee Report','verified'),
('a120004a-0000-0000-0000-000000000000','a1100007-0000-0000-0000-000000000000','GRANT_UTILIZATION_PCT','2024-04-01','2024-06-30', 96.7,'%','Grantee Report','verified'),
('a120004b-0000-0000-0000-000000000000','a1100007-0000-0000-0000-000000000000','GRANT_UTILIZATION_PCT','2024-07-01','2024-09-30', 97.3,'%','Grantee Report','verified'),
('a120004c-0000-0000-0000-000000000000','a1100007-0000-0000-0000-000000000000','GRANT_UTILIZATION_PCT','2024-10-01','2024-12-31', 95.8,'%','Grantee Report','verified'),
('a120004d-0000-0000-0000-000000000000','a1100007-0000-0000-0000-000000000000','GRANT_UTILIZATION_PCT','2025-01-01','2025-03-31', 95.2,'%','Grantee Report','preliminary'),
('a120004e-0000-0000-0000-000000000000','a1100007-0000-0000-0000-000000000000','GRANT_UTILIZATION_PCT','2025-04-01','2025-06-30', 97.1,'%','Grantee Report','preliminary'),
('a120004f-0000-0000-0000-000000000000','a1100007-0000-0000-0000-000000000000','GRANT_UTILIZATION_PCT','2025-07-01','2025-09-30', 98.4,'%','Grantee Report','preliminary'),
('a1200050-0000-0000-0000-000000000000','a1100007-0000-0000-0000-000000000000','GRANT_UTILIZATION_PCT','2025-10-01','2025-12-31', 96.5,'%','Grantee Report','preliminary')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SECTION 9: HOLDING CONTRIBUTIONS — MERIDIAN (PE capital calls + distributions)
-- 5 holdings × multi-transaction history spanning 2019-2025
-- Negative amounts = capital calls/purchases; positive = distributions/dividends
-- ============================================================================

INSERT INTO public.holding_contributions
  (id, portfolio_id, holding_id, amount, contributed_at, memo, source)
VALUES
  -- ── Breakthrough Energy Ventures (5 transactions) ─────────────────────────
  ('b2600001-0000-0000-0000-000000000000','b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2','b2100001-0000-0000-0000-000000000000',
   -2000000.00, '2020-03-15 00:00:00+00', 'Initial capital commitment — Tranche 1', 'Wire Transfer'),
  ('b2600002-0000-0000-0000-000000000000','b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2','b2100001-0000-0000-0000-000000000000',
   -500000.00,  '2021-06-30 00:00:00+00', 'Capital Call #1 — portfolio company follow-on', 'Wire Transfer'),
  ('b2600003-0000-0000-0000-000000000000','b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2','b2100001-0000-0000-0000-000000000000',
   -750000.00,  '2022-09-15 00:00:00+00', 'Capital Call #2 — new portfolio company investment', 'Wire Transfer'),
  ('b2600004-0000-0000-0000-000000000000','b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2','b2100001-0000-0000-0000-000000000000',
   -250000.00,  '2023-12-01 00:00:00+00', 'Capital Call #3 — bridge financing', 'Wire Transfer'),
  ('b2600005-0000-0000-0000-000000000000','b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2','b2100001-0000-0000-0000-000000000000',
    300000.00,  '2025-01-15 00:00:00+00', 'Distribution — partial exit from portfolio company', 'Wire Transfer'),

  -- ── Prelude Ventures Fund III (6 transactions) ────────────────────────────
  ('b2600006-0000-0000-0000-000000000000','b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2','b2100002-0000-0000-0000-000000000000',
   -3000000.00, '2019-11-01 00:00:00+00', 'Initial capital commitment — Fund III close', 'Wire Transfer'),
  ('b2600007-0000-0000-0000-000000000000','b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2','b2100002-0000-0000-0000-000000000000',
   -600000.00,  '2020-08-15 00:00:00+00', 'Capital Call #1', 'Wire Transfer'),
  ('b2600008-0000-0000-0000-000000000000','b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2','b2100002-0000-0000-0000-000000000000',
   -900000.00,  '2021-04-30 00:00:00+00', 'Capital Call #2', 'Wire Transfer'),
  ('b2600009-0000-0000-0000-000000000000','b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2','b2100002-0000-0000-0000-000000000000',
   -300000.00,  '2022-10-15 00:00:00+00', 'Capital Call #3 — late-stage follow-on', 'Wire Transfer'),
  ('b260000a-0000-0000-0000-000000000000','b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2','b2100002-0000-0000-0000-000000000000',
    450000.00,  '2023-06-30 00:00:00+00', 'Distribution #1 — IPO proceeds', 'Wire Transfer'),
  ('b260000b-0000-0000-0000-000000000000','b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2','b2100002-0000-0000-0000-000000000000',
    800000.00,  '2024-12-15 00:00:00+00', 'Distribution #2 — strategic acquisition exit', 'Wire Transfer'),

  -- ── Generate Capital (5 transactions) ─────────────────────────────────────
  ('b260000c-0000-0000-0000-000000000000','b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2','b2100003-0000-0000-0000-000000000000',
   -5000000.00, '2021-02-28 00:00:00+00', 'Initial commitment — infrastructure equity', 'Wire Transfer'),
  ('b260000d-0000-0000-0000-000000000000','b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2','b2100003-0000-0000-0000-000000000000',
   -1000000.00, '2021-12-15 00:00:00+00', 'Capital Call #1 — solar project development', 'Wire Transfer'),
  ('b260000e-0000-0000-0000-000000000000','b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2','b2100003-0000-0000-0000-000000000000',
   -1500000.00, '2022-06-30 00:00:00+00', 'Capital Call #2 — battery storage expansion', 'Wire Transfer'),
  ('b260000f-0000-0000-0000-000000000000','b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2','b2100003-0000-0000-0000-000000000000',
   -500000.00,  '2023-09-30 00:00:00+00', 'Capital Call #3 — grid services pilot', 'Wire Transfer'),
  ('b2600010-0000-0000-0000-000000000000','b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2','b2100003-0000-0000-0000-000000000000',
   1200000.00,  '2024-12-31 00:00:00+00', 'Distribution — operating cash flow year 3', 'Wire Transfer'),

  -- ── Microsoft Corp (4 transactions) ───────────────────────────────────────
  ('b2600011-0000-0000-0000-000000000000','b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2','b2100004-0000-0000-0000-000000000000',
   -2500000.00, '2020-01-15 00:00:00+00', 'Initial position — 12,500 shares @ $200', 'Brokerage'),
  ('b2600012-0000-0000-0000-000000000000','b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2','b2100004-0000-0000-0000-000000000000',
   -500000.00,  '2021-03-10 00:00:00+00', 'Additional purchase — 1,700 shares @ $294', 'Brokerage'),
  ('b2600013-0000-0000-0000-000000000000','b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2','b2100004-0000-0000-0000-000000000000',
   -750000.00,  '2022-01-20 00:00:00+00', 'Additional purchase — 2,500 shares @ $300', 'Brokerage'),
  ('b2600014-0000-0000-0000-000000000000','b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2','b2100004-0000-0000-0000-000000000000',
    200000.00,  '2024-06-15 00:00:00+00', 'Dividend received Q2 2024', 'Brokerage'),

  -- ── Apple Inc (4 transactions) ────────────────────────────────────────────
  ('b2600015-0000-0000-0000-000000000000','b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2','b2100005-0000-0000-0000-000000000000',
   -1800000.00, '2020-02-20 00:00:00+00', 'Initial position — 12,000 shares @ $150', 'Brokerage'),
  ('b2600016-0000-0000-0000-000000000000','b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2','b2100005-0000-0000-0000-000000000000',
   -400000.00,  '2021-06-15 00:00:00+00', 'Additional purchase — 3,050 shares @ $131', 'Brokerage'),
  ('b2600017-0000-0000-0000-000000000000','b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2','b2100005-0000-0000-0000-000000000000',
    150000.00,  '2023-09-30 00:00:00+00', 'Dividend received FY2023', 'Brokerage'),
  ('b2600018-0000-0000-0000-000000000000','b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2','b2100005-0000-0000-0000-000000000000',
    200000.00,  '2024-09-30 00:00:00+00', 'Dividend received FY2024', 'Brokerage')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SECTION 10: TAX PROFILES
-- ============================================================================

INSERT INTO public.tax_profiles
  (id, portfolio_id, tax_year, filing_status, estimated_agi, carryforward_from_prior)
VALUES
  ('a1400001-0000-0000-0000-000000000000',
   'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
   2024, 'married_joint', 1200000.00, 45000.00),

  ('b2400001-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
   2025, 'married_joint', 1850000.00, 62000.00),

  ('c3400001-0000-0000-0000-000000000000',
   'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3',
   2025, 'single', 450000.00, 0.00)
ON CONFLICT (portfolio_id, tax_year) DO NOTHING;

-- ============================================================================
-- SECTION 11: TAX CONTRIBUTIONS — ASHFORD (14 contributions, total $280,000)
-- 2 QCDs ($20,000 each from IRA); all 2024 tax year
-- ============================================================================

INSERT INTO public.tax_contributions
  (id, portfolio_id, holding_id, tax_year, contribution_date,
   recipient_name, recipient_ein, recipient_type,
   contribution_type, amount_usd, deductible_amount, agi_limit_category,
   acknowledgment_received, acknowledgment_date, is_qualified_organization, notes)
VALUES
  ('a1500001-0000-0000-0000-000000000000',
   'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
   'a1100007-0000-0000-0000-000000000000',
   2024, '2024-02-15',
   'The Nature Conservancy', '53-0242652', '501c3_public',
   'cash', 50000.00, 50000.00, '60_cash',
   true, '2024-02-20', true, NULL),

  ('a1500002-0000-0000-0000-000000000000',
   'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
   'a1100009-0000-0000-0000-000000000000',
   2024, '2024-03-10',
   'Khan Academy', '26-1544963', '501c3_public',
   'wire', 25000.00, 25000.00, '60_cash',
   true, '2024-03-12', true, NULL),

  ('a1500003-0000-0000-0000-000000000000',
   'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
   'a1100008-0000-0000-0000-000000000000',
   2024, '2024-04-05',
   'Earthjustice', '94-1485501', '501c3_public',
   'check', 15000.00, 15000.00, '60_cash',
   true, '2024-04-10', true, NULL),

  -- QCD #1 from IRA → Room to Read
  ('a1500004-0000-0000-0000-000000000000',
   'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
   'a110000a-0000-0000-0000-000000000000',
   2024, '2024-05-20',
   'Room to Read', '91-2003533', '501c3_public',
   'wire', 20000.00, 20000.00, '60_cash',
   true, '2024-05-22', true, 'Qualified Charitable Distribution from IRA — excluded from AGI'),

  -- QCD #2 from IRA → The Nature Conservancy
  ('a1500005-0000-0000-0000-000000000000',
   'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
   'a1100007-0000-0000-0000-000000000000',
   2024, '2024-05-20',
   'The Nature Conservancy', '53-0242652', '501c3_public',
   'wire', 20000.00, 20000.00, '60_cash',
   true, '2024-05-24', true, 'Qualified Charitable Distribution from IRA — excluded from AGI'),

  ('a1500006-0000-0000-0000-000000000000',
   'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1', NULL,
   2024, '2024-06-01',
   'Sierra Club Foundation', '94-1560938', '501c3_public',
   'cash', 25000.00, 25000.00, '60_cash',
   true, '2024-06-05', true, NULL),

  ('a1500007-0000-0000-0000-000000000000',
   'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1', NULL,
   2024, '2024-06-15',
   'Natural Resources Defense Council', '13-2654926', '501c3_public',
   'wire', 20000.00, 20000.00, '60_cash',
   true, '2024-06-18', true, NULL),

  ('a1500008-0000-0000-0000-000000000000',
   'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1', NULL,
   2024, '2024-07-10',
   'Stanford Education Fund', '94-1156365', '501c3_public',
   'check', 18000.00, 18000.00, '60_cash',
   true, '2024-07-15', true, NULL),

  ('a1500009-0000-0000-0000-000000000000',
   'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1', NULL,
   2024, '2024-07-22',
   'World Wildlife Fund', '52-1693387', '501c3_public',
   'cash', 15000.00, 15000.00, '60_cash',
   true, '2024-07-25', true, NULL),

  ('a150000a-0000-0000-0000-000000000000',
   'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1', NULL,
   2024, '2024-08-14',
   'National Park Foundation', '52-1086761', '501c3_public',
   'check', 12000.00, 12000.00, '60_cash',
   true, '2024-08-19', true, NULL),

  ('a150000b-0000-0000-0000-000000000000',
   'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1', NULL,
   2024, '2024-09-05',
   'Solar Energy Industries Foundation', '82-2018176', '501c3_public',
   'cash', 10000.00, 10000.00, '60_cash',
   true, '2024-09-10', true, NULL),

  ('a150000c-0000-0000-0000-000000000000',
   'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1', NULL,
   2024, '2024-10-01',
   'America''s Promise Alliance', '52-2175545', '501c3_public',
   'wire', 12000.00, 12000.00, '60_cash',
   true, '2024-10-05', true, NULL),

  ('a150000d-0000-0000-0000-000000000000',
   'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1', NULL,
   2024, '2024-10-20',
   'Teach For America', '13-3541913', '501c3_public',
   'check', 18000.00, 18000.00, '60_cash',
   true, '2024-10-24', true, NULL),

  ('a150000e-0000-0000-0000-000000000000',
   'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1', NULL,
   2024, '2024-11-15',
   'Rocky Mountain Institute', '74-2244407', '501c3_public',
   'check', 20000.00, 20000.00, '60_cash',
   true, '2024-11-20', true, NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SECTION 12: TAX CONTRIBUTIONS — MERIDIAN (32 contributions, total $847,500)
-- 3 QCDs totaling $85,000; 1 appreciated-stock contribution ($45,000); 2025 tax year
-- ============================================================================

INSERT INTO public.tax_contributions
  (id, portfolio_id, holding_id, tax_year, contribution_date,
   recipient_name, recipient_ein, recipient_type,
   contribution_type, amount_usd, fmv_at_donation, cost_basis,
   deductible_amount, agi_limit_category,
   acknowledgment_received, acknowledgment_date, is_qualified_organization, notes)
VALUES
  ('b2500001-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-01-15',
   'Fidelity Charitable', '11-0303001', 'daf',
   'cash', 200000.00, NULL, NULL,
   200000.00, '60_cash',
   true, '2025-01-16', true, 'DAF contribution — subsequent grants to be tracked separately'),

  -- Appreciated securities to Fidelity Charitable
  ('b2500002-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-02-10',
   'Fidelity Charitable', '11-0303001', 'daf',
   'stock', 45000.00, 45000.00, 12500.00,
   45000.00, '30_appreciated',
   true, '2025-02-11', true, 'Contribution of appreciated Microsoft shares (held >1 year); FMV $45,000; basis $12,500'),

  ('b2500003-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
   'b210000a-0000-0000-0000-000000000000',
   2025, '2025-02-28',
   'Robin Hood Foundation', '13-3441066', '501c3_public',
   'wire', 75000.00, NULL, NULL,
   75000.00, '60_cash',
   true, '2025-03-03', true, NULL),

  ('b2500004-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
   'b210000b-0000-0000-0000-000000000000',
   2025, '2025-03-10',
   'KIPP Foundation', '31-1689459', '501c3_public',
   'wire', 68000.00, NULL, NULL,
   68000.00, '60_cash',
   true, '2025-03-12', true, NULL),

  ('b2500005-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-03-28',
   'Khan Academy', '26-1544963', '501c3_public',
   'cash', 45000.00, NULL, NULL,
   45000.00, '60_cash',
   true, '2025-04-01', true, NULL),

  ('b2500006-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-09-15',
   'Khan Academy', '26-1544963', '501c3_public',
   'cash', 10000.00, NULL, NULL,
   10000.00, '60_cash',
   true, '2025-09-17', true, 'Year-end supplemental grant'),

  ('b2500007-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
   'b210000c-0000-0000-0000-000000000000',
   2025, '2025-04-05',
   'Year Up', '04-3523567', '501c3_public',
   'wire', 40000.00, NULL, NULL,
   40000.00, '60_cash',
   true, '2025-04-08', true, NULL),

  ('b2500008-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-04-20',
   'Teach For America', '13-3541913', '501c3_public',
   'cash', 35000.00, NULL, NULL,
   35000.00, '60_cash',
   true, '2025-04-23', true, NULL),

  ('b2500009-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-05-01',
   'College Track', '43-1975498', '501c3_public',
   'wire', 25000.00, NULL, NULL,
   25000.00, '60_cash',
   true, '2025-05-05', true, NULL),

  ('b250000a-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-07-01',
   'College Track', '43-1975498', '501c3_public',
   'wire', 5000.00, NULL, NULL,
   5000.00, '60_cash',
   true, '2025-07-03', true, 'Q2 supplemental grant'),

  ('b250000b-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-05-15',
   'Per Scholas', '13-3721737', '501c3_public',
   'wire', 25000.00, NULL, NULL,
   25000.00, '60_cash',
   true, '2025-05-19', true, NULL),

  -- QCD #1 from IRA → Bottom Line
  ('b250000c-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-06-01',
   'Bottom Line', '04-3523567', '501c3_public',
   'wire', 20000.00, NULL, NULL,
   20000.00, '60_cash',
   true, '2025-06-03', true, 'Qualified Charitable Distribution from IRA — excluded from AGI'),

  -- QCD #2 from IRA → City Year
  ('b250000d-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-07-10',
   'City Year', '22-2882549', '501c3_public',
   'wire', 30000.00, NULL, NULL,
   30000.00, '60_cash',
   true, '2025-07-12', true, 'Qualified Charitable Distribution from IRA — excluded from AGI'),

  -- QCD #3 from IRA → United Way of NYC
  ('b250000e-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-09-01',
   'United Way of New York City', '13-1760110', '501c3_public',
   'wire', 35000.00, NULL, NULL,
   35000.00, '60_cash',
   true, '2025-09-03', true, 'Qualified Charitable Distribution from IRA — excluded from AGI'),

  ('b250000f-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
   'b210000a-0000-0000-0000-000000000000',
   2025, '2025-11-15',
   'Robin Hood Foundation', '13-3441066', '501c3_public',
   'cash', 15000.00, NULL, NULL,
   15000.00, '60_cash',
   true, '2025-11-18', true, 'Year-end gift'),

  ('b2500010-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-06-15',
   'National Urban League', '13-1840185', '501c3_public',
   'wire', 26500.00, NULL, NULL,
   26500.00, '60_cash',
   true, '2025-06-18', true, NULL),

  ('b2500011-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-06-30',
   'Communities In Schools', '59-1626417', '501c3_public',
   'cash', 18000.00, NULL, NULL,
   18000.00, '60_cash',
   true, '2025-07-03', true, NULL),

  ('b2500012-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-07-20',
   'iMentor', '13-4071357', '501c3_public',
   'cash', 16000.00, NULL, NULL,
   16000.00, '60_cash',
   true, '2025-07-23', true, NULL),

  ('b2500013-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-07-25',
   'NPower', '13-4129230', '501c3_public',
   'wire', 14000.00, NULL, NULL,
   14000.00, '60_cash',
   true, '2025-07-28', true, NULL),

  ('b2500014-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-08-01',
   'Cristo Rey Network', '36-4352342', '501c3_public',
   'wire', 12000.00, NULL, NULL,
   12000.00, '60_cash',
   true, '2025-08-05', true, NULL),

  ('b2500015-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-08-15',
   'Management Leadership for Tomorrow', '20-4709427', '501c3_public',
   'cash', 12000.00, NULL, NULL,
   12000.00, '60_cash',
   true, '2025-08-18', true, NULL),

  ('b2500016-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-08-20',
   'Junior Achievement USA', '13-5537021', '501c3_public',
   'cash', 10000.00, NULL, NULL,
   10000.00, '60_cash',
   true, '2025-08-23', true, NULL),

  ('b2500017-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-09-10',
   'Big Brothers Big Sisters of America', '36-6010877', '501c3_public',
   'check', 9000.00, NULL, NULL,
   9000.00, '60_cash',
   true, '2025-09-13', true, NULL),

  ('b2500018-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-09-20',
   'Harlem Children''s Zone', '13-3573992', '501c3_public',
   'wire', 8000.00, NULL, NULL,
   8000.00, '60_cash',
   true, '2025-09-23', true, NULL),

  ('b2500019-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-10-01',
   'Success Academy Charter Schools Fund', '27-2005714', '501c3_public',
   'cash', 8000.00, NULL, NULL,
   8000.00, '60_cash',
   true, '2025-10-04', true, NULL),

  ('b250001a-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-10-10',
   'Sponsor A Scholar', '22-2833529', '501c3_public',
   'cash', 7000.00, NULL, NULL,
   7000.00, '60_cash',
   true, '2025-10-14', true, NULL),

  ('b250001b-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-10-15',
   'YMCA of the USA', '36-3258696', '501c3_public',
   'cash', 7000.00, NULL, NULL,
   7000.00, '60_cash',
   true, '2025-10-18', true, NULL),

  ('b250001c-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-10-20',
   'Partnership for Education Advancement', '13-2575500', '501c3_public',
   'check', 6000.00, NULL, NULL,
   6000.00, '60_cash',
   true, '2025-10-24', true, NULL),

  ('b250001d-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-10-25',
   'Breakthrough NYC', '13-3838540', '501c3_public',
   'wire', 6000.00, NULL, NULL,
   6000.00, '60_cash',
   true, '2025-10-28', true, NULL),

  ('b250001e-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-11-01',
   'Academy for Urban School Leadership', '36-4321612', '501c3_public',
   'cash', 5500.00, NULL, NULL,
   5500.00, '60_cash',
   true, '2025-11-05', true, NULL),

  ('b250001f-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-11-10',
   'Generation: You Employed', '46-3987906', '501c3_public',
   'wire', 5000.00, NULL, NULL,
   5000.00, '60_cash',
   true, '2025-11-13', true, NULL),

  ('b2500020-0000-0000-0000-000000000000',
   'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2', NULL,
   2025, '2025-11-20',
   'Good Shepherd Services', '13-2674536', '501c3_public',
   'cash', 4500.00, NULL, NULL,
   4500.00, '60_cash',
   true, '2025-11-24', true, NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SECTION 13: TAX CONTRIBUTIONS — BRIGHTWATER (8 contributions, total $95,000)
-- 2025 tax year, single filer
-- ============================================================================

INSERT INTO public.tax_contributions
  (id, portfolio_id, holding_id, tax_year, contribution_date,
   recipient_name, recipient_ein, recipient_type,
   contribution_type, amount_usd, deductible_amount, agi_limit_category,
   acknowledgment_received, acknowledgment_date, is_qualified_organization, notes)
VALUES
  ('c3500001-0000-0000-0000-000000000000',
   'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3',
   'c3100001-0000-0000-0000-000000000000',
   2025, '2025-02-01',
   'Year Up United', '04-3523567', '501c3_public',
   'cash', 25000.00, 25000.00, '60_cash',
   true, '2025-02-04', true, NULL),

  ('c3500002-0000-0000-0000-000000000000',
   'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3',
   'c3100002-0000-0000-0000-000000000000',
   2025, '2025-03-15',
   'College Track', '43-1975498', '501c3_public',
   'check', 20000.00, 20000.00, '60_cash',
   true, '2025-03-18', true, NULL),

  ('c3500003-0000-0000-0000-000000000000',
   'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3',
   'c3100004-0000-0000-0000-000000000000',
   2025, '2025-04-10',
   'Per Scholas', '13-3721737', '501c3_public',
   'wire', 15000.00, 15000.00, '60_cash',
   true, '2025-04-14', true, NULL),

  ('c3500004-0000-0000-0000-000000000000',
   'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3',
   'c3100003-0000-0000-0000-000000000000',
   2025, '2025-05-22',
   'Bottom Line', '31-1689459', '501c3_public',
   'cash', 10000.00, 10000.00, '60_cash',
   true, '2025-05-26', true, NULL),

  ('c3500005-0000-0000-0000-000000000000',
   'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3', NULL,
   2025, '2025-06-30',
   'United Way of Greater Boston', '04-2104021', '501c3_public',
   'cash', 8000.00, 8000.00, '60_cash',
   true, '2025-07-03', true, NULL),

  ('c3500006-0000-0000-0000-000000000000',
   'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3', NULL,
   2025, '2025-08-15',
   'National College Access Network', '52-1723705', '501c3_public',
   'check', 7000.00, 7000.00, '60_cash',
   true, '2025-08-19', true, NULL),

  ('c3500007-0000-0000-0000-000000000000',
   'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3', NULL,
   2025, '2025-09-20',
   'StriveTogether', '26-0745533', '501c3_public',
   'wire', 5000.00, 5000.00, '60_cash',
   true, '2025-09-23', true, NULL),

  ('c3500008-0000-0000-0000-000000000000',
   'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3', NULL,
   2025, '2025-10-30',
   'Aspen Institute', '84-0399006', '501c3_public',
   'cash', 5000.00, 5000.00, '60_cash',
   true, '2025-11-02', true, NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SECTION 14: IMPORT MAPPING PROFILE — BRIGHTWATER (Blackbaud RE NXT)
-- ============================================================================

INSERT INTO public.import_mapping_profiles
  (id, name, source_system, description, is_default, version, entity_mappings)
VALUES
  ('c3700001-0000-0000-0000-000000000000',
   'Brightwater Foundation — Blackbaud RE NXT',
   'blackbaud_re_nxt',
   'Field mappings for Brightwater Foundation Blackbaud Raiser''s Edge NXT CSV export. Covers gift and constituent data for workforce-development portfolio.',
   false,
   1,
   '{
     "constituent_name": "name",
     "gift_date":        "transaction_date",
     "gift_amount":      "amount_usd",
     "fund_description": "portfolio_name",
     "payment_method":   "payment_type",
     "gift_type":        "contribution_type",
     "acknowledgement_date": "acknowledgement_date"
   }'::jsonb)
ON CONFLICT (id) DO NOTHING;
