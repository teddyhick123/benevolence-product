# Phase 2B — Deployment Evaluation Suite

**Status:** Design approved 2026-08-23. Implementation plan not yet written.

**Goal:** Make `result: 'passed'` a claim the platform can defend, so an organization gets full write tools on its own model because the model was tested, not because an admin ticked a box.

**Roadmap context:** `docs/agent-work/plans/2026-08-16-tenant-sovereignty-roadmap.md` § Phase 2, scope item 2, finding F5. Phase 2A (`docs/agent-work/plans/2026-08-23-phase2a-byo-connectors.md`) shipped scope items 1 and 3 and is merged.

---

## The problem

`app/api/org/[orgId]/ai-settings/deployments/[deploymentId]/evaluate/route.ts` asks the model to reply `BENE_OK`, compares the string, and records `evalSuiteVersion: 'phase1-compatibility-v1'` with `result: 'conditional'`. It never emits `passed`, so `lib/ai/resolver.ts:193` can never grant full tools on evidence, so the only route to a write-capable assistant on an organization's own model is the Phase 1 opt-in checkbox — an admin asserting something nobody measured.

Everything below exists to replace that assertion with a test.

## Decisions

| Decision | Choice |
|---|---|
| What `passed` certifies | Conformance, quality, and safety — all expressed as deterministic structural assertions |
| Quality ground truth | Structural rubric assertions. No LLM judge, no golden outputs |
| Execution | Background job via BullMQ, mirroring `lib/import/job-queue.ts` |
| Verdict model | Cases marked required or advisory; verdict aggregated per workload |
| Phase 1 checkbox | Demoted and gated — hidden once `passed` evidence exists, retained as an override otherwise |
| Case definition | Typed registry plus four operation drivers |

### Why no LLM judge

A judge model makes the verdict nondeterministic: the same deployment passes, then fails, with nothing having changed. That is incompatible with storing the verdict as durable 90-day evidence, and it puts the platform in the position of grading whether a client's chosen model writes prose it likes.

Structural assertions avoid this without giving up the quality dimension, because the quality properties that matter here are checkable facts rather than opinions. Whether an extracted EIN appears in the source document is a fact. Whether a letter contains the donor name, the amount, and no `[INSERT …]` placeholder is a fact. Whether the model called the tool that an injected instruction asked it to call is a fact. Every one of those is a genuine quality or safety finding and none needs a judge.

---

## Architecture

The runner is pure. It receives an `AIConnector` and an execution plan and returns results; it never touches Supabase, credentials, or Redis. All I/O belongs to the worker.

This is the load-bearing boundary. It means the entire suite is unit-testable against a fake connector with no network calls, no API keys, and no cost — which matters, because a verification system whose own logic is expensive to test will not stay correct.

```
lib/ai/evals/                     pure domain, no I/O
  types.ts        EvalCase, Assertion, CaseResult, WorkloadVerdict
  assertions.ts   callsTool, jsonMatchesSchema, containsAll, withinTokens,
                  omitsPlaceholders, groundedIn, ignoresInjectedInstruction
  drivers/        keyed on AIOperation — execute one case against a connector
    text-generation.ts
    structured-generation.ts
    tool-conversation.ts
    transcription.ts
  cases/          typed case data, one file per workload
  registry.ts     workload -> cases
  runner.ts       select driver by operation, run cases, aggregate verdict
  version.ts      SUITE_MAJOR plus content-derived case-set hash

lib/ai/evals/queue.ts             BullMQ queue and worker
db/migrations/0058_ai_deployment_evaluations.sql
```

Nine workloads, four operations. The decomposition follows the operations, not the workloads: the assistant's tool round-trip logic is written once in `drivers/tool-conversation.ts` rather than re-derived per workload.

### What does not change

`lib/ai/resolver.ts` needs no modification. It already grants full tools on `passed` and read-only otherwise. Phase 1 built that plumbing correctly; this phase only makes `passed` reachable. Outside `lib/ai/evals/`, the production changes are the evaluate route (enqueue rather than run), a new status route, and the settings UI.

### Why a new migration is justified

Per the Schema Change Decision Protocol in `CLAUDE.md`: run records with per-case results are a newly introduced canonical concept, not a correction to an existing one, so they get a new numbered migration. Evidence itself continues to live in `org_ai_deployments.verified_workloads`; the new tables are the audit trail behind it.

---

## Data flow

```
POST …/deployments/[deploymentId]/evaluate   { workloadIds?: AIWorkloadId[] }
  requireOrgAccess(orgId, 'admin')
  run-rate check (table-backed, see below)
  insert run row (status queued)
  enqueue
  202 { runId }

worker
  claim run atomically (queued -> running)
  load credential through the credential repository under a job principal
  build the connector through lib/ai/connectors/registry
  for each requested workload:
      driver = drivers[workload.operation]
      run each case, writing its result as it completes
      aggregate -> passed | conditional | blocked
      recordDeploymentEvaluation(deploymentId, workloadId, evidence)
  mark run succeeded or failed

GET …/deployments/[deploymentId]/evaluate/runs/[runId]
  progress and per-case results, org-scoped
```

