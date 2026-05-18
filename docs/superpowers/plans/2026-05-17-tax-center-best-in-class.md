# Tax Center Best-In-Class Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Tax Center to a trusted, production-grade state: portfolio-scoped access everywhere, private document storage, real CPA collaboration, canonical holding imports, accurate exports, AI tax tools aligned with the same model as the UI, and contract tests that keep the module from drifting again.

**Architecture:** Treat this as prerelease quality work. Prefer optimizing the active schema and contracts over compatibility shims. Sensitive tax data must be protected at the DB layer, route layer, storage layer, and AI/tool layer.

**Tech Stack:** PostgreSQL 15, Supabase RLS and Storage, Next.js App Router, TypeScript, React, Vitest.

---

## Verified Facts (from codebase audit before writing this plan)

These were open questions at review time; they are now resolved and the tasks below reflect the correct state:

| Question | Answer |
|----------|--------|
| Do `can_view_portfolio` / `can_edit_portfolio` helpers exist? | **Yes.** Both are defined in `db/migrations/0001_extensions_and_shared_infra.sql`. All task references to them are correct. |
| Are tax views `SECURITY INVOKER`? | **They must be explicit.** Plain PostgreSQL/Supabase views are not security-invoker by default and can bypass base-table RLS. Tax views must use `WITH (security_invoker = true)` and routes should still perform explicit portfolio access checks for crisp 403 behavior. |
| Is `get_donation_capacity` secure? | Functionally yes — it is `STABLE` (not `SECURITY DEFINER`), so RLS on `v_portfolio_tax_summary` → `tax_years` + `tax_contributions` applies. However it returns empty results rather than an error for unauthorized access. Task 1 adds an explicit `can_view_portfolio` guard so unauthorized callers receive a 403 instead of empty rows. |
| Is the `tax-documents` storage bucket created in migrations? | **No.** `0013_tax_contributions.sql` only stores the bucket name as a column default. The bucket itself is never created. Task 2 fixes this. |
| Where exactly is `getPublicUrl` used? | `app/api/portfolio/[id]/tax/contributions/[contributionId]/documents/route.ts` line 152 (upload response). The download route correctly uses `createSignedUrl`. |
| What is the `other` vs `other_property` inconsistency? | `tax_contributions.contribution_type` correctly uses `other_property`. `daf_grants.contribution_type` uses `other` — this is the stale value. Task 5 aligns `daf_grants` to canonical types. |
| What is `owner_tax_profiles` and should it be dropped? | `db/migrations/0012_owner_tax_profile.sql` defines a narrow personal tax profile table (AGI, filing status, user_id). Since this is prerelease and `tax_profiles` / `tax_years` cover the same data at portfolio scope, `owner_tax_profiles` is legacy. Task 0 drops it and removes all references before any other task runs. |
| Migration strategy for this plan? | Fixes to existing Tax Center schema fold into `0013_tax_contributions.sql`. CPA collaboration schema (new feature surface) goes into a new active migration `0043_tax_cpa_sharing.sql`. `owner_tax_profiles` removal goes into `0012_owner_tax_profile.sql`. |

---

## Review Findings This Plan Fixes

| Priority | Finding | Primary Files |
|----------|---------|---------------|
| P0 | Tax views and `get_donation_capacity` can bypass portfolio RLS via missing route-layer guards | `db/migrations/0013_tax_contributions.sql`, tax GET routes |
| P0 | `owner_tax_profiles` table is a stale legacy schema that AI and routes still reference | `db/migrations/0012_owner_tax_profile.sql` |
| P1 | CPA sharing is exposed but missing schema, revoke RPC, rate limiting, and public token page | `app/api/portfolio/[id]/tax/cpa-share/route.ts`, `components/tax/CPACollaborationPortal.tsx` |
| P1 | Tax document upload uses a missing `tax-documents` storage bucket | `db/migrations/0013_tax_contributions.sql`, document routes |
| P1 | Tax document upload returns a public URL instead of a signed URL | `app/api/portfolio/[id]/tax/contributions/[contributionId]/documents/route.ts:152` |
| P1 | Holding tax record route writes stale tax columns and checks stale roles | `app/api/holdings/[id]/create-tax-record/route.ts` |
| P1 | Holdings importer can generate invalid contribution types | `lib/helpers/tax-holding-link.ts`, `components/tax/HoldingsImporter.tsx` |
| P1 | `daf_grants.contribution_type` uses `other` not `other_property` | `db/migrations/0013_tax_contributions.sql` |
| P1 | AI tax tools read stale owner-tax/carryforward models | `lib/ai/assistant/executor.ts` |
| P2 | Tax exports omit `property_description` | `app/api/portfolio/[id]/tax/export/route.ts` |
| P2 | Tax route auth tests cover only a small subset of routes | `lib/__tests__/tax-routes.auth.test.ts` |

