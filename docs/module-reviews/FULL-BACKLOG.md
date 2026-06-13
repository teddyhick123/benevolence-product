# Impact Platform — Open Backlog

**Status:** Backlog reconciled 2026-05-15 after brand-agnostic pass and task/workflow sweep. Updated 2026-05-19 with a codebase/schema alignment sweep. Updated 2026-05-28 to remove shipped pledge/task foundation items from open count and add security bugs (Vis-B3, QB-B2, Dr-B2, Dr-B3) surfaced by roadmap review. Updated 2026-06-02: Phase 1 P1 sprint verified — all previously-listed P1 tables/views/RPCs were confirmed present in existing migrations (0006, 0010, 0011, 0014, 0016, 0018, 0035); no new migrations were needed. Zero open P1s remain. Updated 2026-06-13: GM-3 bulk transitions shipped; Phase 2.1 Task Center Polish shipped; security_invoker gap closed on 15 views (migration 0045). 52 items open (all P2/P3).

For resolved-issue history, see `git log docs/module-reviews/FULL-BACKLOG.md` and individual `*-review.md` files in this directory.

**Severity legend:** P1 = significant functional gap · P2 = UX / quality-of-life · P3 = nice-to-have / future parity

---

## Dashboard

### UX Gaps (P2)

| # | Issue | Location |
|---|-------|----------|
| D-U1 | No date-range / fiscal-year filter — all KPI numbers are lifetime totals | Dashboard KPIs |

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| D-F1 | Date-range / fiscal-year filter on all KPI cards |
| D-F6 | Multi-portfolio switcher in dashboard header |

---

## Holdings

### Bugs (P1)

| # | Issue | Location |
|---|-------|----------|
| ~~H-B1~~ | ~~Investment performance endpoints query `v_investment_performance` and `v_portfolio_investment_summary`~~ | **VERIFIED 2026-06-02**: both views confirmed present in migration 0035. Not a real bug. |
| ~~H-B2~~ | ~~Financial profile routes depend on `generated_financial_analyses`~~ | **VERIFIED 2026-06-02**: table confirmed present in migration 0035 (analytics module). Not a real bug. |

### UX Gaps (P2)

| # | Issue |
|---|-------|
| H-U5 | No bulk edit / bulk status change |

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| H-F5 | Impact KPI trend chart on holding detail |
| H-F6 | Bulk import of holdings from CSV |
| H-F7 | Holding export to PDF / board report inclusion |

---

## Tax Center

### UX Gaps (P2)

| # | Issue |
|---|-------|
| T-U1 | No multi-year carryforward visualization |
| T-U2 | No side-by-side scenario comparison view |
| T-U5 | No "what-if" slider for donation amount adjustments |

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| T-F4 | Short-term / long-term holding period split in deduction estimates |
| T-F7 | State tax deduction limits (California, NY non-conformity rules) |
| T-F8 | AMT impact estimate |

---

## Compliance

### Bugs (P1)

| # | Issue | Location |
|---|-------|----------|
| ~~Cm-B1~~ | ~~Rich compliance dashboard routes query missing schema objects~~ | **VERIFIED 2026-06-02**: `compliance_profiles`, `disqualified_persons`, `self_dealing_incidents`, `v_compliance_dashboard`, `v_upcoming_filing_deadlines` all confirmed present in migration 0016. Not a real bug. |
| ~~Cm-B2~~ | ~~Payout forecast and ER routes depend on missing tables/views~~ | **VERIFIED 2026-06-02**: `payout_history`, `qualifying_distributions`, `expenditure_responsibility_grants`, `v_er_grant_compliance` all confirmed present in migration 0016. Not a real bug. |

### UX Gaps (P2)

| # | Issue |
|---|-------|
| Cm-U2 | No email/in-app reminder system |
| Cm-U5 | No IRS 990-PF Part XIII worksheet view |

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| Cm-F3 | Nightly cron to auto-mark overdue filings + email reminders |
| Cm-F5 | Document attachment to filings |

---

## QuickBooks

### Bugs (P1)

| # | Issue | Location |
|---|-------|----------|
| ~~QB-B1~~ | ~~Settings UI expects account fields `qb_account_id`, `name`, and `type`, but the accounts API returns `qb_id`, `qb_name`, and `qb_type`, leaving account selects with undefined values~~ | **FIXED 2026-06-02**: updated `QBAccount` interface and all 6 field references in `QuickBooksSettings.tsx` to use `qb_id/qb_name/qb_type`. |
| ~~QB-B2~~ | ~~OAuth access tokens stored as plaintext `TEXT` in `quickbooks_connections`~~ | **ALREADY FIXED** (verified 2026-06-02): `lib/integrations/quickbooks/token-crypto.ts` implements AES-256-GCM encryption; callback encrypts on write; `client.ts` and disconnect route decrypt with `isEncrypted()` guard for legacy rows. Requires `QB_TOKEN_ENCRYPTION_KEY` env var (32-byte hex). |

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| QB-F2 | QB Class / fund dimension support (required under ASC 958 for private foundations) |
| QB-F7 | Net asset class (restricted / unrestricted) tagging on journal entries |
| QB-F10 | Background job for scheduled sync (`sync_interval_hours` column exists but drives nothing) |

