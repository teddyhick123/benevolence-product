# Compliance — Module Review

**Reviewer:** Senior Product Engineer (automated review)
**Date:** 2026-04-26
**Scope:** Filing calendar, state registrations, 990-PF export, payout calculator
**Files reviewed:**
- `app/dashboard/compliance/page.tsx`
- `app/api/org/[orgId]/compliance/filing-calendar/route.ts`
- `app/api/org/[orgId]/compliance/state-registrations/route.ts`
- `app/api/portfolio/[id]/compliance/990pf-export/route.ts`
- `app/api/portfolio/[id]/compliance/payout/route.ts`
- `db/migrations/0016_compliance.sql`
- `db/legacy/0013_tax_tracking.sql`
- `lib/tax/constants.ts`
- `lib/types/org.ts`

---

## Regulatory Accuracy Assessment

### 1. 5% Minimum Distribution Calculation — Partially Correct but Dangerously Incomplete

The payout route (`app/api/portfolio/[id]/compliance/payout/route.ts`, line 55) applies a simple `netAssets * 0.05` formula. This is the right percentage, but the IRS definition of the base (IRC § 4942) is far more specific than the implementation reflects:

- **Correct:** 5% rate on net assets.
- **Wrong:** The base must be the **average fair market value of investment assets** (typically a monthly or quarterly average, not a year-end snapshot). The route uses a single FMV figure pulled from `foundation_990pf_data.fair_market_value_assets` with no averaging logic — this will consistently under- or over-state the requirement.
- **Missing:** The computation must **exclude assets used directly for exempt purposes** (e.g., program-related investments, property used in charitable activities). No such exclusion logic exists anywhere in the codebase.
- **Missing:** The "distributable amount" under IRC § 4942(d) subtracts excise taxes paid on investment income. The payout route does not subtract excise tax from the required payout base.
- **Missing:** Qualifying distributions include not just grants but also **reasonable and necessary administrative expenses directly for exempt purposes** (officer compensation tied to grant programs, foundation management costs). The 990-PF export (`app/api/portfolio/[id]/compliance/990pf-export/route.ts`, lines 56–57) counts only `tax_contributions` records, excluding admin qualifying distributions entirely. This will understate the foundation's compliance with the 5% requirement.

**Risk level: HIGH** — A foundation relying on this calculator could be reported as non-compliant when it is not, or vice versa, triggering the IRC § 4942 initial excise tax of 30% on undistributed income.

### 2. Qualifying Distributions — Column Name Bug Renders Calculation Broken

The 990-PF export and payout routes both reference `amount_usd` on `tax_contributions` (e.g., `990pf-export/route.ts` lines 57, 93, 94; `payout/route.ts` line 52). **This column does not exist.** The actual schema (`db/migrations/0013_tax_contributions.sql`, line 30) uses `fair_market_value` as the primary amount column. The fallback `g.deductible_amount ?? g.amount_usd` also references the non-existent column.

The Supabase JS client will silently return `null` or `undefined` for unknown column selects in some configurations, meaning `totalGrantAmount` and `actualDistributions` will calculate as `0` or `NaN`, making the payout calculator show $0 actual distributions regardless of data. This is a silent data integrity failure — no error is surfaced to the user.

Similarly, `recipient_type` and `property_description` are selected in the 990-PF export (`990pf-export/route.ts` line 45) but neither column exists in `tax_contributions`. The correct column names from the migration are `contribution_type` and `description_of_property`.

### 3. Excise Tax Calculation — Rate Correct, Calculation Surface Missing

The 1.39% excise tax rate is hardcoded correctly in `lib/tax/constants.ts` (line 261) and matches the flat rate enacted for tax years after December 20, 2019 under IRC § 4940(a). However:

- The UI (`page.tsx`, line 228) displays the rate as a percentage label (`1.39%`) but does not display the calculated excise tax amount or show it as a line item reduction to qualifying income.
- The payout route returns `excise_tax_amount: pf990?.excise_tax_amount ?? null` — meaning if no manual 990-PF record has been entered, the excise tax amount is always null with no auto-calculation.
- There is no mechanism to auto-calculate excise tax as `net_investment_income * 0.0139`.

### 4. Filing Deadlines — Not Validated Against IRS Schedule

The filing calendar is entirely user-managed (no auto-seeding of IRS deadlines on org creation). Key IRS deadlines for private foundations that are absent from auto-generation:

