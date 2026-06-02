# Impact Platform — Open Backlog

**Status:** Backlog reconciled 2026-05-15 after brand-agnostic pass and task/workflow sweep. Updated 2026-05-19 with a codebase/schema alignment sweep. Updated 2026-05-28 to remove shipped pledge/task foundation items from open count and add security bugs (Vis-B3, QB-B2, Dr-B2, Dr-B3) surfaced by roadmap review. Updated 2026-06-02: Phase 1 P1 schema gap sprint — closed 13 P1s (X9, Vis-B1, Vis-B2, R-B1, R-B2, H-B1, H-B2, Cm-B1, Cm-B2, QB-B1, Dr-B1–B3, Ch-B1, Adm-B7–B10). 2 P1s remain: QB-B2 (token encryption), Vis-B3 (timeline RLS gap).

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
| ~~H-B1~~ | ~~Investment performance endpoints query `v_investment_performance` and `v_portfolio_investment_summary`, but no active migration creates either view~~ | **FIXED 2026-06-02**: created both views in migration 0047; `v_investment_performance` selects per-holding cost_basis/nav/moic/return_pct; `v_portfolio_investment_summary` aggregates at portfolio level. |
| ~~H-B2~~ | ~~Financial profile routes depend on `generated_financial_analyses`, but no active migration creates the table~~ | **FIXED 2026-06-02**: created `generated_financial_analyses` table in migration 0047 with `holding_id, charity_id, analysis_content, financial_snapshot, generated_at, version`. |

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
| ~~Cm-B1~~ | ~~Rich compliance dashboard routes query missing schema objects: `v_compliance_dashboard`, `v_upcoming_filing_deadlines`, `self_dealing_incidents`, `compliance_profiles`, and `disqualified_persons`~~ | **FIXED 2026-06-02**: migration 0046 creates `compliance_profiles`, `disqualified_persons`, `self_dealing_incidents`, plus `v_compliance_dashboard` and `v_upcoming_filing_deadlines` views. |
| ~~Cm-B2~~ | ~~Payout forecast and expenditure responsibility routes depend on missing tables/views: `payout_history`, `qualifying_distributions`, `expenditure_responsibility_grants`, and `v_er_grant_compliance`~~ | **FIXED 2026-06-02**: migration 0046 creates `payout_history`, `qualifying_distributions`, `expenditure_responsibility_grants`, and `v_er_grant_compliance` view. |

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
| QB-B2 | OAuth access tokens stored as plaintext `TEXT` in `quickbooks_connections` — credential exposure risk for a fiduciary product. Requires encryption-at-rest layer or Supabase Vault on the write path. | `app/api/integrations/quickbooks/callback/route.ts` |

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
| ~~Dr-B1~~ | ~~Donor dashboard/detail surfaces query `v_contribution_with_donor` and `donor_communications`, but no active migration creates them~~ | **FIXED 2026-06-02**: migration 0048 creates `donor_communications` table (direction, comm_type, subject, summary, follow_up tracking) and `v_contribution_with_donor` view (enriched contribution rows with donor name/email). |
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
| ~~Ch-B1~~ | ~~External data services reference missing cache tables/RPCs (`charity_rating_cache`, `geocode_cache`, `get_geocode_cache_stats`, `clean_expired_geocode_cache`)~~ | **FIXED 2026-06-02**: migration 0049 creates both cache tables with expiry indexes and both RPCs (`get_geocode_cache_stats` returns jsonb stats, `clean_expired_geocode_cache` returns deleted count). |

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
| AI-F8 | Per-org AI usage rollups for billing and abuse detection (raw `ai_usage_log` already populated) |

---

## Reporting

### Bugs (P1)

| # | Issue | Location |
|---|-------|----------|
| ~~R-B1~~ | ~~Reporting APIs depend on missing `report_templates`, `generated_documents`, `report_schedules`, and `generate_share_token`~~ | **FIXED 2026-06-02**: created all three tables plus `generate_share_token()` RPC in migration 0045. |
| ~~R-B2~~ | ~~Reporting export queries legacy `contributions` / `transactions` tables~~ | **FIXED 2026-06-02**: export route now queries `tax_contributions` (columns: `amount_usd`, `contribution_type`, `date_acquired`, `recipient_name`, `recipient_ein`) and `holding_transactions` (via `holdings!inner` join for `portfolio_id` filter). |

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

Specs:

- `/docs/superpowers/specs/2026-05-15-task-workflow-management-design.md`
- `/docs/superpowers/specs/2026-05-15-task-automation-producers-design.md`
- `/docs/superpowers/specs/2026-05-15-task-notification-delivery-design.md`

---

## Visualizations / Widgets

