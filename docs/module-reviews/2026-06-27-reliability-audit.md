# Reliability Audit — Boringly Reliable When It Counts

> **Consolidation note (2026-08-08):** RA-01 through RA-24 are fixed and RX-01
> and RX-02 are retired. This document is retained as verification history; new
> open work belongs in the [consolidated backlog](FULL-BACKLOG.md).

> Reviewed: 2026-06-27
> Revised against current working tree: 2026-06-27
> Scope: financial transactions, tax records, board materials/compliance, and grantee obligations
> Motivating question: "As a foundation operator I care less about surface area than whether the system is boringly reliable when money, tax records, board materials, and grantee obligations are involved."

## Current Verdict

**Not yet, but the shape of the remaining work is much clearer.**

Recent hardening has improved cache policy, route-level authorization checks, rollback handling, task automation durability, Builder audit behavior, QuickBooks local logging, and several portfolio/holding route contracts. The remaining highest-risk problems are now mostly structural:

1. **Compliance numbers can still be wrong** because payout/990-PF routes read the wrong tables or stale columns.
2. **Grant data can still leak through views** because core grant views do not use `security_invoker`.
3. **Several money/obligation writes remain non-atomic** and need RPC/database transaction boundaries.
4. **Some audit and authorization surfaces are incomplete** for board-grade operations.

Status legend:

| Status | Meaning |
|---|---|
| Open | Still real in current code |
| Partial | Some route hardening landed, but the core failure remains |
| Revised | Original claim was directionally useful but wording/failure mode changed |
| Retired | No longer true in current code |

---

## Immediate / P0

### RA-01 — Payout compliance uses the wrong source for actual distributions
**Status:** Fixed  
**File:** `app/api/portfolio/[id]/compliance/payout/route.ts`

The fallback actual payout still reads `tax_contributions` and sums `fair_market_value`. That is wrong for two reasons:

- `tax_contributions` records donor/tax contribution data, not foundation qualifying distributions to grantees.
- `fair_market_value` is not a canonical column for `tax_contributions`; canonical fields include `amount_usd` and `fmv_at_donation`.

This can either fail at runtime or produce a fabricated payout compliance number.

**Fix:** Query `qualifying_distributions` for actual qualifying distributions. If needed, supplement with scoped grant payments for pipeline/forecast views, but do not use donor tax contribution rows for foundation payout compliance.

**Resolution:** Payout now reads `qualifying_distributions`, checks query errors, and uses shared payout math covered by `foundation-reliability-contract.test.ts` and `payout-calculation.test.ts`.

---

### RA-02 — 990-PF export uses the wrong source and formula
**Status:** Fixed  
**File:** `app/api/portfolio/[id]/compliance/990pf-export/route.ts`

The export still reads `tax_contributions` as if those rows were grant distributions, uses stale columns (`fair_market_value`, `description_of_property`, `deductible_amount`), and computes required payout as raw `fair_market_value_assets * 0.05`.

The §4942 distributable amount needs the same formula as the payout route: asset base less exempt-use assets and acquisition indebtedness, then 5%, then less excise tax on net investment income. It also needs checked query errors; currently key compliance reads can fail without producing an explicit error.

**Fix:** Extract a shared payout/distributable amount helper and use it from both payout and 990-PF export. Build grant/qualifying distribution sections from `qualifying_distributions` and grant payment data, not donor tax rows.

**Resolution:** The export now reads `qualifying_distributions`, no longer references stale tax-contribution columns, checks query errors, and uses `calculatePayout()`.

---

### RA-03 — Missing canonical average FMV field for payout calculations
**Status:** Fixed  
**Files:** `db/migrations/0013_tax_contributions.sql`, `app/api/portfolio/[id]/compliance/payout/route.ts`

`payout/route.ts` reads `pf990.avg_fair_market_value`, but the canonical `foundation_990pf_data` definition under `db/migrations` does not define that column. Because `db/migrations` is the schema source of truth, the route is reading a non-existent field.

