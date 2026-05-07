# Benevolence — Open Backlog

**Status:** All P1 bugs cleared as of Sprint C (2026-05-06). Open work below is exclusively P2 / P3 — UX gaps and missing features.

For resolved-issue history, see `git log docs/module-reviews/FULL-BACKLOG.md` and individual `*-review.md` files in this directory.

**Severity legend:** P1 = significant functional gap · P2 = UX / quality-of-life · P3 = nice-to-have / future parity

---

## Dashboard

### UX Gaps (P2)

| # | Issue | Location |
|---|-------|----------|
| D-U1 | No date-range / fiscal-year filter — all KPI numbers are lifetime totals | Dashboard KPIs |
| D-U3 | Board report API exists (`/api/portfolio/[id]/board-report`) but not surfaced anywhere on dashboard | Dashboard |
| D-U4 | Widget carousel auto-advances every 8 seconds with no per-session pause control | `components/vis/VisualCarousel.tsx` |
| D-U5 | 5% payout gauge absent from dashboard — currently buried in `/compliance` | Dashboard |
| D-U7 | KPI `lastUpdated` renders raw ISO timestamp string ("2025-01-15T00:00:00") instead of formatted date | `components/KpiCard.tsx:130` |

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| D-F1 | Date-range / fiscal-year filter on all KPI cards |
| D-F2 | Board report CTA from dashboard |
| D-F3 | 5% payout gauge widget |
| D-F6 | Multi-portfolio switcher in dashboard header (multi-org switcher already shipped via X2) |
| D-F7 | Module gating enforcement on dashboard nav links via `org_has_module()` |

---

## Holdings

### UX Gaps (P2)

| # | Issue |
|---|-------|
| H-U2 | Grant milestones UI absent — API exists (`milestones/route.ts`) but zero UI on detail page |
| H-U3 | Report due dates have no UI despite `next_report_due` field on `grant_details` |
| H-U4 | Grant period status (active/expired/pipeline) not shown anywhere in UI |
| H-U5 | No bulk edit / bulk status change |
| H-U6 | No sort/filter on any holdings view |
| H-U7 | No holding export to CSV/PDF |
| H-U8 | No back-navigation breadcrumb on holding detail page |

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| H-F2 | Grant milestone tracker UI on holding detail |
| H-F3 | Report due date calendar / alerts |
| H-F4 | Grant period status badge |
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
| T-U3 | Form 8283 PDF download not wired to a UI button |
| T-U5 | No "what-if" slider for donation amount adjustments |
| T-U6 | Dashboard layout buries AGI Limit Visualizer below the contribution entry form |
| T-U7 | Carryforward section hidden entirely when zero — no explanation for first-time users |
| T-U8 | No year-end giving deadline indicator |

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| T-F4 | Short-term / long-term holding period split in deduction estimates |
| T-F7 | State tax deduction limits (California, NY non-conformity rules) |
| T-F8 | AMT impact estimate |
| T-F9 | OBBB 2026 universal deduction for non-itemizers is implemented but never called |

---

## Compliance

### UX Gaps (P2)

| # | Issue |
|---|-------|
| Cm-U1 | No calendar view of upcoming filings |
| Cm-U2 | No email/in-app reminder system |
| Cm-U4 | No exportable payout summary (990-PF export is raw JSON, not preparer-ready) |
| Cm-U5 | No IRS 990-PF Part XIII worksheet view |
| Cm-U6 | No "at-risk" alert when distribution falls below 5% threshold |
| Cm-U8 | "Mark as Filed" sends only `status: 'filed'` — no confirmation number, filed-by, or notes captured |

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| Cm-F3 | Nightly cron to auto-mark overdue filings + email reminders |
| Cm-F4 | Filing calendar view (monthly/quarterly) |
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
| QB-F9 | Token-expired warning that disables export buttons and prompts reconnect |
| QB-F10 | Background job for scheduled sync (`sync_interval_hours` column exists but drives nothing) |

---

## Donor CRM

### UX Gaps (P2)

