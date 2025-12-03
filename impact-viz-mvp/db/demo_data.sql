-- Demo Data Generation Script
-- Purpose: Create comprehensive demo data showcasing all multi-asset portfolio features
-- Phases covered: Investment tracking, Grant management, Tax integration, Donations
-- Author: Claude Code
-- Date: 2024-11-24

-- ============================================================================
-- SETUP: Get Portfolio ID
-- Replace with your actual portfolio_id
-- ============================================================================

DO $$
DECLARE
  v_portfolio_id UUID;
  v_user_id UUID;

  -- Holdings
  h_equity_saas UUID;
  h_equity_cleantech UUID;
  h_debt_community UUID;
  h_pri_education UUID;
  h_mri_housing UUID;
  h_grant_foundation_1 UUID;
  h_grant_foundation_2 UUID;
  h_grant_daf UUID;
  h_donation_1 UUID;
  h_donation_2 UUID;
  h_pe_fund UUID;
  h_vc_startup UUID;
  h_real_estate_donation UUID;
  h_qcd UUID;

  -- Grant details
  g_foundation_1_id UUID;
  g_foundation_2_id UUID;
  g_daf_id UUID;

BEGIN
  -- Get the first portfolio (you can change this query to target a specific portfolio)
  v_portfolio_id := 'ee0c5a4f-d5a3-4ae4-bac7-20f056e26dbd';  -- Replace with your actual UUID


  IF v_portfolio_id IS NULL THEN
    RAISE EXCEPTION 'No portfolio found. Please create a portfolio first.';
  END IF;

  RAISE NOTICE 'Using portfolio: %', v_portfolio_id;

  -- ============================================================================
  -- PART 0: METRIC DEFINITIONS
  -- Create metric codes that will be used throughout the demo data
  -- ============================================================================

  -- Insert metric definitions (using ON CONFLICT DO NOTHING in case they already exist)
  INSERT INTO public.metrics (code, name, unit, directionality, description) VALUES
    ('BENEFICIARIES_REACHED', 'Beneficiaries Reached', 'people', 'higher_is_better', 'Number of people directly or indirectly benefiting from the program'),
    ('JOBS_CREATED', 'Jobs Created', 'jobs', 'higher_is_better', 'Number of full-time equivalent jobs created'),
    ('REVENUE_USD', 'Revenue (USD)', 'USD', 'higher_is_better', 'Total revenue generated in US dollars'),
    ('CO2_AVOIDED_TONS', 'CO2 Avoided', 'tons', 'higher_is_better', 'Tons of CO2 emissions avoided through clean energy'),
    ('ENERGY_SAVINGS_KWH', 'Energy Savings', 'kWh', 'higher_is_better', 'Kilowatt-hours of energy saved'),
    ('HOUSING_UNITS_CREATED', 'Housing Units Created', 'units', 'higher_is_better', 'Number of affordable housing units created or preserved'),
    ('STUDENTS_GRADUATED', 'Students Graduated', 'students', 'higher_is_better', 'Number of students who completed the program'),
    ('AVG_LOAN_AMOUNT', 'Average Loan Amount', 'USD', NULL, 'Average loan amount distributed per student'),
    ('POLICY_WINS', 'Policy Wins', 'policies', 'higher_is_better', 'Number of successful policy advocacy outcomes'),
    ('MEDIA_MENTIONS', 'Media Mentions', 'mentions', 'higher_is_better', 'Number of times mentioned in media coverage'),
    ('TEACHERS_TRAINED', 'Teachers Trained', 'teachers', 'higher_is_better', 'Number of teachers trained in new curriculum'),
    ('CURRICULUM_MODULES_CREATED', 'Curriculum Modules', 'modules', 'higher_is_better', 'Number of curriculum modules developed'),
    ('MEALS_DISTRIBUTED', 'Meals Distributed', 'meals', 'higher_is_better', 'Number of meals distributed to families in need')
  ON CONFLICT (code) DO NOTHING;

  RAISE NOTICE '✓ Metric definitions created';

  -- ============================================================================
  -- PART 1: EQUITY INVESTMENTS
  -- Showcase: Investment performance tracking, valuations, distributions
  -- ============================================================================

  -- Equity Investment 1: High-growth SaaS company
  INSERT INTO public.holdings (
    portfolio_id, name, asset_type, asset_subtype, status,
    sector, country, funds_allocated,
    description, created_at
  ) VALUES (
    v_portfolio_id,
    'ImpactData Analytics',
    'equity_investment',
    'Series B Preferred',
    'Active',
    'Social Enterprise Software',
    'United States',
    1000000,
    'SaaS platform helping nonprofits measure and communicate impact',
    '2022-06-15'::timestamptz
  ) RETURNING id INTO h_equity_saas;

  -- Add historical valuations showing growth
  INSERT INTO public.holding_valuations (holding_id, as_of_date, nav, valuation_source, notes) VALUES
    (h_equity_saas, '2022-12-31', 1050000, 'Fund Statement', 'Q4 2022 - Post-Series B valuation'),
    (h_equity_saas, '2023-06-30', 1200000, 'Fund Statement', 'H1 2023 - Strong revenue growth'),
    (h_equity_saas, '2023-12-31', 1450000, 'Fund Statement', 'Q4 2023 - Achieved profitability'),
    (h_equity_saas, '2024-06-30', 1650000, 'Fund Statement', 'H1 2024 - Expanded to 3 countries'),
    (h_equity_saas, '2024-11-15', 1850000, 'Manager Report', 'Latest valuation - preparing Series C');

  -- Add transactions (capital calls and distributions)
  INSERT INTO public.holding_transactions (holding_id, transaction_date, transaction_type, amount, memo) VALUES
    (h_equity_saas, '2022-06-15', 'initial_investment', 1000000, 'Initial Series B investment'),
    (h_equity_saas, '2024-08-15', 'distribution', 25000, 'Special dividend from profitable operations');

  -- Add KPI metrics
  INSERT INTO public.metric_facts (holding_id, metric_code, value, period_start, period_end) VALUES
    (h_equity_saas, 'BENEFICIARIES_REACHED', 150000, '2024-01-01', '2024-06-30'),
    (h_equity_saas, 'JOBS_CREATED', 45, '2024-01-01', '2024-06-30'),
    (h_equity_saas, 'REVENUE_USD', 2800000, '2024-01-01', '2024-06-30');

  -- Equity Investment 2: Cleantech startup
  INSERT INTO public.holdings (
    portfolio_id, name, asset_type, asset_subtype, status,
    sector, country, funds_allocated,
    description, created_at
  ) VALUES (
    v_portfolio_id,
    'SolarForward Inc',
    'equity_investment',
    'Series A Preferred',
    'Active',
    'Clean Energy',
    'United States',
    750000,
    'Distributed solar energy platform for underserved communities',
    '2023-03-20'::timestamptz
  ) RETURNING id INTO h_equity_cleantech;

  INSERT INTO public.holding_valuations (holding_id, as_of_date, nav, valuation_source, notes) VALUES
    (h_equity_cleantech, '2023-12-31', 780000, 'Fund Statement', 'Year-end 2023 valuation'),
    (h_equity_cleantech, '2024-06-30', 850000, 'Fund Statement', 'Mid-year 2024 - Expanded to 5 states'),
    (h_equity_cleantech, '2024-11-15', 920000, 'Manager Report', 'Strong adoption metrics');

  INSERT INTO public.holding_transactions (holding_id, transaction_date, transaction_type, amount, memo) VALUES
    (h_equity_cleantech, '2023-03-20', 'initial_investment', 500000, 'Initial Series A commitment'),
    (h_equity_cleantech, '2023-09-15', 'capital_call', 250000, 'Follow-on investment tranche');

  INSERT INTO public.metric_facts (holding_id, metric_code, value, period_start, period_end) VALUES
    (h_equity_cleantech, 'BENEFICIARIES_REACHED', 8500, '2024-01-01', '2024-06-30'),
    (h_equity_cleantech, 'CO2_AVOIDED_TONS', 1250, '2024-01-01', '2024-06-30'),
    (h_equity_cleantech, 'ENERGY_SAVINGS_KWH', 3200000, '2024-01-01', '2024-06-30');

  -- ============================================================================
  -- PART 2: DEBT INVESTMENTS
  -- Showcase: Fixed income tracking
  -- ============================================================================

  INSERT INTO public.holdings (
    portfolio_id, name, asset_type, asset_subtype, status,
    sector, country, funds_allocated,
    description, created_at
  ) VALUES (
    v_portfolio_id,
    'Community Development Note - Habitat Finance',
    'debt_investment',
    'Senior Secured Note, 4.5% annual',
    'Active',
    'Affordable Housing',
    'United States',
    500000,
    'Debt instrument supporting affordable housing development',
    '2023-01-10'::timestamptz
  ) RETURNING id INTO h_debt_community;

  INSERT INTO public.holding_valuations (holding_id, as_of_date, nav, valuation_source) VALUES
    (h_debt_community, '2023-12-31', 500000, 'Par Value'),
    (h_debt_community, '2024-06-30', 500000, 'Par Value'),
    (h_debt_community, '2024-11-15', 500000, 'Par Value');

  -- Regular interest payments as distributions
  INSERT INTO public.holding_transactions (holding_id, transaction_date, transaction_type, amount, memo) VALUES
    (h_debt_community, '2023-01-10', 'initial_investment', 500000, 'Note purchase'),
    (h_debt_community, '2023-07-10', 'distribution', 11250, 'Semi-annual interest payment'),
    (h_debt_community, '2024-01-10', 'distribution', 11250, 'Semi-annual interest payment'),
    (h_debt_community, '2024-07-10', 'distribution', 11250, 'Semi-annual interest payment');

  INSERT INTO public.metric_facts (holding_id, metric_code, value, period_start, period_end) VALUES
    (h_debt_community, 'HOUSING_UNITS_CREATED', 42, '2024-01-01', '2024-06-30'),
    (h_debt_community, 'BENEFICIARIES_REACHED', 165, '2024-01-01', '2024-06-30');

  -- ============================================================================
  -- PART 3: PROGRAM RELATED INVESTMENTS (PRIs)
  -- Showcase: IRS-qualified charitable investments
  -- ============================================================================

  INSERT INTO public.holdings (
    portfolio_id, name, asset_type, asset_subtype, status,
    sector, country, funds_allocated,
    description, created_at
  ) VALUES (
    v_portfolio_id,
    'Education Access Fund - Student Loan Program',
    'pri',
    'Recoverable Grant / Low-interest loan',
    'Active',
    'Education',
    'United States',
    300000,
    'Low-interest loans for first-generation college students',
    '2023-08-01'::timestamptz
  ) RETURNING id INTO h_pri_education;

  INSERT INTO public.holding_valuations (holding_id, as_of_date, nav, valuation_source, notes) VALUES
    (h_pri_education, '2023-12-31', 295000, 'Program Report', 'Net of loan defaults'),
    (h_pri_education, '2024-06-30', 305000, 'Program Report', 'Excellent repayment rate'),
    (h_pri_education, '2024-11-15', 310000, 'Program Report', 'Growing portfolio');

  INSERT INTO public.holding_transactions (holding_id, transaction_date, transaction_type, amount, memo) VALUES
    (h_pri_education, '2023-08-01', 'initial_investment', 300000, 'PRI capital deployment'),
    (h_pri_education, '2024-03-15', 'return_of_capital', 15000, 'Loan repayments received');

  INSERT INTO public.metric_facts (holding_id, metric_code, value, period_start, period_end) VALUES
    (h_pri_education, 'BENEFICIARIES_REACHED', 87, '2024-01-01', '2024-06-30'),
    (h_pri_education, 'STUDENTS_GRADUATED', 23, '2024-01-01', '2024-06-30'),
    (h_pri_education, 'AVG_LOAN_AMOUNT', 6500, '2024-01-01', '2024-06-30');

  -- ============================================================================
  -- PART 4: MISSION RELATED INVESTMENTS (MRIs)
  -- Showcase: Market-rate impact investments
  -- ============================================================================

  INSERT INTO public.holdings (
    portfolio_id, name, asset_type, asset_subtype, status,
    sector, country, funds_allocated,
    description, created_at
  ) VALUES (
    v_portfolio_id,
    'Urban Housing REIT',
    'mri',
    'Common Stock',
    'Active',
    'Affordable Housing',
    'United States',
    400000,
    'Publicly traded REIT focused on workforce housing',
    '2022-11-01'::timestamptz
  ) RETURNING id INTO h_mri_housing;

  INSERT INTO public.holding_valuations (holding_id, as_of_date, nav, valuation_source, notes) VALUES
    (h_mri_housing, '2022-12-31', 405000, 'Mark to Market', 'Year-end market value'),
    (h_mri_housing, '2023-06-30', 425000, 'Mark to Market', 'H1 2023 market value'),
    (h_mri_housing, '2023-12-31', 445000, 'Mark to Market', 'Strong housing market'),
    (h_mri_housing, '2024-06-30', 460000, 'Mark to Market', 'Continued appreciation'),
    (h_mri_housing, '2024-11-15', 475000, 'Mark to Market', 'Current market value');

  INSERT INTO public.holding_transactions (holding_id, transaction_date, transaction_type, amount, memo) VALUES
    (h_mri_housing, '2022-11-01', 'initial_investment', 400000, 'Stock purchase'),
    (h_mri_housing, '2023-03-15', 'distribution', 8000, 'Q1 2023 dividend'),
    (h_mri_housing, '2023-06-15', 'distribution', 8500, 'Q2 2023 dividend'),
    (h_mri_housing, '2023-09-15', 'distribution', 8500, 'Q3 2023 dividend'),
    (h_mri_housing, '2023-12-15', 'distribution', 9000, 'Q4 2023 dividend'),
    (h_mri_housing, '2024-03-15', 'distribution', 9000, 'Q1 2024 dividend'),
    (h_mri_housing, '2024-06-15', 'distribution', 9500, 'Q2 2024 dividend'),
    (h_mri_housing, '2024-09-15', 'distribution', 9500, 'Q3 2024 dividend');

  INSERT INTO public.metric_facts (holding_id, metric_code, value, period_start, period_end) VALUES
    (h_mri_housing, 'BENEFICIARIES_REACHED', 3200, '2024-01-01', '2024-06-30'),
    (h_mri_housing, 'HOUSING_UNITS_CREATED', 450, '2024-01-01', '2024-06-30');

  -- ============================================================================
  -- PART 5: FOUNDATION GRANTS
  -- Showcase: Grant management with milestones and reporting
  -- ============================================================================

  -- Foundation Grant 1: Multi-year operating support
  INSERT INTO public.holdings (
    portfolio_id, name, asset_type, asset_subtype, status,
    sector, country, funds_allocated,
    description, created_at
  ) VALUES (
    v_portfolio_id,
    'Climate Action Network - Operating Grant',
    'foundation_grant',
    'Multi-year General Operating Support',
    'Active',
    'Climate Change',
    'Global',
    500000,
    '3-year general operating support for climate advocacy organization',
    '2023-01-01'::timestamptz
  ) RETURNING id INTO h_grant_foundation_1;

  -- Create grant details
  INSERT INTO public.grant_details (
    holding_id, grant_period_start, grant_period_end, grant_type,
    renewal_eligible, renewal_date, reporting_frequency, next_report_due,
    deliverables
  ) VALUES (
    h_grant_foundation_1,
    '2023-01-01',
    '2025-12-31',
    'multi_year',
    true,
    '2025-09-01',
    'Semi-annual',
    '2024-12-31',
    'Semi-annual progress reports including: policy wins, media coverage, coalition growth, financial statements'
  ) RETURNING id INTO g_foundation_1_id;

  -- Add milestones
  INSERT INTO public.grant_milestones (grant_id, milestone_name, description, due_date, completed_date, status) VALUES
    (g_foundation_1_id, 'Year 1 Policy Victory', 'Pass state-level clean energy legislation', '2023-12-31', '2023-12-28', 'completed'),
    (g_foundation_1_id, 'Coalition Building', 'Expand coalition to 50+ organizations', '2024-06-30', '2024-06-25', 'completed'),
    (g_foundation_1_id, 'Year 2 Policy Victory', 'Secure federal climate funding', '2024-12-31', NULL, 'in_progress'),
    (g_foundation_1_id, 'Media Campaign Launch', 'Launch national awareness campaign', '2025-03-31', NULL, 'pending'),
    (g_foundation_1_id, 'Year 3 Impact Assessment', 'Complete comprehensive impact evaluation', '2025-12-31', NULL, 'pending');

  -- Add grant reports
  INSERT INTO public.grant_reports (grant_id, report_period_start, report_period_end, due_date, submitted_date, report_type) VALUES
    (g_foundation_1_id, '2023-01-01', '2023-06-30', '2023-07-31', '2023-07-25', 'interim'),
    (g_foundation_1_id, '2023-07-01', '2023-12-31', '2024-01-31', '2024-01-28', 'interim'),
    (g_foundation_1_id, '2024-01-01', '2024-06-30', '2024-07-31', '2024-07-29', 'interim'),
    (g_foundation_1_id, '2024-07-01', '2024-12-31', '2025-01-31', NULL, 'interim');

  INSERT INTO public.metric_facts (holding_id, metric_code, value, period_start, period_end) VALUES
    (h_grant_foundation_1, 'BENEFICIARIES_REACHED', 2500000, '2024-01-01', '2024-06-30'),
    (h_grant_foundation_1, 'POLICY_WINS', 3, '2024-01-01', '2024-06-30'),
    (h_grant_foundation_1, 'MEDIA_MENTIONS', 127, '2024-01-01', '2024-06-30');

  -- Foundation Grant 2: Project-specific
  INSERT INTO public.holdings (
    portfolio_id, name, asset_type, asset_subtype, status,
    sector, country, funds_allocated,
    description, created_at
  ) VALUES (
    v_portfolio_id,
    'Youth Education Initiative - STEM Program',
    'foundation_grant',
    'Project Grant',
    'Active',
    'Education',
    'United States',
    200000,
    'Two-year grant for expanding STEM education in underserved communities',
    '2024-01-01'::timestamptz
  ) RETURNING id INTO h_grant_foundation_2;

  INSERT INTO public.grant_details (
    holding_id, grant_period_start, grant_period_end, grant_type,
    renewal_eligible, reporting_frequency, next_report_due,
    deliverables
  ) VALUES (
    h_grant_foundation_2,
    '2024-01-01',
    '2025-12-31',
    'project',
    false,
    'Quarterly',
    '2024-12-31',
    'Quarterly reports: students served, program completion rates, teacher training hours, curriculum materials developed'
  ) RETURNING id INTO g_foundation_2_id;

  INSERT INTO public.grant_milestones (grant_id, milestone_name, description, due_date, completed_date, status) VALUES
    (g_foundation_2_id, 'Curriculum Development', 'Complete STEM curriculum for grades 6-8', '2024-03-31', '2024-03-28', 'completed'),
    (g_foundation_2_id, 'Teacher Training - Wave 1', 'Train 25 teachers in new curriculum', '2024-06-30', '2024-06-25', 'completed'),
    (g_foundation_2_id, 'Pilot Program Launch', 'Launch in 5 schools', '2024-09-01', NULL, 'overdue'),
    (g_foundation_2_id, 'Student Assessment', 'Complete mid-year student assessments', '2024-12-31', NULL, 'in_progress'),
    (g_foundation_2_id, 'Program Expansion', 'Expand to 10 additional schools', '2025-06-30', NULL, 'pending');

  INSERT INTO public.grant_reports (grant_id, report_period_start, report_period_end, due_date, submitted_date, report_type) VALUES
    (g_foundation_2_id, '2024-01-01', '2024-03-31', '2024-04-15', '2024-04-12', 'interim'),
    (g_foundation_2_id, '2024-04-01', '2024-06-30', '2024-07-15', '2024-07-10', 'interim'),
    (g_foundation_2_id, '2024-07-01', '2024-09-30', '2024-10-15', NULL, 'interim');

  INSERT INTO public.metric_facts (holding_id, metric_code, value, period_start, period_end) VALUES
    (h_grant_foundation_2, 'BENEFICIARIES_REACHED', 450, '2024-01-01', '2024-06-30'),
    (h_grant_foundation_2, 'TEACHERS_TRAINED', 25, '2024-01-01', '2024-06-30'),
    (h_grant_foundation_2, 'CURRICULUM_MODULES_CREATED', 12, '2024-01-01', '2024-06-30');

  -- ============================================================================
  -- PART 6: DAF GRANTS
  -- Showcase: Donor Advised Fund grants
  -- ============================================================================

  INSERT INTO public.holdings (
    portfolio_id, name, asset_type, asset_subtype, status,
    sector, country, funds_allocated,
    description, created_at
  ) VALUES (
    v_portfolio_id,
    'Community Food Bank - Emergency Relief',
    'daf_grant',
    'One-time grant via Donor Advised Fund',
    'Active',
    'Food Security',
    'United States',
    75000,
    'Emergency funding for food distribution during economic downturn',
    '2024-03-01'::timestamptz
  ) RETURNING id INTO h_grant_daf;

  INSERT INTO public.grant_details (
    holding_id, grant_period_start, grant_period_end, grant_type,
    renewal_eligible, reporting_frequency, next_report_due,
    deliverables
  ) VALUES (
    h_grant_daf,
    '2024-03-01',
    '2024-12-31',
    'general_operating',
    false,
    'Final report only',
    '2025-01-31',
    'Final report including: meals served, families helped, partnership impact'
  ) RETURNING id INTO g_daf_id;

  INSERT INTO public.grant_milestones (grant_id, milestone_name, description, due_date, completed_date, status) VALUES
    (g_daf_id, 'Emergency Distribution Setup', 'Establish 3 new distribution sites', '2024-04-01', '2024-03-28', 'completed'),
    (g_daf_id, 'Partnership Expansion', 'Partner with 10 local organizations', '2024-06-30', '2024-06-15', 'completed'),
    (g_daf_id, 'Serve 10,000 families', 'Reach milestone of 10,000 families served', '2024-12-31', NULL, 'in_progress');

  INSERT INTO public.metric_facts (holding_id, metric_code, value, period_start, period_end) VALUES
    (h_grant_daf, 'BENEFICIARIES_REACHED', 7800, '2024-01-01', '2024-06-30'),
    (h_grant_daf, 'MEALS_DISTRIBUTED', 156000, '2024-01-01', '2024-06-30');

  -- ============================================================================
  -- PART 7: DONATIONS
  -- Showcase: Charitable donations with tax tracking
  -- ============================================================================

  -- Donation 1: Stock donation
  INSERT INTO public.holdings (
    portfolio_id, name, asset_type, status,
    sector, country, funds_allocated,
    description, created_at
  ) VALUES (
    v_portfolio_id,
    'University Endowment - Appreciated Stock Gift',
    'donation',
    'Active',
    'Education',
    'United States',
    50000,
    'Donation of appreciated publicly traded stock to university endowment',
    '2024-01-15'::timestamptz
  ) RETURNING id INTO h_donation_1;

  INSERT INTO public.metric_facts (holding_id, metric_code, value, period_start, period_end) VALUES
    (h_donation_1, 'BENEFICIARIES_REACHED', 25, '2024-01-01', '2024-06-30');

  -- Donation 2: Cash donation
  INSERT INTO public.holdings (
    portfolio_id, name, asset_type, status,
    sector, country, funds_allocated,
    description, created_at
  ) VALUES (
    v_portfolio_id,
    'Local Arts Center - Annual Fund',
    'donation',
    'Active',
    'Arts & Culture',
    'United States',
    25000,
    'Annual operating support for community arts center',
    '2024-06-01'::timestamptz
  ) RETURNING id INTO h_donation_2;

  INSERT INTO public.metric_facts (holding_id, metric_code, value, period_start, period_end) VALUES
    (h_donation_2, 'BENEFICIARIES_REACHED', 1200, '2024-01-01', '2024-06-30');

  -- ============================================================================
  -- PART 7B: ENHANCED ASSET TYPES (Tax Enhancement Phase 1)
  -- Showcase: New philanthropic asset types with sophisticated tax treatment
  -- ============================================================================

  -- Private Equity Investment: Requires qualified appraisal, potential UBIT concerns
  INSERT INTO public.holdings (
    portfolio_id, name, asset_type, asset_subtype, status,
    sector, country, funds_allocated,
    description, created_at
  ) VALUES (
    v_portfolio_id,
    'Global Impact Fund III, LP',
    'private_equity_investment',
    'Limited Partnership Interest',
    'Active',
    'Impact Investing',
    'Global',
    2000000,
    'PE fund focused on emerging market impact companies. Requires qualified appraisal for donations.',
    '2021-09-01'::timestamptz
  ) RETURNING id INTO h_pe_fund;

  INSERT INTO public.investment_tracking (holding_id, cost_basis, current_nav, as_of_date, multiple_invested_capital, internal_rate_return) VALUES
    (h_pe_fund, 2000000, 2750000, '2024-12-31', 1.375, 0.142);

  INSERT INTO public.metric_facts (holding_id, metric_code, value, period_start, period_end) VALUES
    (h_pe_fund, 'JOBS_CREATED', 340, '2021-09-01', '2024-12-31'),
    (h_pe_fund, 'REVENUE_USD', 45000000, '2023-01-01', '2023-12-31');

  -- Venture Capital Investment: Startup equity with high social impact
  INSERT INTO public.holdings (
    portfolio_id, name, asset_type, asset_subtype, status,
    sector, country, funds_allocated,
    description, created_at
  ) VALUES (
    v_portfolio_id,
    'HealthTech Ventures - Series A',
    'venture_capital_investment',
    'Preferred Stock (Series A)',
    'Active',
    'Healthcare Technology',
    'United States',
    500000,
    'AI-powered diagnostic tools for underserved rural communities. Requires qualified appraisal.',
    '2023-06-01'::timestamptz
  ) RETURNING id INTO h_vc_startup;

  INSERT INTO public.investment_tracking (holding_id, cost_basis, current_nav, as_of_date, multiple_invested_capital, internal_rate_return) VALUES
    (h_vc_startup, 500000, 850000, '2024-12-31', 1.70, 0.385);

  INSERT INTO public.metric_facts (holding_id, metric_code, value, period_start, period_end) VALUES
    (h_vc_startup, 'BENEFICIARIES_REACHED', 15000, '2023-06-01', '2024-12-31'),
    (h_vc_startup, 'STUDENTS_GRADUATED', 450, '2024-01-01', '2024-12-31');

  -- Real Estate Donation: Conservation easement with enhanced deduction
  INSERT INTO public.holdings (
    portfolio_id, name, asset_type, asset_subtype, status,
    sector, country, funds_allocated,
    description, created_at
  ) VALUES (
    v_portfolio_id,
    'Riverfront Conservation Easement',
    'real_estate_donation',
    'Perpetual Conservation Easement',
    'Active',
    'Environmental Conservation',
    'United States',
    1500000,
    'Permanent restriction on 200-acre riverfront property. Qualifies for enhanced 50% AGI limit and 15-year carryforward.',
    '2024-01-15'::timestamptz
  ) RETURNING id INTO h_real_estate_donation;

  INSERT INTO public.metric_facts (holding_id, metric_code, value, period_start, period_end) VALUES
    (h_real_estate_donation, 'CO2_AVOIDED_TONS', 2500, '2024-01-15', '2024-12-31');

  -- QCD Distribution: Tax-optimized retirement distribution
  INSERT INTO public.holdings (
    portfolio_id, name, asset_type, asset_subtype, status,
    sector, country, funds_allocated,
    description, created_at
  ) VALUES (
    v_portfolio_id,
    'Annual QCD to Education Fund',
    'qcd_distribution',
    'Qualified Charitable Distribution from IRA',
    'Active',
    'Education',
    'United States',
    100000,
    'Direct distribution from IRA to qualified charity. Excluded from income, counts toward RMD.',
    '2024-04-01'::timestamptz
  ) RETURNING id INTO h_qcd;

  INSERT INTO public.metric_facts (holding_id, metric_code, value, period_start, period_end) VALUES
    (h_qcd, 'STUDENTS_GRADUATED', 85, '2024-04-01', '2024-12-31'),
    (h_qcd, 'TEACHERS_TRAINED', 12, '2024-04-01', '2024-12-31');

  -- ============================================================================
  -- PART 8: TAX CONTRIBUTIONS (Phase 5 Integration)
  -- Showcase: Holdings linked to tax records with auto-populated data
  -- ============================================================================

  -- Tax record for stock donation (shows cost basis vs FMV benefit)
  INSERT INTO public.tax_contributions (
    portfolio_id, holding_id,
    contribution_type, amount_usd, cost_basis, fmv_at_donation,
    contribution_date, recipient_name, recipient_type,
    tax_year, applied_to_tax_year, deductible_amount,
    notes
  ) VALUES (
    v_portfolio_id, h_donation_1,
    'stock', 50000, 30000, 50000,
    '2024-01-15', 'State University Endowment', '501c3_public',
    2024, 2024, 50000,
    'Appreciated stock donation - avoiding $20k in capital gains tax'
  );

  -- Tax record for cash donation
  INSERT INTO public.tax_contributions (
    portfolio_id, holding_id,
    contribution_type, amount_usd,
    contribution_date, recipient_name, recipient_type,
    tax_year, applied_to_tax_year, deductible_amount,
    notes
  ) VALUES (
    v_portfolio_id, h_donation_2,
    'cash', 25000,
    '2024-06-01', 'Community Arts Center', '501c3_public',
    2024, 2024, 25000,
    'Cash donation - annual operating support'
  );

  -- Tax record for one of the grants (showing grant = charitable contribution)
  INSERT INTO public.tax_contributions (
    portfolio_id, holding_id,
    contribution_type, amount_usd,
    contribution_date, recipient_name, recipient_type,
    tax_year, applied_to_tax_year, deductible_amount,
    notes
  ) VALUES (
    v_portfolio_id, h_grant_daf,
    'cash', 75000,
    '2024-03-01', 'Community Food Bank', '501c3_public',
    2024, 2024, 75000,
    'DAF grant recommendation - emergency relief funding'
  );

  -- ============================================================================
  -- PART 8B: ENHANCED TAX RECORDS (Tax Enhancement Phase 1)
  -- Showcase: New enhanced tax fields for sophisticated planning
  -- ============================================================================

  -- Tax record for private equity donation (requires qualified appraisal, potential UBIT)
  INSERT INTO public.tax_contributions (
    portfolio_id, holding_id,
    contribution_type, amount_usd, cost_basis, fmv_at_donation,
    contribution_date, recipient_name, recipient_type,
    tax_year, applied_to_tax_year, deductible_amount,
    -- Enhanced fields
    requires_qualified_appraisal, appraisal_value, appraisal_date,
    agi_limit_percentage, carryforward_eligible, carryforward_years,
    holding_period_ltcg, ubit_concerns, form_8283_required, form_8283_section,
    notes
  ) VALUES (
    v_portfolio_id, h_pe_fund,
    'other_property', 2750000, 2000000, 2750000,
    '2024-11-15', 'Family Foundation', '501c3_private_foundation',
    2024, 2024, 750000, -- Only $750k deductible in year 1 due to 30% AGI limit
    -- Enhanced fields
    true, 2750000, '2024-11-01',
    30.0, true, 5,
    true, 'PE fund may trigger UBIT if it holds operating business interests. Foundation should consult tax advisor.',
    true, 'B',
    'Private equity donation requires qualified appraisal. Capital gains avoided: $750k. Remaining $2M carries forward.'
  );

  -- Tax record for real estate donation (conservation easement with enhanced benefits)
  INSERT INTO public.tax_contributions (
    portfolio_id, holding_id,
    contribution_type, amount_usd, cost_basis, fmv_at_donation,
    contribution_date, recipient_name, recipient_type,
    tax_year, applied_to_tax_year, deductible_amount,
    -- Enhanced fields
    requires_qualified_appraisal, appraisal_value, appraisal_date,
    agi_limit_percentage, carryforward_eligible, carryforward_years,
    conservation_easement, conservation_enhanced_deduction,
    form_8283_required, form_8283_section,
    notes
  ) VALUES (
    v_portfolio_id, h_real_estate_donation,
    'real_estate', 1500000, 500000, 1500000,
    '2024-01-15', 'Land Trust Alliance', '501c3_public',
    2024, 2024, 1000000, -- $1M deductible in year 1 (50% AGI limit for conservation)
    -- Enhanced fields
    true, 1500000, '2023-12-20',
    50.0, true, 15, -- Enhanced 50% limit and 15-year carryforward for conservation
    true, true,
    true, 'B',
    'Conservation easement donation qualifies for enhanced 50% AGI limit and 15-year carryforward. Capital gains avoided: $1M. Includes baseline documentation.'
  );

  -- Tax record for QCD distribution (excluded from income, no deduction needed)
  INSERT INTO public.tax_contributions (
    portfolio_id, holding_id,
    contribution_type, amount_usd,
    contribution_date, recipient_name, recipient_type,
    tax_year, applied_to_tax_year, deductible_amount,
    -- Enhanced fields
    qcd_qualified, qcd_counts_toward_rmd, agi_limit_percentage,
    carryforward_eligible,
    notes
  ) VALUES (
    v_portfolio_id, h_qcd,
    'ach', 100000,
    '2024-04-01', 'Education Fund', '501c3_public',
    2024, 2024, 0, -- QCDs don't create a deduction, they're excluded from income
    -- Enhanced fields
    true, true, 100.0, -- Not AGI limited since excluded from income
    false, -- QCDs don't carry forward
    'QCD: $100k excluded from taxable income (better than deduction). Counts toward RMD. Donor age 73. Direct from IRA to charity.'
  );

  -- Tax record for venture capital donation (qualified appraisal, high appreciation)
  INSERT INTO public.tax_contributions (
    portfolio_id, holding_id,
    contribution_type, amount_usd, cost_basis, fmv_at_donation,
    contribution_date, recipient_name, recipient_type,
    tax_year, applied_to_tax_year, deductible_amount,
    -- Enhanced fields
    requires_qualified_appraisal, appraisal_value, appraisal_date,
    agi_limit_percentage, carryforward_eligible, carryforward_years,
    holding_period_ltcg, ubit_concerns,
    form_8283_required, form_8283_section,
    notes
  ) VALUES (
    v_portfolio_id, h_vc_startup,
    'other_property', 850000, 500000, 850000,
    '2024-06-30', 'University Medical Research Fund', '501c3_public',
    2024, 2024, 850000, -- Full amount deductible (under 30% AGI limit)
    -- Enhanced fields
    true, 850000, '2024-06-15',
    30.0, true, 5,
    true, 'Illiquid private company stock may trigger UBIT if company has debt financing.',
    true, 'B',
    'VC investment donation. Capital gains avoided: $350k. Requires qualified appraisal due to illiquid nature.'
  );

  -- ============================================================================
  -- SUCCESS MESSAGE
  -- ============================================================================

  RAISE NOTICE '✅ Demo data created successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '  📊 Portfolio: %', v_portfolio_id;
  RAISE NOTICE '  💼 Public Equity: 2 (with valuations & transactions showing strong performance)';
  RAISE NOTICE '  🏢 Private Equity: 1 (requires qualified appraisal, UBIT concerns)';
  RAISE NOTICE '  🚀 Venture Capital: 1 (high appreciation, qualified appraisal required)';
  RAISE NOTICE '  📋 Debt Investment: 1 (steady returns with regular interest payments)';
  RAISE NOTICE '  🎯 PRI: 1 (education loans with repayments)';
  RAISE NOTICE '  🏘️  MRI: 1 (housing REIT with market appreciation & dividends)';
  RAISE NOTICE '  🎁 Foundation Grants: 2 (with milestones, reports, varying progress)';
  RAISE NOTICE '  🏦 DAF Grant: 1 (emergency relief with impact metrics)';
  RAISE NOTICE '  ❤️  Donations: 2 (linked to tax records)';
  RAISE NOTICE '  🏞️  Real Estate: 1 (conservation easement - enhanced 50%% AGI & 15yr carryforward)';
  RAISE NOTICE '  💰 QCD: 1 (excluded from income, counts toward RMD)';
  RAISE NOTICE '';
  RAISE NOTICE 'Features demonstrated:';
  RAISE NOTICE '  ✓ Investment performance tracking (MOIC: 1.85x SaaS, 1.23x Cleantech, 1.70x VC)';
  RAISE NOTICE '  ✓ Historical valuations showing growth over time';
  RAISE NOTICE '  ✓ Distributions and capital calls';
  RAISE NOTICE '  ✓ Grant milestones (completed, in progress, overdue)';
  RAISE NOTICE '  ✓ Grant reporting requirements and deadlines';
  RAISE NOTICE '  ✓ Tax integration with cost basis and capital gains';
  RAISE NOTICE '  ✓ Enhanced tax tracking (appraisal requirements, AGI limits, carryforward)';
  RAISE NOTICE '  ✓ Sophisticated donor strategies (PE, real estate, QCDs)';
  RAISE NOTICE '  ✓ Conservation easement tax benefits';
  RAISE NOTICE '  ✓ UBIT warnings for operating business interests';
  RAISE NOTICE '  ✓ Diverse impact metrics across sectors';
  RAISE NOTICE '  ✓ Portfolio-level aggregations ready to view';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Refresh your dashboard to see the new data';
  RAISE NOTICE '  2. Try the enhanced asset type tabs (14 total types now available)';
  RAISE NOTICE '  3. View individual holdings to see detailed tracking';
  RAISE NOTICE '  4. Check the Tax page to see enhanced fields and sophisticated planning';
  RAISE NOTICE '  5. Notice the new asset types in dropdown: PE, VC, Real Estate, QCD, etc.';
  RAISE NOTICE '  5. Explore the bubble chart with asset_type coloring';

END $$;
