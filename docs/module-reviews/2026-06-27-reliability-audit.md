# Reliability Audit — "Boringly Reliable When It Counts"

> Reviewed: 2026-06-27
> Scope: Financial transactions, tax records, board materials/compliance, grantee obligations
> Method: Four parallel subagent inspections of source + migrations + tests
> Motivating question: *"As a foundation operator I care less about surface area than whether the system is boringly reliable when money, tax records, board materials, and grantee obligations are involved."*

**Short verdict: Not yet.** Eight critical issues and ~20 high-severity issues span all four domains. The gaps cluster around three themes:

1. **Non-atomic writes** that can corrupt financial records on transient failure
2. **Wrong or missing data** in compliance calculations (the numbers on board materials are wrong)
3. **RLS bypasses** that expose data across org boundaries

---

## Critical Issues

### C1 — Duplicate donor receipts on transient failure
**File:** `app/api/org/[orgId]/contributions/[id]/receipt/route.ts`

The receipt flow inserts an `acknowledgment_letters` row, then updates `contributions_received.acknowledgment_sent`. These are two separate DB calls with a compensating-delete fallback whose error return is silently discarded. Any transient failure leaves a `status: 'sent'` letter in the DB with `acknowledgment_sent = false` on the contribution. The next call passes the guard and generates a second letter. A donor receives two IRS receipts for one contribution.

**Fix:** Single RPC wrapping both writes.

---

### C2 — Pledge cancel leaves installments permanently mismatched
**File:** `app/api/org/[orgId]/pledges/[pledgeId]/cancel/route.ts`

Three sequential unguarded writes: cancel pledge → void installments → log event. If the installment void fails, the pledge is `cancelled` but installments remain `pending`. The caller gets a 500; the system is now inconsistent. No transaction, no rollback. Outstanding installment amounts become invisible to queries scoped to non-cancelled pledges.

**Fix:** Move all three writes into a single PL/pgSQL RPC with `FOR UPDATE` locking.

---

### C3 — Tax contribution routes use wrong Supabase client (auth effectively broken)
**File:** `app/api/portfolio/[id]/tax/contributions/[contributionId]/route.ts`

GET, PUT, and DELETE all call `supabasePublic()` instead of `createServerClient()`. `supabasePublic` does not attach session cookies, so `auth.getUser()` returns null, `membership` is always null, and every operation returns 403. Tax contribution deletion is permanently broken in production. Every other file in the tax domain uses `createServerClient` correctly.

**Fix:** Replace `supabasePublic()` with `createServerClient()` in all three handlers — match the pattern in `documents/route.ts` in the same directory.

---

### C4 — Payout compliance number computed from the wrong table
**File:** `app/api/portfolio/[id]/compliance/payout/route.ts:63–71`

When no manual 990-PF override exists, the fallback sums `tax_contributions.fair_market_value`. That table records the **donor's** personal charitable deductions — not the foundation's qualifying distributions to grantees. The correct source is `qualifying_distributions` (used correctly in `payout-forecast/route.ts`). A foundation with $10M in assets will show a fabricated 5% MIR compliance number on its board dashboard.

**Fix:** Mirror the `payout-forecast` logic: query `qualifying_distributions` and `grant_payments` for the actual distributed amount.

---

### C5 — 990-PF export applies raw FMV×5% instead of the §4942 formula
**File:** `app/api/portfolio/[id]/compliance/990pf-export/route.ts:95`

```ts
required_payout: pf990?.required_payout ?? (pf990?.fair_market_value_assets * 0.05 : null)
```

The actual §4942 distributable amount deducts exempt-use assets, acquisition indebtedness, and excise tax on net investment income before applying 5%. A foundation with a $2M program-related building overstates its required payout by $100K. The `payout/route.ts` already has the correct formula (deducting `exemptUseAssets`, `acquisitionIndebtedness`, `exciseTaxAmount`) — the 990-PF export needs to use the same logic.

**Fix:** Share the distributable-amount calculation from `payout/route.ts` into a utility function; call it from the 990-PF export.

---

### C6 — `avg_fair_market_value` column doesn't exist in the canonical migration
**Files:** `app/api/portfolio/[id]/compliance/payout/route.ts:75, 116`; `db/migrations/0013_tax_contributions.sql`