### Bugs (P1)

| # | Issue | Location |
|---|-------|----------|
| ~~Vis-B1~~ | ~~Widget APIs use missing `widgets` table~~ | **FIXED 2026-06-02**: created `widgets` table (migration 0044); updated `executor.ts` and `context.ts` to use `widgets` for portfolio-level operations; fixed `holding_widgets` schema in migration 0006 (was using wrong `portfolio_id/widget_type` columns — now `holding_id/type/title/position`). |
| ~~Vis-B2~~ | ~~Map/location features depend on missing `holding_locations`~~ | **FIXED 2026-06-02**: created `holding_locations` table with `holding_id, portfolio_id, name, status, lat, lon, tags` (migration 0044). Map route already gracefully degraded so no route changes needed. |
| Vis-B3 | **Security:** Timeline route at `app/api/portfolio/[id]/timeline/route.ts:46` queries the `events` table with no `portfolio_id` filter — returns events across all organizations to any authenticated user. No-migration fix: add `.eq('portfolio_id', portfolio_id)` | `app/api/portfolio/[id]/timeline/route.ts` |

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
| ~~Adm-B7~~ | ~~Stale import watchdog calls `mark_stale_import_jobs`, but no active migration creates that RPC~~ | **FIXED 2026-06-02**: migration 0050 creates `mark_stale_import_jobs(p_stale_threshold_minutes int DEFAULT 30)` RPC; marks pending/processing/committing jobs stale after threshold, returns count. |
| ~~Adm-B8~~ | ~~Import upload/extract paths use Supabase Storage bucket `imports`, but no active migration creates the bucket or storage policies~~ | **FIXED 2026-06-02**: migration 0050 inserts the `imports` bucket (private, 50 MB limit) with upload/read/delete RLS policies scoped to org admins via `(storage.foldername(name))[1]::uuid`. |
| ~~Adm-B9~~ | ~~Import AI suggestion UI/API uses `import_ai_suggestions`, but no active migration creates the table~~ | **FIXED 2026-06-02**: migration 0050 creates `import_ai_suggestions` with `suggestion_type`, `confidence`, `proposed_value`, `auto_fixable`, `bulk_applicable`, `status`, unique on `(staging_row_id, field)`. |
| ~~Adm-B10~~ | ~~Import loader and grant creation still depend on an `investees` table that does not exist in the active schema~~ | **FIXED 2026-06-02**: migration 0050 creates `investees` with `ein UNIQUE`, `display_name`, `country`, `charity_id FK→charities`; indexed on `ein` and `lower(display_name)`. |

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
| GM-3 | P2 | Bulk stage transitions from Pipeline view (drag-and-drop kanban) |
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
| X9 | ~~P1~~ | ~~`MODULE_REGISTRY.tables` lists nonexistent tables~~ — **FIXED 2026-06-02**: removed all 16 stale refs, replaced with correct existing table names, added newly-shipped tables (`grant_decisions`, `grant_status_history`, `tasks`/task ops, `tax_years`, `tax_carryforwards`, `daf_grants`, `cpa_share_links`, `cpa_access_logs`, etc.). Tables still absent from schema are noted with inline backlog-ref comments (`Cm-B1`, `Cm-B2`, `Dr-B1`, `R-B1`, `Vis-B2`, `Ch-B1`). |

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

_Updated 2026-06-02: fixed H-B1/B2 (holdings analytics views/table), Cm-B1/B2 (compliance tables/views), QB-B1 (QBAccount field names), Dr-B1/B2/B3 (donor comms table+view, already-fixed acknowledgment bugs), Ch-B1 (geocode/rating cache), Adm-B7–B10 (import RPC, bucket, ai_suggestions, investees). 13 P1s closed this sprint._

| Module | P1 (correctness) | P2 | P3 | Total |
|--------|------------------|----|----|-------|
| Dashboard         | — |  2 | — |  2 |
| Holdings          | — |  4 | — |  4 |
| Tax Center        | — |  5 | — |  5 |
| Compliance        | — |  4 | — |  4 |
| QuickBooks        | 1 |  3 | — |  4 |
| Donor CRM         | — |  5 | — |  5 |
| Charities         | — |  5 | — |  5 |
| AI Assistant      | — |  6 | — |  6 |
| Reporting         | — |  — | — |  0 |
| Visualizations    | 1 |  2 | 6 |  9 |
| Admin / Import    | — |  8 | — |  8 |
| White-Label / Branding | — |  1 | — |  1 |
| Task / Workflow Management | — |  — | — |  0 |
| Cross-Cutting     | — |  1 | 1 |  2 |
| **Total**         | **2** | **46** | **7** | **55** |
