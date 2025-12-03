# Multi-Asset Class Portfolio System - Implementation Blueprint

## Executive Summary

Transform impact-viz-mvp from an impact-focused tool into a comprehensive portfolio management platform that seamlessly handles:
- **Impact Investments** (equity, debt, PRIs, MRIs)
- **Grants** (foundation grants, DAF grants)
- **Donations** (cash, stock, property)

## Core Strategy

**Unified Multi-Asset Architecture:**
- **Tier 1:** Universal holdings (all assets)
- **Tier 2:** Asset type classification (formal enum)
- **Tier 3:** Type-specific extensions (investments, grants, donations)

---

## PHASE 1: FOUNDATION (Current)

### Objective
Establish formal asset type taxonomy by converting `asset_class` to enumerated `asset_type`

### Asset Type Taxonomy

```typescript
asset_type:
  | 'equity_investment'      // Stocks, VC, PE
  | 'debt_investment'        // Bonds, notes, loans
  | 'pri'                    // Program Related Investment
  | 'mri'                    // Mission Related Investment
  | 'foundation_grant'       // Direct foundation grant
  | 'daf_grant'              // Donor Advised Fund grant
  | 'donation'               // Charitable contribution
  | 'other'                  // Uncategorized
```

### Implementation Steps

#### Step 1.1: Database Migration
**File:** `db/0017_asset_type_enum.sql`

```sql
-- Create asset type enum
CREATE TYPE asset_type_enum AS ENUM (
  'equity_investment',
  'debt_investment',
  'pri',
  'mri',
  'foundation_grant',
  'daf_grant',
  'donation',
  'other'
);

-- Rename column from asset_class to asset_type
ALTER TABLE public.holdings
  RENAME COLUMN asset_class TO asset_type_text;

-- Add new typed column
ALTER TABLE public.holdings
  ADD COLUMN asset_type asset_type_enum;

-- Migrate existing data with intelligent defaults
UPDATE public.holdings
SET asset_type =
  CASE
    WHEN LOWER(asset_type_text) LIKE '%grant%' THEN 'foundation_grant'
    WHEN LOWER(asset_type_text) LIKE '%donation%' THEN 'donation'
    WHEN LOWER(asset_type_text) LIKE '%equity%' THEN 'equity_investment'
    WHEN LOWER(asset_type_text) LIKE '%stock%' THEN 'equity_investment'
    WHEN LOWER(asset_type_text) LIKE '%debt%' THEN 'debt_investment'
    WHEN LOWER(asset_type_text) LIKE '%bond%' THEN 'debt_investment'
    WHEN LOWER(asset_type_text) LIKE '%pri%' THEN 'pri'
    WHEN LOWER(asset_type_text) LIKE '%mri%' THEN 'mri'
    ELSE 'other'
  END;

-- Add descriptive subtype field (replaces old free-text asset_class)
ALTER TABLE public.holdings
  ADD COLUMN asset_subtype TEXT;

-- Copy remaining classification detail to asset_subtype
UPDATE public.holdings
SET asset_subtype = asset_type_text;

-- Drop old text column
ALTER TABLE public.holdings
  DROP COLUMN asset_type_text;

-- Add index for filtering
CREATE INDEX idx_holdings_asset_type ON public.holdings(asset_type);
```

#### Step 1.2: TypeScript Schema Updates
**File:** `lib/schemas/portfolio.ts`

```typescript
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

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  equity_investment: 'Equity Investment',
  debt_investment: 'Debt Investment',
  pri: 'Program Related Investment (PRI)',
  mri: 'Mission Related Investment (MRI)',
  foundation_grant: 'Foundation Grant',
  daf_grant: 'DAF Grant',
  donation: 'Donation',
  other: 'Other',
};

export const createHoldingSchema = z.object({
  name: z.string().min(1),
  asset_type: assetTypeSchema.optional(),
  asset_subtype: z.string().max(200).optional(),
  // ... other fields
});
```