---

## Target Product Standard

Tax Center should feel like a serious tax workspace, not a reporting add-on:

- Every tax read is portfolio-scoped and module-gated.
- DB views/RPCs cannot leak AGI, contributions, carryforwards, documents, or CPA share metadata.
- Tax documents are private by default and accessed only through signed URLs after authorization.
- CPA collaboration supports revocable, audited, least-privilege share links.
- Holding imports create canonical `tax_contributions` rows that pass the same schema as manual entry.
- Exports preserve the fields CPAs need: property description, FMV, cost basis, appraisal fields, acquisition dates, recipient EIN, substantiation state, and carryforward metadata.
- AI tools use the same canonical tax-year, contribution, and carryforward data as the UI.
- Contract tests prevent stale table names, stale columns, invalid enum values, public document URLs, and unauthenticated tax routes from reappearing.

---

## File Map

| Area | Files |
|------|-------|
| Legacy tax profile removal | `db/migrations/0012_owner_tax_profile.sql` |
| DB tax schema and RLS | `db/migrations/0013_tax_contributions.sql` |
| Storage migration | `db/migrations/0013_tax_contributions.sql` |
| CPA sharing schema | `db/migrations/0043_tax_cpa_sharing.sql` (new) |
| CPA sharing API | `app/api/portfolio/[id]/tax/cpa-share/route.ts` |
| CPA public access | `app/tax/cpa/[token]/page.tsx`, `app/api/tax/cpa/[token]/**` |
| Tax dashboard | `app/dashboard/tax/page.tsx`, `components/tax/CPACollaborationPortal.tsx` |
| Contribution documents | `app/api/portfolio/[id]/tax/contributions/[contributionId]/documents/**` |
| Holding import | `app/api/holdings/[id]/create-tax-record/route.ts`, `components/tax/HoldingsImporter.tsx`, `lib/helpers/tax-holding-link.ts` |
| Tax exports | `app/api/portfolio/[id]/tax/export/route.ts`, `lib/tax/turbotax-export.ts` |
| AI tax tools | `lib/ai/assistant/executor.ts`, future split modules under `lib/ai/assistant/executors/tax.ts` |
| Tests | `lib/__tests__/tax-routes.auth.test.ts`, `app/api/__tests__/schema-contract.test.ts`, new tax contract tests as needed |
| Agent docs | `AGENTS.md`, `CLAUDE.md` |

---

## Task 0: Drop `owner_tax_profiles` And Remove All References

**Why first:** Every other task in this plan should be written against the canonical tax data model. Starting with stale references in place risks new code silently inheriting the old pattern.

**Files:**
- Modify: `db/migrations/0012_owner_tax_profile.sql`
- Search and remove: any import, query, or type that references `owner_tax_profiles` across the codebase

- [ ] Add a failing contract test asserting `owner_tax_profiles` does not appear in any migration.
- [ ] Remove the `CREATE TABLE owner_tax_profiles` block, its indexes, triggers, RLS policies, and grants from `0012_owner_tax_profile.sql`.
- [ ] Search the full codebase (`grep -r owner_tax_profiles`) and remove every reference: route queries, executor reads, type definitions, Zod schemas, component props.
- [ ] Where code removed AGI from `owner_tax_profiles`, add a comment noting the canonical source is `tax_years.adjusted_gross_income` — do not replace with a new read yet (Task 6 handles that).
- [ ] Run `npx tsc --noEmit` and confirm no type errors remain.

Acceptance:

- `owner_tax_profiles` does not exist in the migration set or anywhere in application code.
- TypeScript compiles cleanly after removal.

---

## Task 1: Lock Down Tax Views, RPCs, And GET Routes