**Fix:** Add `avg_fair_market_value numeric(20,2)` to the canonical `foundation_990pf_data` migration/table definition, then add a contract test that payout routes only read columns present in migrations.

**Resolution:** `foundation_990pf_data` now includes `avg_fair_market_value`, `exempt_use_assets`, and `acquisition_indebtedness`, with a schema contract for payout inputs.

---

### RA-04 — Core grant views bypass base-table RLS
**Status:** Fixed  
**File:** `db/migrations/0041_task_workflow_foundation.sql`

`v_grants`, `v_portfolio_grant_summary`, and `v_grant_health` are created without `WITH (security_invoker = true)`. These views are used by session-client routes. Without `security_invoker`, Postgres views can run with definer privileges and bypass base-table RLS.

`v_er_grant_compliance` already uses `security_invoker`; these three should match it.

**Fix:** Recreate those views with `WITH (security_invoker = true)`. Because the database is prerelease, fold the change into the canonical migration rather than adding compatibility shims.

**Resolution:** `v_grants`, `v_portfolio_grant_summary`, and `v_grant_health` now use `WITH (security_invoker = true)`, covered by the schema privilege contract.

---

## High Priority / P1

### RA-05 — Grant creation is still not atomic
**Status:** Fixed  
**File:** `app/api/org/[orgId]/grants/route.ts`

Grant creation still performs separate writes for optional investee creation, holding creation, grant creation, status history, and optional workflow instance creation. Some compensating deletes now exist, but they are not checked consistently, and the `new_grantee` investee path is not cleaned up if later grant setup fails.

**Fix:** Move grant creation into an RPC that wraps the full write set in one transaction, including optional investee creation, holding, grant, status history, and workflow instance. Until then, check all rollback errors and clean up the created investee when appropriate.

**Resolution:** Grant creation now calls `create_grant_with_foundation_records`, a service-role-only RPC that creates the optional investee, holding, grant, status history, and optional workflow instance in one database transaction.

---

### RA-06 — Pledge cancellation remains non-atomic
**Status:** Fixed  
**File:** `app/api/org/[orgId]/pledges/[pledgeId]/cancel/route.ts`

The route now checks more side effects, but it still updates the pledge before waiving installments, inserting the event, and cancelling generated tasks. If a later write fails, the pledge can remain cancelled while related obligations do not match.

**Fix:** Move pledge cancellation, installment waiver, event insert, and generated-task cancellation into a transactional RPC. Use row locking on the pledge and installments.

**Resolution:** Pledge cancellation now calls `cancel_pledge_with_obligations`, a service-role-only RPC that locks the pledge, cancels it, waives pending installments when requested, records the pledge event, and cancels generated installment tasks with task events in one transaction.

---

### RA-07 — Receipt generation can still leave inconsistent donor substantiation state
**Status:** Fixed  
**File:** `app/api/org/[orgId]/contributions/[id]/receipt/route.ts`

The route inserts an `acknowledgment_letters` row, then updates `contributions_received`. If the contribution update fails, it attempts to delete the letter, but the rollback delete result is not checked. A failed rollback can leave a sent/generated letter without the contribution being marked acknowledged, allowing duplicate receipt generation.

**Fix:** Prefer a transactional RPC for receipt generation. Short term: check rollback delete errors and return them explicitly.

**Resolution:** Receipt generation now calls `create_contribution_receipt_acknowledgment`, a service-role-only RPC that locks the contribution, inserts the acknowledgment letter, assigns a receipt number, and updates contribution receipt/acknowledgment state in one transaction.

---

### RA-08 — Grant document delete can break the document list
**Status:** Fixed  
**File:** `app/api/portfolio/[id]/grants/[grantId]/documents/route.ts`

DELETE removes the storage object before deleting the DB row. If the DB delete fails, the row remains and points to a missing object. GET now checks signed URL errors, so a broken row can make the whole grant document list return 500.