#### Step 1.3: Files to Update
- [x] `db/0017_asset_type_enum.sql` - Database migration
- [ ] `lib/schemas/portfolio.ts` - Add asset_type enum
- [ ] `lib/schemas/portfolio.test.ts` - Update tests
- [ ] `app/api/portfolio/[id]/holdings/route.ts` - Update GET/POST
- [ ] `app/api/portfolio/[id]/holdings/[holdingId]/route.ts` - Update GET/PUT
- [ ] `app/api/holdings/[id]/update-basic/route.ts` - Update PUT
- [ ] `components/HoldingsTable.tsx` - Display asset_type
- [ ] `components/HoldingHeader.tsx` - Display asset_type
- [ ] `components/HoldingsSection.tsx` - Pass asset_type
- [ ] `components/EditHoldingsModal.tsx` - Asset type selector
- [ ] `components/tax/HoldingsImporter.tsx` - Update inference logic
- [ ] `app/dashboard/holdings/[holdingId]/page.tsx` - Display asset_type

---

## PHASE 2: INVESTMENT TRACKING

### Objective
Add financial performance tracking for investments (equity, debt, PRI, MRI)

### Database Schema

#### Table: `holding_valuations`
Track NAV over time
```sql
CREATE TABLE public.holding_valuations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  holding_id UUID NOT NULL REFERENCES public.holdings(id) ON DELETE CASCADE,
  as_of_date DATE NOT NULL,
  nav NUMERIC NOT NULL,
  units NUMERIC,
  nav_per_unit NUMERIC,
  valuation_source TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(holding_id, as_of_date)
);

CREATE INDEX idx_valuations_holding ON holding_valuations(holding_id);
CREATE INDEX idx_valuations_date ON holding_valuations(as_of_date DESC);
```

#### Table: `holding_transactions`
Track capital calls and distributions
```sql
CREATE TYPE transaction_type_enum AS ENUM (
  'initial_investment',
  'capital_call',
  'distribution',
  'return_of_capital',
  'reinvestment'
);

CREATE TABLE public.holding_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  holding_id UUID NOT NULL REFERENCES public.holdings(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL,
  transaction_type transaction_type_enum NOT NULL,
  amount NUMERIC NOT NULL,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(holding_id, transaction_date, transaction_type, amount)
);

CREATE INDEX idx_transactions_holding ON holding_transactions(holding_id);
CREATE INDEX idx_transactions_date ON holding_transactions(transaction_date DESC);
```

#### Calculated Fields on Holdings
```sql
ALTER TABLE public.holdings
  ADD COLUMN cost_basis NUMERIC GENERATED ALWAYS AS (
    (SELECT COALESCE(SUM(amount), 0)
     FROM holding_transactions
     WHERE holding_id = holdings.id
     AND transaction_type IN ('initial_investment', 'capital_call'))
  ) STORED,
  ADD COLUMN total_distributions NUMERIC GENERATED ALWAYS AS (
    (SELECT COALESCE(SUM(amount), 0)
     FROM holding_transactions
     WHERE holding_id = holdings.id
     AND transaction_type = 'distribution')
  ) STORED,
  ADD COLUMN current_nav NUMERIC,
  ADD COLUMN nav_as_of_date DATE;

-- Or use view instead of generated columns
CREATE VIEW v_investment_performance AS
SELECT
  h.id,
  h.name,
  h.asset_type,
  h.funds_allocated,
  COALESCE(hv.nav, h.funds_allocated) as current_nav,
  hv.as_of_date as nav_as_of_date,
  COALESCE(h.funds_allocated, 0) as cost_basis,
  (SELECT SUM(amount) FROM holding_transactions ht
   WHERE ht.holding_id = h.id
   AND ht.transaction_type = 'distribution') as total_distributions,
  COALESCE(hv.nav, h.funds_allocated) - COALESCE(h.funds_allocated, 0) as unrealized_gain,
  CASE
    WHEN h.funds_allocated > 0
    THEN ((COALESCE(hv.nav, h.funds_allocated) - h.funds_allocated) / h.funds_allocated) * 100
  END as unrealized_gain_pct,
  CASE
    WHEN h.funds_allocated > 0
    THEN (COALESCE(hv.nav, h.funds_allocated) + COALESCE(dist.total, 0)) / h.funds_allocated
  END as moic
FROM holdings h
LEFT JOIN LATERAL (
  SELECT nav, as_of_date
  FROM holding_valuations
  WHERE holding_id = h.id
  ORDER BY as_of_date DESC
  LIMIT 1
) hv ON true
LEFT JOIN LATERAL (
  SELECT SUM(amount) as total
  FROM holding_transactions
  WHERE holding_id = h.id
  AND transaction_type = 'distribution'
) dist ON true
WHERE h.asset_type IN ('equity_investment', 'debt_investment', 'pri', 'mri');
```

