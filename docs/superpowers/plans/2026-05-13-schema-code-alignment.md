# Schema / Code Alignment — Foundation Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align all application code with the canonical `db/migrations` schema so every route, function call, and column reference works against a clean database.

**Architecture:** Three categories of fix: (1) wrong RPC function names called from TypeScript (`org_role`, `is_admin`, `p_module_id`); (2) wrong column name `organization_id` in legacy pages and donor components; (3) missing DB objects needed by running code (`receipt_status` column, `reporting→reports` module alias). Each task is independent and can be verified by TypeScript compilation + the contract test suite.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + RLS), TypeScript, Vitest, PostgreSQL migrations.

**Out of scope (separate plans required):** `organization_holdings` (product decision), grant lifecycle tables (gap #4), rich compliance schema (gap #5), tax/reporting/import/metrics tables (gap #7). These require design decisions before they can be planned.

**Before you start:** The canonical schema reference is `db/migrations`. When in doubt about a column or function name, read the relevant migration file. Key invariants:
- All org-scoped tables: `org_id` (NOT `organization_id`)
- Role lookup: `user_org_role(p_org_id uuid)` (NOT `org_role`)
- Member check: `can_view_org(p_org_id uuid)` (NOT `is_org_member`)
- App-level admin: `is_app_admin()` (NOT `is_admin`)
- Module check parameter: `p_module` (NOT `p_module_id`)

---

## Files Modified

| File | Change |
|------|--------|
| `db/migrations/0039_alignment_fixes.sql` | Create: `receipt_status` column + `reporting→reports` module alias |
| `app/api/org/[orgId]/compliance/dashboard/route.ts` | Fix `p_module_id` → `p_module` |
| `app/api/org/[orgId]/route.ts` | Fix `org_role` → `user_org_role` |
| `app/api/org/[orgId]/metrics/route.ts` | Fix `org_role`, `organization_id` |
| `app/api/org/[orgId]/dashboard/route.ts` | Fix `org_role` |
| `app/api/org/[orgId]/members/route.ts` | Fix `org_role` |
| `app/api/org/[orgId]/modules/route.ts` | Fix `org_role` ×2 |
| `app/api/org/[orgId]/acknowledgments/route.ts` | Fix `org_role` |
| `app/api/org/[orgId]/donors/route.ts` | Fix `org_role` |
| `app/api/org/[orgId]/donors/[donorId]/route.ts` | Fix `org_role` |
| `app/api/org/[orgId]/contributions/route.ts` | Fix `org_role` |
| `app/api/org/[orgId]/contributions/[id]/route.ts` | Fix `org_role` |
| `app/api/org/[orgId]/contributions/[id]/receipt/route.ts` | Fix `org_role` |
| `app/api/org/[orgId]/compliance/filing-calendar/route.ts` | Fix `org_role` |
| `app/api/org/[orgId]/compliance/state-registrations/route.ts` | Fix `org_role` |
| `app/api/org/[orgId]/pledges/route.ts` | Fix `org_role` |
| `app/api/org/[orgId]/pledges/[pledgeId]/route.ts` | Fix `org_role` |
| `app/api/org/[orgId]/pledges/[pledgeId]/cancel/route.ts` | Fix `org_role` |
| `app/api/org/[orgId]/pledges/[pledgeId]/installments/[installmentId]/route.ts` | Fix `org_role` |
| `app/admin/console/page.tsx` | Fix `is_admin` → `is_app_admin` |
| `app/admin/constructor/page.tsx` | Fix `is_admin` |
| `app/admin/imports/page.tsx` | Fix `is_admin` |
| `app/admin/imports/[id]/page.tsx` | Fix `is_admin` |
| `app/admin/imports/[id]/mapping/page.tsx` | Fix `is_admin` |
| `app/admin/portfolios/[id]/members/page.tsx` | Fix `is_admin` |
| `app/api/admin/demo/load/route.ts` | Fix `is_admin` |
| `app/api/admin/portfolios/[id]/settings/route.ts` | Fix `is_admin` |
| `app/org/[orgId]/settings/page.tsx` | Fix `org_role`, `organization_id` |
| `app/org/[orgId]/members/page.tsx` | Fix `org_role`, `organization_id` ×2 |
| `app/org/[orgId]/data/page.tsx` | Fix `org_role`, `organization_id` |
| `app/org/[orgId]/receipts/page.tsx` | Fix `organization_id` |
| `app/org/[orgId]/donors/[donorId]/page.tsx` | Fix `organization_id` |
| `app/org/[orgId]/acknowledgments/page.tsx` | Fix `organization_id` |
| `app/org/[orgId]/contributions/page.tsx` | Fix `organization_id` |
| `components/donors/DonorList.tsx` | Fix `organization_id`, `donor_type` |
| `components/donors/DonorDetail.tsx` | Fix `organization_id`, `donor_type`, `contribution_type`, `receipt_status` |
| `components/donors/ContributionForm.tsx` | Fix `organization_id`, `donor_type`, `contribution_type` |
| `components/donors/ReceiptGenerator.tsx` | Fix `donor_type`, `contribution_type`, `receipt_status` |
| `app/api/org/[orgId]/donors/__tests__/column-contract.test.ts` | Extend contract tests |

---

## Task 1: Migration — `receipt_status` column + `reporting→reports` module alias

**Files:**
- Create: `db/migrations/0039_alignment_fixes.sql`

- [ ] **Step 1: Verify `contributions_received` has no `receipt_status` column**

```bash
grep -n "receipt_status" /Users/teddyhickenlooper/Desktop/benevolence-product/db/migrations/0014_donors.sql
```

Expected: no output (column does not exist yet).

- [ ] **Step 2: Verify `org_has_module` has no `reporting` alias**

```bash
grep -n "reporting" /Users/teddyhickenlooper/Desktop/benevolence-product/db/migrations/0038_pledge_tracking.sql
```

Expected: no output (alias does not exist yet).

- [ ] **Step 3: Create migration file**

Create `db/migrations/0039_alignment_fixes.sql`:

```sql
-- =============================================================================
-- 0039_alignment_fixes.sql
-- Two surgical schema fixes:
-- 1. Add receipt_status to contributions_received (legacy donor components need it)
-- 2. Add reporting→reports alias to org_has_module (TypeScript module key mismatch)
-- Depends on: 0014, 0038
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add receipt_status to contributions_received
-- ---------------------------------------------------------------------------
ALTER TABLE public.contributions_received
  ADD COLUMN IF NOT EXISTS receipt_status text NOT NULL DEFAULT 'pending'
    CHECK (receipt_status IN ('pending', 'generated', 'sent'));

-- Back-fill: any row with acknowledgment_sent=true → 'sent', acknowledged_at set → 'generated'
UPDATE public.contributions_received SET receipt_status = 'sent'  WHERE acknowledgment_sent = true;
UPDATE public.contributions_received SET receipt_status = 'generated'
  WHERE acknowledgment_sent = false AND acknowledged_at IS NOT NULL AND receipt_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_contributions_received_receipt_status
  ON public.contributions_received (org_id, receipt_status)
  WHERE receipt_status != 'sent';

-- ---------------------------------------------------------------------------
-- 2. Extend org_has_module to alias TypeScript 'reporting' → DB 'reports'
--    and 'core' → 'portfolio' (belt-and-suspenders for future callers)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.org_has_module(p_org_id uuid, p_module text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (modules->>(
        CASE p_module
          WHEN 'pledge_tracking'       THEN 'pledges'
          WHEN 'donor_management'      THEN 'donors'
          WHEN 'tax_optimization'      THEN 'tax'
          WHEN 'compliance_regulatory' THEN 'compliance'
          WHEN 'reporting'             THEN 'reports'
          WHEN 'core'                  THEN 'portfolio'
          ELSE p_module
        END
      ))::boolean
      FROM organizations
      WHERE id = p_org_id
    ),
    false
  );
$$;
```

- [ ] **Step 4: Verify the file was written correctly**

```bash
grep -n "reporting\|receipt_status\|reporting.*reports" db/migrations/0039_alignment_fixes.sql
```

Expected output (3 lines):
```
<line>:  ADD COLUMN IF NOT EXISTS receipt_status text NOT NULL DEFAULT 'pending'
<line>:  CHECK (receipt_status IN ('pending', 'generated', 'sent'));
<line>:          WHEN 'reporting'             THEN 'reports'
```

- [ ] **Step 5: TypeScript compile check**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors (migration is SQL only, no TS changes).

- [ ] **Step 6: Commit**

```bash
git add db/migrations/0039_alignment_fixes.sql
git commit -m "fix: add receipt_status column and reporting→reports module alias"
```

---

## Task 2: Fix `p_module_id` → `p_module` in compliance dashboard route

**Files:**
- Modify: `app/api/org/[orgId]/compliance/dashboard/route.ts`

The `org_has_module` function signature is `(p_org_id uuid, p_module text)`. This route calls it with `p_module_id` which silently passes null, making the module check always return false.

- [ ] **Step 1: Verify the wrong parameter name**

```bash
grep -n "p_module" "app/api/org/[orgId]/compliance/dashboard/route.ts"
```

Expected:
```
59:      p_module_id: 'compliance_regulatory',
```

- [ ] **Step 2: Fix the parameter name**

In `app/api/org/[orgId]/compliance/dashboard/route.ts`, find:
```typescript
    const { data: hasModule } = await sb.rpc('org_has_module', {
      p_org_id: orgId,
      p_module_id: 'compliance_regulatory',
    });
```

Replace with:
```typescript
    const { data: hasModule } = await sb.rpc('org_has_module', {
      p_org_id: orgId,
      p_module: 'compliance_regulatory',
    });
```

- [ ] **Step 3: Verify fix**

```bash
grep -n "p_module" "app/api/org/[orgId]/compliance/dashboard/route.ts"
```

Expected:
```
59:      p_module: 'compliance_regulatory',
```

- [ ] **Step 4: TypeScript compile**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add "app/api/org/[orgId]/compliance/dashboard/route.ts"
git commit -m "fix: org_has_module parameter p_module_id → p_module in compliance dashboard"
```

---

## Task 3: Fix `org_role` → `user_org_role` across all routes

**Files:** 19 route and page files (listed in Files Modified table above)

The DB function `org_role` does not exist in active migrations. The correct function is `user_org_role(p_org_id uuid)` with the same parameter name and same return type (`member_role_enum`). This is a pure string substitution — the parameter name and usage pattern do not change.

- [ ] **Step 1: Verify total count of occurrences**

```bash
grep -rn "rpc[('\"]org_role['\"]" app/ --include="*.ts" --include="*.tsx" | wc -l
```

Expected: 20–22 lines (the exact count from the alignment sweep). Note one file that correctly uses `user_org_role` already: `app/api/org/[orgId]/members/[userId]/notifications/route.ts` — that one must NOT be touched.

- [ ] **Step 2: Confirm which files are affected**

```bash
grep -rln "rpc[('\"]org_role['\"]" app/ --include="*.ts" --include="*.tsx"
```

Verify this matches the 19 files in the Files Modified table. Investigate any unexpected files before proceeding.

- [ ] **Step 3: Apply the rename (single quotes)**

```bash
find app -name "*.ts" -o -name "*.tsx" | xargs sed -i "s/rpc('org_role',/rpc('user_org_role',/g"
```

- [ ] **Step 4: Apply the rename (double quotes)**

```bash
find app -name "*.ts" -o -name "*.tsx" | xargs sed -i 's/rpc("org_role",/rpc("user_org_role",/g'
```

- [ ] **Step 5: Verify zero remaining occurrences**

```bash
grep -rn "rpc[('\"]org_role['\"]" app/ --include="*.ts" --include="*.tsx"
```

Expected: no output.

- [ ] **Step 6: Verify the correct function name is now present everywhere it should be**

```bash
grep -rn "user_org_role" app/ --include="*.ts" --include="*.tsx" | wc -l
```

Expected: 20–22 lines (same count as before).

- [ ] **Step 7: TypeScript compile**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add app/
git commit -m "fix: rename org_role → user_org_role in all API routes and pages"
```

---

## Task 4: Fix `is_admin` → `is_app_admin` in admin pages and API routes

**Files:** 8 admin page and route files (listed in Files Modified table)

The DB function `is_admin` does not exist. Migration `0023_admin_superuser_policies.sql` defines `is_app_admin()` (no arguments). The usage pattern changes slightly: `supabase.rpc('is_admin')` → `supabase.rpc('is_app_admin')`.

- [ ] **Step 1: Verify total occurrences**

```bash
grep -rn "rpc('is_admin')" app/ --include="*.ts" --include="*.tsx"
```

Expected: 8 lines across `app/admin/` and `app/api/admin/`.

- [ ] **Step 2: Apply the rename**

```bash
find app -name "*.ts" -o -name "*.tsx" | xargs sed -i "s/rpc('is_admin')/rpc('is_app_admin')/g"
```

- [ ] **Step 3: Verify zero remaining occurrences**

```bash
grep -rn "rpc('is_admin')" app/ --include="*.ts" --include="*.tsx"
```

Expected: no output.

- [ ] **Step 4: Verify replacement is in place**

```bash
grep -rn "rpc('is_app_admin')" app/ --include="*.ts" --include="*.tsx" | wc -l
```

Expected: 8 lines.

- [ ] **Step 5: TypeScript compile**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add app/
git commit -m "fix: rename is_admin → is_app_admin in all admin pages and API routes"
```

---

## Task 5: Fix `organization_id` → `org_id` in legacy `app/org/` pages

**Files:** 7 files under `app/org/[orgId]/`

These pages query `organization_members` and other org-scoped tables using the wrong column name `organization_id`. The active migration (`0002_organizations.sql`) defines the column as `org_id`.

- [ ] **Step 1: Verify current wrong pattern in each file**

```bash
grep -rn "organization_id" app/org/ --include="*.ts" --include="*.tsx"
```

Expected output — confirm these 8 occurrences across 7 files:
- `settings/page.tsx`: lines selecting and filtering `organization_id`
- `members/page.tsx`: `organization_id` in SELECT list and `.eq("organization_id", orgId)` 
- `receipts/page.tsx`: `.eq('organization_id', organizationId)`
- `donors/[donorId]/page.tsx`: `.eq('organization_id', organizationId)`
- `acknowledgments/page.tsx`: `.eq('organization_id', organizationId)`
- `data/page.tsx`: `.eq("organization_id", orgId)`
- `contributions/page.tsx`: `.eq('organization_id', organizationId)`

- [ ] **Step 2: Apply fix across all org pages**

```bash
find app/org -name "*.ts" -o -name "*.tsx" | xargs sed -i "s/organization_id/org_id/g"
```

- [ ] **Step 3: Verify zero remaining occurrences**

```bash
grep -rn "organization_id" app/org/ --include="*.ts" --include="*.tsx"
```

Expected: no output.

- [ ] **Step 4: Check members page — the SELECT list also needs `org_id`**

Read `app/org/[orgId]/members/page.tsx` and verify the `select()` call now reads:
```typescript
    .select(`
      user_id,
      org_id,
      role,
      added_at,
      profiles:user_id (display_name)
    `)
    .eq("org_id", orgId)
```

If `added_at` appears, note that `organization_members` uses `created_at` not `added_at` (per migration 0002). Fix that too:
```bash
sed -i "s/added_at/created_at/g" "app/org/[orgId]/members/page.tsx"
```

- [ ] **Step 5: Also fix `org_role` in the three org pages that use it**

```bash
grep -rn "rpc.*org_role" app/org/ --include="*.ts" --include="*.tsx"
```

If any remain (they should have been caught in Task 3), fix them:
```bash
find app/org -name "*.ts" -o -name "*.tsx" | xargs sed -i "s/rpc('org_role'/rpc('user_org_role'/g"
find app/org -name "*.ts" -o -name "*.tsx" | xargs sed -i 's/rpc("org_role"/rpc("user_org_role"/g'
```

- [ ] **Step 6: Also fix `organization_id` in `app/api/org/[orgId]/metrics/route.ts`**

```bash
grep -n "organization_id" "app/api/org/[orgId]/metrics/route.ts"
```

Expected: line 90 `.eq("organization_id", orgId)`. Fix:
```bash
sed -i 's/\.eq("organization_id", orgId)/\.eq("org_id", orgId)/g' "app/api/org/[orgId]/metrics/route.ts"
```

Verify:
```bash
grep -n "org_id\|organization_id" "app/api/org/[orgId]/metrics/route.ts"
```

Expected: only `org_id` references.

- [ ] **Step 7: TypeScript compile**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add app/org/ "app/api/org/[orgId]/metrics/route.ts"
git commit -m "fix: organization_id → org_id in legacy org pages and metrics route"
```

---

## Task 6: Fix donor component field names

**Files:** 4 files in `components/donors/`

The `donors` table uses `is_organization boolean` (not `donor_type text`), `org_id` (not `organization_id`). The `contributions_received` table uses `gift_type` (not `contribution_type`) and now has `receipt_status` (added in Task 1 migration).

### 6a — DonorList.tsx

- [ ] **Step 1: Read the current interface and query**

```bash
grep -n "donor_type\|organization_id\|is_organization" components/donors/DonorList.tsx
```

Expected:
```
8:  donor_type: string;
50:        .eq('organization_id', organizationId)
79:      filtered = filtered.filter(d => d.donor_type === donorTypeFilter);
321:                      <span className="text-sm text-gray-600 capitalize">{donor.donor_type}</span>
```

- [ ] **Step 2: Update the Donor interface**

In `components/donors/DonorList.tsx`, find:
```typescript
  donor_type: string;
```
Replace with:
```typescript
  is_organization: boolean;
```

- [ ] **Step 3: Fix the query column**

Find:
```typescript
        .eq('organization_id', organizationId)
```
Replace with:
```typescript
        .eq('org_id', organizationId)
```

- [ ] **Step 4: Fix donor_type filter logic**

Find:
```typescript
      filtered = filtered.filter(d => d.donor_type === donorTypeFilter);
```
Replace with:
```typescript
      filtered = filtered.filter(d =>
        donorTypeFilter === 'individual' ? !d.is_organization : d.is_organization
      );
```

- [ ] **Step 5: Fix donor_type display**

Find:
```typescript
                      <span className="text-sm text-gray-600 capitalize">{donor.donor_type}</span>
```
Replace with:
```typescript
                      <span className="text-sm text-gray-600 capitalize">{donor.is_organization ? 'Organization' : 'Individual'}</span>
```

- [ ] **Step 6: Compile check for this file**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx tsc --noEmit 2>&1 | grep "DonorList" | head -10
```

Expected: no errors for DonorList.tsx.

### 6b — DonorDetail.tsx

- [ ] **Step 7: Read current interface fields**

```bash
grep -n "donor_type\|contribution_type\|receipt_status\|organization_id" components/donors/DonorDetail.tsx
```

Expected (8 occurrences across interfaces and usage).

- [ ] **Step 8: Fix Donor interface**

In `components/donors/DonorDetail.tsx`, find:
```typescript
  donor_type: string;
```
Replace with:
```typescript
  is_organization: boolean;
```

- [ ] **Step 9: Fix Contribution interface**

Find:
```typescript
  contribution_type: string;
```
Replace with:
```typescript
  gift_type: string;
```

- [ ] **Step 10: Fix the donors query**

Find:
```typescript
          .eq('organization_id', organizationId)
```
Replace with:
```typescript
          .eq('org_id', organizationId)
```

- [ ] **Step 11: Fix donor_type display logic**

Find:
```typescript
  const displayName = donor.donor_type === 'individual'
```
Replace with:
```typescript
  const displayName = !donor.is_organization
```

Find (the badge display):
```typescript
                {donor.donor_type}
```
Replace with:
```typescript
                {donor.is_organization ? 'Organization' : 'Individual'}
```

- [ ] **Step 12: Fix contribution_type table cell**

Find:
```typescript
                      <td className="px-4 py-3 text-sm capitalize">{contrib.contribution_type.replace('_', ' ')}</td>
```
Replace with:
```typescript
                      <td className="px-4 py-3 text-sm capitalize">{contrib.gift_type.replace('_', ' ')}</td>
```

- [ ] **Step 13: Fix receipt_status cell (leave display logic, column name now exists)**

The `receipt_status` cell uses `contrib.receipt_status` — the column now exists after Task 1 migration. Verify it's referenced correctly by checking:
```bash
grep -n "receipt_status" components/donors/DonorDetail.tsx
```

No change needed to the logic here — the column is now canonical.

- [ ] **Step 14: Compile check**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx tsc --noEmit 2>&1 | grep "DonorDetail" | head -10
```

Expected: no errors.

### 6c — ContributionForm.tsx

- [ ] **Step 15: Read current problem fields**

```bash
grep -n "donor_type\|contribution_type\|organization_id\|receipt_status" components/donors/ContributionForm.tsx
```

Expected: 7 occurrences.

- [ ] **Step 16: Fix Donor interface in form**

Find:
```typescript
  donor_type: string;
```
Replace with:
```typescript
  is_organization: boolean;
```

- [ ] **Step 17: Fix donors SELECT query**

Find:
```typescript
        .select('id, donor_type, first_name, last_name, organization_name, email')
        .eq('organization_id', organizationId)
```
Replace with:
```typescript
        .select('id, is_organization, first_name, last_name, organization_name, email')
        .eq('org_id', organizationId)
```

- [ ] **Step 18: Fix donor type check**

Find:
```typescript
    if (donor.donor_type === 'individual') {
```
Replace with:
```typescript
    if (!donor.is_organization) {
```

- [ ] **Step 19: Fix new donor insert**

Find:
```typescript
            organization_id: organizationId,
            donor_type: newDonorType,
```
Replace with:
```typescript
            org_id: organizationId,
            is_organization: newDonorType === 'organization',
```

- [ ] **Step 20: Fix contribution insert**

Find:
```typescript
          organization_id: organizationId,
```
Replace with:
```typescript
          org_id: organizationId,
```

Find:
```typescript
          contribution_type: contributionType,
```
Replace with:
```typescript
          gift_type: contributionType,
```

Find:
```typescript
          receipt_status: 'generated',
```
Replace with:
```typescript
          receipt_status: 'generated',  // column added in migration 0039
```
(No logic change needed — the column now exists.)

- [ ] **Step 21: Compile check**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx tsc --noEmit 2>&1 | grep "ContributionForm" | head -10
```

Expected: no errors.

### 6d — ReceiptGenerator.tsx

- [ ] **Step 22: Read current problem fields**

```bash
grep -n "donor_type\|contribution_type\|receipt_status" components/donors/ReceiptGenerator.tsx
```

Expected: 9 occurrences.

- [ ] **Step 23: Fix Contribution interface**

In `components/donors/ReceiptGenerator.tsx`, find:
```typescript
  contribution_type: string;
```
Replace with:
```typescript
  gift_type: string;
```

- [ ] **Step 24: Fix Donor interface in ReceiptGenerator**

Find:
```typescript
    donor_type: string;
```
Replace with:
```typescript
    is_organization: boolean;
```

- [ ] **Step 25: Fix donor_type check**

Find:
```typescript
    ? donor.donor_type === 'individual'
```
Replace with:
```typescript
    ? !donor.is_organization
```

- [ ] **Step 26: Fix contribution_type in template string**

Find:
```typescript
- Type: ${contribution.contribution_type.replace('_', ' ')}
```
Replace with:
```typescript
- Type: ${contribution.gift_type.replace('_', ' ')}
```

The `receipt_status` references throughout the component are now valid — the column exists after Task 1. No changes needed to that logic.

- [ ] **Step 27: Full compile check**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 28: Commit all donor component fixes**

```bash
git add components/donors/
git commit -m "fix: donor components — is_organization, gift_type, org_id, receipt_status alignment"
```

---

## Task 7: Add contract tests to catch future regressions

**Files:**
- Modify: `app/api/org/[orgId]/donors/__tests__/column-contract.test.ts`

A contract test already exists that asserts the donors route uses `org_id` not `organization_id`. Extend it to cover the broader patterns fixed in this plan, so future regressions fail CI before they reach production.

- [ ] **Step 1: Read the current contract test**

```bash
cat "app/api/org/[orgId]/donors/__tests__/column-contract.test.ts"
```

Note what patterns it currently tests.

- [ ] **Step 2: Create a new global contract test file**

Create `app/api/__tests__/schema-contract.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { globSync } from 'glob';

function readAllSources(patterns: string[]): string {
  return patterns
    .flatMap(p => globSync(p, { cwd: process.cwd() }))
    .map(f => readFileSync(f, 'utf-8'))
    .join('\n');
}

const appSrc = readAllSources(['app/**/*.ts', 'app/**/*.tsx', 'lib/**/*.ts', 'components/**/*.ts', 'components/**/*.tsx']);

describe('Schema contract: RPC function names', () => {
  it('no calls to non-existent org_role RPC', () => {
    expect(appSrc).not.toMatch(/rpc\(['"]org_role['"]/);
  });

  it('no calls to non-existent is_admin RPC', () => {
    expect(appSrc).not.toMatch(/rpc\(['"]is_admin['"]/);
  });

  it('no calls to org_has_module with p_module_id (should be p_module)', () => {
    expect(appSrc).not.toMatch(/p_module_id:/);
  });
});

describe('Schema contract: column names', () => {
  it('no .from(organization_members) with organization_id filter (column is org_id)', () => {
    const membersSrc = readAllSources(['app/**/*.ts', 'app/**/*.tsx']);
    const memberBlocks = membersSrc.match(/organization_members[\s\S]{0,300}/g) ?? [];
    for (const block of memberBlocks) {
      expect(block).not.toMatch(/organization_id/);
    }
  });
});

describe('Schema contract: donor field names', () => {
  const donorSrc = readAllSources(['components/donors/**/*.tsx', 'app/**/donors/**/*.ts', 'app/**/donors/**/*.tsx']);

  it('no donor_type references (field is is_organization boolean)', () => {
    expect(donorSrc).not.toMatch(/donor_type/);
  });

  it('no contribution_type references (field is gift_type)', () => {
    expect(donorSrc).not.toMatch(/contribution_type/);
  });
});
```

- [ ] **Step 3: Run the new contract tests to confirm they pass**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx vitest run app/api/__tests__/schema-contract.test.ts --reporter=verbose 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 4: Run full test suite**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx vitest run 2>&1 | tail -20
```

Expected: all existing tests still pass, new tests pass.

- [ ] **Step 5: Commit**

```bash
git add "app/api/__tests__/schema-contract.test.ts"
git commit -m "test: add schema contract tests for RPC names and column names"
```

---

## Self-Review

**Spec coverage check against `2026-05-13-schema-code-alignment-sweep.md`:**

| Gap | Covered by task |
|-----|-----------------|
| #9 — `reporting→reports` alias | Task 1 (migration) |
| #10 — CLAUDE.md patterns | Already fixed before plan was written |
| #8 — `org_role`, `is_admin`, `p_module_id` RPCs | Tasks 2, 3, 4 |
| #2 — `organization_id` in membership queries | Tasks 5, 6 |
| #6 — Donor CRM field drift | Task 6 |
| #1 — `receipt_status` missing | Task 1 (migration) |

**Not covered in this plan (require separate plans):**
- Gap #3 — `organization_holdings` missing from migrations
- Gap #4 — Grant lifecycle schema
- Gap #5 — Rich compliance schema
- Gap #7 — Tax/reporting/import/metrics tables
- Gap #8 partial — `generate_receipt_number`, `role_for_portfolio`, `can_modify_portfolio` RPCs

These require product scope decisions (add migrations vs reduce UI surface) before they can be planned.
