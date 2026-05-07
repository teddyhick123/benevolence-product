# Sprint A — Production Blockers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all production-blocking issues identified in Sprint A: schema column mismatches across four modules, auth/ownership bypasses in Holdings and AI chat, QB OAuth connect bugs, rate limiting on the AI chat endpoint, and the admin import commit data-loss bug plus its inert Resume/Rollback buttons. **Extended to include claude-assistant.ts AI tool executor fixes identified in review.**

**Architecture:** Each task targets one file or one route family. No new abstractions — changes are find-and-replace style column renames, guard clause insertions, and wiring up existing helpers (`aiLimiter`, `loadStagingToProduction`) that already exist but are not being called.

**Tech Stack:** Next.js 15 App Router API routes (TypeScript), Supabase (PostgreSQL, RLS), `@upstash/ratelimit`, Vitest for unit tests.

---

## Status Summary

| Task | Status | Commit |
|------|--------|--------|
| Task 1: Compliance filing-calendar route | ✅ Done | `3eec1aa5`, `f1615500` |
| Task 2: Compliance state-registrations route | ✅ Done | `6d04aed9` |
| Task 3: QuickBooks column names | ✅ Done | `7774d392` |
| Task 4: QuickBooks OAuth connect param + role checks | ✅ Done | `32e8c5d9` |
| Task 5: claude-assistant.ts — donor tool org_id + field bugs | ✅ Done | `ce9d5d2d` |
| Task 6: claude-assistant.ts — compliance tool org_id + column bugs | ✅ Done | `e0f8bef2` |
| Task 7: claude-assistant.ts — guard missing-table executor cases | ✅ Done | `a891a0cf` |
| Task 8: claude-assistant.ts — WRITE_TOOLS expansion + model version | ✅ Done | `7d937730` |
| Task 9: Donor CRM route column names + v_donor_summary view | ✅ Done | `dce46f8e` |
| Task 10: Auth fix — Holdings update-basic | ✅ Done (already implemented) | `3b676fab` |
| Task 11: Auth fix — Holdings link-charity | ✅ Done (already implemented) | `3b676fab` |
| Task 12: Auth fix — AI chat viewer write bypass | ✅ Done (already implemented) | `01195b3a` |
| Task 13: Add rate limiting to AI chat endpoint | ✅ Done (already implemented) | `01195b3a` |
| Task 14: Fix admin import commit — actually load data | ✅ Done (already implemented) | `3e7ffc06` |
| Task 15: Wire Import Resume and Rollback buttons | ✅ Done | `f8ed3bb6` |

---

## File Map

| File | Change |
|------|--------|
| `lib/claude-assistant.ts` | Fix org_id column names, donor_type → is_organization, postal_code → zip, missing-table guards, WRITE_TOOLS, model version |
| `app/api/org/[orgId]/compliance/filing-calendar/route.ts` | ✅ `organization_id` → `org_id`; remove phantom columns |
| `app/api/org/[orgId]/compliance/state-registrations/route.ts` | ✅ `organization_id` → `org_id`; remove phantom columns; fix conflict key |
| `app/api/integrations/quickbooks/status/route.ts` | ✅ `token_expiry` → `expires_at`; `connected_at` → `created_at` |
| `app/api/integrations/quickbooks/accounts/route.ts` | ✅ `qb_account_id` → `qb_id`; `name` → `qb_name`; `type` → `qb_type`; `subtype` → `qb_subtype` |
| `app/api/integrations/quickbooks/sync/accounts/route.ts` | ✅ same renames + fix `onConflict` key |
| `app/api/integrations/quickbooks/connect/route.ts` | ✅ add role check (admin+) |
| `app/api/integrations/quickbooks/disconnect/route.ts` | ✅ add role check (admin+) |
| `app/api/integrations/quickbooks/export/contributions/route.ts` | ✅ add role check (admin+) |
| `app/api/integrations/quickbooks/export/grants/route.ts` | ✅ add role check (admin+) |
| `components/settings/IntegrationsTab.tsx` | ✅ fix `orgId` → `org_id` query param; fix disconnect body |
| `app/api/org/[orgId]/donors/route.ts` | `organization_id` → `org_id`; fix inserted column names to match DB |
| `app/api/org/[orgId]/donors/[donorId]/route.ts` | same `organization_id` → `org_id` fix |
| `db/migrations/0024_fix_v_donor_summary.sql` | Create — rebuild view with correct column aliases |
| `app/api/holdings/[id]/update-basic/route.ts` | Add `auth.getUser()` + portfolio ownership check |
| `app/api/holdings/[id]/link-charity/route.ts` | Add portfolio ownership check |
| `app/api/ai/chat/route.ts` | Add `aiLimiter.limit(user.id)` + viewer role guard on write tools |
| `app/api/admin/imports/[id]/commit/route.ts` | Call `loadStagingToProduction()` before marking complete |
| `app/admin/imports/ImportDashboardClient.tsx` | Wire Resume and Rollback `onClick` handlers |
| `app/api/admin/imports/[id]/resume/route.ts` | Create — resets paused job to `processing` |
| `app/api/admin/imports/[id]/rollback/route.ts` | Create — delegates to existing `rollback.ts` |

---

## ✅ Task 1: Fix Compliance filing-calendar route — DONE

Commits: `3eec1aa5`, `f1615500`

- [x] Write failing test
- [x] Run test — confirmed failures
- [x] Rewrite route with correct column names (`org_id`, valid DB columns only)
- [x] Run test — passing
- [x] Commit

---

## ✅ Task 2: Fix Compliance state-registrations route — DONE

Commit: `6d04aed9`

- [x] Write failing test
- [x] Run test — confirmed failures
- [x] Rewrite route with correct column names (`org_id`, valid conflict key `org_id,state,registration_type`)
- [x] Run test — passing
- [x] Commit

---

## ✅ Task 3: Fix QuickBooks route column names — DONE

Commit: `7774d392`

- [x] Write failing tests
- [x] Run tests — confirmed failures
- [x] Fix status/route.ts (`expires_at`, `created_at`)
- [x] Fix accounts/route.ts (`qb_id`, `qb_name`, `qb_type`, `qb_subtype`)
- [x] Fix sync/accounts/route.ts (same renames + `onConflict: 'org_id,qb_id'`)
- [x] Run tests — passing
- [x] Commit

---

## ✅ Task 4: Fix QuickBooks OAuth connect param and QB role checks — DONE

Commit: `32e8c5d9`