---

## Donor CRM

### Bugs (P1)

| # | Issue | Location |
|---|-------|----------|
| ~~Dr-B1~~ | ~~Donor dashboard/detail surfaces query `v_contribution_with_donor` and `donor_communications`~~ | **VERIFIED 2026-06-02**: `donor_communications` table and `v_contribution_with_donor` view confirmed present in migration 0014. Not a real bug. |
| ~~Dr-B2~~ | ~~Acknowledgment route inserts `contribution_id` (singular UUID) but the `acknowledgments` table schema defines `contribution_ids` (UUID array)~~ | **ALREADY FIXED** (verified 2026-06-02): route already uses `contribution_ids: contribution_id ? [contribution_id] : []`. |
| ~~Dr-B3~~ | ~~Acknowledgment PDFs returned via `getPublicUrl()` — produces an unauthenticated permanent URL~~ | **ALREADY FIXED** (verified 2026-06-02): route already uses `createAdminClient()` + `createSignedUrl(storagePath, 3600)`. |

### UX Gaps (P2)

| # | Issue |
|---|-------|
| Dr-U4 | Donor acknowledgment letter generator at `/dashboard/letter` is a portfolio narrative tool — not connected to Donor CRM |

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| Dr-F7 | Household / relationship grouping |
| Dr-F8 | LYBUNT / SYBUNT queries and segmentation |
| Dr-F9 | Year-end letter batch generation |
| Dr-F10 | Soft credit attribution |

### Shipped / Removed From Open Count

| # | Former Issue | Status |
|---|--------------|--------|
| Dr-U3 | ~~No pledge tracking UI despite DB supporting it~~ | Shipped before 2026-05-28: pledge dashboard, create modal, detail panel, donor profile integration, org settings toggle |
| Dr-F6 | ~~Pledge tracking + installment schedule UI~~ | Shipped before 2026-05-28: pledge pipeline plus installment schedule UI/API |

---

## Charities

### Bugs (P1)

| # | Issue | Location |
|---|-------|----------|
| ~~Ch-B1~~ | ~~External data services reference missing cache tables/RPCs~~ | **VERIFIED 2026-06-02**: `charity_rating_cache`, `geocode_cache`, `get_geocode_cache_stats`, `clean_expired_geocode_cache` all confirmed present in migration 0010. Not a real bug. |

### UX Gaps (P2)

| # | Issue |
|---|-------|
| Ch-U1 | No side-by-side charity comparison view |
| Ch-U8 | No "similar charities" / related discovery |
| Ch-U9 | No map view despite `latitude`/`longitude` being indexed |

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| Ch-F4 | Side-by-side charity comparison view |
| Ch-F8 | Multi-year financial trend from ProPublica filings |

---

## AI Assistant

### UX Gaps (P2)

| # | Issue |
|---|-------|
| AI-U2 | Conversation history lost on page reload — no persistence across sessions |

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| AI-F3 | Persist conversation history across page reloads |
| AI-F4 | Portfolio-aware contextual suggested prompts |
| AI-F5 | Donor CRM tool coverage (`find_donor`, `log_gift`, `generate_acknowledgment`) |
| AI-F6 | Tax center tool coverage (`estimate_deduction`, `run_optimization`) |
| AI-F8 | Per-org AI usage rollups for billing and abuse detection — `ai_usage_log` table populated and Redis counter (`usage:ai:${orgId}:${month}`) incremented on every chat call; **missing:** admin dashboard page to surface this data (`/admin/usage`) |

---

## Reporting

### Bugs (P1)

| # | Issue | Location |
|---|-------|----------|
| ~~R-B1~~ | ~~Reporting APIs depend on missing `report_templates`, `generated_documents`, `report_schedules`, and `generate_share_token`~~ | **VERIFIED 2026-06-02**: all confirmed present in migration 0011. Not a real bug. |
| ~~R-B2~~ | ~~Reporting export queries legacy `contributions` / `transactions` tables~~ | **VERIFIED 2026-06-02**: export route already queries `tax_contributions` and `holding_transactions`. Not a real bug. |

---

## White-Label / Branding

### Missing Features (P2)

| # | Feature |
|---|---------|
| Br-F2 | Org-specific brand overrides in generated PDFs, outbound emails, and exported accounting notes |