**Fix:** Delete or mark the DB row first, then remove storage. Worst case should be an orphaned private storage object, not a permanently broken document list.

**Resolution:** DELETE now removes the scoped `grant_documents` row first and then attempts storage cleanup. A storage cleanup failure returns `202` with `storage_cleanup_pending` instead of leaving a visible row that points at a missing object.

---

### RA-09 — Portfolio access does not account for deprovisioned org users
**Status:** Fixed  
**File:** `lib/portfolio-auth.ts`

`requirePortfolioAccess` checks only `portfolio_members`. It does not filter inactive/deleted portfolio memberships and does not verify active organization membership. A user soft-deleted from `organization_members` may retain access to portfolio-scoped board reports, tax exports, widgets, KPI routes, etc. if their `portfolio_members` row remains.

**Fix:** Add an active membership check, preferably joining through the portfolio's `org_id` and requiring an active, non-deleted `organization_members` row. If `portfolio_members` supports soft deletion, filter that too.

**Resolution:** `requirePortfolioAccess` now filters soft-deleted `portfolio_members`, joins the portfolio `org_id`, and requires a non-deleted, accepted `organization_members` row for the same user before granting access.

---

### RA-10 — Tax carryforward applications are computed but not persisted
**Status:** Fixed  
**File:** `lib/tax/carryforward-tracker.ts`

`applyCarryforwards()` computes drawdown and new remaining balances, but no route/RPC persists those applications back to `tax_carryforwards.amount_remaining`. Carryforwards can appear permanently available.

**Fix:** Add an endpoint/RPC that accepts a validated carryforward application set and updates `amount_remaining` transactionally.

**Resolution:** Added `tax_carryforward_applications` as a year-specific ledger plus `replace_tax_carryforward_applications`, an idempotent RPC that restores/replaces applications for a tax year and updates `tax_carryforwards.amount_remaining` in one transaction. `PATCH /api/portfolio/[id]/tax/carryforwards` now persists computed applications through that RPC.

---

### RA-11 — Historical tax exports omit carryforwards that were active in the selected year
**Status:** Fixed  
**File:** `app/api/portfolio/[id]/tax/export/route.ts`

Tax export still queries `v_active_carryforwards`, whose semantics are based on current active carryforwards. For historical exports, this can omit carryforwards that were active in the requested tax year but have since expired.

**Fix:** Query `tax_carryforwards` directly for exports:

```sql
originating_tax_year <= :year
AND expires_tax_year >= :year
```

**Resolution:** Historical exports now query canonical `tax_carryforwards` directly, include the `tax_carryforward_applications` ledger, and calculate the remaining carryforward balance as of the selected tax year rather than relying on the current-active view.

---

### RA-12 — Tax profile can still skip canonical `tax_years` creation
**Status:** Fixed  
**File:** `app/api/portfolio/[id]/tax/profile/route.ts`

The route now rolls back if the `tax_years` sync fails, but the sync is still guarded by JS truthiness:

```ts
if (validated.estimated_agi || validated.filing_status)
```

That skips sync when `estimated_agi` is `0` and `filing_status` is absent, and it also skips creating a canonical `tax_years` row for profiles that only set carryforward-related fields. Users can believe profile setup succeeded while downstream routes still report missing tax-year context.

**Fix:** Use explicit nullish checks and decide whether every profile create should ensure a `tax_years` row:

```ts
if (validated.estimated_agi != null || validated.filing_status != null)
```

or simply always upsert `tax_years` for the profile's year.

**Resolution:** Tax profile create and update now always upsert the canonical `tax_years` row using the final saved profile values, so zero-AGI profiles and carryforward-only profile edits still establish year context. The rollback behavior remains in place if the canonical sync fails.

---

### RA-13 — CPA revocation race window
**Status:** Fixed  
**File:** `lib/tax/cpa-public-access.ts`