- [x] Write failing tests
- [x] Run tests — confirmed failures
- [x] Fix IntegrationsTab.tsx: `orgId=` → `org_id=`; add `org_id` to disconnect body
- [x] Add `member_role` check to connect, disconnect, sync, export routes
- [x] Run tests — passing
- [x] Commit

---

## Task 5: Fix claude-assistant.ts — Donor tool org_id, donor_type, and field name bugs

**File:** `lib/claude-assistant.ts`

**Root cause:** The AI executor was written against an older schema. The `donors`, `contributions_received`, and `acknowledgment_letters` tables all use `org_id`. The donor name logic uses `donor_type` (column doesn't exist; schema uses `is_organization boolean`). One field uses `postal_code` (the column is `zip`). The `search_donors` case filters `v_donor_summary` by `donor_tier` (the view inherits `tier` from `donors`).

**All locations to fix:**

| Case | Line (approx) | Bug | Fix |
|---|---|---|---|
| `generate_receipt` | ~4847 | selects `donor_type`, `postal_code` from donors | select `is_organization`, `zip` |
| `generate_receipt` | ~4862 | `contribution.organization_id` in RPC arg | `contribution.org_id` |
| `generate_receipt` | ~4886 | `donor.donor_type === 'individual'` | `!donor.is_organization` |
| `generate_receipt` | ~4914 | `organization_id: contribution.organization_id` in insert | `org_id: contribution.org_id` |
| `generate_acknowledgment` | ~4995 | `donor.donor_type === 'individual'` | `!donor.is_organization` |
| `generate_acknowledgment` | ~5079 | `organization_id: args.organization_id` in insert | `org_id: args.organization_id` |
| `search_donors` | ~5219 | `.eq('organization_id', args.organization_id)` | `.eq('org_id', args.organization_id)` |
| `search_donors` | ~5229 | `.eq('donor_type', args.donor_type)` | map to `is_organization` filter (see below) |
| `search_donors` | ~5229 | `.eq('donor_tier', args.donor_tier)` | `.eq('tier', args.donor_tier)` |

For `search_donors` donor_type mapping:
```typescript
// donor_type 'individual' → is_organization = false
// any other value → is_organization = true
if (args.donor_type) {
  query = query.eq('is_organization', args.donor_type !== 'individual');
}
```

- [ ] **Step 1: Read the relevant section of claude-assistant.ts**

Read `lib/claude-assistant.ts` lines 4839–5275 to confirm exact line numbers for each bug before editing.

- [ ] **Step 2: Write failing test**

Create `lib/__tests__/claude-assistant-donor-columns.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('claude-assistant donor executor column contract', () => {
  const src = readFileSync('lib/claude-assistant.ts', 'utf8');

  it('does not reference donor_type column (use is_organization)', () => {
    // donor_type is not a real column — schema uses is_organization boolean
    // The tool SCHEMA arg can still be named donor_type, so we check executor context only
    expect(src).not.toMatch(/donor\.donor_type/);
    expect(src).not.toMatch(/['"]donor_type['"]\s*,\s*args\.donor_type/);
  });

  it('does not use postal_code (column is zip)', () => {
    expect(src).not.toContain('postal_code');
  });

  it('does not insert organization_id into acknowledgment_letters', () => {
    // acknowledgment_letters table uses org_id
    expect(src).not.toMatch(/organization_id:\s*(?:contribution|args)\.organization_id/);
  });

  it('search_donors filters v_donor_summary by org_id not organization_id', () => {
    // v_donor_summary inherits org_id from donors — not organization_id
    expect(src).not.toMatch(/eq\(['"]organization_id['"],\s*args\.organization_id\)/);
  });

  it('search_donors filters by tier not donor_tier', () => {
    expect(src).not.toMatch(/eq\(['"]donor_tier['"]/);
  });
});
```

- [ ] **Step 3: Run test — expect failures**

```bash
cd /Users/teddyhickenlooper/Desktop/Benevolence/impact-viz-mvp
npx vitest run lib/__tests__/claude-assistant-donor-columns.test.ts
```

Expected: failures on donor_type, postal_code, organization_id insert, and donor_tier.

- [ ] **Step 4: Apply all donor field fixes**

Make the following edits to `lib/claude-assistant.ts`:

**Edit 1** — `generate_receipt` donors select: remove `donor_type`, change `postal_code` to `zip`:
```typescript
// Old
donors(first_name, last_name, organization_name, donor_type, email, address_line1, city, state, postal_code),

// New
donors(first_name, last_name, organization_name, is_organization, email, address_line1, city, state, zip),
```

**Edit 2** — `generate_receipt` RPC call: `contribution.organization_id` → `contribution.org_id`:
```typescript
// Old
const { data: newReceiptNum } = await this.supabase.rpc('generate_receipt_number', {
  p_org_id: contribution.organization_id,
});

// New
const { data: newReceiptNum } = await this.supabase.rpc('generate_receipt_number', {
  p_org_id: contribution.org_id,
});
```

**Edit 3** — `generate_receipt` donor name derivation:
```typescript
// Old
const donorName = donor
  ? (donor.donor_type === 'individual'
      ? `${donor.first_name || ''} ${donor.last_name || ''}`.trim()
      : donor.organization_name)
  : 'Donor';

// New
const donorName = donor
  ? (!donor.is_organization
      ? `${donor.first_name || ''} ${donor.last_name || ''}`.trim()
      : donor.organization_name)
  : 'Donor';
```

**Edit 4** — `generate_receipt` acknowledgment_letters insert:
```typescript
// Old
organization_id: contribution.organization_id,

// New
org_id: contribution.org_id,
```

**Edit 5** — `generate_acknowledgment` donor name derivation:
```typescript
// Old
const donorName = donor.donor_type === 'individual'
  ? `${donor.first_name || ''} ${donor.last_name || ''}`.trim()
  : donor.organization_name;

// New
const donorName = !donor.is_organization
  ? `${donor.first_name || ''} ${donor.last_name || ''}`.trim()
  : donor.organization_name;
```

**Edit 6** — `generate_acknowledgment` acknowledgment_letters insert:
```typescript
// Old
organization_id: args.organization_id,

// New
org_id: args.organization_id,
```

**Edit 7** — `search_donors` v_donor_summary filter:
```typescript
// Old
.eq('organization_id', args.organization_id);

// New
.eq('org_id', args.organization_id);
```

**Edit 8** — `search_donors` donor_type filter: replace
```typescript
// Old
if (args.donor_type) {
  query = query.eq('donor_type', args.donor_type);
}

// New
if (args.donor_type) {
  query = query.eq('is_organization', args.donor_type !== 'individual');
}
```

**Edit 9** — `search_donors` donor_tier filter:
```typescript
// Old
if (args.donor_tier) {
  query = query.eq('donor_tier', args.donor_tier);
}

// New
if (args.donor_tier) {
  query = query.eq('tier', args.donor_tier);
}
```

- [ ] **Step 5: Run test — expect pass**

```bash
npx vitest run lib/__tests__/claude-assistant-donor-columns.test.ts
```

Expected: 5 passing.

- [ ] **Step 6: Run full test suite to check for regressions**

```bash
npx vitest run
```

- [ ] **Step 7: Commit**

```bash
git add lib/claude-assistant.ts lib/__tests__/claude-assistant-donor-columns.test.ts
git commit -m "fix: claude-assistant — donor tools org_id, is_organization, zip column fixes"
```

---

## Task 6: Fix claude-assistant.ts — Compliance tool org_id and column name bugs

**File:** `lib/claude-assistant.ts`

**Root cause:** The advanced compliance tools in the executor were written against the legacy `db/0062_compliance_regulatory.sql` schema which uses `organization_id`. The current deployed schema (`db/migrations/0016_compliance.sql`) uses `org_id`. Additionally, `track_filing_deadline` references several columns that don't exist in the current schema.

**All locations to fix:**

| Case | Location | Bug | Fix |
|---|---|---|---|
| `get_compliance_status` | 3 `.eq('organization_id',...)` calls | `organization_id` → `org_id` on views |
| `screen_for_self_dealing` | `.eq('organization_id', args.organization_id)` | `organization_id` → `org_id` |
| `screen_for_self_dealing` | insert `organization_id: args.organization_id` | `org_id: args.organization_id` |
| `register_disqualified_person` | insert `organization_id: args.organization_id` | `org_id: args.organization_id` |
| `track_filing_deadline` | update `.eq('organization_id', ...)` | `.eq('org_id', ...)` |
| `track_filing_deadline` | update allowlist: `confirmation_number`, `filed_by`, `extended_due_date` | rename to `filing_reference`, `completed_by`, `extension_due_date` |
| `track_filing_deadline` | insert `organization_id: args.organization_id` | `org_id: args.organization_id` |
| `track_filing_deadline` | status values `pending`, `filed_late`, `not_required` | `upcoming`, `waived`, `not_applicable` |
| `get_state_registration_status` | `.eq('organization_id', ...)` | `.eq('org_id', ...)` |
| `get_state_registration_status` | filter `.eq('state_code', ...)` | `.eq('state', ...)` |
| `get_state_registration_status` | summary keys `registered`, `renewal_pending`, `renewal_overdue`, `lapsed` | `active`, `renewal_due`, `expired` |

- [ ] **Step 1: Read the compliance executor section**

Read `lib/claude-assistant.ts` lines 5276–5874 to confirm exact line numbers.

- [ ] **Step 2: Write failing test**

Create `lib/__tests__/claude-assistant-compliance-columns.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('claude-assistant compliance executor column contract', () => {
  const src = readFileSync('lib/claude-assistant.ts', 'utf8');

  // Compliance section — extract just that portion for targeted checks
  const complianceStart = src.indexOf("case 'get_compliance_status'");
  const complianceEnd = src.indexOf("default:\n        throw new Error(`Unknown function");
  const complianceSrc = src.slice(complianceStart, complianceEnd);

  it('compliance cases do not use organization_id', () => {
    expect(complianceSrc).not.toContain("'organization_id'");
    expect(complianceSrc).not.toContain('"organization_id"');
    expect(complianceSrc).not.toMatch(/organization_id:\s*args\.organization_id/);
  });

  it('track_filing_deadline does not use confirmation_number (use filing_reference)', () => {
    expect(complianceSrc).not.toContain('confirmation_number');
    expect(complianceSrc).toContain('filing_reference');
  });

  it('track_filing_deadline does not use filed_by (use completed_by)', () => {
    expect(complianceSrc).not.toContain("'filed_by'");
    expect(complianceSrc).toContain('completed_by');
  });

  it('track_filing_deadline does not use extended_due_date (use extension_due_date)', () => {
    // Only in the filing_calendar context — extension_due_date is the correct column
    const trackStart = complianceSrc.indexOf("case 'track_filing_deadline'");
    const trackEnd = complianceSrc.indexOf("case 'log_expenditure_responsibility'");
    const trackSrc = complianceSrc.slice(trackStart, trackEnd);
    expect(trackSrc).not.toContain("'extended_due_date'");
    expect(trackSrc).toContain('extension_due_date');
  });

  it('get_state_registration_status filters by state not state_code', () => {
    const stateStart = complianceSrc.indexOf("case 'get_state_registration_status'");
    const stateSrc = complianceSrc.slice(stateStart);
    expect(stateSrc).not.toContain('state_code');
    expect(stateSrc).not.toContain('state_name');
  });
});
```

- [ ] **Step 3: Run test — expect failures**

```bash
npx vitest run lib/__tests__/claude-assistant-compliance-columns.test.ts
```

Expected: failures on organization_id, confirmation_number, filed_by, extended_due_date, state_code.

- [ ] **Step 4: Apply all compliance field fixes**

**`get_compliance_status` edits:**
- Three `.eq('organization_id', args.organization_id)` calls → `.eq('org_id', args.organization_id)`

**`screen_for_self_dealing` edits:**
- `.eq('organization_id', args.organization_id)` on `disqualified_persons` → `.eq('org_id', args.organization_id)`
- In the incident insert: `organization_id: args.organization_id` → `org_id: args.organization_id`

**`register_disqualified_person` edit:**
- Insert `organization_id: args.organization_id` → `org_id: args.organization_id`

**`track_filing_deadline` edits:**
- Update `.eq('organization_id', args.organization_id)` → `.eq('org_id', args.organization_id)`
- Fields allowlist: `'confirmation_number'` → `'filing_reference'`; `'filed_by'` → `'completed_by'`; `'extended_due_date'` → `'extension_due_date'`
- When status is `filed`/`filed_late`, set `completed_by` (not `filed_by`)
- Insert `organization_id: args.organization_id` → `org_id: args.organization_id`
- Insert `extended_due_date:` → `extension_due_date:`
- Status enum validator: replace `'pending', 'filed_late', 'not_required'` with `'upcoming', 'waived', 'not_applicable'`

**`get_state_registration_status` edits:**
- `.eq('organization_id', args.organization_id)` → `.eq('org_id', args.organization_id)`
- Filter `.eq('state_code', ...)` → `.eq('state', args.state_code.toUpperCase())`
- Status filter `.eq('status', args.status_filter)` — keep as-is
- Summary object: rename keys to match current schema status values:
  ```typescript
  const summary = {
    total: registrations.length,
    active: registrations.filter((r: any) => r.status === 'active').length,
    renewal_due: registrations.filter((r: any) => r.status === 'renewal_due').length,
    expired: registrations.filter((r: any) => r.status === 'expired').length,
    exempt: registrations.filter((r: any) => r.status === 'exempt').length,
    not_registered: registrations.filter((r: any) => r.status === 'not_registered').length,
  };
  ```

- [ ] **Step 5: Run test — expect pass**

```bash
npx vitest run lib/__tests__/claude-assistant-compliance-columns.test.ts
```

- [ ] **Step 6: Run full test suite**

```bash
npx vitest run
```

- [ ] **Step 7: Commit**

```bash
git add lib/claude-assistant.ts lib/__tests__/claude-assistant-compliance-columns.test.ts
git commit -m "fix: claude-assistant — compliance tools org_id, filing_calendar/state_registrations column fixes"
```

---

## Task 7: Fix claude-assistant.ts — Guard missing-table executor cases

**File:** `lib/claude-assistant.ts`

**Root cause:** Eight executor cases query tables/views/RPCs that only exist in the legacy `db/` files, not in the current `db/migrations/` schema. On a fresh deployment these calls silently fail or return cryptic Supabase errors. The fix is to return a clear `feature_not_available` error from each affected case until the corresponding migration is added.

**Affected cases and missing objects:**

| Case | Missing object |
|---|---|
| `get_compliance_status` | `v_compliance_dashboard`, `v_upcoming_filing_deadlines`, `self_dealing_incidents` |
| `screen_for_self_dealing` | `disqualified_persons`, `self_dealing_incidents` |
| `register_disqualified_person` | `disqualified_persons` |
| `calculate_payout_requirement` | `payout_history`, `v_payout_status` |
| `get_payout_forecast` | `payout_history`, `qualifying_distributions`, `v_payout_status` |
| `assess_qualifying_distribution` | `qualifying_distributions` |
| `log_expenditure_responsibility` | `expenditure_responsibility_grants` |
| `get_990pf_export_data` | `payout_history`, `qualifying_distributions` |
| `get_donor_summary` (communications section) | `donor_communications` |
| `generate_acknowledgment` (annual_summary branch) | `get_donor_annual_summary` RPC |

**Strategy:** Return a structured `{ feature_not_available: true, message: '...' }` output (not throw) so the AI can tell the user gracefully. For cases that mix available and unavailable data (e.g., `get_compliance_status`, `get_donor_summary`), strip the unavailable sub-queries rather than blocking the whole case.

- [ ] **Step 1: Read the affected cases**

Read `lib/claude-assistant.ts` lines 5118–5190 (`get_donor_summary`), 5277–5323 (`get_compliance_status`), 5500–5717 (payout/ER/QD cases).

- [ ] **Step 2: Apply guards**

**`get_compliance_status`** — Remove the three queries for missing tables (`v_compliance_dashboard`, `self_dealing_incidents`, `v_upcoming_filing_deadlines`, `v_payout_status`). Return only what's available in the current schema (note: these views don't exist in `db/migrations/` so the case currently returns errors). Replace the entire case body with:

```typescript
case 'get_compliance_status': {
  return {
    action: null,
    output: {
      feature_not_available: true,
      message: 'Advanced compliance dashboard (self-dealing, payout status, upcoming deadlines) requires migrations not yet deployed. Use get_state_registration_status and track_filing_deadline for available compliance data.',
    },
  };
}
```

**`screen_for_self_dealing`** and **`register_disqualified_person`** — Same guard:
```typescript
return {
  action: null,
  output: {
    feature_not_available: true,
    message: 'Self-dealing screening requires the disqualified_persons migration (not yet deployed). Please log incidents manually.',
  },
};
```

**`calculate_payout_requirement`**, **`get_payout_forecast`**, **`get_990pf_export_data`** — Guard with:
```typescript
return {
  action: null,
  output: {
    feature_not_available: true,
    message: 'Payout calculation requires payout_history and qualifying_distributions tables (not yet deployed as part of the clean migration set).',
  },
};
```

**`assess_qualifying_distribution`**, **`log_expenditure_responsibility`** — Guard with:
```typescript
return {
  action: null,
  output: {
    feature_not_available: true,
    message: 'This feature requires qualifying_distributions / expenditure_responsibility_grants tables (not yet deployed).',
  },
};
```

**`get_donor_summary`** — Only the `donor_communications` sub-query is missing. Remove that block and also remove the `get_donor_annual_summary` RPC call from `generate_acknowledgment`'s `annual_summary` branch:

For `get_donor_summary`: delete the entire `if (args.include_communications !== false)` block.

For `generate_acknowledgment` annual_summary branch: replace the RPC call with a placeholder:
```typescript
} else if (letterType === 'annual_summary') {
  // donor_communications and get_donor_annual_summary not yet available
  subject = `Your ${new Date().getFullYear()} Giving Summary`;
  body = `Dear ${donorName},\n\nThank you for your incredible generosity this year!\n\n${args.custom_message || 'Your support has made a tremendous impact on our mission.'}\n\n${org?.ein ? `Organization EIN: ${org.ein}` : ''}\n\nWith gratitude,\n${org?.name || 'The Organization'}`;
```

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add lib/claude-assistant.ts
git commit -m "fix: claude-assistant — guard missing-table executor cases with feature_not_available responses"
```

---

## Task 8: Fix claude-assistant.ts — Expand WRITE_TOOLS + update model version

**File:** `lib/claude-assistant.ts`

**Issues:**
1. `WRITE_TOOLS` set (line ~1486) only guards 7 core portfolio write ops. Viewer-role users can call all donor/compliance mutation tools via AI. Add the missing write tools.
2. Model version `'claude-sonnet-4-5-20250929'` is outdated. Update to `'claude-sonnet-4-6'` (appears in 2 places).

- [ ] **Step 1: Write failing test**

Create `lib/__tests__/claude-assistant-write-tools.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('claude-assistant WRITE_TOOLS and model version', () => {
  const src = readFileSync('lib/claude-assistant.ts', 'utf8');

  it('WRITE_TOOLS includes donor write tools', () => {
    expect(src).toContain("'log_contribution_received'");
    expect(src).toContain("'generate_receipt'");
    expect(src).toContain("'generate_acknowledgment'");
  });

  it('WRITE_TOOLS includes compliance write tools', () => {
    expect(src).toContain("'register_disqualified_person'");
    expect(src).toContain("'track_filing_deadline'");
    expect(src).toContain("'assess_qualifying_distribution'");
    expect(src).toContain("'log_expenditure_responsibility'");
  });

  it('uses current model version', () => {
    expect(src).not.toContain('claude-sonnet-4-5-20250929');
    expect(src).toContain('claude-sonnet-4-6');
  });
});
```

- [ ] **Step 2: Run test — expect failures**

```bash
npx vitest run lib/__tests__/claude-assistant-write-tools.test.ts
```

- [ ] **Step 3: Expand WRITE_TOOLS and update model**

**Edit 1** — Expand WRITE_TOOLS set:
```typescript
// Old
private readonly WRITE_TOOLS = new Set([
  'add_holding', 'update_holding', 'remove_holding',
  'add_metric_fact', 'delete_metric_fact',
  'add_widget', 'remove_widget',
]);

// New
private readonly WRITE_TOOLS = new Set([
  'add_holding', 'update_holding', 'remove_holding',
  'add_metric_fact', 'delete_metric_fact',
  'add_widget', 'remove_widget',
  'log_contribution_received', 'generate_receipt', 'generate_acknowledgment',
  'register_disqualified_person', 'track_filing_deadline',
  'assess_qualifying_distribution', 'log_expenditure_responsibility',
]);
```

**Edit 2** — Update model version (appears in 2 places in the `chat()` method):
```typescript
// Old (both occurrences)
model: 'claude-sonnet-4-5-20250929',

// New
model: 'claude-sonnet-4-6',
```

- [ ] **Step 4: Run test — expect pass**

```bash
npx vitest run lib/__tests__/claude-assistant-write-tools.test.ts
```

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```

- [ ] **Step 6: Commit**

```bash
git add lib/claude-assistant.ts lib/__tests__/claude-assistant-write-tools.test.ts
git commit -m "fix: claude-assistant — expand WRITE_TOOLS viewer guard, update model to claude-sonnet-4-6"
```

---

## Task 9: Fix Donor CRM route column names and v_donor_summary view

**Files:**
- Modify: `app/api/org/[orgId]/donors/route.ts`
- Modify: `app/api/org/[orgId]/donors/[donorId]/route.ts`
- Create: `db/migrations/0024_fix_v_donor_summary.sql`

The `donors` table (migration `0014_donors.sql`) uses `org_id`. Both donor routes use `organization_id`. The POST route also inserts phantom columns: `donor_type`, `contact_name`, `postal_code`, `is_anonymous`, `communication_preference`, `do_not_contact`, `created_by`. The DB has: `org_id`, `first_name`, `last_name`, `organization_name`, `is_organization`, `preferred_name`, `email`, `phone`, `address_line1`, `address_line2`, `city`, `state`, `zip`, `country`, `tier`, `recency_status`, `notes`, `tags`.

The `v_donor_summary` view only returns `d.*` + `full_name`. The donor list route queries it for `organization_id`, `display_name`, `total_lifetime_giving`, `computed_tier`, `has_pending_acknowledgments` — none of which exist. The fix is to rebuild the view with the correct aliases.

- [ ] **Step 1: Write failing tests**

Create `app/api/org/[orgId]/donors/__tests__/column-contract.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('donors route column contract', () => {
  const routeSrc = readFileSync('app/api/org/[orgId]/donors/route.ts', 'utf8');

  it('uses org_id not organization_id', () => {
    expect(routeSrc).not.toContain("'organization_id'");
    expect(routeSrc).not.toContain('"organization_id"');
    expect(routeSrc).toContain('org_id');
  });

  it('does not insert phantom columns', () => {
    expect(routeSrc).not.toContain('donor_type');
    expect(routeSrc).not.toContain('contact_name');
    expect(routeSrc).not.toContain('postal_code');
    expect(routeSrc).not.toContain('is_anonymous');
    expect(routeSrc).not.toContain('communication_preference');
    expect(routeSrc).not.toContain('do_not_contact');
    expect(routeSrc).not.toContain('created_by');
  });

  it('queries v_donor_summary with org_id', () => {
    expect(routeSrc).toContain("eq('org_id'");
  });
});
```

- [ ] **Step 2: Run test — expect failures**

```bash
npx vitest run app/api/org/\[orgId\]/donors/__tests__/column-contract.test.ts
```

Expected: 3 failures.

- [ ] **Step 3: Create the v_donor_summary migration**

Create `db/migrations/0024_fix_v_donor_summary.sql`:

```sql
-- =============================================================================
-- 0024_fix_v_donor_summary.sql
-- Rebuild v_donor_summary with correct column aliases used by API routes.
-- Fixes: display_name, total_lifetime_giving, computed_tier, has_pending_acknowledgments
-- Depends on: 0014_donors.sql
-- =============================================================================

DROP VIEW IF EXISTS v_donor_summary;

CREATE OR REPLACE VIEW v_donor_summary AS
SELECT
  d.*,
  -- Display name used by UI and API list route
  CASE
    WHEN d.is_organization THEN COALESCE(d.organization_name, 'Unknown Organization')
    ELSE TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, ''))
  END AS display_name,
  -- Alias for lifetime_giving (what routes call "total_lifetime_giving")
  d.lifetime_giving AS total_lifetime_giving,
  -- Alias for tier (what routes call "computed_tier")
  d.tier AS computed_tier,
  -- Pending acknowledgments: contributions not yet acknowledged
  EXISTS (
    SELECT 1 FROM contributions_received cr
    WHERE cr.donor_id = d.id
      AND cr.acknowledgment_sent = false
      AND cr.is_pledge = false
  ) AS has_pending_acknowledgments