### API Endpoints

#### `POST /api/portfolio/[id]/holdings/[holdingId]/valuations`
Add valuation
```typescript
{
  as_of_date: '2024-12-31',
  nav: 1250000,
  valuation_source: 'Fund Statement',
  notes: 'Q4 2024 valuation'
}
```

#### `GET /api/portfolio/[id]/holdings/[holdingId]/valuations`
Get valuation history

#### `POST /api/portfolio/[id]/holdings/[holdingId]/transactions`
Record transaction
```typescript
{
  transaction_date: '2024-06-15',
  transaction_type: 'distribution',
  amount: 50000,
  memo: 'Quarterly distribution'
}
```

#### `GET /api/portfolio/[id]/investment-performance`
Get portfolio-level investment metrics
```typescript
{
  total_cost_basis: 5300000,
  total_current_nav: 6100000,
  total_distributions: 450000,
  total_unrealized_gain: 800000,
  portfolio_moic: 1.24,
  portfolio_irr: 12.4  // Would need IRR calculation
}
```

### UI Components

#### `InvestmentPerformanceCard.tsx`
Dashboard card showing:
- Total NAV
- Unrealized Gain
- Total Distributions
- Portfolio MOIC

#### `InvestmentPerformanceTable.tsx`
Table showing per-investment:
- Name, Type
- Cost Basis, Current NAV
- Unrealized Gain ($, %)
- Distributions, MOIC

#### `ValuationHistoryChart.tsx`
Line chart of NAV over time

#### `TransactionHistory.tsx`
List of capital calls and distributions

---

## PHASE 3: GRANT MANAGEMENT

### Objective
Add grant-specific tracking (milestones, renewals, reporting)

### Database Schema

#### Table: `grant_details`
```sql
CREATE TYPE grant_type_enum AS ENUM (
  'general_operating',
  'project',
  'capacity_building',
  'multi_year',
  'seed',
  'planning'
);

CREATE TABLE public.grant_details (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  holding_id UUID NOT NULL REFERENCES public.holdings(id) ON DELETE CASCADE,
  grant_period_start DATE,
  grant_period_end DATE,
  grant_type grant_type_enum,
  renewal_eligible BOOLEAN DEFAULT false,
  renewal_date DATE,
  deliverables TEXT,
  reporting_frequency TEXT, -- 'monthly', 'quarterly', 'annual', 'final'
  next_report_due DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(holding_id)
);
```

#### Table: `grant_milestones`
```sql
CREATE TYPE milestone_status_enum AS ENUM (
  'pending',
  'in_progress',
  'completed',
  'overdue',
  'cancelled'
);

CREATE TABLE public.grant_milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grant_id UUID NOT NULL REFERENCES public.grant_details(id) ON DELETE CASCADE,
  milestone_name TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  completed_date DATE,
  status milestone_status_enum DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_milestones_grant ON grant_milestones(grant_id);
CREATE INDEX idx_milestones_status ON grant_milestones(status);
CREATE INDEX idx_milestones_due ON grant_milestones(due_date);
```