| # | Issue |
|---|-------|
| Dr-U2 | No gift entry UI — no way to record a donation in the app |
| Dr-U3 | No pledge tracking UI despite DB supporting it |
| Dr-U4 | Donor acknowledgment letter generator at `/dashboard/letter` is a portfolio narrative tool — not connected to Donor CRM |
| Dr-U5 | No column sorting on donor list |
| Dr-U6 | No edit capability on donor profile page despite PATCH endpoint existing |
| Dr-U7 | No "Generate Letter" button on donor profile |
| Dr-U8 | No standalone acknowledgment queue page for development officers |

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
| Ch-U2 | No watchlist / saved charities (add-to-portfolio is too heavyweight for early-stage research) |
| Ch-U3 | No diligence notes — no way to record why a charity was chosen or rejected |
| Ch-U7 | Mission statement shown only on CSS hover — not accessible on touch devices |
| Ch-U8 | No "similar charities" / related discovery |
| Ch-U9 | No map view despite `latitude`/`longitude` being indexed |

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| Ch-F4 | Side-by-side charity comparison view |
| Ch-F5 | Watchlist / save for later |
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
| AI-U3 | Suggested prompts are generic — not portfolio-aware or contextual |
| AI-U4 | "Save to Dashboard" for preview widgets has no save button in the chat panel |
| AI-U5 | No indication when Ben is calling a tool vs generating text |
| AI-U6 | No way to cancel a running request |
| AI-U7 | `AIAssistantButton` opens from any dashboard page but Ben has no awareness of which page the user is on |

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| AI-F2 | Streaming responses (SSE or ReadableStream) |
| AI-F3 | Persist conversation history across page reloads |
| AI-F4 | Portfolio-aware contextual suggested prompts |
| AI-F5 | Donor CRM tool coverage (`find_donor`, `log_gift`, `generate_acknowledgment`) |
| AI-F6 | Tax center tool coverage (`estimate_deduction`, `run_optimization`) |
| AI-F8 | Per-org AI usage rollups for billing and abuse detection (raw `ai_usage_log` already populated by Sprint C) |

---

## Visualizations / Widgets

### Bugs (P1 — correctness)

| # | Issue | Location |
|---|-------|----------|
| Vis-B1 | Waterfall "impact" mode uses `funds_allocated` — identical to "funding" mode — produces misleading board presentations showing funding data labeled as impact | `app/api/portfolio/[id]/waterfall/route.ts:89-148` |
| Vis-B4 | Drag-to-reorder in `EditWidgetsModal` only swaps two positions — dragging item 1 to slot 5 moves item 5 to slot 1, items 2–4 don't shift | `components/vis/EditWidgetsModal.tsx` |
| Vis-B5 | `ImpactBubbleChart` tooltip uses `event.pageX`/`event.pageY` (absolute) but tooltip is `position: absolute` inside container — tooltip appears offset on any scrolled page | `components/vis/ImpactBubbleChart.tsx:351-353` |
| Vis-B6 | `ImpactTimeline` horizontal mode has no ResizeObserver — SVG width set once on mount, breaks on window resize | `components/vis/ImpactTimeline.tsx:250` |
| Vis-B7 | N+1 query in waterfall `metric` mode — one sequential DB query per holding | `app/api/portfolio/[id]/waterfall/route.ts:196-217` |

### UX Gaps (P2)

| # | Issue |
|---|-------|
| Vis-U1 | No print/export to PDF for board reports — `board-report` API exists but no button in UI |
| Vis-U3 | Fixed 500px carousel height — waterfall cramped, radial progress wastes space |
| Vis-U4 | No live preview inside widget config form — configure-then-save with no feedback |
| Vis-U6 | No inter-slide data cache — navigating carousel re-fetches API on every slide transition |

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
| Adm-U6 | No download template / sample CSV link before upload |

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
| Dashboard         | — | 10 | — | 10 |
| Holdings          | — | 14 | — | 14 |
| Tax Center        | — | 11 | — | 11 |
| Compliance        | — | 11 | — | 11 |
| QuickBooks        | — |  5 | — |  5 |
| Donor CRM         | — | 14 | — | 14 |
| Charities         | — | 11 | — | 11 |
| AI Assistant      | — | 13 | — | 13 |
| Visualizations    | 5 |  4 | 6 | 15 |
| Admin / Import    | — | 13 | — | 13 |
| Cross-Cutting     | — |  2 | 1 |  3 |
| **Total**         | **5** | **108** | **7** | **120** |

The Visualizations P1 row (Vis-B1, Vis-B4–B7) is real correctness work — misleading board data and broken interactions. Recommended next sprint.