`payout/route.ts` reads `pf990.avg_fair_market_value` but the column only exists in `db/0062_compliance_regulatory.sql` — a legacy file outside `db/migrations/`, which CLAUDE.md marks as stale. In production the field is always null. The payout always falls back to year-end FMV (not the IRS-required average monthly FMV), and `avg_fmv_used` is always `false`. The 5% asset base is systematically wrong.

**Fix:** Add `avg_fair_market_value numeric(20,2)` to `foundation_990pf_data` in a new migration.

---

### C7 — Non-atomic grant creation leaves orphaned holdings
**File:** `app/api/org/[orgId]/grants/route.ts:203–259`

Grant creation is three sequential unguarded calls: insert holding → insert grant → insert `grant_status_history`. Compensating deletes on failure never check their own return values. Transient errors leave a `foundation_grant` holding with no corresponding `grants` row — invisible to grant management but counted in the portfolio's asset total. The `new_grantee` path also creates an `investees` row that is never cleaned up on failure.

**Fix:** Consolidate into a single RPC (or use the existing `provision_organization` pattern). The transition RPC (`transition_grant_lifecycle`) shows the right model.

---

### C8 — Core grant views bypass RLS (missing `security_invoker`)
**File:** `db/migrations/0041_task_workflow_foundation.sql:1108, 1170, 1182`

`v_grants`, `v_portfolio_grant_summary`, and `v_grant_health` are created without `WITH (security_invoker = true)`. Per CLAUDE.md, views without this flag run as the definer and bypass base-table RLS. An authenticated user from any org can query `v_grants` via the session client and read grants belonging to other orgs. `v_er_grant_compliance` on line 1245 of the same file has the flag correctly — the three others don't.

**Fix:** Add `WITH (security_invoker = true)` to all three view definitions (requires DROP and recreate, or a patch migration).

---

## High-Severity Issues

### Financial

**H1 — QuickBooks double-export on retry**
`app/api/integrations/quickbooks/export/contributions/route.ts` and `.../grants/route.ts`

QB journal entry is created before `qb_exported_at` is marked in the DB. A crash or timeout after the QB call but before the DB update causes the same records to be exported again on retry. Duplicate journal entries may be accepted by QB (DocNumber uniqueness is not always enforced, especially in sandbox mode).

**Fix:** Mark `qb_exported_at` (or an `in_flight_at` lock) before calling QB, then set `qb_journal_entry_id` after. Clear the lock if QB fails.

---

**H2 — No DB-level positive amount constraint on `contributions_received`**
`db/migrations/0014_donors.sql`

Application validates `amount > 0` but the DB has no CHECK constraint. `pledges.total_amount` and `tax_contributions.amount_usd` both have `CHECK (amount > 0)`. Any admin import, seeder, or service-role call can insert negative amounts, silently corrupting `lifetime_giving` donor aggregates.

**Fix:** `ALTER TABLE contributions_received ADD CONSTRAINT contributions_received_amount_positive CHECK (amount > 0);`

---

**H3 — QB export completeness: partial export logged as full success**
`app/api/integrations/quickbooks/export/contributions/route.ts`

Uses the user-session client against a portfolio-scoped view. If the triggering user lacks `can_view_portfolio` on some portfolios, contributions from those portfolios are silently excluded. The export reports `exported: N` but the QB ledger is missing records.

**Fix:** Use the admin client for the data-fetch phase (consistent with the subsequent `qb_exported_at` update which already uses `createAdminClient`).

---

**H4 — Pledge KPI aggregation uses JS floats on an unbounded dataset**
`app/api/org/[orgId]/pledges/route.ts:75–83`

All `pledge_installments` for the org are loaded into memory and summed using `Number(i.amount)` (IEEE 754). Summing many `numeric(20,2)` values through JS floats introduces rounding error. No row limit — large orgs will hit Supabase's 1000-row default cap silently.

**Fix:** Push KPI aggregations into a DB view or RPC; apply explicit pagination if needed.

---

**H5 — Contribution DELETE doesn't reopen linked pledge installment**
`app/api/org/[orgId]/contributions/[id]/route.ts`

On deletion, `pledge_installments.contribution_id` is set to NULL via FK cascade, but the installment's `status` stays `paid` with `paid_at` set. The installment is permanently marked paid with no backing contribution.

**Fix:** Check for a linked installment before deletion and either reject with 409 or call the `reopen` action on the installment first.

---

### Tax Records

