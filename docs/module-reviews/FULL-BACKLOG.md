# Impact Platform - Open Backlog

Last cleaned: 2026-06-27.

This document tracks open work only. Completed items and historical notes should be recovered from git history when needed.

Severity guide: P1 = significant functional gap, P2 = UX / quality-of-life, P3 = future parity.

---

## Dashboard

### P2

| # | Issue |
|---|-------|
| D-U1 | Add date-range / fiscal-year filtering to KPI cards and dashboard totals |
| D-F6 | Add multi-portfolio switcher in dashboard header |

---

## Holdings

### P2

| # | Issue |
|---|-------|
| H-U5 | Add bulk edit / bulk status change |
| H-F5 | Add impact KPI trend chart on holding detail |
| H-F6 | Add bulk import of holdings from CSV |
| H-F7 | Add holding export to PDF / board report inclusion |

---

## Tax Center

### P2

| # | Issue |
|---|-------|
| T-U1 | Add multi-year carryforward visualization |
| T-U2 | Add side-by-side scenario comparison view |
| T-U5 | Add "what-if" slider for donation amount adjustments |
| T-F4 | Add short-term / long-term holding period split in deduction estimates |
| T-F7 | Add state tax deduction limits, including California and New York non-conformity rules |
| T-F8 | Add AMT impact estimate |

---

## Compliance

### P2

| # | Issue |
|---|-------|
| Cm-U2 | Add email / in-app reminder system |
| Cm-U5 | Add IRS 990-PF Part XIII worksheet view |
| Cm-F3 | Add nightly job to auto-mark overdue filings and send reminders |
| Cm-F5 | Add document attachment support for filings |

---

## QuickBooks

### P2

| # | Issue |
|---|-------|
| QB-F2 | Add QuickBooks Class / fund dimension support required under ASC 958 for private foundations |
| QB-F7 | Add net asset class tagging on journal entries: restricted / unrestricted |
| QB-F10 | Add background job for scheduled sync using `sync_interval_hours` |

---

## Donor CRM

### P2

| # | Issue |
|---|-------|
| Dr-U4 | Replace `/dashboard/letter` portfolio narrative flow with Donor CRM acknowledgment-letter generation |
| Dr-F7 | Add household / relationship grouping |
| Dr-F8 | Add LYBUNT / SYBUNT queries and segmentation |
| Dr-F9 | Add year-end letter batch generation |
| Dr-F10 | Add soft credit attribution |

---

## Charities

### P2

| # | Issue |
|---|-------|
| Ch-U1 | Add side-by-side charity comparison view |
| Ch-U8 | Add "similar charities" / related discovery |
| Ch-U9 | Add map view using indexed `latitude` / `longitude` data |
| Ch-F8 | Add multi-year financial trend from ProPublica filings |

---

## AI Assistant

### P2

| # | Issue |
|---|-------|
| AI-F3 | Persist conversation history across page reloads and sessions |
| AI-F4 | Add portfolio-aware contextual suggested prompts |
| AI-F5 | Add Donor CRM tool coverage: `find_donor`, `log_gift`, `generate_acknowledgment` |
| AI-F6 | Add Tax Center tool coverage: `estimate_deduction`, `run_optimization` |
| AI-F8 | Add admin usage dashboard for `ai_usage_log` and Redis monthly usage counters |

---

## White-Label / Branding

### P2

| # | Issue |
|---|-------|
| Br-F2 | Add org-specific brand overrides in generated PDFs, outbound emails, and exported accounting notes |

---

## Visualizations / Widgets

### P2

| # | Issue |
|---|-------|
| Vis-U1 | Add print / export to PDF for board reports |

### P3

| # | Issue |
|---|-------|
| Vis-F1 | Add Sankey diagram for fund flow |
| Vis-F2 | Add stacked bar chart |
| Vis-F3 | Add choropleth / geographic impact map |
| Vis-F4 | Add scatter plot, such as ESG score vs financial return |
| Vis-F5 | Add waterfall chart with true outcomes data |
| Vis-F6 | Add print / PDF-optimized widget stylesheet |

---

## Admin / Import

### P2

| # | Issue |
|---|-------|
| Adm-B6 | Implement `blackbaud_api` and `direct_db` source types, which are declared in schema but currently not supported |
| Adm-F1 | Add Blackbaud campaign import coverage |
| Adm-F2 | Add Blackbaud appeal import coverage |
| Adm-F3 | Add Blackbaud soft credit import coverage |
| Adm-F4 | Add Blackbaud pledge and installment import coverage |
| Adm-F5 | Add Blackbaud event registration import coverage |
| Adm-F6 | Add Blackbaud constituent relationship import coverage |
| Adm-F7 | Add Blackbaud tribute / memorial gift import coverage |
| Adm-F8 | Add Blackbaud recurring gift schedule import coverage |

---

## Grant Management

### P2

| # | Issue |
|---|-------|
| GM-1 | Add grantee-facing application portal that moves submitted applications to `application_received` |
| GM-2 | Add grant report submission workflow so grantee uploads set `grant_reports.submitted_date` |

### P3

| # | Issue |
|---|-------|
| GM-5 | Add grant comparison view with side-by-side health metrics |
| GM-6 | Add automated grant renewal workflow triggered by `renewal_review` stage |
| GM-7 | Add grant agreement template generation from `grant_decisions` data |

---

## Strategic Modules

### P1

| # | Issue |
|---|-------|
| SM-1 | Add board portal / structured quarterly reporting pathway for foundations |
| SM-2 | Add document hub / data room for grant agreements, 990s, appraisals, and board materials |

### P2

| # | Issue |
|---|-------|
| SM-3 | Add stakeholder CRM for grantees, board members, advisors, and other non-donor relationships |
| SM-4 | Add integration hub for Salesforce, custodians, banking, and data warehouse integrations |

### P3

| # | Issue |
|---|-------|
| SM-5 | Add external portals for grantee reporting and CPA collaboration workflows beyond current public access |

---

## Open Count Summary

| Priority | Count |
|----------|------:|
| P1 | 2 |
| P2 | 48 |
| P3 | 10 |
| Total | 60 |