**Context:** The underlying tables already have correct RLS (`can_view_portfolio` + `org_has_module('tax')`). Tax views must also be declared with `WITH (security_invoker = true)` so direct view reads preserve base-table RLS. Routes should still assert `can_view_portfolio` before reading views so unauthorized callers receive a proper 403 rather than an empty result.

**Files:**
- Modify: `db/migrations/0013_tax_contributions.sql`
- Modify: tax GET routes under `app/api/portfolio/[id]/tax/**`
- Modify/add: `lib/__tests__/tax-routes.auth.test.ts`
- Modify/add: `app/api/__tests__/schema-contract.test.ts`

- [ ] Add a failing contract test asserting `get_donation_capacity` includes a `can_view_portfolio(p_portfolio_id)` guard before returning rows (currently it relies on RLS returning empty rows — the guard makes it explicit and returns an error instead).
- [ ] Add a route inventory test for all tax routes:
  - `profile`
  - `overview`
  - `summary`
  - `contributions`
  - `contributions/[contributionId]`
  - `contributions/[contributionId]/documents`
  - `contributions/[contributionId]/documents/[documentId]`
  - `carryforwards`
  - `form8283`
  - `export`
  - `scenarios`
  - `optimize`
  - `cpa-share`
- [ ] Update `get_donation_capacity` to call `can_view_portfolio(p_portfolio_id)` at the top of the function body and raise an exception if it returns false.
- [ ] Add explicit `can_view_portfolio` / `can_edit_portfolio` checks to every tax route before querying sensitive tables/views. These helpers are defined in `0001_extensions_and_shared_infra.sql` and available to all routes via `supabase.rpc`.
- [ ] Run the targeted tests and `npx tsc --noEmit`.

Acceptance:

- An authenticated user with no portfolio membership calling any tax route receives a 403, not empty data.
- The security contract is enforced in tests, not just by convention.
- All Tax Center GET routes have explicit access checks before sensitive reads.

---

## Task 2: Make Tax Document Storage Real And Private

**Files:**
- Modify: `db/migrations/0013_tax_contributions.sql`
- Modify: `app/api/portfolio/[id]/tax/contributions/[contributionId]/documents/route.ts`
- Modify: `app/api/portfolio/[id]/tax/contributions/[contributionId]/documents/[documentId]/route.ts`
- Modify/add: tax storage contract tests

- [ ] Add `INSERT INTO storage.buckets (id, name, public) VALUES ('tax-documents', 'tax-documents', false) ON CONFLICT DO NOTHING;` to `0013_tax_contributions.sql`.
- [ ] Add storage policies that allow authenticated users to read/write only documents tied to portfolios they can access/edit.
- [ ] Ensure service role keeps full access for server-side cleanup and generation.
- [ ] In `documents/route.ts` line 152: replace `getPublicUrl(storagePath)` with `createSignedUrl(storagePath, 3600)`. Return the signed URL in the upload response.
- [ ] Confirm `documents/[documentId]/route.ts` already uses `createSignedUrl` (it does — no change needed).
- [ ] Ensure upload paths do not duplicate the bucket name inside object paths unless that is intentional and tested.
- [ ] Add tests asserting Tax Center never returns public document URLs.
- [ ] Add tests asserting the active migrations contain the `tax-documents` bucket and storage policies.

Acceptance:

- Document uploads work on a clean DB.
- Tax documents are private by default.
- Users only receive signed URLs after route-level and DB-level authorization.

---

## Task 3: Ship CPA Collaboration As A Real Product Surface

**Scope note:** This is the largest task in the plan. It is split into two phases. Phase A (schema + hide broken UI) must ship in the same implementation pass as Tasks 0–2. Phase B (public portal + full product surface) may follow in a subsequent pass. Do not leave Phase A incomplete — a broken CPA panel exposed to users is worse than no panel.

### Phase A: Schema And Hide (required)

**Files:**
- Add: `db/migrations/0043_tax_cpa_sharing.sql`
- Modify: `components/tax/CPACollaborationPortal.tsx`