**H6 — Carryforward `amount_remaining` is never decremented**
`lib/tax/carryforward-tracker.ts`

`applyCarryforwards()` computes the drawdown correctly in TypeScript but the result is never persisted. No route, RPC, or trigger writes the computed `amount_remaining` back to `tax_carryforwards`. Every carryforward permanently shows its full original amount.

**Fix:** Add a PATCH endpoint (or extend the existing POST) that accepts `CarryforwardApplication[]` and updates `amount_remaining` in a single transaction.

---

**H7 — Past-year tax export omits expired carryforwards**
`app/api/portfolio/[id]/tax/export/route.ts:77–80`

`v_active_carryforwards` filters on `expires_tax_year >= EXTRACT(YEAR FROM CURRENT_DATE)`. A CPA requesting the 2023 export in 2026 won't see carryforwards that were active in 2023 but expired in 2024. The export is silently incomplete.

**Fix:** Query `tax_carryforwards` directly with `originating_tax_year <= year AND expires_tax_year >= year` instead of using the view for historical exports.

---

**H8 — AGI profile POST can succeed without creating a `tax_years` row**
`app/api/portfolio/[id]/tax/profile/route.ts:127`

The upsert to `tax_years` is conditional on `if (validated.estimated_agi || validated.filing_status)` (JS truthiness). A user who saves a profile with only carryforward data gets no `tax_years` row, and `optimize` and `scenarios` routes subsequently return 400 "AGI not set." The user believes their profile is configured.

**Fix:** Change condition to `if (validated.estimated_agi != null || validated.filing_status != null)`.

---

**H9 — CPA revocation race window**
`lib/tax/cpa-public-access.ts:216–231`

The atomic `record_cpa_access` RPC validates the link and increments the counter, then releases its lock. `buildCPAPayload` runs afterwards using the admin client (which bypasses RLS). A link revoked between these two steps still returns data — revocation is checked once at the start, not held across the data fetch.

**Fix:** Pass revocation status into `buildCPAPayload` and re-check after the lock, or move the access log to the end (log only what was actually returned).

---

### Board Materials & Compliance

**H10 — Deprovisioned users retain board report access**
`lib/portfolio-auth.ts:53–57`

`requirePortfolioAccess` queries `portfolio_members` with no `deleted_at` filter. Soft-deleting from `organization_members` does not cascade. A deprovisioned user can still call any portfolio-scoped route (board reports, KPI series, tax export, etc.) if their `portfolio_members` row was not explicitly removed.

**Fix:** Add `.is('deleted_at', null)` filter to `portfolio_members` query in `requirePortfolioAccess`, or check org membership first.

---

**H11 — Audit log has no writers**
`db/migrations/0024_settings_ops_hub.sql`; `app/api/org/[orgId]/audit/route.ts`

`org_audit_log` is readable but nothing writes to it. Zero application code inserts audit entries. A board requesting a log of who generated a report, changed a filing status, or recorded a grant payment will see an empty table.

**Fix:** Instrument material write operations (receipt generation, grant transitions, 990-PF export, filing status changes) with audit log inserts via the service-role client.

---

**H12 — Payout forecast silently reports "on track" when data is missing**
`app/api/portfolio/[id]/compliance/payout-forecast/route.ts:76`

```ts
const distributableAmount = payout?.distributable_amount ?? 0;
```

When no `payout_history` row exists (common mid-year), this produces `distributableAmount = 0`, `shortfall = 0`, `onTrack = true`. Missing data looks identical to full compliance.

**Fix:** Return `{ data_missing: true, on_track: null }` when no payout history exists for the year.

---

**H13 — DQP soft-delete sets `end_date` but not `is_active`**
`app/api/org/[orgId]/compliance/disqualified-persons/route.ts:175–178`

No trigger syncs them. The default active list filters on `is_active = true`, so deleted DQPs remain in the active list until an admin also toggles `is_active` separately.

**Fix:** Update both fields in the DELETE handler, or add a trigger: `SET is_active = false WHERE end_date <= CURRENT_DATE`.

---

### Grantee Obligations

**H14 — No cap on grant payments vs. approved amount**
`lib/ai/assistant/executors/grants.ts:149–205`

`recordGrantPayment` inserts without checking whether cumulative disbursements would exceed `grants.approved_amount`. Total payments can silently exceed the board-approved cap with no error.

