# Refactor Findings — Behavior Quirks Log

**Spec:** [2026-07-26-full-refactor-design.md](2026-07-26-full-refactor-design.md)

Non-security behavior quirks discovered during the refactor are logged here
instead of fixed. Security bugs are fixed in dedicated commits with regression
coverage — see the spec's bug policy.

Each entry: date, phase/task, `file:line`, what the code actually does versus
what was expected, and why it was left alone.

## Findings

### 2026-07-27 — Phase 1, Task 7 — `.github/workflows/walkthrough-smoke.yml`, `tests/walkthrough/journeys/`

**What happened:** On PR #19 (Phase 1 guardrails), the `walkthrough-smoke` job ran
22/22 executed Playwright tests green (9 smoke + 13 journey specs) but was
canceled by GitHub Actions' 30-minute job timeout mid-way through the final
journey batch (`##[error]The operation was canceled.` at 23:19:43, after
starting a 6-test batch at 23:15:14). No test assertion failed.

**Expected vs. actual:** The Phase 1 plan (Task 7 Step 4) expects `Walkthrough
Smoke` green alongside `CI / verify`. It is not: the job is already broken on
`main` independent of this PR — the push run at the Phase 1 merge-base commit
(`53731cb1`, run 30221081802) failed `npm run walkthrough:journeys` with exit
code 1 in 17m14s, and `gh run list` shows repeated intermittent failures on
`main` going back to at least 2026-06-19 (roughly half of the last 14 runs
failed, with durations ranging 5m35s–17m14s even on green runs approaching the
current PR's 30-minute ceiling).

**Why left alone:** This phase is infrastructure-only (lockfile, CI gate, test
conventions) and touches no product code, Playwright config, or walkthrough
scripts — nothing in the Phase 1 diff can explain either failure mode. The
underlying issue (suite duration/flakiness in `tests/walkthrough/journeys/`,
possibly compounded by the added `cache: npm` step's first-run cache-miss
overhead) is pre-existing and orthogonal to the guardrails this phase lands.
Not a security bug, so per the spec's bug policy it's logged, not fixed, here.
Phase 1's actual CI gate (`.github/workflows/ci.yml`'s `verify` job) is green on
both the push and pull_request triggers.

**Suggested follow-up (not scheduled):** A later phase or a dedicated ticket
should either raise `walkthrough-smoke`'s `timeout-minutes`, split the journeys
job to parallelize, or investigate why suite duration has crept toward the
30-minute ceiling.

### 2026-07-29 — Phase 2, Admin Upload family — ignored `autoApprove` input

**What happened:** Both upload UIs send `autoApprove=true`, and
`lib/schemas/admin.ts:7-10` accepts the same option for the reprocessing route,
but neither ingestion path reads it. Extracted facts always remain in
`staging_metric_facts` for manual review.

**Expected vs. actual:** The field name implies that a successful ingestion can
promote facts automatically. Actual behavior is manual approval regardless of
the supplied value.

**Why left alone:** Automatically promoting AI-extracted facts changes a
high-impact review control and requires an explicit product decision. The API
and authorization refactor preserves the manual-review behavior.

**Suggested follow-up (not scheduled):** Remove the unused option from the UI
and schema, or define a role-gated bulk approval workflow with audit history.

### 2026-07-29 — Phase 2, Admin Upload family — holding uploader AI-off mode is unrestricted

**What happened:** `components/holdings/ReportUploader.tsx:104-110` submits
`ai_mode=false` without any `selected_metrics`. The extractor treats an empty
restriction list as unrestricted (`lib/ai/document-extractor.ts:50-52`), so the
toggle can still discover any KPI.

**Expected vs. actual:** The admin upload page describes AI-off mode as limiting
extraction to selected KPIs. The holding-level uploader exposes the same toggle
without a KPI selector, so its off state does not enforce that restriction.

**Why left alone:** Choosing whether AI-off means "do not extract" or "extract
only configured KPIs" is a product behavior decision outside the boundary
refactor. Existing extraction behavior was retained.

**Suggested follow-up (not scheduled):** Add the configured-KPI selector to the
holding uploader or remove the toggle there and route non-AI uploads through a
document-only storage flow.