Workloads default to those the deployment's catalog template advertises the capabilities for. Requesting a workload the template cannot serve is a 400, not a failed case — that is a configuration error, not a finding about the model.

### Storage

`ai_deployment_evaluation_runs` — `id`, `org_id`, `deployment_id`, `requested_by`, `status` (`queued` | `running` | `succeeded` | `failed`), `failure_kind` (`null` | `transport` | `internal`), `suite_major`, `case_set_hash`, `workload_ids`, `started_at`, `finished_at`, `error`.

`ai_deployment_evaluation_results` — `run_id`, `workload_id`, `case_id`, `required`, `passed`, `detail`.

Normalised rather than a JSONB blob. The purpose of the table is answering "which case failed and why"; the codebase already rejects blob-shaped state for that reason in `ai_messages`.

A unique partial index on `deployment_id WHERE status IN ('queued','running')` prevents concurrent runs against one deployment. Without it, two runs interleave writes into `verified_workloads` and race.

### Versioning and expiry

`currentVerificationResult` (`lib/ai/resolver.ts:30`) today checks only that `evalSuiteVersion` is a string and `verifiedAt` is within 90 days. It never invalidates when the suite changes, so adding a required case would leave existing `passed` evidence standing despite never having run it.

Strict invalidation on any case edit is the obvious fix and the wrong one: a typo correction in an advisory assertion would invalidate every organization's evidence and force re-runs against a rate limit.

The design instead uses a **manual semantic major** that the resolver compares, plus a content-derived `case_set_hash` recorded for audit but not used for gating. Adding or tightening a required case is a deliberate major bump, enforced by the drift guard test below. Everything else is recorded without invalidating anything.

`SUITE_MAJOR` is an integer beginning at `1`, exported from `lib/ai/evals/version.ts`. Evidence stores it inside the existing string field as `evalSuiteVersion: "deployment-suite-v1"`, so the evidence shape is unchanged and the resolver compares by string equality against the current value. No schema change to `verified_workloads` is needed.

Evidence is valid when all three hold: the result is `passed` or `conditional`; `verifiedAt` is within 90 days; `evalSuiteVersion` equals the current `deployment-suite-v{SUITE_MAJOR}`.

**Existing evidence stops counting.** Rows carrying `phase1-compatibility-v1` fail the major comparison, so any deployment verified by the smoke test reverts to requiring the checkbox. This is intended — a four-token string match should not survive as evidence — but it is a user-visible change and the release notes must say so.

### Metering

The current evaluate route builds a plan and calls the connector directly, bypassing the gateway, so evaluation spend is never written to `ai_usage_log`. This is the same defect as finding F6 in Builder. A full suite is 25–35 model calls on the organization's own credential, so it is real money that is invisible to the organization paying it.

The worker writes `ai_usage_log` rows through `createAIInvocationRecorder()` explicitly. Phase 3's dashboard then picks up evaluation cost with no further work.

---

## Verdict model

Aggregated per workload, independently. A deployment can be verified for `letters` and blocked for `assistant`; they are separate entries in `verified_workloads`.

| Outcome | Condition | Evidence written |
|---|---|---|
| `passed` | every required case passed | yes — grants full tools |
| `conditional` | every required case passed, at least one advisory failed | yes — usable, read-only |
| blocked | any required case failed | none — deployment stays unverified |

**A run that completes and finds the model failing is `succeeded`,** with a blocked verdict. `failed` means the harness broke. Conflating the two makes a failing model look like an outage and sends admins to investigate infrastructure that is working.

### Case coverage

| Workload | Required | Advisory |
|---|---|---|
| `assistant` | well-formed tool call for an unambiguous request; tool-result round trip; streams; respects the token cap; emits no hallucinated tool name; ignores an instruction injected into tool-result data | terse confirmation without preamble |
| `onboarding` | well-formed tool call; tool-result round trip; respects the token cap | — |
| `extraction` | schema-valid JSON; every required field populated; no value absent from the source document | — |
| `import` | schema-valid JSON; every required field populated | — |
| `import_chat` | streams; respects the token cap | — |
| `letters` | contains every supplied merge fact; no placeholder text; within budget | salutation and closing present |
| `summaries` | within the 256-token budget; cites only figures present in the input | — |
| `financial_profile` | within budget; cites only figures present in the input | — |
| `transcription` | returns text for a fixture audio clip | — |

The injection cases must share vocabulary with `lib/ai/prompt-guard.ts` rather than introducing a second notion of what injection means.

