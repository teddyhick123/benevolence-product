# Tax Tracking Feature - Implementation Documentation

## Overview

This document describes the comprehensive tax tracking system for charitable contributions that has been implemented in Phase 1. This feature helps users track donations, calculate IRS deduction limits, manage carryforwards, and ensure substantiation compliance.

## What's Been Implemented

### 1. Database Schema (`db/0013_tax_tracking.sql`)

Six new tables with full Row Level Security (RLS):

- **`tax_profiles`**: Store AGI estimates and filing status per portfolio/year
- **`tax_contributions`**: Enhanced contribution tracking with IRS metadata
- **`tax_carryforwards`**: Multi-year carryforward tracking (5-year expiration)
- **`daf_grants`**: Donor-Advised Fund contribution and grant tracking
- **`foundation_990pf_data`**: Private foundation 990-PF specific data
- **`tax_documents`**: Document storage metadata for receipts, appraisals, etc.

**Helper Views:**
- `v_tax_contributions_enriched`: Contributions with calculated compliance fields
- `v_active_carryforwards`: Active carryforwards with expiration status

### 2. Validation Schemas (`lib/schemas/tax.ts`)

Comprehensive Zod schemas for type-safe validation:

- Tax profiles (create/update)
- Tax contributions (create/update) with business rule validation
- Tax carryforwards (create/update)
- DAF grants (create/update)
- Foundation 990-PF data (create/update)
- Tax documents (create/update)
- Query parameter schemas
- Type exports for TypeScript

### 3. Calculation Engines

#### **AGI Calculator** (`lib/tax/agi-calculator.ts`)
- Calculates deduction limits based on IRS rules:
  - 60% limit: Cash to public charities
  - 30% limit: Appreciated assets to public charities
  - 30% limit: Cash to private foundations
  - 20% limit: Property to private foundations
- Determines automatic carryforwards when limits exceeded
- Provides optimization recommendations
- Analyzes bunching strategy potential

#### **Substantiation Validator** (`lib/tax/substantiation-validator.ts`)
- Validates IRS substantiation requirements by amount:
  - <$250: Bank record
  - $250+: Written acknowledgment
  - $500+: Form 8283 (non-cash)
  - $5,000+: Qualified appraisal (non-cash)
- Generates compliance scores (0-100)
- Creates action item lists
- Explains requirements in plain English

#### **Carryforward Tracker** (`lib/tax/carryforward-tracker.ts`)
- FIFO application of carryforwards (oldest first)
- Tracks 5-year expiration periods
- Generates alerts for expiring carryforwards
- Optimizes utilization strategies
- Summarizes by category and year

#### **Constants** (`lib/tax/constants.ts`)
- Standard deduction amounts by year/filing status
- AGI limit percentages
- Substantiation thresholds
- IRS form requirements
- Tax disclaimers

### 4. API Endpoints

All endpoints include proper authentication, RLS enforcement, and caching:

#### **Tax Profile**
- `GET /api/portfolio/[id]/tax/profile?year=2024` - Get profile for year
- `POST /api/portfolio/[id]/tax/profile` - Create profile
- `PUT /api/portfolio/[id]/tax/profile?year=2024` - Update profile

#### **Tax Contributions**
- `GET /api/portfolio/[id]/tax/contributions?year=2024` - List contributions
- `POST /api/portfolio/[id]/tax/contributions` - Create contribution
- `GET /api/portfolio/[id]/tax/contributions/[contributionId]` - Get single
- `PUT /api/portfolio/[id]/tax/contributions/[contributionId]` - Update
- `DELETE /api/portfolio/[id]/tax/contributions/[contributionId]` - Delete

#### **Tax Overview**
- `GET /api/portfolio/[id]/tax/overview?year=2024` - Comprehensive summary
  - Returns: totals, AGI limits, compliance report, carryforward summary, alerts

#### **Carryforwards**
- `GET /api/portfolio/[id]/tax/carryforwards` - List active carryforwards
- `POST /api/portfolio/[id]/tax/carryforwards` - Create carryforward

### 5. UI Components

#### **TaxOverviewCard** (`components/tax/TaxOverviewCard.tsx`)
- Dashboard widget showing tax summary
- Displays: total contributions, deductible amount, carryforwards, compliance status
- Links to full tax dashboard
- Color-coded compliance indicators

#### **Tax Dashboard Page** (`app/dashboard/tax/page.tsx`)
- Main tax center interface
- Year selector
- Getting started guide
- Feature overview
- Placeholder cards for future enhancements

## How to Deploy

### Step 1: Run Database Migration

```bash
# Connect to your Supabase project
psql "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"

# Run the migration
\i db/0013_tax_tracking.sql
```

Or via Supabase Dashboard:
1. Go to SQL Editor
2. Create new query
3. Paste contents of `db/0013_tax_tracking.sql`
4. Run

### Step 2: Verify Tables Created

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'tax_%'
OR table_name LIKE '%990pf%'
OR table_name = 'daf_grants';
```

Should return:
- tax_profiles
- tax_contributions
- tax_carryforwards
- tax_documents
- daf_grants
- foundation_990pf_data

### Step 3: Verify Views Created

```sql
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public'
AND (table_name LIKE 'v_tax%' OR table_name LIKE 'v_active%');
```

Should return:
- v_tax_contributions_enriched
- v_active_carryforwards

### Step 4: Test API Endpoints

```bash
# Test tax profile endpoint
curl -X GET "http://localhost:3000/api/portfolio/[YOUR_PORTFOLIO_ID]/tax/profile?year=2024" \
  -H "Authorization: Bearer [YOUR_TOKEN]"