- [ ] Create `db/migrations/0043_tax_cpa_sharing.sql` with:
  - `cpa_share_links`: `id`, `portfolio_id`, `org_id`, `token_hash` (SHA-256 of raw token), CPA name/email/firm, `allowed_tax_years` (integer array), `permissions` (JSONB), `expires_at`, `max_access_count`, `access_count`, `revoked_at`, `created_by`, `notes`, `created_at`, `updated_at`.
  - `cpa_access_logs`: `id`, `share_link_id`, `action`, `resource`, IP (text), user agent, `created_at`.
  - RLS on both tables: read/write via `can_view_portfolio(portfolio_id)` and `can_edit_portfolio(portfolio_id)`.
  - Service role full access policies.
- [ ] Store only `token_hash` (SHA-256) in the database. The raw token is shown once at creation and never persisted.
- [ ] Gate `CPACollaborationPortal` behind a `cpaCollaborationEnabled` feature flag (a simple `const` in the component file). Set to `false` until Phase B is complete.
- [ ] Add a test asserting the migration contains `cpa_share_links` and `cpa_access_logs`.

### Phase B: Public Portal And Full Product Surface

**Files:**
- Modify: `app/api/portfolio/[id]/tax/cpa-share/route.ts`
- Add: `app/tax/cpa/[token]/page.tsx`
- Add: `app/api/tax/cpa/[token]/route.ts`
- Add: `app/api/tax/cpa/[token]/download/route.ts`
- Modify: `components/tax/CPACollaborationPortal.tsx`
- Modify/add: CPA tests

- [ ] Implement token creation: generate a cryptographically random token, store only the SHA-256 hash, return the raw token once.
- [ ] Implement revoke as a `PATCH` on the cpa-share route that sets `revoked_at = NOW()`.
- [ ] Build `/tax/cpa/[token]` as a read-only portal for valid, unexpired, unrevoked share links.
  - Hash the incoming token before DB lookup.
  - Add rate limiting on this route (use `@upstash/ratelimit` — already a project dependency) to prevent token enumeration. Use a sliding window of 20 requests/minute keyed on IP.
  - Use a timing-safe comparison (`crypto.timingSafeEqual`) when comparing token hashes.
  - Render empty/expired/revoked states.
- [ ] Enforce share permissions for contribution lists, carryforwards, summaries, documents, Form 8283, and TXF downloads.
- [ ] Increment `access_count` and write a `cpa_access_logs` row for every view and download.
- [ ] Set `cpaCollaborationEnabled = true` in `CPACollaborationPortal.tsx` once the portal page is live.
- [ ] Add tests for token creation, token hashing, revoke, expiration, max-access limits, permission filtering, and access logging.

Acceptance:

- The dashboard does not expose a broken CPA panel (Phase A).
- CPA links point to a real, audited, least-privilege public experience (Phase B).
- Leaked DB rows cannot be used as raw access tokens.
- The public token endpoint cannot be brute-forced without triggering rate limits.

---

## Task 4: Repair Holding-To-Tax Contribution Creation

**Files:**
- Modify: `app/api/holdings/[id]/create-tax-record/route.ts`
- Modify: `lib/helpers/tax-holding-link.ts`
- Modify/add: holding tax route tests

- [ ] Replace direct `portfolio_members.role IN ('owner','editor')` checks with the canonical `can_edit_portfolio` helper.
- [ ] Insert canonical `tax_contributions` columns: `contribution_date`, `tax_year`, `portfolio_id`, `holding_id`, `contribution_type`, `amount_usd`, `fmv_at_donation`, `cost_basis`, `recipient_name`, `property_description`, and `notes`.
- [ ] Remove stale `donation_date` and `deduction_year` writes.
- [ ] Derive `tax_year` from the chosen contribution date.
- [ ] Use `.maybeSingle()` for duplicate checks so "no existing tax contribution" is not treated as an exceptional path.
- [ ] Reuse the shared tax contribution schema/service where practical so manual entry and holding import cannot drift.
- [ ] Add tests for cash, non-cash, duplicate, and unauthorized holding import cases.

Acceptance:

- Creating a tax contribution from a holding succeeds on the canonical schema.
- Admin/edit-capable users are allowed according to current portfolio auth, not stale role names.
- Duplicate protection still works.

---

## Task 5: Normalize Contribution Type Mapping