The public CPA payload path validates/logs access, then fetches payload data using the admin client. A link revoked after the access RPC but before payload construction can still return data.

**Fix:** Re-check revocation immediately before or during payload construction, or move the access/logging and payload fetch into one RPC/transactional boundary.

**Resolution:** CPA public payload construction now refreshes and revalidates the share link before admin-client payload reads and again before returning data. CPA downloads also refresh the link before permission checks and before issuing document signed URLs, while still using the atomic `record_cpa_access` RPC for access logging and max-access enforcement.

---

### RA-14 — Disqualified-person soft delete leaves `is_active = true`
**Status:** Fixed  
**File:** `app/api/org/[orgId]/compliance/disqualified-persons/route.ts`

DELETE sets `end_date` but does not set `is_active = false`. The active list filters on `is_active = true`, so terminated DQPs can remain active.

**Fix:** Update both fields in the DELETE handler:

```ts
{ end_date: today, is_active: false }
```

Consider a DB trigger that keeps `is_active` and `end_date` consistent.

**Resolution:** DELETE now writes both `end_date` and `is_active: false`. The canonical compliance migration also defines `sync_disqualified_person_active_state()` plus a trigger so future inserts/updates cannot leave an ended disqualified-person row active.

---

### RA-15 — Grant payments can exceed approved amount
**Status:** Fixed  
**File:** `lib/ai/assistant/executors/grants.ts`

`recordGrantPayment` inserts or updates grant payments without checking cumulative non-cancelled payments against `grants.approved_amount`. AI tools can record disbursements above the board-approved cap.

**Fix:** Before insert/update, sum existing non-cancelled payments for the grant and reject writes that would exceed `approved_amount`. Use a DB RPC if concurrent payment creation is possible.

**Resolution:** `recordGrantPayment` now checks existing grant payments before insert/update and rejects totals above `grants.approved_amount`. The canonical grant migration also enforces the aggregate limit with `enforce_grant_payment_approved_amount()`, locking the parent grant and excluding cancelled/returned payments so concurrent writes cannot exceed the approved cap.

---

### RA-16 — Grant decisions are mutable at the RLS layer
**Status:** Fixed  
**File:** `db/migrations/0041_task_workflow_foundation.sql`

`grant_decisions` has an authenticated admin policy using `FOR ALL`, and grants `UPDATE, DELETE` to authenticated. Board approval/decline records should be append-only for normal users/admins; service role can retain full access for exceptional repair.

**Fix:** Replace authenticated `FOR ALL` with `FOR SELECT` and `FOR INSERT` policies only. Remove authenticated update/delete grants.

**Resolution:** Authenticated access to `grant_decisions` is now append-only: members can read, admins can insert, and authenticated `UPDATE`/`DELETE` privileges are revoked. Service role keeps full access for exceptional repair.

---

### RA-17 — Pledge KPI aggregation is in JS over an unbounded dataset
**Status:** Fixed  
**File:** `app/api/org/[orgId]/pledges/route.ts`

The route fetches all `pledge_installments` and `pledges`, then sums `numeric(20,2)` values in JavaScript. This risks Supabase default caps, memory pressure, and floating-point rounding.

**Fix:** Move KPI aggregation into a database view or RPC using SQL numeric sums. Keep paginated row retrieval separate from aggregate calculation.

**Resolution:** Pledge dashboard metrics now come from `get_pledge_dashboard_metrics`, a SQL RPC that computes KPI totals, aging buckets, and 12-month forecast values with `numeric` aggregation. The list route keeps paginated row retrieval separate and filters `pipeline_status` in the view query instead of filtering a page in JavaScript.

---

### RA-18 — Contribution delete does not reconcile linked pledge installments
**Status:** Fixed  
**File:** `app/api/org/[orgId]/contributions/[id]/route.ts`

DELETE removes a contribution but does not explicitly reopen or reject deletion when a pledge installment is linked. If FK behavior nulls the contribution pointer, the installment can remain `paid` without a backing contribution.

