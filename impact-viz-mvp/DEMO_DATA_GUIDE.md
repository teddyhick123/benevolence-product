# Demo Data Guide

This guide explains the comprehensive demo dataset that showcases all features of the multi-asset portfolio system.

## How to Run

### Option 1: Via Supabase SQL Editor
1. Go to your Supabase project → SQL Editor
2. Create a new query
3. Copy the contents of `db/demo_data.sql`
4. Click "Run"

### Option 2: Via psql
```bash
psql -f db/demo_data.sql
```

### Option 3: Via command line (if you have connection details)
```bash
psql "postgresql://[user]:[password]@[host]:[port]/[database]" -f db/demo_data.sql
```

## What's Included

### 📊 Investment Portfolio (2 Equity + 1 Debt + 1 PRI + 1 MRI)

#### 1. **ImpactData Analytics** - Equity Investment
- **Type:** Series B Preferred Stock
- **Sector:** Social Enterprise Software
- **Investment:** $1,000,000 (June 2022)
- **Current NAV:** $1,850,000 (Nov 2024)
- **MOIC:** 1.88x (includes $25k distribution)
- **Features:**
  - 5 historical valuations showing 85% growth
  - Initial investment + 1 distribution
  - Impact metrics: 150k beneficiaries, 45 jobs created
  - Preparing for Series C round

#### 2. **SolarForward Inc** - Equity Investment
- **Type:** Series A Preferred Stock
- **Sector:** Clean Energy
- **Investment:** $750,000 (March 2023)
- **Current NAV:** $920,000 (Nov 2024)
- **MOIC:** 1.23x (no distributions yet)
- **Features:**
  - 3 historical valuations showing steady growth
  - Initial investment + follow-on capital call
  - Impact: 8.5k beneficiaries, 1,250 tons CO2 avoided
  - Expanded to 5 states

#### 3. **Community Development Note** - Debt Investment
- **Type:** 4.5% Senior Secured Note
- **Sector:** Affordable Housing
- **Investment:** $500,000 (Jan 2023)
- **Features:**
  - Stable NAV at par value
  - 3 semi-annual interest payments ($11,250 each)
  - Impact: 42 housing units, 165 beneficiaries
  - Demonstrates fixed-income tracking

#### 4. **Education Access Fund** - PRI
- **Type:** Recoverable Grant / Low-interest loans
- **Sector:** Education
- **Investment:** $300,000 (Aug 2023)
- **Current NAV:** $310,000
- **Features:**
  - Growing NAV from loan repayments
  - Shows return of capital transactions
  - Impact: 87 students, 23 graduates
  - IRS-qualified program related investment

#### 5. **Urban Housing REIT** - MRI
- **Type:** Common Stock (market-rate)
- **Sector:** Affordable Housing
- **Investment:** $400,000 (Nov 2022)
- **Current NAV:** $475,000 (Nov 2024)
- **MOIC:** 1.34x (includes 7 quarterly dividends)
- **Features:**
  - 5 valuations showing appreciation
  - Regular quarterly dividend payments
  - Impact: 3.2k beneficiaries, 450 units
  - Market-rate investment with mission alignment

### 🎁 Grant Portfolio (2 Foundation + 1 DAF)

#### 6. **Climate Action Network** - Foundation Grant
- **Amount:** $500,000
- **Type:** 3-year General Operating Support (2023-2025)
- **Status:** Active, renewable
- **Features:**
  - 5 milestones (2 completed, 1 in progress, 2 pending)
  - 4 reporting periods (3 submitted, 1 upcoming)
  - Semi-annual reporting requirement
  - Renewal eligible September 2025
  - Impact: 2.5M beneficiaries, 3 policy wins, 127 media mentions
  - **Showcases:** Multi-year tracking, milestone management

#### 7. **Youth Education Initiative** - Foundation Grant
- **Amount:** $200,000
- **Type:** 2-year Project Grant (2024-2025)
- **Status:** Active, not renewable
- **Features:**
  - 5 milestones (2 completed, 1 OVERDUE, 1 in progress, 1 pending)
  - 3 quarterly reports (2 submitted, 1 OVERDUE)
  - Quarterly reporting requirement
  - Impact: 450 students, 25 teachers trained, 12 curriculum modules
  - **Showcases:** Overdue tracking, project-specific management

#### 8. **Community Food Bank** - DAF Grant
- **Amount:** $75,000
- **Type:** One-time Emergency Relief
- **Status:** Active
- **Features:**
  - 3 milestones (2 completed, 1 in progress)
  - Final report due January 2025
  - Impact: 7.8k families, 156k meals distributed
  - **Linked to tax record** (shows DAF grant = charitable contribution)
  - **Showcases:** DAF workflow, emergency response

### ❤️ Donation Portfolio (2 Donations)

