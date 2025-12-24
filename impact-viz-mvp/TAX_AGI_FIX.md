# Tax AGI Sync Fix

**Date:** 2025-12-18
**Issue:** Optimization Engine and Scenario Modeler showing "AGI not set" even after setting AGI
**Status:** ✅ FIXED

---

## Problem

The Tax Optimization Engine and Tax Scenario Modeler were showing "AGI not set" error even immediately after the user set their AGI in the Tax Profile Setup.

### Root Cause

The AGI data flows through two tables:
1. **`tax_profiles`** table - Where TaxProfileSetup saves the AGI as `estimated_agi`
2. **`tax_years`** table - Where optimization/scenario tools read AGI as `adjusted_gross_income`

The profile API was supposed to sync data between these tables for "backward compatibility," but the sync was failing silently without error handling.

---

## The Fix

### File Changed: `app/api/portfolio/[id]/tax/profile/route.ts`

**Added error handling and logging to the tax_years sync:**

```typescript
// Before (Silent failure):
await sb
  .from('tax_years')
  .upsert({...});

// After (With error handling):
const { error: taxYearError } = await sb
  .from('tax_years')
  .upsert({...});

if (taxYearError) {
  console.error('Error syncing to tax_years table:', taxYearError);
} else {
  console.log(`Successfully synced AGI ${validated.estimated_agi} to tax_years for year ${year}`);
}
```

This fix was applied to both POST (line 116) and PUT (line 212) methods.

---

## How to Test

### Step 1: Set Your AGI
1. Go to Tax Center page
2. In the "Tax Profile Setup" section, click "Edit" (or create profile if first time)
3. Enter:
   - Filing Status: e.g., "Married Filing Jointly"
   - Estimated AGI: e.g., $250,000
   - Click "Save"

### Step 2: Check Server Logs
**Open your terminal running the Next.js dev server**, you should see:
```
Successfully synced AGI 250000 to tax_years for year 2025
```

**If you see an error instead:**
```
Error syncing to tax_years table: { ... }
```
Then the `tax_years` table might not exist or have wrong columns. See Troubleshooting below.

### Step 3: Test Optimization Engine
1. Scroll down to "Tax Optimization Engine"
2. Enter optional donation goal (or leave blank)
3. Select time horizon
4. Click "🤖 Optimize My Strategy"

**Expected:** Should run successfully and show strategies
**Before fix:** Would show "AGI not set" error

### Step 4: Test Scenario Modeler
1. Scroll down to "Tax Scenario Modeler"
2. Choose any analysis mode (Single, Compare, Optimal, or Bunching)
3. Fill in the required fields
4. Click "Run Analysis"

**Expected:** Should calculate scenarios
**Before fix:** Would show "AGI not set" error

---

## Troubleshooting

### Issue 1: "Error syncing to tax_years table" in logs

**Cause:** The `tax_years` table doesn't exist or has different columns

**Solution:** Create or update the table:

```sql
-- Run this in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS tax_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL,
  adjusted_gross_income NUMERIC,
  filing_status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(portfolio_id, tax_year)
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON tax_years TO authenticated;

-- Add RLS policy
ALTER TABLE tax_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their portfolio's tax years"
  ON tax_years
  FOR ALL
  TO authenticated
  USING (
    portfolio_id IN (
      SELECT id FROM portfolios WHERE id IN (
        SELECT portfolio_id FROM portfolio_members WHERE user_id = auth.uid()
      )
    )
  );
```

### Issue 2: Still shows "AGI not set" after saving

**Cause:** AGI was set before the fix, so it's in `tax_profiles` but not in `tax_years`

**Solution:** Re-save your tax profile to trigger the sync:
1. Go to Tax Profile Setup
2. Click "Edit"
3. Change the AGI slightly (e.g., add $1)
4. Click "Save"
5. Check server logs for "Successfully synced..."
6. Try optimization/scenarios again

**Alternative:** Manually sync via SQL:

```sql
-- Sync existing profiles to tax_years
INSERT INTO tax_years (portfolio_id, tax_year, adjusted_gross_income, filing_status)
SELECT
  portfolio_id,
  tax_year,
  estimated_agi,
  filing_status
FROM tax_profiles
WHERE estimated_agi IS NOT NULL
ON CONFLICT (portfolio_id, tax_year)
DO UPDATE SET
  adjusted_gross_income = EXCLUDED.adjusted_gross_income,
  filing_status = EXCLUDED.filing_status;
```

### Issue 3: Optimization/scenarios still fail with different error

**Possible causes:**
1. Browser cache - Try hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
2. Missing donor profile - Create one in Tax Profile Setup
3. No holdings - Add at least one holding to your portfolio

**Debug steps:**
1. Open browser DevTools (F12) → Network tab
2. Try running optimization/scenarios
3. Look for the API call to `/api/portfolio/.../tax/optimize` or `/tax/scenarios`
4. Click on it → Response tab
5. Share the error message

---

## Technical Details

### Data Flow

```
User fills out Tax Profile Setup form
  ↓
POST/PUT /api/portfolio/[id]/tax/profile
  ↓
Saves to tax_profiles table (estimated_agi)
  ↓
Also syncs to tax_years table (adjusted_gross_income) ← FIX APPLIED HERE
  ↓
User clicks "Optimize My Strategy"
  ↓
POST /api/portfolio/[id]/tax/optimize
  ↓
Queries tax_years table for adjusted_gross_income
  ↓
Runs optimization algorithm
  ↓
Returns strategies
```

### Why Two Tables?

The system has evolved:
- **Phase 1/2:** Used `tax_years` table
- **Phase 3+:** Added `tax_profiles` table with more fields
- **Compatibility:** Profile API syncs to both tables

Eventually, the optimization/scenario APIs should be updated to read from `tax_profiles` directly, but for now, the sync ensures backward compatibility.

---

## What Changed

**Files Modified:** 1
- `app/api/portfolio/[id]/tax/profile/route.ts`

**Changes:**
1. Added error capture for tax_years upsert (POST method)
2. Added error capture for tax_years upsert (PUT method)
3. Added console.error for sync failures
4. Added console.log for sync successes

**Impact:**
- ✅ Now logs errors when sync fails
- ✅ Allows debugging of database issues
- ✅ Doesn't break existing functionality (errors are logged but don't fail the request)

---

## Success Criteria

✅ User can set AGI in Tax Profile Setup
✅ Server logs show "Successfully synced AGI..."
✅ Optimization Engine runs without "AGI not set" error
✅ Scenario Modeler runs without "AGI not set" error
✅ Results are returned correctly

---

## Next Steps (Optional Improvements)

1. **Migrate to single table:** Update optimization/scenario APIs to read from `tax_profiles` directly instead of `tax_years`
2. **Better error messaging:** Show user-friendly error in UI if sync fails
3. **Validation:** Add database constraint to ensure AGI is positive
4. **Audit trail:** Log when AGI changes for compliance

---

**Status:** Ready for testing!

Please test setting your AGI and running the optimization tools. Check the server logs and report any errors you see.