# Test tax overview endpoint
curl -X GET "http://localhost:3000/api/portfolio/[YOUR_PORTFOLIO_ID]/tax/overview?year=2024" \
  -H "Authorization: Bearer [YOUR_TOKEN]"
```

### Step 5: Access Tax Dashboard

Navigate to: `http://localhost:3000/dashboard/tax`

## Usage Examples

### Creating a Tax Profile

```typescript
const response = await fetch(`/api/portfolio/${portfolioId}/tax/profile`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    portfolio_id: portfolioId,
    tax_year: 2024,
    filing_status: 'married_joint',
    estimated_agi: 200000,
  }),
});
```

### Adding a Tax Contribution

```typescript
const response = await fetch(`/api/portfolio/${portfolioId}/tax/contributions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    portfolio_id: portfolioId,
    tax_year: 2024,
    contribution_date: '2024-06-15',
    recipient_name: 'American Red Cross',
    recipient_ein: '53-0196605',
    recipient_type: '501c3_public',
    contribution_type: 'check',
    amount_usd: 5000,
    acknowledgment_received: true,
    acknowledgment_date: '2024-06-20',
  }),
});
```

### Calculating AGI Limits

```typescript
import { calculateAGILimits } from '@/lib/tax/agi-calculator';

const { limits, carryforwards } = calculateAGILimits(
  contributions,
  estimatedAGI,
  taxYear
);

console.log('Cash bucket used:', limits.buckets['60_cash'].percentageUsed + '%');
console.log('Total carryforward:', limits.totalCarryforward);
```

## Next Steps (Phase 2-5)

### Immediate Next Steps

1. **Add Navigation Link**
   - Update main navigation to include "Tax" link
   - Add to `app/layout.tsx` or navigation component

2. **Create TaxProfileSetup Component**
   - Form for entering AGI and filing status
   - AGI limit preview
   - Educational tooltips

3. **Create ContributionTaxWizard Component**
   - Multi-step form for adding contributions
   - Charity EIN lookup/verification
   - Receipt upload
   - Substantiation guidance

4. **Add to Dashboard**
   - Include `<TaxOverviewCard>` on main dashboard
   - Show for all users or feature-flag for beta

### Phase 2: Enhanced UI (2-3 weeks)

- AGI limit visualization (D3 chart showing usage by category)
- Carryforward timeline visualization
- Document upload with drag-drop
- OCR for receipt processing
- Charity verification autocomplete
- Real-time validation feedback

### Phase 3: Advanced Features (3-4 weeks)

- Bunching calculator tool
- Asset donation optimizer
- What-if scenario planning
- Integration with existing holdings
- Bulk import from CSV
- Email reminders for documentation

### Phase 4: Document Generation (3-4 weeks)

- Tax summary report PDF
- Form 8283 generator
- Schedule A draft generator
- Accountant package export (ZIP)
- Carryforward schedule

### Phase 5: Professional Features (2-3 weeks)

- CPA review and validation
- IRS form template updates
- Multi-portfolio support
- Advanced reporting
- API for accountant integration

## File Structure

```
impact-viz-mvp/
├── db/
│   └── 0013_tax_tracking.sql              # Database migration
├── lib/
│   ├── schemas/
│   │   └── tax.ts                         # Zod validation schemas
│   └── tax/
│       ├── agi-calculator.ts              # AGI limit calculations
│       ├── substantiation-validator.ts    # IRS compliance validation
│       ├── carryforward-tracker.ts        # Carryforward management
│       └── constants.ts                   # Tax constants & disclaimers
├── app/
│   ├── api/
│   │   └── portfolio/
│   │       └── [id]/
│   │           └── tax/
│   │               ├── profile/route.ts
│   │               ├── contributions/route.ts
│   │               ├── contributions/[contributionId]/route.ts
│   │               ├── overview/route.ts
│   │               └── carryforwards/route.ts
│   └── dashboard/
│       └── tax/
│           └── page.tsx                   # Main tax dashboard
└── components/
    └── tax/
        └── TaxOverviewCard.tsx            # Dashboard widget
```

## Security Considerations

- **Row Level Security (RLS)**: All tables have RLS policies matching portfolio_members permissions
- **Validation**: Zod schemas validate all inputs server-side
- **Authorization**: API endpoints verify portfolio edit permissions via `can_edit_portfolio()`
- **Sensitive Data**: EINs and personal tax data protected by RLS
- **Disclaimers**: Tax advice disclaimers on all tax-related pages

## Legal Disclaimer

This system provides tools for organizing tax data. It does NOT constitute tax advice. All calculations are estimates based on current tax law. Users must:
- Verify all information with a qualified tax professional
- Understand that generated forms are drafts requiring CPA review
- Take responsibility for accuracy of reported information
- Consult professionals before making tax-related decisions

## Testing Checklist

- [ ] Database migration runs without errors
- [ ] All tables and views created
- [ ] RLS policies prevent unauthorized access
- [ ] API endpoints return correct data
- [ ] Validation schemas catch invalid input
- [ ] AGI calculator produces accurate limits
- [ ] Substantiation validator identifies missing docs
- [ ] Carryforward tracker calculates expiration correctly
- [ ] Tax dashboard loads without errors
- [ ] TaxOverviewCard displays data correctly

## Support

For questions or issues:
1. Check Supabase logs for RLS/permission errors
2. Verify all migrations ran successfully
3. Ensure user has portfolio_member record
4. Check browser console for client-side errors
5. Review API endpoint logs

## Changelog

### 2024-11-20 - Phase 1 Complete
- Database schema with 6 tables, 2 views, RLS policies
- Zod validation schemas
- AGI calculator, substantiation validator, carryforward tracker
- 9 API endpoints
- TaxOverviewCard component
- Tax dashboard page
- Complete documentation
