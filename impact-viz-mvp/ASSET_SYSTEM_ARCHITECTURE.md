# Asset System Architecture

**Last Updated**: December 3, 2025
**Status**: Implemented with ongoing enhancements

This document describes the complete multi-asset class portfolio system architecture, covering both backend data model and frontend presentation.

---

## Table of Contents
1. [System Overview](#system-overview)
2. [Backend Architecture](#backend-architecture)
3. [Frontend Presentation](#frontend-presentation)
4. [Asset Type Taxonomy](#asset-type-taxonomy)
5. [Future Enhancements](#future-enhancements)

---

## System Overview

### Core Strategy
**Unified Multi-Asset Architecture:**
- **Tier 1:** Universal holdings table (all assets)
- **Tier 2:** Asset type classification (formal enum)
- **Tier 3:** Type-specific extensions (investments, grants, donations)

### Asset Classes Supported
- **Impact Investments** (equity, debt, PRIs, MRIs)
- **Grants** (foundation grants, DAF grants)
- **Donations** (cash, stock, property)

---

## Backend Architecture

### Database Schema

#### Asset Type Enum
```sql
CREATE TYPE asset_type_enum AS ENUM (
  'equity_investment',      -- Stocks, VC, PE
  'debt_investment',        -- Bonds, notes, loans
  'pri',                    -- Program Related Investment
  'mri',                    -- Mission Related Investment
  'foundation_grant',       -- Direct foundation grant
  'daf_grant',              -- Donor Advised Fund grant
  'donation',               -- Charitable contribution
  'other'                   -- Uncategorized
);
```

#### Holdings Table
```sql
CREATE TABLE public.holdings (
  id UUID PRIMARY KEY,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id),
  investee_id UUID REFERENCES investees(id),

  -- Asset Classification
  asset_type asset_type_enum NOT NULL,
  asset_subtype TEXT,  -- Optional descriptive detail

  -- Core Fields
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  funds_allocated NUMERIC,
  as_of DATE,

  -- Additional metadata
  sector TEXT,
  country TEXT,
  custodian TEXT,
  valuation_method TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_holdings_asset_type ON public.holdings(asset_type);
CREATE INDEX idx_holdings_portfolio_status ON public.holdings(portfolio_id, status);
```

### TypeScript Schema

#### Asset Type Schema
```typescript
// lib/schemas/portfolio.ts
export const assetTypeSchema = z.enum([
  'equity_investment',
  'debt_investment',
  'pri',
  'mri',
  'foundation_grant',
  'daf_grant',
  'donation',
  'other',
]);

export type AssetType = z.infer<typeof assetTypeSchema>;
```

#### Holdings Schema
```typescript
export const holdingSchema = z.object({
  id: z.string().uuid(),
  portfolio_id: z.string().uuid(),
  investee_id: z.string().uuid().nullable(),

  // Asset Classification
  asset_type: assetTypeSchema,
  asset_subtype: z.string().nullable(),

  // Core Fields
  name: z.string().min(1, 'Name is required'),
  status: z.string().default('active'),
  funds_allocated: z.number().nullable(),
  as_of: z.string().nullable(),

  // Metadata
  sector: z.string().nullable(),
  country: z.string().nullable(),
  custodian: z.string().nullable(),
  valuation_method: z.string().nullable(),

  created_at: z.string(),
  updated_at: z.string(),
});
```

### Type-Specific Extensions

#### Investment Details
```typescript
// For equity_investment, debt_investment, pri, mri
export interface InvestmentDetails {
  holding_id: string;
  cost_basis: number;
  current_nav: number;
  total_distributions: number;
  unrealized_gain: number;
  moic: number;  // Multiple on Invested Capital
  irr: number;   // Internal Rate of Return
}
```

#### Grant Details
```typescript
// For foundation_grant, daf_grant
export interface GrantDetails {
  holding_id: string;
  grant_type: 'general' | 'project' | 'capacity' | 'matching';
  grant_period: string;
  disbursement_schedule: object;
  reporting_frequency: string;
  milestones: Milestone[];
}
```

#### Donation Details
```typescript
// For donation asset type
export interface DonationDetails {
  holding_id: string;
  donation_type: 'cash' | 'stock' | 'property' | 'crypto';
  tax_year: number;
  deduction_amount: number;
  fair_market_value: number;
  cost_basis: number;
}
```

---

## Frontend Presentation

### Portfolio Summary Tabs

The portfolio dashboard uses a tabbed interface to switch between views:
- **All Assets** - Unified overview of entire portfolio
- **Investments** - Investment-specific metrics
- **Grants** - Grant-specific metrics
- **Donations** - Donation-specific metrics

### All Assets Tab Design

#### Current Implementation
Shows three summary cards stacked vertically:
- PortfolioInvestmentSummary
- PortfolioGrantSummary
- PortfolioDonationSummary

#### Recommended Enhancement: Unified Dashboard

```
┌─────────────────────────────────────────────────────────┐
│  All Assets Overview                                     │
├──────────────────────┬──────────────────────────────────┤
│  PORTFOLIO TOTAL     │  ASSET ALLOCATION                │
│  $12.5M              │  ┌─────────────────────┐         │
│                      │  │  [Pie Chart]        │         │
│  • 45 Holdings       │  │  - Investments 65%  │         │
│  • 8 Asset Types     │  │  - Grants 25%       │         │
│  • Last updated...   │  │  - Donations 10%    │         │
│                      │  └─────────────────────┘         │
├──────────────────────┴──────────────────────────────────┤
│  KEY METRICS GRID                                        │
├────────────┬─────────────┬─────────────┬────────────────┤
│ Total      │ Active      │ Avg. Size   │ Recent         │
│ Value      │ Holdings    │ $278K       │ Activity       │
│ $12.5M     │ 38 of 45    │             │ 5 this month   │
├────────────┴─────────────┴─────────────┴────────────────┤
│  BREAKDOWN BY ASSET TYPE                                 │
├───────────────┬──────────┬──────────┬───────────────────┤
│ Equity Inv.   │ $4.2M    │ 12 hlgs  │ ████████░░  65%  │
│ Debt Inv.     │ $1.8M    │ 8 hlgs   │ ████░░░░░░  28%  │
│ PRI           │ $800K    │ 4 hlgs   │ ██░░░░░░░░  12%  │
│ MRI           │ $500K    │ 3 hlgs   │ █░░░░░░░░░   8%  │
│ Found. Grant  │ $2.1M    │ 10 hlgs  │ █████░░░░░  32%  │
│ DAF Grant     │ $900K    │ 5 hlgs   │ ██░░░░░░░░  14%  │
│ Donation      │ $1.2M    │ 3 hlgs   │ ███░░░░░░░  18%  │
└───────────────┴──────────┴──────────┴───────────────────┘
```

**Components**:
- `PortfolioTotalCard` - Aggregate value, count, last updated
- `AssetAllocationPie` - Visual allocation by asset type
- `MetricsGrid` - 4-column grid of key stats
- `AssetTypeBreakdownTable` - Sortable table with progress bars

**Benefits**:
- ✅ Single comprehensive view
- ✅ Visual asset allocation
- ✅ Easy to scan metrics
- ✅ Uses existing color palette
- ✅ Could replace separate summary section

### Asset Type Colors

```typescript
// lib/schemas/portfolio.ts
export const ASSET_TYPE_COLORS = {
  equity_investment: 'blue',
  debt_investment: 'green',
  pri: 'purple',
  mri: 'orange',
  foundation_grant: 'pink',
  daf_grant: 'teal',
  donation: 'amber',
  other: 'neutral',
};
```

### Holdings Table Views

#### All Assets View
Shows all holdings with asset type badges:
```typescript
<HoldingsTable
  holdings={allHoldings}
  showAssetType={true}
  colorByAssetType={true}
/>
```

#### Filtered Views
Individual tabs filter by asset type:
```typescript
// Investments tab
<HoldingsTable
  holdings={investmentHoldings}
  filter={{ asset_type: ['equity_investment', 'debt_investment', 'pri', 'mri'] }}
/>

// Grants tab
<HoldingsTable
  holdings={grantHoldings}
  filter={{ asset_type: ['foundation_grant', 'daf_grant'] }}
/>

// Donations tab
<HoldingsTable
  holdings={donationHoldings}
  filter={{ asset_type: ['donation'] }}
/>
```

---

## Asset Type Taxonomy

### Investment Assets

#### Equity Investment
**Examples**: Public stock, private equity, venture capital
**Key Metrics**: MOIC, IRR, cost basis, unrealized gain
**Tax Considerations**: Long-term capital gains treatment

#### Debt Investment
**Examples**: Bonds, notes, loans
**Key Metrics**: Yield, maturity date, interest payments
**Tax Considerations**: Interest income (ordinary income)

#### PRI (Program Related Investment)
**Examples**: Below-market loans to charities
**Requirements**: Must further charitable purpose
**Tax Benefits**: Counts toward foundation payout requirement

#### MRI (Mission Related Investment)
**Examples**: Market-rate impact investments
**Requirements**: Aligned with mission, market returns
**Tax Treatment**: Standard investment treatment

### Grant Assets

#### Foundation Grant
**Examples**: Direct grants from private foundation
**Requirements**: Due diligence, expenditure responsibility
**Tracking**: Milestones, reports, disbursements

#### DAF Grant
**Examples**: Donor Advised Fund recommendations
**Requirements**: Qualified charity recipient
**Tracking**: Recommendation status, disbursement

### Donation Assets

#### Donation
**Examples**: Cash, stock, property, crypto
**Tax Benefits**: Deductible contribution
**Tracking**: FMV, cost basis, tax year, receipts

---

## API Endpoints

### Holdings Management
```
GET    /api/portfolio/[id]/holdings              # List all holdings
POST   /api/portfolio/[id]/holdings              # Create holding
GET    /api/portfolio/[id]/holdings/[holdingId]  # Get holding details
PATCH  /api/portfolio/[id]/holdings/[holdingId]  # Update holding
DELETE /api/portfolio/[id]/holdings/[holdingId]  # Delete holding
```

### Asset Type Summaries
```
GET /api/portfolio/[id]/investments  # Investment summary
GET /api/portfolio/[id]/grants       # Grant summary
GET /api/portfolio/[id]/donations    # Donation summary
```

### Analytics
```
GET /api/portfolio/[id]/bubble-chart      # Asset allocation visualization
GET /api/portfolio/[id]/performance       # Investment performance metrics
GET /api/portfolio/[id]/summary           # Overall portfolio summary
```

---

## Future Enhancements

### Phase 1: Enhanced Asset Types
- [ ] Add `private_equity_investment` (distinct from public equity)
- [ ] Add `venture_capital_investment` (distinct from PE)
- [ ] Add `real_estate_donation` (major tax planning vehicle)
- [ ] Add `impact_bond` (SIBs, green bonds)
- [ ] Add `conservation_investment` (carbon credits, wetlands)

### Phase 2: Asset Subtype Taxonomy
Create formal subtypes for each asset type:
```typescript
export const ASSET_SUBTYPES = {
  equity_investment: ['public_stock', 'private_equity', 'venture_capital'],
  debt_investment: ['corporate_bond', 'municipal_bond', 'convertible_note'],
  donation: ['cash', 'stock', 'real_estate', 'crypto', 'artwork'],
  // ... etc
};
```

### Phase 3: Unified Dashboard
Implement the recommended "All Assets" dashboard design with:
- Portfolio total card
- Asset allocation pie chart
- Key metrics grid
- Asset type breakdown table

### Phase 4: Cross-Asset Analytics
- Portfolio-wide IRR calculation
- Total impact metrics (across investments + grants)
- Tax optimization recommendations
- Asset allocation rebalancing suggestions

---

## Implementation Status

### ✅ Completed (Phase 1)
- [x] Asset type enum created
- [x] Holdings table migrated from `asset_class` to `asset_type`
- [x] TypeScript schemas updated
- [x] API routes support asset_type filtering
- [x] Frontend tabs for Investments/Grants/Donations
- [x] Color-coded asset type badges
- [x] Summary cards for each asset category

### 🚧 In Progress (Phase 2)
- [ ] Enhanced asset type taxonomy
- [ ] Asset subtype formalization
- [ ] Unified "All Assets" dashboard
- [ ] Cross-asset analytics

### 📋 Planned (Phase 3+)
- [ ] Private equity/VC tracking
- [ ] Real estate donation handling
- [ ] Impact bond support
- [ ] Portfolio rebalancing tools

---

## Reference Documents

**Backend Implementation**: `db/0017_asset_type_enum.sql`
**TypeScript Schemas**: `lib/schemas/portfolio.ts`, `lib/schemas/investment.ts`, `lib/schemas/grant.ts`, `lib/schemas/donation.ts`
**Frontend Components**: `components/PortfolioSummarySection.tsx`, `components/HoldingsTable.tsx`
**Original Blueprints**: `docs/archive/MULTI_ASSET_BLUEPRINT.md`, `docs/archive/ALL_ASSETS_REDESIGN_BLUEPRINT.md`