FROM donors d
WHERE d.deleted_at IS NULL;
```

- [ ] **Step 4: Rewrite donors/route.ts**

Replace `app/api/org/[orgId]/donors/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

// GET /api/org/[orgId]/donors — list donors via v_donor_summary
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();
    const { searchParams } = new URL(req.url);

    const { data: role } = await supabase.rpc('org_role', { p_org_id: orgId });
    if (!role) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    let query = supabase
      .from('v_donor_summary')
      .select('*')
      .eq('org_id', orgId);

    const name = searchParams.get('name');
    const tier = searchParams.get('donor_tier');
    const recencyStatus = searchParams.get('recency_status');
    const minGiving = searchParams.get('min_lifetime_giving');
    const pendingAcks = searchParams.get('pending_acknowledgments');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    if (name) query = query.ilike('display_name', `%${name}%`);
    if (tier) query = query.eq('computed_tier', tier);
    if (recencyStatus) query = query.eq('recency_status', recencyStatus);
    if (minGiving) query = query.gte('total_lifetime_giving', parseFloat(minGiving));
    if (pendingAcks === 'true') query = query.eq('has_pending_acknowledgments', true);

    const { data: donors, error } = await query
      .order('total_lifetime_giving', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ donors, count: donors?.length || 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/org/[orgId]/donors — create donor
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    const { data: canEdit } = await supabase.rpc('can_edit_org', { p_org_id: orgId });
    if (!canEdit) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await req.json();
    const {
      first_name, last_name, email, phone,
      organization_name, is_organization, preferred_name,
      address_line1, address_line2, city, state, zip, country,
      tier, notes, tags,
    } = body;

    const { data: donor, error } = await supabase
      .from('donors')
      .insert({
        org_id: orgId,
        first_name: first_name || null,
        last_name: last_name || null,
        email: email || null,
        phone: phone || null,
        organization_name: organization_name || null,
        is_organization: is_organization || false,
        preferred_name: preferred_name || null,
        address_line1: address_line1 || null,
        address_line2: address_line2 || null,
        city: city || null,
        state: state || null,
        zip: zip || null,
        country: country || 'US',
        tier: tier || 'prospect',
        notes: notes || null,
        tags: tags || [],
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(donor, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 5: Fix donors/[donorId]/route.ts**

Read `app/api/org/[orgId]/donors/[donorId]/route.ts`. Find every `.eq('organization_id', orgId)` and `.eq('organization_id',` and replace with `.eq('org_id', orgId)` and `.eq('org_id',`. Also update any UPDATE/INSERT that references `organization_id`.

- [ ] **Step 6: Run test — expect pass**

```bash
npx vitest run app/api/org/\[orgId\]/donors/__tests__/column-contract.test.ts
```

Expected: 3 passing.

- [ ] **Step 7: Commit**

```bash
git add app/api/org/\[orgId\]/donors/route.ts \
        app/api/org/\[orgId\]/donors/\[donorId\]/route.ts \
        db/migrations/0024_fix_v_donor_summary.sql \
        app/api/org/\[orgId\]/donors/__tests__/column-contract.test.ts
git commit -m "fix: donor CRM — org_id columns, valid DB columns, rebuild v_donor_summary"
```

---

## Task 10: Auth fix — Holdings update-basic (add auth + ownership check)

**Files:**
- Modify: `app/api/holdings/[id]/update-basic/route.ts`

This route currently has no `auth.getUser()` call and no check that the holding belongs to the current user's portfolio. Any authenticated session that knows a holding UUID can overwrite it. Fix: get user, look up which portfolios the user is a member of, verify the holding's `portfolio_id` is in that set.

The route currently imports `createSupabaseServerClient` aliased as `getSupabase`. Switch to the standard `createServerClient` from `@/lib/supabase` (same thing, different name) which is what every other route uses.

- [ ] **Step 1: Write failing test**

Create `app/api/holdings/__tests__/update-basic.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('update-basic auth contract', () => {
  const src = readFileSync(
    'app/api/holdings/[id]/update-basic/route.ts',
    'utf8'
  );

  it('calls auth.getUser()', () => {
    expect(src).toContain('auth.getUser()');
  });

  it('verifies portfolio membership before update', () => {
    expect(src).toMatch(/portfolio_member|portfolio_id.*user|user.*portfolio_id/);
  });

  it('returns 401 when no user', () => {
    expect(src).toContain('401');
  });

  it('returns 403 when not authorized', () => {
    expect(src).toContain('403');
  });
});
```

- [ ] **Step 2: Run test — expect failures**

```bash
npx vitest run app/api/holdings/__tests__/update-basic.test.ts
```

Expected: failures on getUser and portfolio check.

- [ ] **Step 3: Rewrite update-basic/route.ts**

Replace `app/api/holdings/[id]/update-basic/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

function getValue(formData: FormData, key: string) {
  const val = formData.get(key);
  if (val === null || val === undefined) return undefined;
  const str = String(val).trim();
  return str === '' ? null : str;
}

function numOrNull(v: FormDataEntryValue | null) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: holdingId } = await ctx.params;
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: holding } = await supabase
    .from('holdings')
    .select('id, portfolio_id')
    .eq('id', holdingId)
    .single();

  if (!holding) {
    return NextResponse.json({ error: 'Holding not found' }, { status: 404 });
  }

  const { data: membership } = await supabase
    .from('portfolio_members')
    .select('role')
    .eq('portfolio_id', holding.portfolio_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const formData = await req.formData();
  const updates: any = {};

  const name = getValue(formData, 'name');
  if (name !== undefined) updates.name = name;
  const asset_type = getValue(formData, 'asset_type');
  if (asset_type !== undefined) updates.asset_type = asset_type;
  const sector = getValue(formData, 'sector');
  if (sector !== undefined) updates.sector = sector;
  const description = getValue(formData, 'description');
  if (description !== undefined) updates.description = description;
  const status = getValue(formData, 'status');
  if (status !== undefined) updates.status = status;
  const as_of = getValue(formData, 'as_of');
  if (as_of !== undefined) updates.as_of = as_of;
  const theory_of_action = getValue(formData, 'theory_of_action');
  if (theory_of_action !== undefined) updates.theory_of_action = theory_of_action;
  const funds_allocated = formData.has('funds_allocated')
    ? numOrNull(formData.get('funds_allocated'))
    : undefined;
  if (funds_allocated !== undefined) updates.funds_allocated = funds_allocated;

  const { error, data } = await supabase
    .from('holdings')
    .update(updates)
    .eq('id', holdingId)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath(`/dashboard/holdings/${holdingId}`);
  revalidatePath(`/dashboard`);

  return NextResponse.json({ success: true, data });
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npx vitest run app/api/holdings/__tests__/update-basic.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add app/api/holdings/\[id\]/update-basic/route.ts \
        app/api/holdings/__tests__/update-basic.test.ts
git commit -m "fix: holdings update-basic — add auth.getUser() and portfolio ownership check"
```

---

## Task 11: Auth fix — Holdings link-charity (add portfolio ownership check)

**Files:**
- Modify: `app/api/holdings/[id]/link-charity/route.ts`

Both POST and DELETE handlers check auth but never verify the holding belongs to the current user's portfolio. Add the same portfolio membership check from Task 10.

- [ ] **Step 1: Write failing test**

Create `app/api/holdings/__tests__/link-charity.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('link-charity ownership contract', () => {
  const src = readFileSync(
    'app/api/holdings/[id]/link-charity/route.ts',
    'utf8'
  );

  it('verifies portfolio membership in POST', () => {
    expect(src).toMatch(/portfolio_member|portfolio_id/);
  });

  it('returns 403 for unauthorized holding access', () => {
    expect(src).toContain('403');
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
npx vitest run app/api/holdings/__tests__/link-charity.test.ts
```

- [ ] **Step 3: Add portfolio ownership check to POST and DELETE**

In `app/api/holdings/[id]/link-charity/route.ts`, after each `if (!user)` check, insert:

```typescript
    const { data: holding } = await sb
      .from('holdings')
      .select('portfolio_id')
      .eq('id', holdingId)
      .single();

    if (!holding) {
      return NextResponse.json({ error: 'Holding not found' }, { status: 404 });
    }

    const { data: membership } = await sb
      .from('portfolio_members')
      .select('role')
      .eq('portfolio_id', holding.portfolio_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
```

Add this block in both the POST and DELETE handlers, after the `if (!user)` guard.

- [ ] **Step 4: Run test — expect pass**

```bash
npx vitest run app/api/holdings/__tests__/link-charity.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add app/api/holdings/\[id\]/link-charity/route.ts \
        app/api/holdings/__tests__/link-charity.test.ts
git commit -m "fix: holdings link-charity — add portfolio ownership check to POST and DELETE"
```

---

## Task 12: Auth fix — AI chat viewer write bypass

**Files:**
- Modify: `app/api/ai/chat/route.ts`

The route fetches `membership.role` from `portfolio_members` but never reads it before calling `assistant.chat()`. The assistant's `executeTool()` has a `WRITE_TOOLS` guard but needs the `memberRole` passed in. Fix: pass `memberRole` to the `chat()` call so the guard fires.

- [ ] **Step 1: Write failing test**

Create `app/api/ai/__tests__/chat-auth.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('AI chat viewer write bypass', () => {
  const chatSrc = readFileSync('app/api/ai/chat/route.ts', 'utf8');
  const assistantSrc = readFileSync('lib/claude-assistant.ts', 'utf8');

  it('chat route passes memberRole to assistant.chat()', () => {
    expect(chatSrc).toMatch(/memberRole/);
  });

  it('executeTool guards write tools from viewers', () => {
    expect(assistantSrc).toMatch(/WRITE_TOOLS.*viewer|viewer.*WRITE_TOOLS/s);
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
npx vitest run app/api/ai/__tests__/chat-auth.test.ts
```

- [ ] **Step 3: Add memberRole to assistant.chat() call in the route**

In `app/api/ai/chat/route.ts`, find the `assistant.chat({` call. Add `memberRole: membership?.role ?? 'viewer'` to the options object:

```typescript
    const result = await assistant.chat({
      portfolioId,
      userId: user.id,
      sessionId,
      message,
      conversationHistory: filteredHistory,
      memberRole: membership?.role ?? 'viewer',
    });
```

- [ ] **Step 4: Run test — expect pass**

```bash
npx vitest run app/api/ai/__tests__/chat-auth.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add app/api/ai/chat/route.ts \
        app/api/ai/__tests__/chat-auth.test.ts
git commit -m "fix: AI chat — pass memberRole to assistant so viewer write-tool guard fires"
```

---

## Task 13: Add rate limiting to AI chat endpoint

**Files:**
- Modify: `app/api/ai/chat/route.ts`

`aiLimiter` is defined in `lib/rate-limit.ts` (30 req/hr per user, sliding window) but is never called in the chat route. The undo/redo routes already have it. Pattern to follow: call `aiLimiter.limit(user.id)` immediately after confirming the user is authenticated.

- [ ] **Step 1: Write failing test**

Create `app/api/ai/__tests__/chat-rate-limit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('AI chat rate limiting', () => {
  const src = readFileSync('app/api/ai/chat/route.ts', 'utf8');

  it('imports aiLimiter', () => {
    expect(src).toContain('aiLimiter');
  });

  it('calls aiLimiter.limit after user auth', () => {
    expect(src).toMatch(/aiLimiter\.limit\s*\(\s*user\.id\s*\)/);
  });

  it('returns 429 when rate limit exceeded', () => {
    expect(src).toContain('rateLimitExceeded');
  });
});
```

- [ ] **Step 2: Run test — expect failures**

```bash
npx vitest run app/api/ai/__tests__/chat-rate-limit.test.ts
```

- [ ] **Step 3: Add rate limiting to chat route**

In `app/api/ai/chat/route.ts`:

**Edit 1** — Add import:
```typescript
import { aiLimiter } from '@/lib/rate-limit';
import { rateLimitExceeded } from '@/lib/rate-limit-response';
```

**Edit 2** — After the `if (!user)` check, add:
```typescript
    const { success, reset, remaining, limit } = await aiLimiter.limit(user.id);
    if (!success) {
      return rateLimitExceeded(reset, remaining, limit);
    }
```

- [ ] **Step 4: Run test — expect pass**

```bash
npx vitest run app/api/ai/__tests__/chat-rate-limit.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add app/api/ai/chat/route.ts \
        app/api/ai/__tests__/chat-rate-limit.test.ts
git commit -m "fix: AI chat — add aiLimiter rate limiting (30 req/hr per user)"
```

---

## Task 14: Fix admin import commit — actually load data

**Files:**
- Modify: `app/api/admin/imports/[id]/commit/route.ts`

Currently this route just sets `status = 'completed'` without loading any staging data into production tables. `lib/import/loader.ts` exports `loadStagingToProduction(supabase, importJobId, options)` which does the real work.

- [ ] **Step 1: Write failing test**

Create `app/api/admin/imports/__tests__/commit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('import commit route', () => {
  const src = readFileSync(
    'app/api/admin/imports/[id]/commit/route.ts',
    'utf8'
  );

  it('calls loadStagingToProduction', () => {
    expect(src).toContain('loadStagingToProduction');
  });

  it('imports loadStagingToProduction from loader', () => {
    expect(src).toContain("from '@/lib/import/loader'");
  });

  it('only marks completed after loading', () => {
    const loadIdx = src.indexOf('loadStagingToProduction');
    const statusIdx = src.indexOf("status: 'completed'");
    expect(loadIdx).toBeGreaterThan(0);
    expect(loadIdx).toBeLessThan(statusIdx);
  });
});
```

- [ ] **Step 2: Run test — expect failures**

```bash
npx vitest run app/api/admin/imports/__tests__/commit.test.ts
```

- [ ] **Step 3: Rewrite commit/route.ts**

Replace `app/api/admin/imports/[id]/commit/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { loadStagingToProduction } from '@/lib/import/loader';
import type { ImportJob } from '@/lib/import/types';

async function requireAdmin(): Promise<string | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: adminRow } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  return adminRow ? user.id : null;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAdmin();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: job, error: jobError } = await supabase
    .from('import_jobs')
    .select('*')
    .eq('id', id)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: 'Import job not found' }, { status: 404 });
  }

  const committableStatuses = ['mapped', 'validated', 'paused'];
  if (!committableStatuses.includes(job.status)) {
    return NextResponse.json(
      { error: `Cannot commit a job with status '${job.status}'. Job must be mapped or validated first.` },
      { status: 422 }
    );
  }

  await supabase.from('import_jobs').update({ status: 'processing' }).eq('id', id);

  let loadResults;
  try {
    loadResults = await loadStagingToProduction(supabase, id, { upsertMode: 'upsert' });
  } catch (loadErr: any) {
    await supabase
      .from('import_jobs')
      .update({ status: job.status, pause_reason: loadErr.message })
      .eq('id', id);
    return NextResponse.json({ error: `Load failed: ${loadErr.message}` }, { status: 500 });
  }

  const totalInserted = loadResults.reduce((s: number, r: any) => s + r.inserted + r.updated, 0);

  const { data: updated, error: updateError } = await supabase
    .from('import_jobs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      pause_reason: null,
      records_loaded: totalInserted,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json(
    { job: updated as ImportJob, load_summary: { total_inserted: totalInserted, phases: loadResults } },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npx vitest run app/api/admin/imports/__tests__/commit.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/imports/\[id\]/commit/route.ts \
        app/api/admin/imports/__tests__/commit.test.ts
git commit -m "fix: import commit — call loadStagingToProduction before marking job completed"
```

---

## Task 15: Wire Import Resume and Rollback buttons

**Files:**
- Create: `app/api/admin/imports/[id]/resume/route.ts`
- Create: `app/api/admin/imports/[id]/rollback/route.ts`
- Modify: `app/admin/imports/ImportDashboardClient.tsx`

The Resume and Rollback buttons in the import dashboard have no `onClick` handlers. The rollback logic exists in `lib/import/rollback.ts`. Resume just needs to reset `status` from `'paused'` to `'processing'`.

- [ ] **Step 1: Write failing test**

Create `app/admin/imports/__tests__/dashboard-buttons.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('import dashboard action buttons', () => {
  const src = readFileSync('app/admin/imports/ImportDashboardClient.tsx', 'utf8');

  it('Resume button has an onClick handler', () => {
    expect(src).toMatch(/onClick.*[Rr]esume|[Rr]esume.*onClick/);
  });

  it('Rollback button has an onClick handler', () => {
    expect(src).toMatch(/onClick.*[Rr]ollback|[Rr]ollback.*onClick/);
  });

  it('calls resume API', () => {
    expect(src).toContain('/resume');
  });

  it('calls rollback API', () => {
    expect(src).toContain('/rollback');
  });
});
```

- [ ] **Step 2: Run test — expect failures**

```bash
npx vitest run app/admin/imports/__tests__/dashboard-buttons.test.ts
```

- [ ] **Step 3: Create the resume API route**

Create `app/api/admin/imports/[id]/resume/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';

async function requireAdmin(): Promise<string | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: adminRow } = await supabase
    .from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
  return adminRow ? user.id : null;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAdmin();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: job } = await supabase.from('import_jobs').select('status').eq('id', id).single();
  if (!job) return NextResponse.json({ error: 'Import job not found' }, { status: 404 });
  if (job.status !== 'paused') {
    return NextResponse.json({ error: `Cannot resume a job with status '${job.status}'` }, { status: 422 });
  }

  const { data: updated, error } = await supabase
    .from('import_jobs')
    .update({ status: 'processing', pause_reason: null })
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ job: updated });
}
```

- [ ] **Step 4: Create the rollback API route**

Read `lib/import/rollback.ts` to confirm the exported function name, then create `app/api/admin/imports/[id]/rollback/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { rollbackImport } from '@/lib/import/rollback';

async function requireAdmin(): Promise<string | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: adminRow } = await supabase
    .from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
  return adminRow ? user.id : null;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAdmin();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: job } = await supabase.from('import_jobs').select('status').eq('id', id).single();
  if (!job) return NextResponse.json({ error: 'Import job not found' }, { status: 404 });
  if (job.status !== 'completed') {
    return NextResponse.json(
      { error: `Can only rollback completed jobs (current: '${job.status}')` },
      { status: 422 }
    );
  }

  try {
    const result = await rollbackImport(supabase, id);
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

**Note:** After creating this file, read `lib/import/rollback.ts` to confirm the exported function name is `rollbackImport`. Adjust if different.

- [ ] **Step 5: Update ImportDashboardClient.tsx to wire the buttons**

Read `app/admin/imports/ImportDashboardClient.tsx` fully first. Then add:
1. `useState` for `actionInProgress`
2. `handleResume` and `handleRollback` async functions that call the API routes and update job state
3. Wire `onClick` on the Resume and Rollback buttons

- [ ] **Step 6: Run test — expect pass**

```bash
npx vitest run app/admin/imports/__tests__/dashboard-buttons.test.ts
```

- [ ] **Step 7: Run full test suite to check for regressions**

```bash
npx vitest run
```

- [ ] **Step 8: Commit**

```bash
git add app/api/admin/imports/\[id\]/resume/route.ts \
        app/api/admin/imports/\[id\]/rollback/route.ts \
        app/admin/imports/ImportDashboardClient.tsx \
        app/admin/imports/__tests__/dashboard-buttons.test.ts
git commit -m "fix: import dashboard — wire Resume and Rollback buttons with API routes"
```

---

## Final verification

- [ ] **Run full test suite one last time**

```bash
npx vitest run
```

- [ ] **TypeScript check**

```bash
npx tsc --noEmit
```

Fix any type errors introduced by the changes before calling this sprint done.
