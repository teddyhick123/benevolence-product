# Impact Platform — Open Backlog

**Status:** Backlog reconciled 2026-05-15 after brand-agnostic pass and task/workflow sweep.

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

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| QB-F2 | QB Class / fund dimension support (required under ASC 958 for private foundations) |
| QB-F7 | Net asset class (restricted / unrestricted) tagging on journal entries |
| QB-F10 | Background job for scheduled sync (`sync_interval_hours` column exists but drives nothing) |

---

## Donor CRM

### UX Gaps (P2)

| # | Issue |
|---|-------|
| Dr-U3 | No pledge tracking UI despite DB supporting it |
| Dr-U4 | Donor acknowledgment letter generator at `/dashboard/letter` is a portfolio narrative tool — not connected to Donor CRM |

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| Dr-F6 | Pledge tracking + installment schedule UI |
| Dr-F7 | Household / relationship grouping |
| Dr-F8 | LYBUNT / SYBUNT queries and segmentation |
| Dr-F9 | Year-end letter batch generation |
| Dr-F10 | Soft credit attribution |

---

## Charities

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

## White-Label / Branding

### Missing Features (P2)

| # | Feature |
|---|---------|
| Br-F2 | Org-specific brand overrides in generated PDFs, outbound emails, and exported accounting notes |

---

## Task / Workflow Management

### Missing Features (P2)

| # | Feature |
|---|---------|
| Tw-F1 | Unified org task inbox across grants, compliance, pledges, imports, donor follow-up, and board reporting |
| Tw-F4 | Automation producers for compliance reminders, pledge follow-up, grant reports/milestones, import review, and report approvals |
| Tw-F5 | Notification event queue and digest delivery driven by task events and `organization_members.notification_prefs` |

Specs:

- `/docs/superpowers/specs/2026-05-15-task-workflow-management-design.md`
- `/docs/superpowers/specs/2026-05-15-task-automation-producers-design.md`
- `/docs/superpowers/specs/2026-05-15-task-notification-delivery-design.md`

---

## Visualizations / Widgets

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

| Module | P1 (correctness) | P2 | P3 | Total |
|--------|------------------|----|----|-------|
| Dashboard         | — |  2 | — |  2 |
| Holdings          | — |  4 | — |  4 |
| Tax Center        | — |  5 | — |  5 |
| Compliance        | — |  4 | — |  4 |
| QuickBooks        | — |  3 | — |  3 |
| Donor CRM         | — |  7 | — |  7 |
| Charities         | — |  5 | — |  5 |
| AI Assistant      | — |  6 | — |  6 |
| Visualizations    | — |  2 | 6 |  8 |
| Admin / Import    | — |  8 | — |  8 |
| White-Label / Branding | — |  1 | — |  1 |
| Task / Workflow Management | — |  3 | — |  3 |
| Cross-Cutting     | — |  1 | 1 |  2 |
| **Total**         | **—** | **51** | **7** | **58** |