#### 9. **University Endowment** - Stock Donation
- **Amount:** $50,000 (FMV)
- **Cost Basis:** $30,000
- **Tax Benefit:** Deduct $50k FMV, avoid $20k capital gains
- **Features:**
  - Demonstrates appreciated asset donation
  - Linked to tax contribution record
  - Shows cost basis vs FMV tracking
  - **Showcases:** Tax optimization strategy

#### 10. **Local Arts Center** - Cash Donation
- **Amount:** $25,000
- **Type:** Annual operating support
- **Features:**
  - Simple cash donation
  - Linked to tax contribution record
  - Impact: 1,200 beneficiaries
  - **Showcases:** Standard charitable giving

### 📋 Tax Integration (3 Tax Records)

All linked to holdings with proper validation:
1. **Stock donation** - Shows capital gains avoidance
2. **Cash donation** - Standard deduction
3. **DAF grant** - Grant treated as charitable contribution

## What You Can Test

### Dashboard Features
1. **Asset Type Tabs**
   - Switch between All Assets / Investments / Grants / Donations
   - See counts and aggregated summaries

2. **Portfolio Investment Summary**
   - Total NAV: $4,205,000
   - Total Cost Basis: $3,450,000
   - Total Distributions: $98,000
   - Portfolio MOIC: ~1.25x
   - Unrealized Gain: $755,000

3. **Portfolio Grant Summary**
   - 3 active grants ($775k allocated)
   - Milestone tracking (4 completed, 2 in progress, 1 overdue, 3 pending)
   - Report status (5 submitted, 2 overdue)
   - Renewal opportunities

4. **Portfolio Donation Summary**
   - $75k total donations
   - $150k tax deductible (includes DAF grant)
   - $20k capital gains avoided

### Individual Holding Pages
- View detailed investment performance
- See valuation history charts
- Track grant milestones and deadlines
- **Click "Add to Tax Tracker"** button to test Phase 5 integration

### Tax Dashboard
- See linked holdings
- View cost basis and FMV tracking
- Calculate capital gains avoided
- Import additional holdings

### Visualizations
- **Bubble Chart** - Color by asset_type to see portfolio composition
- **Asset Type Filter** - Filter holdings by specific types
- **Performance Charts** - View NAV trends over time

## Key Metrics to Observe

### Investment Performance
- **Best Performer:** ImpactData Analytics (1.88x MOIC, 85% growth)
- **Steady Performer:** Urban Housing REIT (1.34x MOIC with dividends)
- **Early Stage:** SolarForward (1.23x MOIC, 23% growth in 18 months)
- **Fixed Income:** Community Note (4.5% annual, stable)

### Grant Management
- **On Track:** Climate Action Network (5 milestones, 3 completed)
- **Needs Attention:** Youth Education (1 overdue milestone, 1 overdue report)
- **Successful:** Food Bank (2/3 milestones completed)

### Tax Optimization
- **Capital Gains Avoided:** $20,000 (via stock donation)
- **Total Tax Deductions:** $150,000
- **Tax-Efficient Giving:** 100% of donations linked to tax records

## Portfolio Composition

| Asset Type | Count | Amount | % of Portfolio |
|------------|-------|--------|----------------|
| Equity Investments | 2 | $1,750,000 | 44% |
| Debt Investment | 1 | $500,000 | 13% |
| PRI | 1 | $300,000 | 8% |
| MRI | 1 | $400,000 | 10% |
| Foundation Grants | 2 | $700,000 | 18% |
| DAF Grant | 1 | $75,000 | 2% |
| Donations | 2 | $75,000 | 2% |
| **Total** | **10** | **$3,800,000** | **100%** |

## Impact Summary

- **Total Beneficiaries:** 2.68M people reached
- **Jobs Created:** 45 direct jobs
- **Housing Units:** 492 affordable housing units
- **Students Served:** 537 students
- **Meals Distributed:** 156,000 meals
- **CO2 Avoided:** 1,250 tons
- **Policy Wins:** 3 major legislative victories

## Next Steps After Loading Data

1. **Refresh Dashboard** - See all 10 holdings appear
2. **Try Asset Type Tabs** - Filter by category
3. **Click on Holdings** - View detailed pages
4. **Test "Add to Tax Tracker"** - Create tax records from holdings
5. **View Tax Dashboard** - See linked contributions
6. **Explore Bubble Chart** - Color by asset_type
7. **Check Grant Calendar** - See upcoming milestones/reports
8. **Review Performance** - Analyze MOIC and distributions

## Cleanup (If Needed)

To remove demo data and start fresh:

```sql
-- Delete all data for a specific portfolio
DELETE FROM public.holdings WHERE portfolio_id = '[your-portfolio-id]';
-- This will cascade delete all related valuations, transactions, grants, etc.
```

---

**Enjoy exploring your comprehensive multi-asset portfolio system!** 🚀