---

## Task / Workflow Management

No active task/workflow foundation items remain open after the 2026-05-28 backlog hygiene pass. Future task work should be tracked under the relevant module if it depends on module-specific schema or producer coverage.

### Shipped / Removed From Open Count

| # | Former Feature | Status |
|---|----------------|--------|
| Tw-F1 | ~~Unified org task inbox across grants, compliance, pledges, imports, donor follow-up, and board reporting~~ | Shipped: org task inbox exists at `/org/[orgId]/tasks`; remaining module-specific coverage belongs under the owning module |
| Tw-F4 | ~~Automation producers for compliance reminders, pledge follow-up, grant reports/milestones, import review, and report approvals~~ | Shipped: producer framework exists for compliance, pledges, grants, imports, and reports |
| Tw-F5 | ~~Notification event queue and digest delivery driven by task events and `organization_members.notification_prefs`~~ | Shipped: `notification_events`, fanout/send/digest jobs, delivery helpers, and member preferences exist |
| Tw-F6 | ~~Task Center Polish (Phase 2.1)~~ | **Shipped 2026-06-12**: task summary aggregate endpoint (`GET /api/org/[orgId]/tasks/summary`), dashboard summary widget (overdue/due-soon/blocked/mine tiles), entity-link URL helper (`lib/tasks/entity-links.ts`), entity link chips in TaskInbox, Tasks nav entry in org layout |

Specs:

- `/docs/superpowers/specs/2026-05-15-task-workflow-management-design.md`
- `/docs/superpowers/specs/2026-05-15-task-automation-producers-design.md`
- `/docs/superpowers/specs/2026-05-15-task-notification-delivery-design.md`

---

## Visualizations / Widgets

### Bugs (P1)

| # | Issue | Location |
|---|-------|----------|
| ~~Vis-B1~~ | ~~Widget APIs use missing `widgets` table~~ | **VERIFIED 2026-06-02**: `widgets` and `holding_widgets` tables confirmed present in migration 0006. Not a real bug. |
| ~~Vis-B2~~ | ~~Map/location features depend on missing `holding_locations`~~ | **VERIFIED 2026-06-02**: `holding_locations` table confirmed present in migration 0006. Not a real bug. |
| ~~Vis-B3~~ | ~~**Security:** Timeline route queries `events` table with no org_id scoping~~ | **FIXED 2026-06-12** (commit a0a5324f): org_id derived from portfolio's holdings; query now filters `.or('org_id.is.null,org_id.eq.${orgId}')` — only public + own-org events returned. |

### UX Gaps (P2)

| # | Issue |
|---|-------|
| Vis-U1 | No print/export to PDF for board reports — `board-report` API exists but no button in UI |
| Vis-U4 | No live preview inside widget config form — configure-then-save with no feedback |

### Missing Chart Types (P3)

| # | Chart |
|---|-------|
| Vis-F1 | Sankey diagram (fund flow: funder → portfolio → grantee) |
| Vis-F2 | Stacked bar chart |
| Vis-F3 | Choropleth / geographic impact map |
| Vis-F4 | Scatter plot (e.g. ESG score vs financial return) |
| Vis-F5 | Waterfall with true outcomes data (not funding as proxy) |
| Vis-F6 | Print / PDF-optimized widget stylesheet |

---

## Admin / Import

### Bugs (P1)

| # | Issue | Location |
|---|-------|----------|
| ~~Adm-B7~~ | ~~Stale import watchdog calls `mark_stale_import_jobs`, but no migration creates that RPC~~ | **VERIFIED 2026-06-02**: `mark_stale_import_jobs` RPC confirmed present in migration 0018. Not a real bug. |
| ~~Adm-B8~~ | ~~Import upload/extract paths use Supabase Storage bucket `imports`, but no migration creates the bucket~~ | **VERIFIED 2026-06-02**: `imports` bucket created in migration 0018 with org-admin-scoped RLS policies. Not a real bug. |
| ~~Adm-B9~~ | ~~Import AI suggestion UI/API uses `import_ai_suggestions`, but no migration creates the table~~ | **VERIFIED 2026-06-02**: `import_ai_suggestions` table confirmed present in migration 0018. Not a real bug. |
| ~~Adm-B10~~ | ~~Import loader and grant creation depend on an `investees` table that does not exist~~ | **VERIFIED 2026-06-02**: `investees` table confirmed present in migration 0010. Not a real bug. |

### Bugs (P2)

| # | Issue | Location |
|---|-------|----------|
| Adm-B6 | `blackbaud_api` and `direct_db` source types declared in schema but never implemented — always requires CSV export | `lib/import/job-queue.ts` |

### Missing Blackbaud Entity Coverage (P2)

