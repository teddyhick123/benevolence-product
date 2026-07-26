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
