# Tax Fields Enhancement Blueprint

**Date**: November 30, 2025
**Priority**: MEDIUM
**Estimated Effort**: 1-2 hours
**Status**: 🔄 In Progress

---

## Problem Statement

**Current State**: Tax export route hardcodes `qcd_qualified: false` because the field doesn't exist in the database
**Files Affected**:
- `app/api/portfolio/[id]/tax/export/route.ts:199` - TXF export
- `app/api/portfolio/[id]/tax/export/route.ts:237` - Form 8283 export

**Impact**: MEDIUM - Affects tax form accuracy for Qualified Charitable Distributions (QCDs)
- Cannot track QCDs from IRA distributions (age 70½+)
- Missing important tax optimization opportunities
- Incorrect TurboTax import data

---

## Solution Overview

Add `qcd_qualified` field to track Qualified Charitable Distributions (QCDs).

**What is a QCD?**
- Qualified Charitable Distribution from IRA
- Available to donors age 70½ or older
- Counts toward Required Minimum Distribution (RMD)
- Excluded from taxable income (better than deduction)
- Limited to $100,000 per year (as of 2024)
- Must go directly from IRA to qualified charity

**Why This Matters:**
- QCDs provide better tax treatment than standard deductions
- For donors 70½+, QCDs can satisfy RMD without increasing AGI
- Important for high-net-worth donors with large IRAs

---

## Discovery: requires_appraisal Already Exists! ✅

Good news: After reviewing the database schema, `requires_appraisal` already exists in `tax_contributions` table (line 54 of db/0013_tax_tracking.sql).

**What We Found:**
- ✅ `requires_appraisal BOOLEAN DEFAULT false` exists in database
- ✅ Schema validation already exists (line 113 of lib/schemas/tax.ts)
- ✅ Auto-calculation logic exists (lines 146-160 of lib/schemas/tax.ts)

**What's Missing:**
- ❌ `qcd_qualified` field doesn't exist in database
- ❌ `qcd_qualified` field doesn't exist in schema
- ❌ Export routes hardcode false values

**Revised Scope:**
- Add `qcd_qualified` field only
- Update exports to use real `requires_appraisal` from database
- Add QCD eligibility helpers

---

## Implementation Plan

### Step 1: Database Migration
**File**: `db/0022_tax_enhancements.sql` (NEW)

Add `qcd_qualified` column to `tax_contributions` table:

```sql
-- Add QCD tracking field
ALTER TABLE tax_contributions
ADD COLUMN IF NOT EXISTS qcd_qualified BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN tax_contributions.qcd_qualified IS
  'Qualified Charitable Distribution (age 70½+, from IRA)';

-- Add index for QCD queries
CREATE INDEX IF NOT EXISTS idx_tax_contributions_qcd
  ON tax_contributions(portfolio_id, tax_year)
  WHERE qcd_qualified = true;
```

**Why an index?**
- QCD tracking queries will filter by `qcd_qualified = true`
- Partial index is efficient (only indexes true values)
- Speeds up QCD summary calculations

### Step 2: Update Zod Schema
**File**: `lib/schemas/tax.ts`

Add `qcd_qualified` to base schema:

```typescript
const baseTaxContributionSchema = z.object({
  // ... existing fields ...

  // QCD (Qualified Charitable Distribution)
  qcd_qualified: z.boolean().default(false).optional(),

  // Appraisal (already exists)
  requires_appraisal: z.boolean().default(false).optional(),
  // ... rest of appraisal fields ...
});
```

Add validation rule for QCD:

```typescript
export const createTaxContributionSchema = baseTaxContributionSchema
  .refine(/* existing FMV validation */)
  .refine(/* existing appraisal validation */)
  .refine(
    (data) => {
      // QCDs can only be cash/check/wire from IRA
      if (data.qcd_qualified) {
        return ['cash', 'check', 'wire'].includes(data.contribution_type);
      }
      return true;
    },
    {
      message: 'QCDs must be cash contributions (from IRA)',
      path: ['qcd_qualified'],
    }
  );
```

### Step 3: Add QCD Helper Functions
**File**: `lib/schemas/tax.ts` (append to existing helpers)