#### Table: `grant_reports`
```sql
CREATE TABLE public.grant_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grant_id UUID NOT NULL REFERENCES public.grant_details(id) ON DELETE CASCADE,
  report_period_start DATE,
  report_period_end DATE,
  due_date DATE,
  submitted_date DATE,
  report_type TEXT, -- 'interim', 'final', 'financial', 'narrative'
  document_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Views

```sql
CREATE VIEW v_grants AS
SELECT
  h.id,
  h.name,
  h.asset_type,
  h.funds_allocated,
  h.status,
  gd.grant_period_start,
  gd.grant_period_end,
  gd.grant_type,
  gd.next_report_due,
  gd.renewal_eligible,
  gd.renewal_date,
  COUNT(gm.id) FILTER (WHERE gm.status = 'completed') as milestones_completed,
  COUNT(gm.id) FILTER (WHERE gm.status IN ('pending', 'in_progress')) as milestones_pending,
  COUNT(gm.id) FILTER (WHERE gm.status = 'overdue') as milestones_overdue
FROM holdings h
INNER JOIN grant_details gd ON h.id = gd.holding_id
LEFT JOIN grant_milestones gm ON gd.id = gm.grant_id
WHERE h.asset_type IN ('foundation_grant', 'daf_grant')
GROUP BY h.id, gd.id;
```

### API Endpoints

#### `POST /api/portfolio/[id]/holdings/[holdingId]/grant-details`
Create grant details

#### `POST /api/portfolio/[id]/holdings/[holdingId]/milestones`
Add milestone

#### `PATCH /api/portfolio/[id]/milestones/[milestoneId]`
Update milestone status

#### `GET /api/portfolio/[id]/grants/pipeline`
Get grant pipeline overview

### UI Components

#### `GrantPipelineCard.tsx`
Show active/pending/completed grants

#### `GrantCalendar.tsx`
Calendar view of milestones and report deadlines

#### `MilestoneTracker.tsx`
Progress bar and checklist for grant milestones

#### `GrantDetailsPanel.tsx`
Full grant information with timeline

---

## PHASE 4: UNIFIED DASHBOARD

### Objective
Create intelligent filtering and type-specific views

### Features

#### 4.1: Asset Type Filter
Add to all portfolio-level views:
```tsx
<select value={assetTypeFilter} onChange={handleFilterChange}>
  <option value="all">All Assets</option>
  <option value="equity_investment">Equity Investments</option>
  <option value="debt_investment">Debt Investments</option>
  <option value="pri">PRIs</option>
  <option value="mri">MRIs</option>
  <option value="foundation_grant">Foundation Grants</option>
  <option value="daf_grant">DAF Grants</option>
  <option value="donation">Donations</option>
</select>
```

#### 4.2: Tabbed Dashboard
```tsx
<Tabs>
  <Tab label="All Assets" />
  <Tab label="Investments" badge={investmentCount} />
  <Tab label="Grants" badge={grantCount} />
  <Tab label="Donations" badge={donationCount} />
</Tabs>
```

#### 4.3: Type-Specific Summary Cards

**Investment Summary:**
- Total NAV, Total Distributions
- Portfolio MOIC, Unrealized Gain
- Top performers

**Grant Summary:**
- Active grants, Total deployed
- Upcoming milestones, Reports due
- Grant pipeline

**Donation Summary:**
- Total donations, Tax-deductible amount
- Carryforwards available
- Compliance score

#### 4.4: Enhanced Visualizations

**Bubble Chart:**
- Color by asset_type
- Size by funds_allocated
- Position by impact metrics

**Treemap:**
- Hierarchical: asset_type → sector → holding
- Show allocation breakdown

**Timeline:**
- Investments: funding → exit
- Grants: award → completion
- Show milestones and distributions

---

## PHASE 5: TAX INTEGRATION

### Objective
Link holdings to tax contributions, auto-populate fields

### Database Changes

```sql
ALTER TABLE tax_contributions
  ADD COLUMN holding_id UUID REFERENCES public.holdings(id);