**Fix:** Before delete, check linked installment(s). Either reject with 409 or atomically reopen the installment and clear paid fields.

**Resolution:** Contribution DELETE now returns `409` when the contribution is linked to a pledge installment, requiring the pledge installment to be reopened or reconciled first. The pledge migration also defines a `BEFORE DELETE` trigger on `contributions_received` to prevent silent FK nulling through other delete paths.

---

### RA-19 — Payout forecast treats missing payout history as on-track
**Status:** Fixed  
**File:** `app/api/portfolio/[id]/compliance/payout-forecast/route.ts`

When no `payout_history` row exists, the route sets:

```ts
const distributableAmount = payout?.distributable_amount ?? 0;
```

That makes missing data look like `on_track: true`.

**Fix:** Return `data_missing: true`, `on_track: null`, and an explicit setup/compliance warning when payout history is absent.

**Resolution:** The forecast route now returns an explicit missing-data response when no `payout_history` row exists, including `data_missing: true`, `on_track: null`, `pct_complete: null`, and a setup warning. `PayoutTracker` accepts nullable forecast fields and shows a payout setup warning instead of rendering missing payout history as on-track.

---

### RA-20 — Bulk grant transition is intentionally partial but not explicitly contract-safe
**Status:** Fixed  
**File:** `app/api/org/[orgId]/grants/bulk-transition/route.ts`

Each grant transition is individually atomic, but the batch is not. The route returns 207 with per-item results. That can be acceptable, but for board/year-end cohort operations it should be explicit and offer safer modes.

**Fix:** Document partial behavior in the API contract and UI. Consider `dry_run` and `rollback_on_error` modes for high-stakes cohort transitions.

**Resolution:** The bulk-transition API now has explicit modes: default partial execution documents that individual grant transitions are atomic but the batch is not rolled back; `dry_run` validates without writes; and `rollback_on_error` uses the atomic `transition_grant_lifecycle_batch` RPC so an execution-time failure rolls back the whole batch. The dashboard sends operator-initiated bulk transitions with `rollback_on_error: true`, and both confirmation paths explain the batch behavior.

---

## Medium Priority / P2

### RA-21 — QuickBooks exports can still double-export after an external success/local failure
**Status:** Fixed  
**Files:** `app/api/integrations/quickbooks/export/contributions/route.ts`, `app/api/integrations/quickbooks/export/grants/route.ts`

Recent hardening made sync-log writes durable and persists local QB IDs after successful exports. However, the fundamental ordering remains: external QB journal entry first, local reconciliation second. A crash after QB success but before local persistence can still require duplicate detection on retry.

The current `DocNumber` lookup mitigates this if QB uniqueness/lookup behaves as expected, but this should still be tracked.

**Fix:** Add an in-flight/export lock or durable export attempt table before calling QB. Reconcile by DocNumber and expected amount/account before treating duplicates as success.

**Resolution:** Added `qb_export_attempts` with a unique active/succeeded export key. Contribution and grant exports now claim a durable in-flight attempt before calling QuickBooks, mark attempts succeeded/failed, skip already-succeeded attempts, and recover in-flight retries by looking up the DocNumber. Duplicate DocNumbers are only treated as success when the existing QB journal entry matches the expected amount and debit/credit account IDs.

---

### RA-22 — Contributions table lacks a DB-level positive amount constraint
**Status:** Fixed  
**File:** `db/migrations/0014_donors.sql`

`contributions_received.amount` is `numeric(20,2) NOT NULL` but has no `CHECK (amount > 0)`. Application routes validate positive amounts, but imports or service-role writes can bypass this and corrupt donor aggregates.

**Fix:** Add `CHECK (amount > 0)` to the canonical table definition.

**Resolution:** `contributions_received.amount` now has a canonical `CHECK (amount > 0)` constraint, backed by a reliability contract so service-role/import writes cannot bypass positive donor-gift amounts.