- **Form 990-PF:** Due the 15th day of the 5th month after fiscal year end (May 15 for calendar-year filers; Nov 15 with extension). No logic enforces this.
- **Extension Form 8868:** Grants automatic 6-month extension — no `extension_due_date` auto-calculation from the base due date.
- **IRC § 4720 Excise Tax Return:** Not represented in `filing_type` enums at all.
- **Estimated excise tax deposits (Form 990-W):** Not in scope, not flagged as missing.
- The `filing_type` enum in `lib/types/org.ts` (line 113) uses `form_990pf` (no underscore between 990 and pf), while the DB migration comment in `0016_compliance.sql` (line 20) documents `form_990_pf`. These are inconsistent; queries filtering on this field will silently return no results.

### 5. State Registrations — Data Structure Present, Logic Absent

The `state_registrations` table exists and is queryable, but there is no:
- Pre-seeded list of the 41 states requiring registration
- State-specific renewal deadline calculation
- State-specific exemption threshold logic (several states exempt orgs under $25K–$50K in revenue)
- Annual report due date auto-calculation by state

### 6. Self-Dealing — Flag Only, No Substance

The payout route returns `has_self_dealing` (line 79) and shows a warning banner in the UI (`page.tsx`, lines 293–297). However:
- The flag is a boolean on `foundation_990pf_data`, manually set — no automated detection
- IRC § 4941 defines six categories of self-dealing (sales, loans, compensation, use of assets, payments to government officials, transfers during tax years). None of these are tracked structurally.
- The IRC § 4941 initial excise tax (10% on disqualified person, 5% on foundation manager) and correction procedures are not represented.

---

## Competitive Assessment

Foundation Source, the primary competitor, provides:
1. **Automated deadline calendar** pre-seeded with IRS dates and state-specific renewal dates at org setup.
2. **Distributable amount worksheet** matching the IRS 990-PF Part XI line-by-line.
3. **Excise tax estimator** with quarterly payment reminders.
4. **State registration tracker** for all 41 states with fee schedules, exemption triggers, and auto-renewal flagging.
5. **Document vault** with version control for filed returns.
6. **Board resolution templates** for grant approvals as qualifying distributions.

Benevolence currently delivers:
- A manually populated filing calendar with no IRS deadline seeding.
- A payout calculator that is broken at the data layer (wrong column names) and oversimplified at the regulatory layer.
- A 990-PF export that produces JSON (not a preparer-ready format) and mislabels 990-PF parts.
- A state registrations CRUD with no business logic.

**Assessment:** The module is not yet competitive with Foundation Source. It is closer to a compliance notepad than a compliance management system.

---

## Bugs & Reliability Issues

### Bug 1 — CRITICAL: Column Name Mismatch — `amount_usd` Does Not Exist
**Files:** `app/api/portfolio/[id]/compliance/990pf-export/route.ts` lines 45, 57, 93, 94; `app/api/portfolio/[id]/compliance/payout/route.ts` lines 46, 52.
**Impact:** All payout and qualifying distribution calculations return $0 or NaN. The actual column is `fair_market_value` (primary) and `deductible_amount` (tax-adjusted). `property_description` → `description_of_property`, `recipient_type` → does not exist on this table.

### Bug 2 — CRITICAL: `filing_calendar` Table Column Name Mismatch
**Files:** `app/api/org/[orgId]/compliance/filing-calendar/route.ts` lines 32, 73, 128.
**Impact:** All `filing_calendar` queries use `.eq('organization_id', orgId)` and insert `organization_id: orgId`, but the DB migration (`db/migrations/0016_compliance.sql`, line 16) defines the column as `org_id`. Every GET, POST, and PATCH against this table will fail or return empty results at runtime.

### Bug 3 — CRITICAL: `state_registrations` Column Mismatch
**Files:** `app/api/org/[orgId]/compliance/state-registrations/route.ts` lines 24, 63, 76.
**Impact:** Same issue — queries use `organization_id`, DB schema uses `org_id`. Additionally, `registered_name`, `annual_report_due`, `annual_report_filed`, and `filing_fee` are inserted by the API but do not exist in the DB schema (`db/migrations/0016_compliance.sql`, lines 65–91). The DB schema uses `annual_fee` (not `filing_fee`) and has no `registered_name` or `annual_report_*` columns.