CREATE INDEX idx_tax_contributions_holding ON tax_contributions(holding_id);
```

### Validation Function

```sql
CREATE FUNCTION validate_tax_contribution_consistency()
RETURNS TRIGGER AS $$
BEGIN
  -- If linked to holding, verify contribution_type matches asset_type
  IF NEW.holding_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM holdings h
      WHERE h.id = NEW.holding_id
      AND h.asset_type = 'equity_investment'
      AND NEW.contribution_type NOT IN ('stock', 'crypto')
    ) THEN
      RAISE EXCEPTION 'Equity investments must use stock or crypto contribution type';
    END IF;

    IF EXISTS (
      SELECT 1 FROM holdings h
      WHERE h.id = NEW.holding_id
      AND h.asset_type IN ('foundation_grant', 'daf_grant', 'donation')
      AND NEW.contribution_type NOT IN ('cash', 'check', 'wire')
    ) THEN
      RAISE EXCEPTION 'Grants and donations typically use cash contribution types';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_tax_contribution
  BEFORE INSERT OR UPDATE ON tax_contributions
  FOR EACH ROW
  EXECUTE FUNCTION validate_tax_contribution_consistency();
```

### Auto-Population Logic

```typescript
// When creating tax contribution from holding
async function createTaxContributionFromHolding(holdingId: string) {
  const holding = await getHolding(holdingId);

  const contributionTypeMap: Record<AssetType, ContributionType> = {
    equity_investment: 'stock',
    debt_investment: 'other_property',
    pri: 'other_property',
    mri: 'stock',
    foundation_grant: 'cash',
    daf_grant: 'cash',
    donation: 'cash',
    other: 'other_property',
  };

  const contribution = {
    holding_id: holdingId,
    contribution_type: contributionTypeMap[holding.asset_type] || 'other_property',
    amount_usd: holding.funds_allocated,
    cost_basis: holding.cost_basis, // From investment tracking
    fmv_at_donation: holding.current_nav, // From latest valuation
    recipient_name: holding.name,
    // ... other fields
  };

  return createTaxContribution(contribution);
}
```

### UI Integration

#### Holdings → Tax Link
```tsx
<Button onClick={() => createTaxRecord(holding)}>
  Add to Tax Tracker
</Button>
```

#### Tax Import Enhancement
Update `HoldingsImporter.tsx` to:
- Use asset_type instead of pattern matching
- Create proper holding record with correct type
- Link to tax contribution automatically

---

## SUCCESS METRICS

### Phase 1
- [ ] All asset_class references converted to asset_type
- [ ] Asset type selector in forms
- [ ] Backward compatibility maintained
- [ ] Tests passing

### Phase 2
- [ ] NAV tracking for 5+ investments
- [ ] Transaction history working
- [ ] MOIC calculations accurate
- [ ] Investment performance dashboard live

### Phase 3
- [ ] Grant details for 5+ grants
- [ ] Milestone tracking working
- [ ] Grant calendar showing deadlines
- [ ] Grant pipeline view functional

### Phase 4
- [ ] Asset type filtering on all views
- [ ] Tabbed dashboard with counts
- [ ] Type-specific summary cards
- [ ] Color-coded visualizations

### Phase 5
- [ ] Holdings linked to tax contributions
- [ ] Auto-population working
- [ ] Validation preventing mismatches
- [ ] Unified tax + holdings view

---

## TIMELINE ESTIMATE

- **Phase 1:** 1-2 days
- **Phase 2:** 2-3 days
- **Phase 3:** 2-3 days
- **Phase 4:** 1-2 days
- **Phase 5:** 1-2 days

**Total:** 7-12 days of focused development

---

## ROLLBACK PLAN

Each phase includes:
1. Database migration with DOWN function
2. Git commits after each major step
3. Feature flags for gradual rollout
4. Data backup before migrations

---

## NEXT STEPS

Execute Phase 1 systematically:
1. Create database migration
2. Update schemas
3. Update API routes
4. Update components
5. Test thoroughly
6. Commit and proceed to Phase 2