**Files:**
- Modify: `lib/helpers/tax-holding-link.ts`
- Modify: `components/tax/HoldingsImporter.tsx`
- Modify: `lib/tax/constants.ts`
- Modify: `db/migrations/0013_tax_contributions.sql` (fix `daf_grants` CHECK constraint)
- Modify/add: mapping tests

- [ ] The canonical contribution types are: `cash`, `check`, `wire`, `stock`, `crypto`, `real_estate`, `other_property`. Keep the TypeScript union, Zod schema, constants, and `tax_contributions.contribution_type` CHECK constraint aligned to exactly these seven values.
- [ ] In `0013_tax_contributions.sql`: update the `daf_grants.contribution_type` CHECK constraint from `('cash', 'stock', 'crypto', 'other')` to `('cash', 'check', 'wire', 'stock', 'crypto', 'real_estate', 'other_property')` to match the canonical set. (The old `other` value is subsumed by `other_property`.)
- [ ] Remove unsupported types from helper labels: `ach`, `art`, `vehicle`. The free-form `other` value is removed in favor of `other_property`.
- [ ] Map QCD-style assets to a canonical cash-like type plus `qcd_qualified = true` and clear notes.
- [ ] Map artwork/collectibles to `other_property` with property description and appraisal metadata.
- [ ] Make `isContributionTypeValid` enforce only values that the DB accepts.
- [ ] Add a contract test that helper contribution types are a subset of `createTaxContributionSchema` and the DB constraint.

Acceptance:

- Holding import cannot generate a contribution type rejected by validation or Postgres.
- `daf_grants` and `tax_contributions` share the same canonical type set.
- QCD and artwork flows preserve meaningful tax metadata without inventing unsupported enum values.

---

## Task 6: Align AI Tax Tools With Canonical Tax Center Data

**Files:**
- Modify: `lib/ai/assistant/executor.ts`
- Prefer add: `lib/ai/assistant/executors/tax.ts`
- Modify/add: AI tool contract tests

- [ ] Move tax executor logic into a dedicated tax executor module if the assistant split is in progress.
- [ ] Read AGI from `tax_years.adjusted_gross_income` for the requested year, falling back to `tax_profiles.estimated_agi` only if needed. (`owner_tax_profiles` was removed in Task 0 — do not recreate reads from it.)
- [ ] Do not silently default AGI to `500000`. If AGI is missing, return an explicit missing-input result or ask the user for AGI.
- [ ] Read carryforwards from `tax_carryforwards` or `v_active_carryforwards`, not `tax_contributions.is_carryforward`.
- [ ] Use existing tax calculation utilities where possible instead of duplicating AGI-limit logic in the assistant executor.
- [ ] Ensure all AI tax reads are portfolio-scoped and use the same access model as the route layer.
- [ ] Add tests that prevent AI tax tools from selecting stale columns/tables.

Acceptance:

- AI tax answers match the Tax Center data the user entered.
- The assistant cannot fabricate tax calculations from arbitrary defaults without disclosure.
- Contract tests fail if stale owner-tax/carryforward patterns return.

---

## Task 7: Fix Tax Export Fidelity

**Files:**
- Modify: `app/api/portfolio/[id]/tax/export/route.ts`
- Modify: `lib/tax/turbotax-export.ts`
- Modify/add: export snapshot tests

- [ ] Map `property_description` from `c.property_description`, not `c.notes`.
- [ ] Include property description consistently in CSV, XLSX, TXF, Form 8283, and carryforward exports.
- [ ] Include FMV, cost basis, date acquired, appraisal fields, recipient EIN, substantiation status, and QCD flag where each format supports them.
- [ ] Ensure non-cash exports are sorted and grouped in a CPA-friendly way.
- [ ] Add snapshot tests for:
  - cash gift
  - appreciated stock gift
  - real estate gift
  - other property gift requiring appraisal
  - QCD gift
  - carryforward row

Acceptance:

- Export output preserves the user-entered tax-prep fields.
- Non-cash contribution exports no longer collapse property detail into notes.

---

## Task 8: Expand The Tax Safety Net

**Files:**
- Modify: `lib/__tests__/tax-routes.auth.test.ts`
- Modify: `app/api/__tests__/schema-contract.test.ts`
- Add: `lib/__tests__/tax-schema-contract.test.ts`
- Add: `lib/__tests__/tax-ai-contract.test.ts`
- Add: `lib/__tests__/tax-export-contract.test.ts`