### Bug 4 — MODERATE: `filing_calendar` GET Misses Overdue Items
**File:** `app/api/org/[orgId]/compliance/filing-calendar/route.ts` lines 26–36.
**Impact:** The query applies `lte('due_date', cutoffDate)` (future cutoff only) but has no lower-bound filter — overdue items (past due dates) are excluded from the default "next 12 months" view because `cutoffDate` is always in the future. An overdue filing from last month would not appear. The query needs `gte('due_date', pastDate)` OR to filter by status in addition to date.

### Bug 5 — MODERATE: `filing_calendar` Status Enum Mismatch
**Files:** `app/dashboard/compliance/page.tsx` lines 15–21, `lib/types/org.ts` line 114, `db/migrations/0016_compliance.sql` line 34–35.
- DB default status is `'upcoming'` and valid values include `'in_progress'`, `'extended'`, `'waived'`, `'not_applicable'`.
- TypeScript type (`FilingStatus`) defines `'pending' | 'filed' | 'overdue' | 'n_a' | 'extension_filed'`.
- UI `STATUS_STYLES` handles `pending`, `filed`, `overdue`, `n_a`, `extension_filed`.
- None of these three layers align. A filing with DB status `'upcoming'` will display with no matching style and no "Mark as Filed" button (because the condition checks `filing.status === 'pending' || filing.status === 'overdue'`).

### Bug 6 — LOW: `filing_type` Value Inconsistency
**Files:** `lib/types/org.ts` line 113, `db/migrations/0016_compliance.sql` line 20.
- TypeScript type uses `'form_990pf'`, DB comment documents `'form_990_pf'` as valid value, and the `FILING_TYPE_LABELS` map in `page.tsx` (line 6) uses `'form_990pf'`.
- No DB constraint enforces the enum, so the inconsistency is silent.

### Bug 7 — LOW: `payout_deficit` Sign Inversion Logic Is Fragile
**File:** `app/api/portfolio/[id]/compliance/payout/route.ts` lines 57–61.
```ts
const surplusOrDeficit =
  pf990?.payout_deficit !== undefined && pf990?.payout_deficit !== null
    ? -pf990.payout_deficit   // stored as positive deficit, negated here
    : requiredPayout !== null
      ? actualDistributions - requiredPayout
      : null;
```
The sign convention for `payout_deficit` is unclear — the DB schema (`db/legacy/0013_tax_tracking.sql`, line 149) stores it as `NUMERIC DEFAULT 0` with no sign convention documented. If the value is stored as `actualDistributions - requiredPayout` (negative when in deficit), the negation here produces a double-negative. A zero `payout_deficit` with a non-zero calculated deficit will also silently pick the inverted stored value.

### Bug 8 — LOW: `990-PF Export` Part Numbering Error
**File:** `app/api/portfolio/[id]/compliance/990pf-export/route.ts` line 72–73.
The comment reads `// Part II — Minimum Distribution / Payout` but the key is `part_xi`. On the actual IRS Form 990-PF (2023 revision), minimum distribution is Part XIII, not Part XI or Part II. The UI (`page.tsx`) renders `part_xii` as "Qualifying Distributions (Part XII)" — 990-PF Part XII is "Qualifying Distributions" (correct label, wrong part key in the API response object). Preparer confusion risk is high.

---

## UX Gaps

1. **No calendar view.** The filing calendar is a flat table with no month/quarter visualization. Foundation Source and competitors show a Google Calendar-style timeline with color-coded deadlines by type and urgency.
2. **No overdue badge or count.** There is no dashboard widget or badge showing count of overdue filings. Users must navigate to the compliance page and manually scan the table.
3. **No "Add Filing" UI.** The POST endpoint exists (`filing-calendar/route.ts`, lines 52–94) but there is no corresponding form in the compliance page. All filing entries must be added via direct API call or database manipulation.
4. **No state registrations section in the UI.** The `state-registrations` route exists and works (modulo the `org_id` bug) but there is zero UI for it in `app/dashboard/compliance/page.tsx`. The entire state registrations subsystem is invisible to users.
5. **No attachment/document upload.** Both the DB schema (`filing_calendar.attachments jsonb`, `state_registrations.attachments jsonb`) and the legacy `tax_documents` table support document storage, but no file upload UI or API is wired into the compliance page.
6. **Payout calculator auto-loads on year change** (via `useEffect` on `payoutYear`) which is correct UX, but the 990-PF export requires a separate button click. The inconsistency between auto-load and manual trigger is unexplained.
7. **"Mark as Filed" provides no confirmation number, filed-by, or notes fields.** The PATCH handler accepts `confirmation_number`, `filed_by`, and `notes`, but the UI sends only `status: 'filed'` and `filed_date`. This means confirmed filings have no audit trail.
8. **No print or PDF export.** The 990-PF "export" downloads raw JSON — unsuitable for CPAs, auditors, or board review. A structured PDF or Excel export is the minimum acceptable format for a compliance tool targeting finance staff.

