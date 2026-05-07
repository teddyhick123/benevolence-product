# Benevolence Module Review — Master Summary

Reviewed: 2026-04-26 | Updated: 2026-04-30 (Sprint A complete)
Scope: All 10 active product modules, reviewed by parallel subagent inspection of source code.
Individual reviews: `docs/module-reviews/*.md`

**Sprint A resolved (2026-04-30):** compliance org_id column, compliance state-registrations columns, QB schema + connect/disconnect + admin-only role checks, donor CRM org_id + v_donor_summary view, holdings update-basic + link-charity auth, AI chat rate limiting + viewer write guard, admin import commit (writes rows) + resume/rollback buttons.

---

## Scoreboard

| Module | Rating | Status |
|--------|--------|--------|
| AI Assistant (Ben) | **7.5/10** | Shippable — rate limiting + viewer guard fixed |
| Admin / Import | **7/10** | Commit bug fixed; mapping assist still sends empty samples |
| Tax Center | **6.5/10** | Shippable after calc fixes + uncommenting CPA portal |
| Visualizations / Widgets | **6.5/10** | Shippable after waterfall bug + registry fix |
| Holdings | **6/10** | Auth fixed; list page + grant UI still absent |
| QuickBooks | **6/10** | Schema fixed; duplicate export + token encryption remain |
| Dashboard | **5.5/10** | UX gaps, triple-fetch bug, missing payout gauge |
| Compliance | **5/10** | Column mismatches fixed; payout formula + IRS accuracy broken |
| Donor CRM | **5/10** | org_id + view fixed; contribution_id array + PDF PII remain |
| Charities | **3/10** | **Non-functional** — schema/code diverged, add-to-portfolio broken |

**Platform average: 5.8/10** (was 5.2/10 before Sprint A)

---

## Critical / Production-Blocking Issues

These must be fixed before any module is shown to a paying customer.

### 1. Compliance payout column mismatch

`app/api/portfolio/[id]/compliance/payout/route.ts:46,52` and `app/api/portfolio/[id]/compliance/990pf-export/route.ts:45,56,57,93,94` reference `amount_usd` and `property_description` — columns that do not exist in `tax_contributions`. All payout calculations return $0.

**Fix:** replace `amount_usd` with `fair_market_value` and `property_description` with `asset_description` (or verify correct column names against `0009_tax_optimization.sql`).

### 2. Acknowledgment write failure (Donor CRM)

`app/api/org/[orgId]/acknowledgments/route.ts:67` inserts `contribution_id` (singular UUID) but the `acknowledgments` table schema defines `contribution_ids` (UUID array). Every new acknowledgment write fails at the DB constraint.

**Fix:** change the insert to `contribution_ids: [args.contribution_id]` or update to accept an array upstream.

### 3. Donor PDF PII exposed (Donor CRM)

Acknowledgment PDFs are stored with `getPublicUrl()` which produces an unauthenticated public URL. Donor names, addresses, and giving amounts are accessible to anyone with the URL.

**Fix:** use `createSignedUrl()` with a short TTL (e.g., 1 hour) and return the signed URL per-request rather than storing a permanent public link.

### 4. Charities schema drift (dozens of mismatches)

The charities API and components reference columns that do not match `0010_charities_and_news.sql`:

| Code references | DB column | Impact |
|----------------|-----------|--------|
| `mission_statement` | `mission` | Every charity detail page shows blank mission |
| `annual_revenue` | `total_revenue` | Revenue always null |
| `programs_expense_ratio` | `program_expense_ratio` | Ratio always null |
| `ntee_major` / `ntee_minor` | `ntee_code` (single field) | Category filter broken |
| `contact_email` / `contact_phone` | not in schema | Contact section blank |

**Fix:** write a schema reconciliation and update API column references.

### 5. Charities — three tables referenced but never created

`app/api/charities/[ein]/route.ts` and associated components query:
- `charity_impact_stories` — does not exist
- `charity_activity_feed` — does not exist
- `charity_rating_cache` — does not exist

Impact and Activity tabs throw 500s in production.

**Fix:** either create these tables with appropriate RLS or remove the unreachable UI tabs.

### 6. Charities — add-to-portfolio inserts wrong columns

`app/api/charities/[ein]/add-to-portfolio/route.ts` inserts into `portfolio_recommendations` using column names that don't match the migration DDL. The add-to-portfolio flow silently fails for every user.

**Fix:** audit column names against `0010_charities_and_news.sql` and correct the insert statement.

---

## High-Priority Issues by Module