- [ ] Build a route inventory test that fails when a new tax route lacks an explicit access guard.
- [ ] Add DB contract tests for:
  - `owner_tax_profiles` does not exist in migrations (from Task 0)
  - `get_donation_capacity` includes `can_view_portfolio` guard
  - `tax-documents` storage bucket and storage policies exist in migrations
  - `cpa_share_links` and `cpa_access_logs` tables exist (from Task 3 Phase A)
  - `daf_grants.contribution_type` uses canonical values (no `other`, `ach`, `art`, `vehicle`)
  - contribution type enum alignment across `tax_contributions`, `daf_grants`, TypeScript constants, and Zod schema
- [ ] Add route-source tests preventing `getPublicUrl` in tax document routes.
- [ ] Add AI source tests preventing stale `owner_tax_profiles.agi`, `is_carryforward`, and nonexistent tax columns in assistant tools.
- [ ] Add export tests for property description and non-cash fields.
- [ ] Run:

```bash
npx tsc --noEmit
npm run test:run -- lib/__tests__/tax-routes.auth.test.ts app/api/__tests__/schema-contract.test.ts lib/__tests__/tax-schema-contract.test.ts lib/__tests__/tax-ai-contract.test.ts lib/__tests__/tax-export-contract.test.ts
```

Acceptance:

- Future tax work cannot add routes, views, storage references, AI tools, or exports that bypass the canonical contract.

---

## Task 9: Update Agent Documentation

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

- [ ] Document `tax_profiles`, `tax_years`, `tax_contributions`, `tax_carryforwards`, and `tax_documents` as the canonical Tax Center tables.
- [ ] Document that `owner_tax_profiles` has been dropped and must not be recreated. The canonical source for personal AGI data is `tax_years.adjusted_gross_income`.
- [ ] Document the canonical contribution type values: `cash`, `check`, `wire`, `stock`, `crypto`, `real_estate`, `other_property`. Note that `daf_grants` uses the same set.
- [ ] Document that tax documents must use the private `tax-documents` storage bucket and signed URLs.
- [ ] Document that tax views must use `WITH (security_invoker = true)` and all tax routes must still call `can_view_portfolio` explicitly before reading views to return a proper 403 on unauthorized access.
- [ ] Document CPA sharing schema and token hashing once Phase A of Task 3 is complete. Update when Phase B ships.
- [ ] Document that `can_view_portfolio` and `can_edit_portfolio` are defined in `0001_extensions_and_shared_infra.sql` and are available to all tax route code.

Acceptance:

- Future agents have a clear Tax Center canon and do not regenerate stale table/column patterns.

---

## Recommended Implementation Order

1. Task 0: drop `owner_tax_profiles` and all references — establishes the canonical data model before any new code is written.
2. Task 1: lock down tax data access.
3. Task 2: make document storage private and real.
4. Task 3 Phase A: add CPA schema migration and hide the broken panel.
5. Task 4 and Task 5: repair holding import and contribution type mapping (including `daf_grants`).
6. Task 3 Phase B: ship the public CPA portal with rate limiting and access logging.
7. Task 6: align AI tax tools.
8. Task 7: fix export fidelity.
9. Task 8 and Task 9: broaden tests and document the canon.

This order protects sensitive data first (0→1→2), removes clean-DB breakage second (3A→4→5), ships the CPA feature properly (3B), then raises product quality without building more behavior on unstable contracts (6→7→8→9).

---

## Verification Plan

- [ ] `npx tsc --noEmit`
- [ ] `npm run test:run -- lib/__tests__/tax-routes.auth.test.ts`
- [ ] `npm run test:run -- app/api/__tests__/schema-contract.test.ts`
- [ ] `npm run test:run -- lib/__tests__/tax-schema-contract.test.ts`
- [ ] `npm run test:run -- lib/__tests__/tax-ai-contract.test.ts`
- [ ] `npm run test:run -- lib/__tests__/tax-export-contract.test.ts`
- [ ] Manual route sweep for Tax Center dashboard:
  - profile save
  - contribution create
  - holding import
  - document upload/download
  - carryforward display
  - export download
  - CPA share create/revoke/public access
  - AI tax scenario/carryforward answers