---

## Missing Features

### Priority Missing Features

1. **Auto-seeded filing calendar.** On org creation (via `provision_organization()` RPC), the system should auto-create filing entries for: Form 990-PF (May 15), Form 8868 extension (Nov 15), state registrations for known active states. Currently, the calendar starts empty and requires 100% manual population — a major onboarding friction point.

2. **State registration coverage for all 41 states.** No state-by-state knowledge base exists. The system stores whatever the user enters but does not:
   - Know which states require registration for the org's revenue level
   - Auto-calculate renewal due dates (most states: anniversary of registration or fixed annual dates)
   - Warn about upcoming expirations
   - Know fee schedules or exemption thresholds by state

3. **Distributable amount worksheet (990-PF Part XIII).** The 5% payout calculation must match the IRS Part XIII worksheet:
   - Line 1: FMV of assets (average, not year-end)
   - Line 2: Cash/receivables reduction
   - Line 3: Assets used for exempt purposes
   - Line 4: Acquisition indebtedness
   - Line 5: Net value of assets
   - Line 6: Minimum investment return (5% × Line 5)
   - Line 7: Distributable amount (after excise tax deduction)
   None of these lines are implemented.

4. **IRC § 4942 underdistribution carryforward tracker.** When a foundation distributes less than required, the shortfall can be carried forward and satisfied in the following year. The system has no concept of year-over-year payout carryforward tracking for compliance purposes (distinct from the individual donor carryforward in `lib/tax/carryforward-tracker.ts`).

5. **Excise tax auto-calculator.** Given `net_investment_income`, the system should compute `excise_tax = net_investment_income * 0.0139` and display it as a line item. Currently this requires manual entry.

6. **Self-dealing violation tracker (IRC § 4941).** Only a boolean flag exists. A proper tracker needs:
   - Transaction-level records (date, parties, amount, violation category)
   - Initial excise tax calculator (10% on disqualified person)
   - Correction deadline tracking (within 90 days of IRS notice)
   - Disclosure to IRS Form 4720

7. **Form 8868 automatic extension tracking.** If a foundation files Form 8868, the system should automatically set `extension_due_date` to +6 months from the original due date and update status to `'extended'`.

8. **Lobbying limit tracker (public charities).** For orgs with `org_type = 'public_charity'`, the H election (lobbying expenditure test) and substantial part test limits are entirely absent.

9. **Audit support / exam workpapers.** No document organization, no audit trail for "who marked this as filed and when," no ability to attach scanned returns.

---

## Automation & Alerts

### Current State

The `reminder_days` column exists on `filing_calendar` (schema default `{30, 14, 7}`), and `notification_prefs` is stored on `organization_members` (`app/api/org/[orgId]/members/[userId]/notifications/route.ts`). The AI assistant (`lib/claude-assistant.ts`, lines 2600–2648) reads the next upcoming filing for context display. However:

- **No background job, cron, or edge function** exists anywhere in the codebase to send reminder emails or push notifications based on `reminder_days`. The `reminder_days` column is purely decorative — it stores a preference but drives no action.
- **No overdue auto-detection.** There is no process that scans `filing_calendar` for entries where `due_date < NOW()` and `status != 'filed'` and updates them to `'overdue'`. Status must be manually set.
- **No dashboard-level alert panel.** There is no compliance widget on `/dashboard` showing "3 filings due in 30 days" or "1 filing overdue."
- **No email integration.** The notification preferences API (`digest: 'daily' | 'weekly' | 'never'`) has no delivery mechanism — no Resend, SendGrid, Postmark, or similar integration.

### What Needs to Be Built

1. **Supabase Edge Function (cron):** A nightly job that:
   - Queries `filing_calendar WHERE status IN ('upcoming', 'in_progress') AND due_date < NOW()` → marks as `'overdue'`
   - Queries upcoming filings within `reminder_days` range → triggers notification
2. **Email delivery integration** (Resend or similar) connected to the existing notification preferences schema.
3. **Dashboard compliance widget** showing overdue count and next-due filing.
4. **In-app notification center** for compliance alerts without requiring email.