### Dashboard (5.5/10)
- Triple-fetch: `AllAssetsOverview`, `HoldingsSection`, `PieAutoRenderer` all independently hit the same holdings endpoint with different `limit` values — pie chart and table can show inconsistent totals
- KPI delta prop is always `undefined` — trend arrows never render despite being wired up
- No date-range / fiscal-year filter — all numbers are lifetime totals
- "AI Interface" button label is confusing — links to `/dashboard/letter`, not a chat interface
- Board report API exists (`/api/portfolio/[id]/board-report`) but is not surfaced anywhere on the dashboard
- 5% payout gauge absent from dashboard (buried in `/compliance`)

### Holdings (6/10)
- `app/dashboard/holdings/page.tsx` does not exist — no entry point to the module
- Grant milestones, report due dates, and grant period status have APIs but zero UI
- `supabasePublic()` (anonymous client, bypasses RLS) used in the holdings list GET route
- `financial-profile/generate` silently uses GPT-4o instead of Claude — undocumented divergence
- `approveAll()` in `ReportUploader` processes staged facts serially with empty catch blocks

### Tax Center (6.5/10)
- Conservation easement AGI limit (50% under IRC §170(b)(1)(E)) implemented in scenario calculator but absent from stored-contribution calculator — can produce $400k+ errors in reported tax position
- `lib/tax/form8283-generator.ts:61–62` — publicly traded stock routed to Section B (appraisal required) instead of Section A regardless of value
- Optimization engine ignores the 60% cash AGI bucket entirely
- Short-term vs long-term capital gain distinction absent — all appreciated-asset deductions inflated for assets held <12 months
- `CPACollaborationPortal` is fully built but hard-commented out in `page.tsx:15` — uncomment + fix hardcoded `app.benevolence.com` URL in `cpa-collaboration.ts:64`
- `optimize/route.ts` and `scenarios/route.ts` emit raw AGI values to production console log