**Fix:** Before inserting, query `SUM(amount) WHERE grant_id = ? AND status != 'cancelled'` and reject if the new payment would breach `approved_amount`.

---

**H15 — Grant decisions are not append-only**
`db/migrations/0041_task_workflow_foundation.sql:1000–1003`

The RLS policy is `FOR ALL TO authenticated USING (is_org_admin(org_id))`. `FOR ALL` includes UPDATE and DELETE. Board approval records can be silently modified or deleted after the fact.

**Fix:** Change to `FOR SELECT` and `FOR INSERT` only for authenticated users. Service role retains full access.

---

**H16 — Grant document DELETE: storage deleted before DB record**
`app/api/portfolio/[id]/grants/[grantId]/documents/route.ts:261–270`

Storage object is removed first. If the DB delete then fails, the row stays pointing to a non-existent storage path. The next GET calls `createSignedUrl` inside `Promise.all` with no per-item error handling — one failure throws and the entire document list for the grant returns 500.

**Fix:** Delete the DB record first, then delete from storage. The worst case is a leaked storage file (acceptable); the current worst case is a permanently broken document list.

---

**H17 — `overdue` milestone status is never auto-set**
`db/migrations/0041_task_workflow_foundation.sql:212`

`grant_milestones.status` has `'overdue'` as a valid CHECK value but no trigger, scheduled function, or application code ever transitions milestones to it. `.eq('status', 'overdue')` always returns zero rows regardless of due dates. Any client filtering on this column silently shows "no overdue milestones."

**Fix:** Add a DB trigger (or nightly function) that sets `status = 'overdue'` when `due_date < CURRENT_DATE AND status IN ('pending', 'in_progress')`, or remove `'overdue'` from the CHECK and document that overdue state is computed from dates only.

---

**H18 — Bulk grant transition has no all-or-nothing guarantee**
`app/api/org/[orgId]/grants/bulk-transition/route.ts`

Each grant transitions atomically (via RPC) but the batch as a whole is not. If 6 of 10 succeed and the 7th fails, the first 6 are permanently committed. For a year-end cohort push this leaves half the pipeline in the new stage. The API returns a 207 but there is no rollback option.

**Fix:** Document the partial-application behavior explicitly in the API contract; consider a `dry_run` mode and a `rollbackOnError` flag for high-stakes batch operations.

---

## What's Working Correctly

These invariants were verified as correctly implemented:

- **AGI source chain in AI executor** (`lib/ai/assistant/executors/tax.ts`): queries `tax_years.adjusted_gross_income` first, falls back to `tax_profiles.estimated_agi`, returns null with explicit error — no silent default.
- **Carryforward data source in AI tools**: queries `tax_carryforwards` directly, not the legacy `is_carryforward` flag on `tax_contributions`.
- **CPA token hashing** (`lib/tax/cpa-collaboration.ts`): SHA-256, timing-safe comparison, raw token stripped from all responses.
- **Tax document storage** (`app/api/portfolio/[id]/tax/contributions/[contributionId]/documents/route.ts`): admin client for all storage ops, `createSignedUrl` (never `getPublicUrl`).
- **Grant lifecycle transition enforcement** (`lib/grants/lifecycle.ts`): `canTransition` correctly gates stage advancement; the `transition_grant_lifecycle` RPC is atomic.
- **`v_er_grant_compliance`** security invoker: correctly set on line 1245 of migration 0041.
- **Tax views security invoker**: all six tax views in migration 0013 use `WITH (security_invoker = true)`.

---

## Triage Order

| Priority | Issues | Why |
|---|---|---|
| Immediate | C3 | Tax auth is broken today — users cannot delete tax contributions |
| Immediate | C4, C5, C6 | Compliance numbers on board materials are wrong — the highest-stakes user-visible surface |
| This sprint | C1, C2, C7 | Non-atomic financial writes that corrupt records on transient failure |
| This sprint | C8 | Cross-org grant data leak via views — security boundary violation |
| Next sprint | H6, H7, H8 | Tax carryforward integrity (data permanently wrong) |
| Next sprint | H10, H11, H15 | Auth/audit gaps (deprovisioned users, empty audit log, mutable decisions) |
| Next sprint | H1, H3 | QB double-export + completeness |
| Backlog | H2, H4, H5, H9, H12–H14, H16–H18 | Real but lower operational impact; schedule for hardening sprint |