---

## Overall Rating

**3/10**

The compliance module has a structurally sound database schema and a plausible API surface, but is functionally broken at the data layer — three separate critical column name mismatches mean that every filing calendar query, state registration query, and payout calculation fails silently at runtime. Even if those bugs were fixed, the 5% payout calculator uses an oversimplified formula that does not match the IRS Part XIII distributable amount worksheet, creating material regulatory risk. For a product targeting private foundations managing fiduciary compliance obligations, the module is not ready for production use with live client data.

---

## Priority Fixes (Top 5)

### Fix 1 — CRITICAL: Repair Column Name Mismatches (Estimated: 2 hours)

**`filing_calendar` routes:** In `app/api/org/[orgId]/compliance/filing-calendar/route.ts`, replace all instances of `organization_id` with `org_id` (lines 32, 73, 128). The DB schema (`db/migrations/0016_compliance.sql`, line 16) uses `org_id`.

**`state_registrations` routes:** In `app/api/org/[orgId]/compliance/state-registrations/route.ts`, replace `organization_id` with `org_id` (lines 24, 63, 76). Remove insert of `registered_name`, `annual_report_due`, `annual_report_filed`, `filing_fee` — these columns don't exist. The equivalent DB column for fee is `annual_fee`.

**`tax_contributions` columns:** In `app/api/portfolio/[id]/compliance/990pf-export/route.ts` and `payout/route.ts`, replace `amount_usd` with `fair_market_value`, replace `property_description` with `description_of_property`, and remove `recipient_type` from the select (it does not exist). The fallback `g.deductible_amount ?? g.amount_usd` should become `g.deductible_amount ?? g.fair_market_value`.

### Fix 2 — CRITICAL: Align Status Enums Across All Three Layers (Estimated: 3 hours)

Choose one status vocabulary and propagate it:
- Recommended canonical set (matches DB migration): `'upcoming' | 'in_progress' | 'filed' | 'extended' | 'overdue' | 'waived' | 'not_applicable'`
- Update `lib/types/org.ts` `FilingStatus` type (line 114).
- Update `STATUS_STYLES` in `app/dashboard/compliance/page.tsx` (lines 15–21) to include `'upcoming'`, `'in_progress'`, `'extended'`, `'waived'`, `'not_applicable'`.
- Update the "Mark as Filed" button condition (line 181) to include `'upcoming'` and `'in_progress'` as actionable states.
- Update the DB default from `'upcoming'` to the chosen default, or update all API inserts that currently write `status: 'pending'` (filing-calendar/route.ts line 81).

### Fix 3 — HIGH: Correct the Payout Calculator to Use IRS Part XIII Logic (Estimated: 1–2 days)

In `app/api/portfolio/[id]/compliance/payout/route.ts`, replace the `netAssets * 0.05` formula with a structured calculation that:
1. Reads average FMV (sum of monthly/quarterly snapshots ÷ n), not a single figure.
2. Subtracts assets used for exempt purposes.
3. Subtracts acquisition indebtedness on investment assets.
4. Produces "minimum investment return" = 5% × net value.
5. Subtracts excise tax paid (`excise_tax_amount`) to arrive at "distributable amount."
6. Includes administrative qualifying expenses (not just grants) in actual distributions.

Until a full implementation is feasible, add a prominent disclaimer in the UI: "This is a simplified estimate. Consult Form 990-PF Part XIII instructions for the precise distributable amount."

### Fix 4 — HIGH: Add State Registrations UI Panel (Estimated: 4–6 hours)

Add a fourth section to `app/dashboard/compliance/page.tsx` that fetches from `GET /api/org/[orgId]/compliance/state-registrations` and renders a table of state registrations with renewal due dates, status badges, and an "Add State" button. This makes the existing (but currently invisible) API surface accessible to users.

### Fix 5 — HIGH: Implement the Overdue Auto-Detection Job (Estimated: 1 day)

Create a Supabase Edge Function (or Next.js cron route) that runs nightly:
```sql
UPDATE filing_calendar
SET status = 'overdue', updated_at = now()
WHERE status IN ('upcoming', 'in_progress')
  AND due_date < CURRENT_DATE;
```
Wire `reminder_days` to trigger email notifications via an email delivery service. Until this exists, the entire `reminder_days` column and `notification_prefs` digest preference are non-functional, and users will miss filing deadlines.
