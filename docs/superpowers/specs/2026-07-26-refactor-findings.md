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

### 2026-08-01 — Phase 2, dashboard family — failed counts render as zero

**What happened:** `app/api/org/[orgId]/dashboard/route.ts:73-78` deliberately
turns any count-query error into `0`. Several other dashboard reads also use
empty fallbacks when their query fails.

**Expected vs. actual:** A zero normally means the organization has no matching
records. During a database or policy failure, the dashboard can show the same
zero instead of indicating that the statistic is unavailable.

**Why left alone:** Changing partial dashboard degradation into a request-level
failure or per-card error state is a product reliability decision, not an API
boundary change. The refactor retained the current response contract.

**Suggested follow-up (not scheduled):** Return availability metadata per
statistic and render an unavailable state separately from a real zero.

### 2026-08-01 — Phase 2, visualization family — widget positions use max-plus-one

**What happened:** `lib/api/repositories/visualizations.ts:45-61` and `:69-85`
read the current maximum widget position and then insert `max + 1` in a separate
operation.

**Expected vs. actual:** Sequential saves produce stable ordering. Concurrent
saves can read the same maximum and receive the same position because the
schema has no uniqueness constraint or atomic allocator for that ordering.

**Why left alone:** The scoped repository preserves existing ordering behavior;
introducing an RPC, lock, or uniqueness/retry policy would be a separate data
model decision.

**Suggested follow-up (not scheduled):** Allocate positions in a transaction or
use a uniqueness constraint with retry/rebalancing.

### 2026-08-01 — Phase 2, milestone family — task sync follows the status write

**What happened:** The milestone route updates `grant_milestones` and then calls
the org-scoped generated-task synchronizer
(`app/api/portfolio/[id]/holdings/[holdingId]/milestones/[milestoneId]/route.ts:65-79`).

**Expected vs. actual:** Under normal operation both changes succeed. If task
synchronization fails, the API returns 500 after the milestone status has
already been saved, so the response does not describe the committed state.

**Why left alone:** The ordering predates this refactor and the task writer is
designed for repeatable source-prefix operations. Making both systems atomic
requires a database orchestration boundary beyond this route migration.

**Suggested follow-up (not scheduled):** Move milestone status change and task
state transition into one database function or persist an outbox event for
retryable synchronization.

### 2026-08-01 — Phase 2, notification family — nested preferences merge shallowly

**What happened:** The notification preference endpoint accepts partial
`channels` and `alerts` objects, but `lib/api/repositories/notifications.ts`
merges only the top-level preference keys. Sending one nested channel therefore
replaces the stored `channels` object instead of preserving its sibling value.

**Expected vs. actual:** A partial update such as `{ channels: { email: false }
}` may be expected to retain the existing `in_app` choice. Existing behavior
stores only the supplied nested object.

**Why left alone:** Deep-merging changes the endpoint's established update
semantics and could retain values callers intended to replace. The API boundary
refactor preserves the shallow merge.

**Suggested follow-up (not scheduled):** Define whether nested preference
objects are patches or replacements, then align the schema, implementation, and
client payloads with that contract.

### 2026-08-01 — Phase 2, notification jobs — delivery scan errors look empty

**What happened:** `lib/api/repositories/notification-jobs.ts` reads pending and
retryable email notifications concurrently but, matching the prior route, uses
only each result's `data` and does not inspect its `error`.

**Expected vs. actual:** A failed queue read may be expected to fail the worker
run so it can be retried or alerted. Actual behavior treats the failed result as
an empty list and can return `ok: true` with zero work.

**Why left alone:** Changing the worker's success/failure contract affects
monitoring and retry behavior outside the API-boundary extraction. The refactor
keeps the existing semantics.

**Suggested follow-up (not scheduled):** Fail the run when either queue read
errors, and add job monitoring that distinguishes an empty queue from a failed
scan.

### 2026-08-01 — Phase 2, pledge family — installment task sync is post-commit

**What happened:** The installment status RPC commits the pledge/installment
change before `lib/api/repositories/pledges.ts` synchronizes generated tasks.

**Expected vs. actual:** Under normal operation both states agree. If generated
task synchronization fails, the endpoint returns 500 even though the installment
status and pledge event have already committed.

**Why left alone:** Making the pledge mutation and task updates atomic requires
expanding the database RPC or introducing an outbox/retry boundary. The scoped
repository preserves the existing ordering.

**Suggested follow-up (not scheduled):** Fold task synchronization into the
installment RPC or persist a retryable domain event in the same transaction.

### 2026-08-01 — Phase 2, workflow family — task synchronization compensates best-effort

**What happened:** `lib/api/repositories/workflows.ts` updates a workflow task,
its linked task, a task event, and potentially the workflow instance in separate
operations. On a later failure it attempts to restore the three mutable rows,
but does not verify those compensation writes or remove an event that may
already have been inserted.

**Expected vs. actual:** The endpoint tries to present one logical update, but a
database failure between operations can leave state or audit history partially
advanced even when the response is 500.

**Why left alone:** The scoped repository preserves the existing compensation
sequence. True atomicity requires a database function or transactional outbox,
which is beyond an API authorization boundary change.

**Suggested follow-up (not scheduled):** Move the workflow-task, linked-task,
workflow-instance, and task-event changes into one transactional database RPC.
