# Benevolence — Open Backlog

**Status:** Backlog reconciled 2026-05-07 after Sprint C + Sprint D sessions.

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
| D-F7 | Module gating enforcement on dashboard nav links via `org_has_module()` |

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
| H-F8 | PRIs and MRIs should be allowed to have `grant_details` (currently blocked by `asset_type` guard) |

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
| Cm-F6 | Auto-seed filing calendar on org creation (990-PF May 15, Form 8868 Nov 15) |
| Cm-F7 | Annual filing checklist generator |

---

## QuickBooks

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| QB-F2 | QB Class / fund dimension support (required under ASC 958 for private foundations) |
| QB-F7 | Net asset class (restricted / unrestricted) tagging on journal entries |
| QB-F8 | Sync history and conflict resolution UI |
| QB-F10 | Background job for scheduled sync (`sync_interval_hours` column exists but drives nothing) |

---

## Donor CRM

### UX Gaps (P2)

| # | Issue |
|---|-------|
| Dr-U2 | No gift entry UI — no way to record a donation in the app |
| Dr-U3 | No pledge tracking UI despite DB supporting it |
| Dr-U4 | Donor acknowledgment letter generator at `/dashboard/letter` is a portfolio narrative tool — not connected to Donor CRM |

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| Dr-F2 | Gift entry form (cash, non-cash, securities) |
| Dr-F5 | Real pagination — API must return total count with `{ count: 'exact' }` |
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
| Ch-U3 | No diligence notes — no way to record why a charity was chosen or rejected |
| Ch-U8 | No "similar charities" / related discovery |
| Ch-U9 | No map view despite `latitude`/`longitude` being indexed |

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| Ch-F4 | Side-by-side charity comparison view |
| Ch-F6 | Diligence notes + decision log |
| Ch-F8 | Multi-year financial trend from ProPublica filings |
| Ch-F9 | Form 990 PDF links from ProPublica |

---

## AI Assistant (Ben)

### UX Gaps (P2)

| # | Issue |
|---|-------|
| AI-U1 | No streaming — full reply waits until complete (20–45s for complex reports) before rendering |
| AI-U2 | Conversation history lost on page reload — no persistence across sessions |

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| AI-F2 | Streaming responses (SSE or ReadableStream) |
| AI-F3 | Persist conversation history across page reloads |
| AI-F4 | Portfolio-aware contextual suggested prompts |
| AI-F5 | Donor CRM tool coverage (`find_donor`, `log_gift`, `generate_acknowledgment`) |
| AI-F6 | Tax center tool coverage (`estimate_deduction`, `run_optimization`) |
| AI-F8 | Per-org AI usage rollups for billing and abuse detection (raw `ai_usage_log` already populated) |

---

## Visualizations / Widgets

### Bugs (P1 — correctness)

| # | Issue | Location |
|---|-------|----------|
| Vis-B7 | N+1 query in waterfall `metric` mode — one sequential DB query per holding | `app/api/portfolio/[id]/waterfall/route.ts` metric section |

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

### UX Gaps (P2)

| # | Issue |
|---|-------|
| Adm-U2 | No progress bar or row-count update during commit |
| Adm-U3 | No post-import validation report (how many rows written, warnings, duplicates) |
| Adm-U4 | No audit log viewer in UI |

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

## Cross-Cutting Issues

| # | Severity | Issue |
|---|----------|-------|
| X6 | P2 | No task / workflow / approval system — `reminder_days` and notification preferences exist in schema but drive zero behavior |
| X7 | P2 | No grant lifecycle management (intake → review → approval → payment → reporting → closeout) |
| X8 | P3 | No board portal — no structured quarterly reporting pathway for foundations |

---

## Missing Modules (New Build)

| Priority | Module | Rationale |
|----------|--------|-----------|
| P0 | Grant Lifecycle Management | Largest competitive gap; Foundant/Fluxx built around this |
| P0 | Task / Workflow / Approvals | Required for team-based operations |
| P1 | Board Portal & Reporting | Foundations present to boards quarterly |
| P1 | Document Hub / Data Room | Grant agreements, 990s, appraisals need organized storage |
| P2 | Stakeholder CRM | Grantees, board members, advisors beyond donor CRM |
| P2 | Integration Hub | Salesforce, custodians, banking, data warehouse |
| P3 | External Portals | Grantee-facing application / reporting portal, CPA portal |

---

## Issue Count Summary

| Module | P1 (correctness) | P2 | P3 | Total |
|--------|------------------|----|----|-------|
| Dashboard         | — |  3 | — |  3 |
| Holdings          | — |  5 | — |  5 |
| Tax Center        | — |  5 | — |  5 |
| Compliance        | — |  6 | — |  6 |
| QuickBooks        | — |  4 | — |  4 |
| Donor CRM         | — | 10 | — | 10 |
| Charities         | — |  8 | — |  8 |
| AI Assistant      | — |  8 | — |  8 |
| Visualizations    | 1 |  2 | 6 |  9 |
| Admin / Import    | — | 11 | — | 11 |
| Cross-Cutting     | — |  2 | 1 |  3 |
| **Total**         | **1** | **64** | **7** | **72** |

---

## Quick-Win Candidates (bounded, < 1 hour each)

These items are self-contained enough for rapid subagent dispatch:

| # | Item | What to build |
|---|------|---------------|
| Dr-F5 | Donor pagination count | Add `{ count: 'exact' }` to `app/api/org/[orgId]/donors/route.ts`; return `total` in response; show count in UI |
| Ch-U3/Ch-F6 | Charity diligence notes | localStorage textarea on `app/charities/[ein]/page.tsx` — auto-saves note keyed by EIN |
| Ch-F9 | Form 990 PDF links | Check if `filing_url` / ProPublica link exists in charity DB; surface in `CharityDetailTabs` |
| Vis-B7 | Waterfall N+1 fix | Rewrite metric mode in `app/api/portfolio/[id]/waterfall/route.ts` to batch-fetch all holdings in one query |
| Cm-F6 | Auto-seed filings | On org creation (`app/api/org/route.ts` POST), insert 990-PF (May 15) and Form 8868 (Nov 15) into `filing_calendar` for current year |
| Cm-F7 | Filing checklist | In `app/dashboard/compliance/page.tsx`, add a collapsed "Annual Checklist" section listing standard foundation obligations |
| QB-F8 | Sync history UI | Add a `SyncHistoryTable` component to QuickBooks settings showing last N sync events from a `qb_sync_log` table (if it exists) |
| Adm-U4 | Audit log viewer | Add an `/app/dashboard/admin/audit-log/page.tsx` that reads from `audit_log` table and shows a searchable table |
| D-F7 | Nav module gating | In the dashboard sidebar/nav, check active org modules and disable/hide links for unsubscribed modules |
