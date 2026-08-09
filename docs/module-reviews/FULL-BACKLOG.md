# Impact Platform — Consolidated Open Backlog

Last consolidated: 2026-08-08.

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
- **Decision needed** — current behavior is known; product semantics must be chosen before implementation.
- **Carry-forward** — retained from the prior product backlog and should be revalidated when selected.

## Consolidated sources

| Source | Consolidation result |
|---|---|
| [Refactor findings](../superpowers/specs/2026-07-26-refactor-findings.md) | 13 unresolved findings are tracked below; Phase 3/5/6/7 resolutions and the eight closed on 2026-08-09 were not copied. |
| [Reliability audit](2026-06-27-reliability-audit.md) | RA-01 through RA-24 are fixed; RX-01/RX-02 are retired. No open items copied. |
| [Role and permission audit](../ROLE_PERMISSION_AUDIT.md) | All audited P0-P2 boundaries are resolved. No open items copied. |
| [Builder orchestration audit](../BUILDER_REVIEW_ORCHESTRATION_AUDIT.md) | Durable review and local verification shipped; production isolation and delivery evidence remain below. |
| [Agentic walkthrough backlog](../walkthroughs/agentic-testing-backlog.md) | Reports, analytics, and compliance-document journeys shipped; only runtime-noise polish remains. |
| April module reviews under `docs/archive/module-reviews/` | Historical only; their still-relevant product candidates were already carried into this backlog. |

## Release and security blockers

| ID | Priority | Status | Area | Open work |
|---|---|---|---|---|
| BLD-01 | P0 | Verified open | Builder | Ship the container/Docker-isolated verification runner before enabling Builder code execution for production organizations. The current local worktree runner executes proposal-modified code on the worker host. |

## Data integrity and reliability findings

These entries preserve intentionally deferred behavior from the refactor. The
source log contains the full evidence and expected-versus-actual discussion.
RF IDs follow discovery order after resolved findings were excluded.

### P1

| ID | Status | Area | Open work |
|---|---|---|---|
| RF-04 | Verified open | Workflows | Move workflow-task, linked-task, workflow-instance, and task-event changes into one transactional boundary. |
| RF-06 | Verified open | Tasks | Make task, link, comment, audit, milestone-sync, and automation side effects transactional or outbox-backed. |
| RF-07 | Verified open | Acknowledgments | Replace PDFs through versioned/staged object paths so database and storage state cannot diverge. |
| RF-08 | Verified open | Memberships | Move membership changes, last-owner protection, and audit insertion into transactional database functions. |
| RF-09 | Verified open | Invitations | Commit invitation state and an email-outbox record transactionally; deliver with idempotent retries and explicit status. |
| RF-10 | Verified open | Custom fields | Validate the full request, commit all field values atomically, and dispatch automation through a durable outbox. |
| RF-11 | Verified open | Public invitations | Accept the invitation, activate membership, and write the audit event in one idempotent transaction. |
| RF-12 | Verified open | Onboarding assistant | Give onboarding chat the durable, idempotent turn/state/recommendation boundary already used by the portfolio assistant. |
| RF-13 | Verified open | Onboarding provisioning | Use `session_id` as the idempotency key for transactional create-or-resume provisioning and final session linkage. |
| BLD-02 | Verified open | Builder evidence | Promote the verifier's `diff.authoritative.patch` to canonical review/apply evidence: persist and hash it fail-closed, expose it to reviewers, and stop treating the earlier adds-only `diff.patch`/hash as authoritative for modified files. |

### P2

| ID | Status | Area | Open work |
|---|---|---|---|
| RF-14 | Verified open | Walkthrough CI | Split or parallelize the journey suite, or raise the timeout after measuring the intermittent runtime ceiling. |
| RF-18 | Verified open | Widgets | Allocate widget positions atomically or enforce uniqueness with retry/rebalancing. Needs a unique constraint to detect the collision, so it cannot ship schema-free. |
| RF-20 | Verified open | Onboarding | Distinguish not-found from infrastructure failure and make session/telemetry updates transactional or event-backed. |
| RF-21 | Decision needed | Onboarding | Define the canonical organization-type-to-module recommendation matrix and align prompts, defaults, exclusions, and tests. |
| BLD-03 | Verified open | Builder delivery | Replace manually tracked merge/deploy state with provider-verified delivery facts before presenting those states as authoritative. |

## Test infrastructure

### P3

| ID | Status | Area | Open work |
|---|---|---|---|
| WT-01 | Verified open | Walkthrough runtime | Reduce occasional Fast Refresh and `MaxListenersExceededWarning` noise during long local journey runs. |

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
| P1 | 10 | 2 | 12 |
| P2 | 5 | 40 | 45 |
| P3 | 1 | 10 | 11 |
| **Total** | **17** | **52** | **69** |

## Recommended execution order

1. Ship BLD-01 before enabling production Builder workers; address BLD-02 in the same Builder hardening increment.
2. Reuse the RF-01/RF-03 transactional orchestration pattern for RF-04, RF-06, and RF-08 through RF-13 in bounded domain slices; introduce an outbox where an external side effect cannot share the database transaction.
3. Resolve the remaining product decision RF-21 before implementation.
4. Select product roadmap candidates based on customer discovery, revalidate them, and promote only chosen items from carry-forward status.