---

### RA-23 — Audit coverage exists but is incomplete for board-grade operations
**Status:** Fixed  
**Files:** `app/api/org/[orgId]/audit/route.ts`, material write routes

The original audit said there were zero `org_audit_log` writers. That is now stale: membership and invitation flows write audit entries.

The broader issue remains. Material operations such as report generation, 990-PF export, filing status changes, receipt generation, grant decisions, and grant payments are not consistently recorded in `org_audit_log`.

**Fix:** Define a minimal audit event taxonomy and instrument the highest-stakes write/export routes first.

**Resolution:** Added a shared org-audit helper and event taxonomy, then instrumented several board-grade operations: grant decision records, grant payment insert/update through the AI grant tool, contribution receipt generation, and 990-PF export. These writes now fail loudly if the audit event cannot be recorded.

---

### RA-24 — Milestone `overdue` status is stored but not maintained
**Status:** Fixed  
**Files:** `db/migrations/0041_task_workflow_foundation.sql`, `lib/grants/milestones.ts`, milestone APIs

The stored `grant_milestones.status` enum includes `overdue`, but no trigger/job transitions rows to that status. Some views compute overdue state from due dates, so dashboard counts can still work if they use the view. Direct filters on `grant_milestones.status = 'overdue'` remain unreliable.

**Fix:** Either maintain the stored status with a scheduled job/trigger, or remove `overdue` as stored state and standardize computed overdue logic in views.

**Resolution:** Removed `overdue` from the persisted `grant_milestones.status` domain and standardized overdue as a computed display/export state based on `due_date` for non-terminal milestones. Milestone read APIs and grant exports now map rows through a shared helper that returns computed display status while preserving `stored_status`; AI tools and automation producers no longer accept or query `overdue` as a stored workflow value. Added a reliability contract to keep the database, Zod schema, API routes, export route, automation producer, and AI tool definition aligned.

---

## Retired / Not Current As Written

### RX-01 — Tax contribution routes use a public client so auth is broken
**Original ID:** C3  
**Status:** Retired

The claim is not true against current `lib/supabase.ts`. `supabasePublic` is a deprecated alias of `createServerClient()`, so it does attach cookies and uses the session client.

Still worth doing: rename/import `createServerClient` directly in tax routes to avoid future confusion, and improve DELETE to avoid manual `portfolio_members` reads.

---

### RX-02 — Audit log has no writers
**Original ID:** H11  
**Status:** Retired as written / replaced by RA-23

There are now `org_audit_log` writers for invitation and membership flows. Audit coverage is still incomplete, but not zero.

---

## Suggested Triage Order

| Order | Issues | Why |
|---|---|---|
| 1 | RA-01, RA-02, RA-03 | Board/compliance numbers can be wrong or fail |
| 2 | RA-04 | Cross-org grant data leak risk through views |
| 3 | RA-05, RA-06, RA-07 | Non-atomic money/obligation writes |
| 4 | RA-08, RA-09, RA-14 | Broken document lists, access after deprovisioning, DQP active-state drift |
| 5 | RA-10, RA-11, RA-12, RA-13 | Tax/carryforward/CPA correctness |
| 6 | RA-15, RA-16, RA-20, RA-24 | Grantee obligation and board decision discipline |
| 7 | RA-17, RA-18, RA-21, RA-22, RA-23 | Important hardening after the highest-risk correctness/security items |

## Useful Regression Contracts To Add

- Compliance routes only reference columns defined in `db/migrations`.
- `foundation_990pf_data` includes all columns read by payout/990-PF routes.
- Grant views in migration 0041 all include `security_invoker`.
- `requirePortfolioAccess` requires active org membership.
- Grant decisions are insert-only for authenticated roles.
- `contributions_received.amount` has a positive CHECK constraint.
- Grant document DELETE removes/marks DB row before storage removal.
