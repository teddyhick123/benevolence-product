# Impact Platform — Consolidated Open Backlog

Last consolidated: 2026-08-12.

This is the single current backlog for open product, reliability, security,
Builder, and test-infrastructure work. Discovery logs remain as historical
evidence, but an item is actionable only when it appears here. Completed items
stay in their source audit or Git history and are not duplicated here.

Priority guide:

- **P0** — release or security blocker; do not enable the affected production path.
- **P1** — data integrity, authorization, money/obligation, or major functional risk.
- **P2** — reliability contract, operator workflow, or important product improvement.
- **P3** — future parity, coverage expansion, or low-risk operational polish.

Status guide:

- **Verified open** — confirmed against the current tree during consolidation.
- **In progress** — an implementation is merged locally, but required release configuration or verification remains.
- **Decision needed** — current behavior is known; product semantics must be chosen before implementation.
- **Carry-forward** — retained from the prior product backlog and should be revalidated when selected.

## Consolidated sources

| Source | Consolidation result |
|---|---|
| [Refactor findings](../agent-work/specs/2026-07-26-refactor-findings.md) | 9 unresolved findings are tracked below; Phase 3/5/6/7 resolutions and the eighteen closed through 2026-08-13 were not copied. |
| [Reliability audit](../archive/audits/2026-06-27-reliability-audit.md) | RA-01 through RA-24 are fixed; RX-01/RX-02 are retired. No open items copied. |
| [Role and permission audit](../archive/audits/ROLE_PERMISSION_AUDIT.md) | All audited P0-P2 boundaries are resolved. No open items copied. |
| [Builder orchestration audit](../archive/audits/BUILDER_REVIEW_ORCHESTRATION_AUDIT.md) | Durable review and local verification shipped; production isolation and delivery evidence remain below. |
| [Agentic walkthrough backlog](../walkthroughs/agentic-testing-backlog.md) | Reports, analytics, and compliance-document journeys shipped; only runtime-noise polish remains. |
| April module reviews under `docs/archive/module-reviews/` | Historical only; their still-relevant product candidates were already carried into this backlog. |

## Release and security blockers

| ID | Priority | Status | Area | Open work |
|---|---|---|---|---|
| BLD-01 | P0 | In progress | Builder | Containerized verification is implemented and production now fails closed without a digest-pinned `BUILDER_VERIFIER_IMAGE`. Build and publish the trusted verifier image, configure it for production workers, then run the container-backed verification suite before enabling Builder code execution for production organizations. |

## Data integrity and reliability findings

These entries preserve intentionally deferred behavior from the refactor. The
source log contains the full evidence and expected-versus-actual discussion.
Existing RF IDs are retained for stable references. RF-22 through RF-27 were
added during the 2026-08-12 consolidation correction without renumbering the
already-referenced entries.

### P1

| ID | Status | Area | Open work |
|---|---|---|---|

### P2

| ID | Status | Area | Open work |
|---|---|---|---|
| RF-18 | Verified open | Widgets | Allocate widget positions atomically or enforce uniqueness with retry/rebalancing. Needs a unique constraint to detect the collision, so it cannot ship schema-free. |
| RF-20 | Verified open | Onboarding | Distinguish not-found from infrastructure failure and make session/telemetry updates transactional or event-backed. |
| RF-21 | Decision needed | Onboarding | Define the canonical organization-type-to-module recommendation matrix and align prompts, defaults, exclusions, and tests. |
| RF-22 | Decision needed | Admin uploads | Remove the ignored `autoApprove` input from upload/reprocessing clients and schemas, or define a role-gated bulk-approval workflow with audit history. |
| RF-23 | Decision needed | Holding imports | Define “AI-off” behavior for holding uploads: provide a configured-KPI selector or remove the misleading toggle and route non-AI uploads to document-only storage. |
| RF-24 | Verified open | Dashboard | Return availability metadata for each dashboard statistic and render unavailable data separately from a true zero. |
| RF-25 | Decision needed | Notifications | Define whether nested notification preference objects are patches or replacements, then align the schema, repository, and client payloads. |
| RF-26 | Verified open | Notification jobs | Treat pending/retryable delivery scan errors as a failed run and add monitoring that distinguishes an empty queue from a failed scan. |
| RF-27 | Verified open | Task jobs | Check advisory-lock and run-log database results, then define whether logging failures abort generation, retry logging, or emit a monitoring alert. |
| BLD-03 | Verified open | Builder delivery | Replace manually tracked merge/deploy state with provider-verified delivery facts before presenting those states as authoritative. |

## Test infrastructure

### P3

| ID | Status | Area | Open work |
|---|---|---|---|
| WT-01 | Verified open | Walkthrough runtime | Reduce occasional Fast Refresh and `MaxListenersExceededWarning` noise during long local journey runs. |
| WT-02 | Verified open | Local authentication | After a local Supabase reset, a browser with a stale session can remain on “Signing in…” and report `AuthApiError: Invalid Refresh Token: Refresh Token Not Found`. Clear or recover the invalid browser-auth session so login and walkthroughs resume without manual browser-state cleanup. |

## Product roadmap candidates

The following module items are carry-forwards from the June product review.
They are intentionally lower-confidence than the verified findings above: when
an item is selected, revalidate it against current code and update its status
before planning implementation.

Revalidated 2026-08-09: six already-shipped items were removed (compliance
reminders, the overdue-filing job, the 990-PF Part XIII worksheet, Donor CRM and
Tax Center assistant tools, and holdings CSV import). The remaining entries were
spot-checked against the tree but not exhaustively re-verified.

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
| Ch-U9 | Add map view using indexed `latitude` / `longitude` data. Partially covered: `components/map/MapSection.tsx` already plots coordinates on the dashboard, but keyed by holding, not from the charity directory. Scope what a charity-side map adds before building. |
| Ch-F8 | Add multi-year financial trend from ProPublica filings |

---

## AI Assistant

### P2

| # | Issue |
|---|-------|
| AI-F4 | Add portfolio-aware contextual suggested prompts |
| AI-F8 | Add admin usage dashboard for `ai_usage_log` and Redis monthly usage counters. Blocked until the organization AI runtime lands, since that increment reshapes `ai_usage_log` into the canonical invocation record. |

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

## Open count summary

| Priority | Verified/decision findings | Product carry-forwards | Total |
|---|---:|---:|---:|
| P0 | 1 | 0 | 1 |
| P1 | 4 | 2 | 6 |
| P2 | 11 | 40 | 51 |
| P3 | 2 | 10 | 12 |
| **Total** | **18** | **52** | **70** |

## Recommended execution order

1. Ship BLD-01 before enabling production Builder workers. BLD-02’s canonical diff-evidence hardening is complete locally.
2. Reuse the RF-01/RF-03/RF-04/RF-06 transactional orchestration pattern for remaining bounded domain slices; introduce an outbox where an external side effect cannot share the database transaction.
3. Resolve the remaining product decision RF-21 before implementation.
4. Select product roadmap candidates based on customer discovery, revalidate them, and promote only chosen items from carry-forward status.