```typescript
/**
 * Helper: Calculate QCD limit and available amount
 * Annual limit is $100,000 per individual (2024)
 */
export function calculateQCDLimit(
  year: number = 2024,
  filingStatus: DonorFilingStatus,
): {
  limit: number;
  perIndividual: number;
} {
  const perIndividual = 100000; // IRS limit as of 2024

  // For married filing jointly, each spouse has separate $100k limit
  const limit = filingStatus === 'married_filing_jointly'
    ? perIndividual * 2
    : perIndividual;

  return { limit, perIndividual };
}

/**
 * Helper: Calculate QCD tax benefit
 * QCDs reduce AGI directly (better than deduction)
 */
export function calculateQCDBenefit(
  qcdAmount: number,
  marginalTaxRate: number,
): {
  agiReduction: number;
  taxSavings: number;
  rmdSatisfied: number;
} {
  return {
    agiReduction: qcdAmount, // Full amount reduces AGI
    taxSavings: qcdAmount * marginalTaxRate, // Estimated tax savings
    rmdSatisfied: qcdAmount, // Counts toward RMD
  };
}

/**
 * Helper: Validate QCD eligibility and amount
 */
export function validateQCD(
  contribution: {
    qcd_qualified: boolean;
    contribution_type: string;
    amount_usd: number;
    contribution_date: string;
  },
  donorDateOfBirth?: string | null,
  yearToDateQCDs: number = 0,
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!contribution.qcd_qualified) {
    return { valid: true, errors, warnings };
  }

  // Check contribution type
  if (!['cash', 'check', 'wire'].includes(contribution.contribution_type)) {
    errors.push('QCDs must be cash contributions from IRA');
  }

  // Check age eligibility
  if (donorDateOfBirth) {
    const eligibility = isQCDEligible(donorDateOfBirth, contribution.contribution_date);
    if (!eligibility.eligible) {
      errors.push(eligibility.reason || 'Donor must be 70½ or older for QCDs');
    }
  } else {
    warnings.push('Cannot verify age eligibility without date of birth');
  }

  // Check annual limit
  const totalQCDs = yearToDateQCDs + contribution.amount_usd;
  if (totalQCDs > 100000) {
    errors.push(`QCD limit exceeded: $${totalQCDs.toLocaleString()} (limit: $100,000/year)`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
```

### Step 4: Update Export Routes
**File**: `app/api/portfolio/[id]/tax/export/route.ts`

**Change 1: TXF Export (line 199)**
```typescript
// Before:
qcd_qualified: false, // TODO: Add qcd_qualified field to contribution

// After:
qcd_qualified: c.qcd_qualified ?? false,
```

**Change 2: Form 8283 Export (line 237-238)**
```typescript
// Before:
qcd_qualified: false,
requires_appraisal: false,

// After:
qcd_qualified: c.qcd_qualified ?? false,
requires_appraisal: c.requires_appraisal ?? false,
```

### Step 5: Update Database Views (if needed)
Check if views need updating to include `qcd_qualified`:

**View to check**: `v_tax_contributions_with_limits`

If view doesn't include `qcd_qualified`, add it:
```sql
ALTER VIEW v_tax_contributions_with_limits AS
SELECT
  tc.*,
  tc.qcd_qualified, -- Add this line if missing
  -- ... rest of view
FROM tax_contributions tc
-- ... rest of view
```

---

## Testing Plan

### Database Migration Test
```sql
-- After running migration
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'tax_contributions'
  AND column_name IN ('qcd_qualified', 'requires_appraisal');

-- Expected:
-- qcd_qualified | boolean | false
-- requires_appraisal | boolean | false
```

### Schema Validation Tests

**Test 1: QCD with cash contribution (valid)**
```typescript
const contribution = {
  qcd_qualified: true,
  contribution_type: 'cash',
  amount_usd: 50000,
};
// Should pass validation
```

**Test 2: QCD with stock contribution (invalid)**
```typescript
const contribution = {
  qcd_qualified: true,
  contribution_type: 'stock', // ERROR: QCDs must be cash
  amount_usd: 50000,
};
// Should fail validation
```

**Test 3: QCD age eligibility**
```typescript
const dob = '1950-01-01'; // 74 years old
const contributionDate = '2024-06-15';

const eligibility = isQCDEligible(dob, contributionDate);
// Should return { eligible: true, age: 74.x }
```