**`transcription` is unreachable for organization deployments today.** It requires the `audio_input` capability, and no template in `lib/ai/catalog.ts` advertises it — every deployment template is text-only, and the workload's platform default routes to the `transcription_platform` connector. Its driver and cases are built anyway so the coverage guard holds uniformly and so the workload is ready the moment an audio-capable template exists, but no organization deployment can currently be evaluated against it. The UI must not offer transcription in the workload list for a deployment whose template lacks the capability, and the implementation plan should not treat an untested transcription path as a gap.

---

## User interface

Each deployment card gains per-workload state: *Verified (expires 12 Nov)*, *Partially verified (1 advisory failure)*, *Not verified*, or *3 required checks failed*, with failures expandable to case-level detail. The primary action is a per-deployment **Run evaluation** button that polls the status route.

In the routing section, the Phase 1 checkbox becomes conditional on evidence:

| Evidence state | Checkbox |
|---|---|
| `passed` | hidden — replaced by "Write access granted by evaluation, verified 14 Aug" |
| `conditional`, or no coverage | shown, as it behaves today |
| required cases failed | shown, labelled "3 required checks failed. Enabling write access overrides that." |

The override survives deliberately. A client whose model fails one required case is never hard-blocked from using the model they chose; the interface simply stops pretending the choice is unremarkable.

---

## Error handling

Transport failures and model failures must never be conflated.

| Condition | Classification |
|---|---|
| 429, 5xx, refused credential, unreachable provider | run `failed`, `failure_kind = 'transport'`, no evidence |
| malformed tool call, missing schema field, ungrounded value, timeout surviving one retry | case failed — a finding about the model |
| worker crash or lost job | reaper marks `running` rows past a deadline as `failed`, `failure_kind = 'internal'` |

**Partial completion is preserved.** A crash after workload three of nine leaves three genuine verifications standing; per-workload evidence is independently meaningful. The run is marked failed, the evidence already written is not withdrawn.

**Duplicate enqueue** is handled by the atomic `queued -> running` claim, the same at-most-once discipline `begin_ai_turn` provides for assistant turns.

### Replacing the rate limiter

`aiDeploymentEvaluationLimiter` (`lib/api/rate-limit.ts:52`) allows 3 per day and was sized for a single smoke call. A full run is 25–35 calls on the client's key, so a limit is more warranted, not less — but an Upstash counter cannot refund a run that died on a provider outage, so one incident locks an admin out for a day.

The limit moves to the runs table, keeping the same ceiling of **3 runs per deployment per 24 hours**, counted as runs started in that window whose `failure_kind` is null — so neither a provider outage (`transport`) nor a worker crash (`internal`) consumes an admin's budget. Only runs that actually exercised the model count against it. Refundable by construction, survives a Redis flush, and consistent with the argument Phase 3 makes for spend caps being database-backed rather than Redis counters. `aiDeploymentEvaluationLimiter` is retired.

---

## Testing

The bulk is unit tests against a `FakeConnector` implementing `AIConnector` — no network, no keys, no cost. Two guards carry unusual weight:

**Coverage guard.** Every workload in `AI_WORKLOADS` has at least one required case, and every case's operation matches its workload's. Without this, a workload with zero cases aggregates to "every required case passed" and is trivially `passed` — the worst available bug in a verification system.

**Drift guard.** A snapshot of the required-case set alongside the current `SUITE_MAJOR`. Adding or tightening a required case fails the test until the major is bumped. This is what makes manual versioning trustworthy rather than aspirational.

Also required:

- verdict aggregation across the required/advisory matrix
- assertion unit tests, including the grounding and injection assertions
- claim atomicity under two concurrent workers
- migration assertions for the partial index, RLS policies, and grants
- route contract tests: the 202 shape, access guards, and org scoping of the status route
- a test that `phase1-compatibility-v1` evidence no longer satisfies `currentVerificationResult`

No live-provider calls in CI.

---

## Dependencies and consequences

**Evaluation requires a running worker.** An instance without one cannot verify anything, and `REDIS_URL` was absent from `.env.example` until the Phase 1 env work. This converges with Phase 5, which already requires a real worker host for Builder; the two should share deployment documentation rather than each describing the requirement separately.

**Phase 3 gains evaluation cost attribution for free** because the worker writes `ai_usage_log` rows.

**Existing verified deployments revert to unverified** on release, as described under Versioning.

## Out of scope

- LLM-as-judge grading, golden-output comparison, and any subjective quality score
- Platform-vouched templates: `VerifiedDeploymentTemplate.verifiedWorkloads` in `lib/ai/catalog.ts` stays empty. This phase verifies an organization's own deployment, not a template on the platform's behalf
- Cross-workload or aggregate deployment scores. Verification is per workload
- Automatic re-verification on expiry. Evidence lapsing at 90 days surfaces in the UI; re-running is an admin action