### Compliance (5/10)
- Payout column mismatch — see Critical §1 above
- 5% minimum distribution calculation (`netAssets * 0.05`) does not match IRS Form 990-PF Part XIII — missing monthly FMV averaging, exempt-use asset deduction, acquisition indebtedness deduction, excise tax deduction. A foundation relying on this tool risks IRC §4942 excise tax.
- `reminder_days` column drives zero behavior — no cron job, Edge Function, or email delivery
- Status enums three-way misaligned between DB (`'upcoming'`), TypeScript (`'pending'/'n_a'`), and UI (only activates on `'pending'`/`'overdue'`)
- State registrations UI does not render (API exists, page doesn't surface it)

### QuickBooks (6/10)
- No duplicate export guard — re-running export creates duplicate QB journal entries
- Grants exported by `total_committed` rather than disbursed amounts — double-counts multi-year grants
- No QB Class/fund dimension support — required under ASC 958 for private foundations; accountants must manually reclassify every entry
- `refresh_expires_at` column never read — 101-day refresh token expiry goes undetected until complete auth failure
- Access tokens stored as plaintext `TEXT` in Postgres

### Donor CRM (5/10)
- Acknowledgment write failure — see Critical §2 above
- PDF PII exposure — see Critical §3 above
- `app/dashboard/donors/new/page.tsx` does not exist — "Add Donor" CTA 404s
- Non-cash donation acknowledgment template is IRS non-compliant (missing good-faith estimate of goods/services received)
- Letter generator (`/dashboard/letter`) is a portfolio narrative tool with no connection to the donor CRM — misleadingly named
- No gift entry UI, no pledge tracking, no household/relationship grouping, no campaign attribution
- No LYBUNT/SYBUNT reports or segmentation — the primary reporting paradigm Blackbaud users rely on

### Charities (3/10)
- Schema drift, missing tables, broken add-to-portfolio — see Critical §4–6 above
- Autocomplete endpoint (`/api/charities/search/autocomplete`) exists but is unwired from the search input
- "My Portfolio" mode fetches `/api/portfolios` — no non-admin route exists for this path
- No compare view, no saved/watchlist, no side-by-side comparison
- No diligence notes or decision log — program officers have no way to record why they chose/rejected a charity

### AI Assistant / Ben (7.5/10)
- Conversation history not persisted across page reloads — closing the panel loses all context
- Suggested prompts are generic; no portfolio-aware contextual suggestions
- No streaming responses — full reply waits until complete before rendering

### Visualizations (6.5/10)
- Waterfall "impact" mode uses identical data to "funding" mode (`funds_allocated`) — produces misleading board presentations
- `app/api/portfolio/[id]/timeline/route.ts:46` — `events` table query has no `portfolio_id` filter — returns all events across all orgs
- Widget type registry (`widget-configs/`) has entries that don't match component names — some widget types in DB can't render
- No drag-to-reorder (UI present but broken)
- No print/PDF CSS — widgets render incorrectly in board report print view
- Missing chart types: Sankey (fund flows), stacked bar, choropleth map, scatter plot

### Admin / Import (7/10)
- AI mapping assist always sends `sample_records: []` (`MappingPageClient.tsx:93`) — AI never sees actual CSV values, only column names
- Three different admin authorization patterns across 25+ routes — inconsistent access control
- Blackbaud data coverage gaps: campaigns, appeals, soft credits, pledges, event registrations, relationships, tribute gifts, recurring schedules — all absent
- Staging tables hold donor PII indefinitely with no documented retention/cleanup policy
- Hard `.limit(5000)` cap in `lib/import/rollback.ts:83` silently leaves production data behind on large imports

---

## Cross-Cutting Themes

### 1. The platform is more complete in the data model than in the product surface
Most modules have well-designed DB schemas, Zod validation, and RLS policies. The gap is almost always in the UI layer — pages that don't exist, buttons that 404, API joins that are never called. The back-end investment is ahead of the front-end.

### 2. Module gating is cosmetic, not enforced
Tax, Compliance, and Donors are listed as optional modules but their nav links and pages don't check whether the module is enabled. Module toggles are UI preferences, not entitlement boundaries.

### 3. Multi-entity/multi-org UX is first-org-wins throughout
`/api/me` picks first portfolio; donors and compliance fetch first org; dashboard falls back to first portfolio. Family offices managing multiple entities are not served.

### 4. Missing product layer: Grant Lifecycle Management
The largest single product gap is a complete grant lifecycle module: intake (applications/LOIs), review & scoring, approval workflow, payment scheduling, grantee reporting, and closeout. Foundant GLM and Fluxx are built around exactly this. Without it, Benevolence cannot fully replace those systems for program-heavy foundations.

### 5. Workflow / Tasks / Approvals
No task system, no approval workflows, no assignment of work to team members, no SLAs or reminders that actually fire. The `reminder_days` column in compliance and notification preferences in settings exist but drive no behavior.

---

## Suggested Sprint Priorities

### Sprint A — Stop the bleeding ✅ Complete (2026-04-30)
- Schema reconciliation: Compliance org_id, QB schema, Donor CRM org_id + v_donor_summary view
- Auth fixes: Holdings update-basic, Holdings link-charity, AI chat viewer writes, QB role checks
- Rate limiting on `/api/ai/chat`
- Admin import commit bug (was writing zero rows)
- Import Resume/Rollback button onClick handlers

### Sprint B — Make existing modules shippable (2–3 weeks)
1. Compliance: fix payout `amount_usd` → correct column; fix 5% IRS formula (monthly FMV average, deductions); wire state registrations UI; fix status enum alignment
2. Donor CRM: fix `contribution_id` → `contribution_ids` array; replace public PDF URL with signed URL; create Add Donor page; fix IRS acknowledgment language
3. Tax Center: conservation easement AGI fix, Form 8283 routing fix, uncomment CPA portal
4. Holdings: create list page, surface grant milestone UI, replace `supabasePublic()` with authed client
5. Dashboard: fix triple-fetch, add date-range filter, surface payout gauge, fix board report CTA

### Sprint C — Competitive parity (4–6 weeks)
1. Charities: full schema reconciliation (columns + create 3 missing tables), wire autocomplete, fix add-to-portfolio, add compare/diligence views
2. QuickBooks: add export deduplication guard, fix disbursed-vs-committed grant export, add QB Class support, encrypt tokens, surface refresh token expiry warning
3. Visualizations: fix waterfall impact mode, fix timeline portfolio_id filter, add print/PDF CSS, Sankey chart
4. Admin Import: fix mapping assist sample records, fix rollback 5000 row cap, add missing Blackbaud entity types
5. AI Assistant: persist conversation history, add portfolio-aware suggested prompts, streaming

### Sprint D — New module: Grant Lifecycle (6–8 weeks)
Build the missing product layer:
- Grant intake / LOI submission
- Review & scoring workflow
- Approval with multi-role sign-off
- Payment scheduling + disbursement tracking
- Grantee reporting portal
- Grant closeout / impact capture

---

## What's Missing (Modules to Add)

| Module | Priority | Rationale |
|--------|----------|-----------|
| Grant Lifecycle Management | **P0** | Largest competitive gap; Foundant/Fluxx built around this |
| Task / Workflow / Approvals | **P0** | Required for any team-based operations |
| Board Portal & Reporting | **P1** | Foundations present to boards quarterly; currently no structured pathway |
| Document Hub / Data Room | **P1** | Grant agreements, 990s, appraisals need organized storage |
| Stakeholder CRM | **P2** | Grantees, board members, advisors, co-funders beyond donor CRM |
| Integration Hub | **P2** | Salesforce, custodians, banking, data warehouse |
| External Portals | **P3** | Grantee-facing application/reporting portal, CPA portal |