**Test 4: QCD limit check**
```typescript
const contribution = { qcd_qualified: true, amount_usd: 120000 };
const ytdQCDs = 0;

const validation = validateQCD(contribution, '1950-01-01', ytdQCDs);
// Should return errors: ['QCD limit exceeded: $120,000 (limit: $100,000/year)']
```

### Export Test
```bash
# Test TXF export with QCD
GET /api/portfolio/{id}/tax/export?year=2024&format=txf

# Verify output includes:
# qcd_qualified: true (for actual QCD contributions)
# requires_appraisal: true (for contributions > $5,000)
```

---

## Files to Modify

### New Files
1. **db/0022_tax_enhancements.sql** - Database migration

### Modified Files
1. **lib/schemas/tax.ts** - Add `qcd_qualified` field and helpers
2. **app/api/portfolio/[id]/tax/export/route.ts** - Use real field values

---

## Data Migration Strategy

**No data migration needed!**
- New `qcd_qualified` column defaults to `false`
- Existing contributions remain unchanged
- Users can manually update contributions to mark QCDs

**Future Enhancement:**
Add UI to mark contributions as QCDs:
- Checkbox: "This is a Qualified Charitable Distribution"
- Show warning if donor under 70½
- Show YTD QCD total and remaining limit

---

## Impact Analysis

### Before Enhancement
```typescript
// Export always hardcodes false
qcd_qualified: false, // Incorrect for actual QCDs
requires_appraisal: false, // Incorrect for large donations
```

### After Enhancement
```typescript
// Export uses real database values
qcd_qualified: c.qcd_qualified ?? false, // Accurate
requires_appraisal: c.requires_appraisal ?? false, // Accurate (already in DB!)
```

### User Benefits
1. **Accurate Tax Forms**
   - TurboTax import reflects actual QCD status
   - Form 8283 shows correct appraisal requirements

2. **Better Tax Planning**
   - Track QCDs separately from standard donations
   - Monitor $100k annual QCD limit
   - Optimize RMD satisfaction

3. **Age-Based Guidance**
   - System validates donor age for QCDs
   - Warns when marking QCD for ineligible donor
   - Calculates tax benefits automatically

---

## Success Criteria

- [ ] `qcd_qualified` column exists in database
- [ ] Column has proper index for queries
- [ ] Zod schema includes `qcd_qualified` with validation
- [ ] QCD helper functions work correctly
- [ ] Export routes use real `qcd_qualified` values
- [ ] Export routes use real `requires_appraisal` values
- [ ] TypeScript compiles with no errors
- [ ] All tests pass

---

## Rollout Strategy

### Phase 1: Database & Schema (This Session)
1. Create migration file
2. Update Zod schema
3. Add helper functions
4. Update export routes

### Phase 2: UI Enhancement (Future)
1. Add QCD checkbox to contribution form
2. Show age eligibility warning
3. Display YTD QCD total
4. Add QCD filter to tax overview

### Phase 3: Reporting (Future)
1. QCD summary report
2. RMD satisfaction tracking
3. QCD vs standard deduction comparison

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Breaking existing exports | Low | Medium | Test thoroughly before deploy |
| Invalid QCD marking | Medium | Low | Add validation and warnings |
| Migration fails | Low | High | Test migration on dev DB first |

---

## Next Steps

1. ✅ Create blueprint (this document)
2. ⏳ Create database migration
3. ⏳ Update Zod schema
4. ⏳ Add helper functions
5. ⏳ Update export routes
6. ⏳ Test everything
7. ⏳ Update documentation

---

## Notes

**Key Insight:** `requires_appraisal` already exists in the database!
- We only need to fix the export routes to use the real value
- This is a simpler implementation than originally planned

**QCD Context:**
- QCDs are powerful tax optimization tool for retirees
- Direct IRA-to-charity transfers avoid income taxation
- Better than standard deduction for high-income donors
- Critical for Required Minimum Distribution (RMD) planning

**References:**
- IRS Publication 590-B (Distributions from IRAs)
- IRS QCD FAQs: https://www.irs.gov/retirement-plans/retirement-plans-faqs-regarding-iras-distributions-withdrawals