| # | Entity Type |
|---|-------------|
| Adm-F1 | Campaigns |
| Adm-F2 | Appeals |
| Adm-F3 | Soft credits |
| Adm-F4 | Pledges and installments |
| Adm-F5 | Event registrations |
| Adm-F6 | Constituent relationships |
| Adm-F7 | Tribute / memorial gifts |
| Adm-F8 | Recurring gift schedules |

---

## Grant Management

Shipped 2026-05-16: 14-stage lifecycle, org-scoped CRUD APIs, Pipeline/Table/Calendar/Attention views, AI tools, task automation producers, decisions, transitions, export.

### Remaining Gaps (P2–P3)

| # | Priority | Gap |
|---|----------|-----|
| GM-1 | P2 | Grantee-facing application portal (external form → `application_received` stage) |
| GM-2 | P2 | Grant report submission workflow — grantee uploads report → `grant_reports.submitted_date` set |
| ~~GM-3~~ | ~~P2~~ | ~~Bulk stage transitions from Pipeline view~~ | **SHIPPED 2026-06-12**: multi-select in Pipeline view, BulkActionBar, BulkDecisionQueue stepped modal, 207 multi-transition API (`POST /api/org/[orgId]/grants/bulk-transition`), result modal with per-grant success/failure breakdown. |
| GM-4 | P2 | Grant search across all portfolios in org (currently per-portfolio) |
| GM-5 | P3 | Grant comparison view — side-by-side health metrics for multiple grants |
| GM-6 | P3 | Automated grant renewal workflow triggered by `renewal_review` stage |
| GM-7 | P3 | Grant agreement template generation from `grant_decisions` data |

---

## Cross-Cutting Issues

| # | Severity | Issue |
|---|----------|-------|
| X7 | ~~P2~~ | ~~No grant lifecycle management~~ — **SHIPPED 2026-05-16**: 14-stage lifecycle, decisions, pipeline view, AI tools, task automation |
| X8 | P3 | No board portal — no structured quarterly reporting pathway for foundations |
| X9 | ~~P1~~ | ~~`MODULE_REGISTRY.tables` lists nonexistent tables~~ — **FIXED 2026-06-02**: module registry aligned to active schema. |
| X10 | ~~Security~~ | ~~15 portfolio/org-scoped SQL views missing `security_invoker = true` — views ran as definer, bypassing base-table RLS; any authenticated user could read any org's data~~ | **FIXED 2026-06-13**: migration 0045 adds `ALTER VIEW ... SET (security_invoker = true)` to all 15 affected views. Base-table RLS (`can_view_portfolio`, `can_view_org`) now enforces per-user access. |

---

## Missing Modules (New Build)

| Priority | Module | Rationale |
|----------|--------|-----------|
| ~~P0~~ | ~~Grant Lifecycle Management~~ | **SHIPPED 2026-05-16** — 14-stage lifecycle, org-scoped APIs, Pipeline/Table/Calendar/Attention views, AI tools, task automation producers, lifecycle decisions, export |
| ~~P0~~ | ~~Task / Workflow / Approvals~~ | **SHIPPED** — task automation, workflow instances, task notification delivery |
| P1 | Board Portal & Reporting | Foundations present to boards quarterly |
| P1 | Document Hub / Data Room | Grant agreements, 990s, appraisals need organized storage |
| P2 | Stakeholder CRM | Grantees, board members, advisors beyond donor CRM |
| P2 | Integration Hub | Salesforce, custodians, banking, data warehouse |
| P3 | External Portals | Grantee-facing application / reporting portal, CPA portal |

---

## Issue Count Summary

_Updated 2026-06-13: GM-3 (bulk transitions) shipped, Task Center Polish (Phase 2.1) shipped, security_invoker gap closed. P2 count reduced by 1 (GM-3). 52 items open._

| Module | P1 (correctness) | P2 | P3 | Total |
|--------|------------------|----|----|-------|
| Dashboard         | — |  2 | — |  2 |
| Holdings          | — |  4 | — |  4 |
| Tax Center        | — |  5 | — |  5 |
| Compliance        | — |  4 | — |  4 |
| QuickBooks        | — |  3 | — |  3 |
| Donor CRM         | — |  5 | — |  5 |
| Charities         | — |  5 | — |  5 |
| AI Assistant      | — |  6 | — |  6 |
| Reporting         | — |  — | — |  0 |
| Visualizations    | — |  2 | 6 |  8 |
| Admin / Import    | — |  8 | — |  8 |
| White-Label / Branding | — |  1 | — |  1 |
| Task / Workflow Management | — |  — | — |  0 |
| Cross-Cutting     | — |  1 | 1 |  2 |
| **Total**         | **0** | **45** | **7** | **52** |
