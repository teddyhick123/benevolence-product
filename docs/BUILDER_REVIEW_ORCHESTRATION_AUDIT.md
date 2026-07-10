# Builder Implementation Orchestration: Audit and Best-in-Class Delivery Plan

Date: 2026-07-10  
Status: proposed execution plan  
Audience: product, platform, security, and implementation teams

## Decision

Do not treat Builder code proposals as ready for production deployment yet. The current experience is a useful proposal generator and human PR launcher, but it is not an evidence-based implementation pipeline. In particular, a generic proposal can open a pull request without any review, and a scaffolded proposal reaches the same state after a single truncated LLM review regardless of its findings.

The target is a bounded, auditable system in which Builder may generate code but may never autonomously approve, merge, deploy, or declare delivery. An organization implementation reviewer remains the decision maker; deterministic verification and specialist review provide the evidence for that decision.

This plan deliberately keeps safe, org-scoped configuration changes on the existing direct-apply path. It applies only to proposals that modify source code, migrations, infrastructure, or tests.

## What “best in class” means here

A code proposal is safe to offer for PR creation only when all of the following are true:

1. Its code is an immutable revision with a recorded base commit, manifest hash, and unified diff.
2. It was built and checked in an isolated, resource-bounded environment with no production credentials and no default network egress.
3. Required deterministic checks passed against exactly that revision and their redacted evidence is available to the reviewer.
4. All blocking findings are resolved or the reviewer has explicitly rejected the proposal. A model score is never an authorization signal.
5. The current base branch has not drifted in a way that invalidates the review. Drift causes a rebase/re-review, not a silent PR creation.
6. PR, merge, and deployment states are verified from the integration that owns them. A human cannot manually turn an open PR into “shipped.”

The reviewer experience should answer, without leaving Builder Studio: what changed, why it changed, what was tested, what failed or remains risky, what source revision was reviewed, and what action is now safe to take.

## Audited current state

### Current paths

| Path | Current behavior | Verdict |
| --- | --- | --- |
| `submit_code_proposal` | Persists supplied files directly as `ready_to_apply`. | P0 bypass: no build, verification, or review run is required. |
| `scaffold_module` | Produces a plan; a reviewer starts a BullMQ worker that generates files then calls one LLM reviewer. | Useful scaffold, but not a release gate. |
| `runReviewPhase` | Sends each generated file truncated to 3,000 characters to one model and stores a score/findings JSON document. It always advances to `ready_to_apply`. | P0: error findings, low scores, omissions, and non-deterministic review failures do not block. |
| Apply endpoint | Requires `implementation_reviewer`, org scope, GitHub configuration, `ready_to_apply`, and nonempty files. | Correct authorization foundation; missing current-review, blocking-finding, stale-base, and path-policy gates. |
| Ship endpoint | Requires reviewer capability, an open PR URL, and `pr_opened`, then writes `shipped`. | P1: this is a manual assertion, not merge or deployment verification. |
| Builder Studio | Shows lifecycle, paths, a score, count of findings, and action buttons. | Insufficient evidence for a responsible review decision. |

### Confirmed release blockers

| Priority | Finding | Evidence in the current implementation | Required correction |
| --- | --- | --- | --- |
| P0 | Generic proposals bypass all review. | `lib/builder/tools.ts` inserts generic code with `phase: 'ready_to_apply'`. | Route every code proposal through one revision and verification gate. |
| P0 | A model review does not gate PR creation. | `lib/builder/scaffold-worker.ts` updates `ready_to_apply` after any parsed or fallback report. | Make required checks and unresolved blocker findings authoritative. |
| P0 | Generated code has no isolated execution boundary. | The worker generates text only; no pinned checkout, patch application, or deterministic command runner exists. | Introduce a sandboxed verification runner before any PR action. |
| P0 | A reviewed change is not bound to source state. | No base SHA, diff hash, or worktree snapshot is persisted; GitHub apply reads `main` only when opening the PR. | Capture base SHA and review a generated diff against it; invalidate on drift. |
| P0 | Duplicate build requests can race. | The build endpoint reads `plan_ready` and enqueues without an atomic claim; the worker has no proposal revision lock. | Use a database compare-and-set claim and idempotency key before queueing. |
| P0 | Generated paths are traversal-checked but not policy-checked. | `validateBuilderPath` rejects absolute and `..` paths, while GitHub apply can still write any other repo path. | Enforce an allow/deny path policy; prohibit workflow, secrets, deployment, dependency-lock, and security-sensitive paths unless an approved elevated plan explicitly permits them. |
| P1 | Evidence is too weak for human review. | Only path names, score, and count are returned to Studio. Generated content and findings are not presented there. | Provide exact diffs, per-check evidence, findings, and revision metadata. |
| P1 | Delivery status is not verified. | The ship route checks only a PR URL. | Verify merged SHA and deployment result; otherwise stop at `merged`. |
| P2 | Context is broad and stale rather than task-specific. | A process-cached index, templates, one donor example, and an AGENTS.md excerpt are supplied; Foundation Memory and exact target files are not. | Persist a versioned, minimal task context packet keyed to the source revision. |
| P2 | There is no repair path. | Findings are stored in one JSONB column and cannot create a new controlled revision. | Add reviewer-requested, bounded repair attempts with immutable history. |

### What remains worth preserving

- The `implementation_reviewer` capability is the right human authority boundary for starting a run, requesting repair, opening a PR, and rejecting a proposal.
- Org scoping and GitHub configuration checks in the apply route are a sound base to retain.
- The BullMQ worker is an appropriate orchestration mechanism once its jobs operate on immutable revisions and a safe runner.
- Existing proposal and Builder-event visibility are a useful starting point for an audit trail.
- The product distinction between safe configuration and source-code work is correct and should become more prominent in the Builder conversation and UI.

## Product and security guardrails

These are non-negotiable implementation rules, not later enhancements.

- Never execute generated code in the web process, BullMQ worker host, shared developer checkout, or an environment containing production/Supabase/GitHub write credentials.
- Run only a fixed command allowlist in a disposable sandbox. Give it a pinned tool image, read-only base checkout, writable scratch directory, CPU/memory/time/output limits, and network disabled by default.
- Use least-privilege GitHub credentials: read access to obtain the pinned base; write access only for the deliberate PR-open action. Do not place the write token in the verification sandbox.
- Reject paths outside an approved proposal target set. Always deny `.github/**`, deployment configuration, secret/env files, lockfiles, auth/security primitives, and migration rewrites by default. An elevated plan can request a narrow exception, but it must be explicitly approved before generation and prominently flagged to the reviewer.
- Never persist raw model prompts, source code, or command logs in telemetry visible across organizations. Store artifacts in a private, org-scoped location; persist hashes and redacted summaries in relational rows.
- Treat model output as untrusted input. Validate every plan, file manifest, review finding, and repair patch with Zod/strict schemas before persistence or use.
- Preserve immutable proposal revisions and review attempts. Repairs, reruns, and rebases create new records; they never overwrite evidence for a previous revision.
- No automatic merge or production deployment. A PR is an external review handoff, not a release action.

## Target operating model

```text
Builder request
  -> config proposal (safe direct-apply path)
  -> code proposal
       -> plan validation and human start
       -> immutable proposal revision (base SHA + context + requested paths)
       -> generate or ingest patch
       -> deterministic verification sandbox
       -> specialist review of the exact diff and evidence
       -> needs_repair | ready_to_apply | rejected
       -> human opens PR
       -> verified merged
       -> verified deployed (only when deployment telemetry is configured)
```

### Canonical proposal state model

Replace the overloaded `status` plus `phase` interpretation for code proposals with one explicit state field. Keep the existing configuration approval state separate; do not force configuration proposals through the code state machine.

| State | Meaning | Entry rule | Allowed next states |
| --- | --- | --- | --- |
| `plan_ready` | Scope and expected paths are available for an implementation reviewer. | Validated plan or generic proposal draft exists. | `queued`, `rejected` |
| `queued` | A claimed revision has a queued job. | Atomic claim succeeds. | `generating`, `verifying`, `failed` |
| `generating` | A scaffold generator is producing a patch. Generic proposals skip this state. | Worker owns current job. | `verifying`, `failed` |
| `verifying` | Patch application, deterministic checks, and reviews are running. | Immutable revision and sandbox are ready. | `needs_repair`, `ready_to_apply`, `failed`, `rejected` |
| `needs_repair` | At least one required check or blocker finding remains. | Review policy evaluation fails. | `queued`, `rejected` |
| `ready_to_apply` | Current revision passed all required gates and awaits a human PR decision. | Fresh required checks pass; no open blockers. | `pr_opened`, `queued`, `rejected` |
| `pr_opened` | GitHub confirms the PR associated with this revision is open. | Idempotent PR creation succeeds. | `merged`, `needs_repair`, `rejected` |
| `merged` | GitHub confirms the approved PR merged at the recorded head SHA. | Webhook or signed API verification. | `deployed` |
| `deployed` | Deployment provider confirms success for the merged SHA and environment. | Verified deployment event. | terminal |
| `rejected` | An authorized reviewer declined the proposal with a reason. | Explicit human decision. | terminal |
| `failed` | An infrastructure failure stopped the latest run without a code finding. | Runner/queue/integration failure. | `queued`, `rejected` |

`shipped` is retired. In interfaces, show `Merged` when deployment telemetry is unavailable and `Deployed` only after a verified success. Do not map an open PR to a delivery state.

## Canonical persistence design

The database is prerelease, so make the Builder schema coherent rather than layering compatibility fields indefinitely. Reconcile the builder fields currently split between `0025_builder.sql` and `0026_builder_enhancement.sql` into one canonical baseline, then add the new orchestration tables in the active migration set. Keep `organizations.ai_instructions` only until the separate assistant-context migration is complete; it is actively used beyond Builder and must not be removed as part of this work without that sweep.

### Tables and immutable artifacts

| Record | Purpose | Essential fields |
| --- | --- | --- |
| `builder_proposals` | Human request and current code-proposal state. | `org_id`, `requested_by`, `request_text`, `proposal_type`, `code_state`, `current_revision_id`, `reviewed_by`, `rejected_reason`, timestamps. |
| `builder_proposal_revisions` | Immutable code snapshot for generation, generic ingestion, repair, or rebase. | `proposal_id`, `revision_number`, `parent_revision_id`, `kind`, `base_commit_sha`, `head_commit_sha`, `manifest_hash`, `diff_hash`, `context_hash`, `artifact_prefix`, `created_by`, timestamps. |
| `builder_review_attempts` | One policy evaluation against one revision. | `proposal_id`, `revision_id`, `attempt_number`, `trigger`, `status`, `policy_version`, `started_at`, `completed_at`, `decision_reason`. |
| `builder_verification_runs` | One deterministic check execution. | `review_attempt_id`, `check_key`, `command_version`, `status`, `exit_code`, `duration_ms`, `log_artifact_key`, `evidence_hash`, timestamps. |
| `builder_review_findings` | Typed, line-addressable reviewer output. | `review_attempt_id`, `reviewer_kind`, `severity`, `category`, `rule_id`, `file_path`, line range, `evidence`, `recommendation`, `state`. |
| `builder_delivery_records` | GitHub and deployment facts, not user assertions. | `proposal_id`, `revision_id`, `provider`, `pr_number`, `branch_name`, `commit_sha`, `environment`, `status`, provider event ID, payload hash, timestamps. |

Use check constraints for enums, `org_id` indexes where a table is directly org-scoped, and RLS that lets org admins read their records while reserving all writes for service-role orchestration routes. When child records do not carry `org_id`, enforce access through an inner join to `builder_proposals(org_id)`. Add service-role policies and grants explicitly. Store full patch/context/log artifacts in a new private `builder-artifacts` bucket with revision-scoped paths and signed URL access; cap and redact logs before storage.

The existing `generated_code`, `review_report`, `phase`, and `pr_url` fields are transitional sources. Migrate their active code consumers to the canonical records and remove the stale fields and lifecycle compatibility mapper in the same prerelease schema consolidation. Do not maintain two sources of truth.

## Execution roadmap

The sequence is intentional: each phase removes a way unreviewed code can reach GitHub before adding sophistication. Completion of one phase is the entry criterion for the next.

### Phase 0 — Freeze the unsafe release path (P0)

**Outcome:** No new code proposal can become PR-eligible without a current, passing verification attempt.

1. Change `submit_code_proposal` to create `plan_ready` code proposals and a generic-input revision, never `ready_to_apply`.
2. Make the apply route require the proposal’s current revision, a completed current review attempt, `ready_to_apply`, zero unresolved blocking findings, passing required check keys, a matching diff hash, and a non-stale base SHA.
3. Replace the build route’s read-then-enqueue sequence with an atomic transition from `plan_ready`/`needs_repair` to `queued`, recording an idempotency key and revision ID before emitting the job. Return the existing job on a duplicate request.
4. Introduce proposal target-path policy validation before persistence, again before sandbox patch application, and again before GitHub write. Validate normalized unique paths, byte/file-count budgets, exact manifest-diff consistency, and protected-path exceptions.
5. Disable the ship button and endpoint. Temporarily present verified PR status only until Phase 6 creates `merged` and `deployed` facts.
6. Update `docs/BUILDER_OPERATIONS.md`, Builder tool descriptions, tests, and UI language so no document says generic proposals go directly to PRs.

**Primary code seams:** `lib/builder/tools.ts`, `app/api/org/[orgId]/builder/proposals/[proposalId]/build/route.ts`, `app/api/org/[orgId]/builder/proposals/[proposalId]/apply/route.ts`, `lib/builder/github-apply.ts`, `lib/builder/proposal-lifecycle.ts`, and related Builder tests.

**Exit criteria:** A generic proposal cannot open a PR; two concurrent starts produce one active job; a proposal containing a protected path, stale base, failed check, or blocker finding receives a clear 409/422 and stays non-PR-eligible.

### Phase 1 — Establish the durable data contract (P0)

**Outcome:** Every run is traceable to one immutable proposal revision and one review attempt.

1. Consolidate the prerelease Builder schema as described above, with RLS, indexes, typed constraints, triggers, and a private artifact bucket in canonical migrations.
2. Implement typed domain models and one transition service (`lib/builder/proposal-state.ts`), including transition guards, idempotency behavior, terminal-state rules, and an explicit policy version.
3. Create artifact utilities for JSON context, file manifest, unified diff, review prompts/responses, and capped/redacted command logs. Hash all serialized inputs with a stable canonical serializer.
4. Move API list/detail responses to a summary/detail contract: list views return current state, risk, and aggregate check status; detail views return the authorized revision, diff, attempts, findings, and signed artifact links.
5. Write schema-contract and RLS tests against `db/migrations`, not just source-text assertions.

**Exit criteria:** A revision cannot be altered after an attempt starts; retry/repair/rebase makes a new revision; the detail API can explain every current state from persisted evidence alone.

### Phase 2 — Build the isolated deterministic verifier (P0)

**Outcome:** Builder-generated changes are applied and tested against a fixed source revision before any AI reviewer summarizes them.

1. Capture the configured repository’s default-branch SHA when a revision is claimed. Fetch a read-only checkout pinned to that SHA; do not use the app working tree or an unpinned `main` reference.
2. Create a verification-runner adapter with a local development implementation and a production disposable-container implementation. The job passes only a revision artifact reference and an allowlisted check profile; it never passes production environment variables or GitHub write credentials.
3. Apply the manifest as a patch in the sandbox. Fail immediately if patch application, path policy, file size, or manifest/diff hash validation fails. Generate the authoritative unified diff from the sandbox, rather than trusting model-supplied diff text.
4. Add stable project scripts and check profiles, beginning with:
   - `verify:types` — `tsc --noEmit`
   - `verify:lint` — lint only changed/related files, plus full lint when changed configuration requires it
   - `verify:unit` — deterministic targeted Vitest selection from affected paths, followed by contract suites for changed routes/schema
   - `verify:migrations` — fresh local Supabase reset from canonical `db/migrations` and schema/contract assertions for changed SQL
   - `verify:build` — production Next build for changes affecting routes, components, configuration, or dependencies
5. Record command version, input revision, exit code, elapsed time, capped logs, and evidence hash for every check. A failed runner is `failed`, not a passing review with a warning.
6. Define an explicit check matrix by change class. Migration, API, authorization, module-registry, and UI changes receive their relevant mandatory suites; the matrix is code, versioned, and testable rather than LLM-selected.

**Exit criteria:** A deliberately broken type, lint rule, migration, and route contract each blocks the revision and leaves reproducible evidence. No verification process can read a production secret or write to GitHub.

### Phase 3 — Add evidence-driven specialist review (P1)

**Outcome:** Model reviews complement deterministic checks and produce actionable, line-addressable findings against the exact diff.

1. Add a plan validator before generation. It verifies target paths, module dependencies, schema ownership, migration strategy, test expectations, and whether a request should have been a configuration change instead.
2. Replace the single `runReviewPhase` prompt with strict, versioned reviewer contracts. Each reviewer receives the authoritative diff, relevant full target/adjacent files, canonical migration excerpts, check evidence, and the context hash—not truncated file snippets or a global index alone.
3. Start with these reviewer kinds:
   - **security/data:** org isolation, role/capability checks, RLS, input validation, sensitive data, audit effects
   - **integration/architecture:** routes, modules, APIs, types, migration/schema canon, existing conventions
   - **product/test:** workflow clarity, loading/empty/error states, accessibility, copy, and missing regression coverage
4. Validate reviewer JSON with Zod. Findings require a category, severity, evidence, recommendation, and, when relevant, an existing diff path/line range. Invalid output becomes a review infrastructure failure, not an empty report.
5. Make `blocker` severity the explicit gate. Security, data, schema, and failed deterministic checks are blocking. Product findings are warnings by default; the policy can elevate specified rules after measurement.
6. Retain score only as an optional, non-authoritative summary. Surface policy version and reviewer coverage so a future policy change can require reruns.

**Exit criteria:** A critical RLS/auth defect blocks PR creation even if a score is high; every visible finding links to its evidence; the same revision can be re-reviewed without losing the earlier attempt.

### Phase 4 — Make context precise and repairs controlled (P1)

**Outcome:** The implementation agent gets relevant context without broad, stale prompt stuffing, and reviewers can request a safe repair rather than bypass findings.

1. Create `BuilderImplementationContext` at revision claim time. Include request, approved plan, source SHA, targeted and adjacent files, relevant tests, registry/dependency entries, canonical migration excerpts, applicable access-control conventions, and only the Foundation Memory/configuration entries relevant to the request.
2. Replace the process-global codebase index with revision-aware retrieval. Invalidate index caches for every revision and record selected files/owners in the context artifact. Include full contents only for target/adjacent files; summarize everything else.
3. Add a reviewer-only “request repair” action. The repair prompt may use only the immutable prior revision, open findings, deterministic evidence, and selected context. It may change only approved paths unless the reviewer approves a new plan.
4. Enforce repair budgets: two repair attempts per proposal revision lineage, per-run token/time/file limits, and no automatic retry after a failed repair. Exceeding the budget leaves the proposal in `needs_repair` for human rejection or a new plan.
5. Re-run the full required check matrix and all required reviews on each repair revision. Mark prior findings `resolved` only when the new evidence supports that resolution; never infer resolution from model prose alone.

**Exit criteria:** A repair creates a new revision and diff with a complete lineage; it cannot silently expand scope; an irrelevant Foundation Memory entry cannot appear in a proposal context artifact.

### Phase 5 — Deliver a reviewer-grade Builder Studio (P1)

**Outcome:** The human reviewer can make an informed, accountable decision inside the product.

1. Replace the score-only proposal card with a compact state and risk summary: current state, base/head SHA, changed-file count, mandatory-check pass/fail/pending counts, blocker count, last-run time, and stale-base warning.
2. Add a proposal detail view with a syntax-highlighted unified diff, file tree, migration impact, check log summaries, reviewer findings grouped by severity, attempt timeline, repair lineage, and a clear “why this is blocked” panel.
3. Provide only state-valid controls: start/retry review, request repair, reject with reason, open PR, and refresh delivery status. Every mutation requires confirmation and shows the acting reviewer in the timeline.
4. Keep full content and logs behind authorized detail fetches/signed URLs. Do not return generated source in broad list responses or cross-org admin telemetry.
5. Make the UI accessible: keyboard-navigable diff/finding links, visible severity text in addition to color, readable error states, loading/retry behavior, and no action presented while its state transition is in flight.

**Exit criteria:** An implementation reviewer can identify the exact diff, the failed command or finding, its evidence, the recommended next action, and the reviewed source SHA without opening GitHub.

### Phase 6 — Verify PR, merge, and deployment facts (P1)

**Outcome:** Delivery status is trustworthy and reflects the deployment topology of a white-label instance.

1. Extend the GitHub adapter to return and persist PR number, branch, base SHA, and head SHA. Before PR creation, compare current default-branch SHA with the revision base; drift requires rebase/reverification. Do not write files directly through the Contents API without preserving the resulting commit SHA.
2. Prefer a signed GitHub webhook receiver with idempotent delivery IDs for `pull_request` and check events. A polling fallback may refresh status, but cannot replace signature validation or produce a delivery assertion without GitHub confirmation.
3. On merge, verify `merged === true` and that the merged commit contains the reviewed revision’s head SHA. Write `merged`; do not infer it from a closed PR.
4. Add a provider-neutral deployment-status adapter. For an instance connected to Vercel or another provider, accept only authenticated deployment events that identify the merged commit SHA, target environment, and successful terminal status. Write `deployed` only then.
5. If no deployment provider is configured, stop at `merged` and state that explicitly in the UI. Remove the manual ship route once this path ships.

**Exit criteria:** Closing an unmerged PR never marks a proposal merged; a failed deployment never marks it deployed; a merged PR is shown as `Merged`, not `Deployed`, when no deployment evidence exists.

### Phase 7 — Operate, measure, and roll out safely (P1)

**Outcome:** The pipeline is observable, supportable, and introduced without disrupting org workflows.

1. Evolve `builder_events` from generic lifecycle strings into a privacy-safe event stream that references proposal/revision/attempt IDs and result summaries. Avoid duplicating artifacts or source code in event payloads.
2. Add operations views and alerts for queue age, stuck runs, sandbox failure rate, verifier duration, blocked-reason distribution, repair success rate, GitHub/webhook failures, and delivery verification lag.
3. Publish runbooks for stuck jobs, expired sandbox artifacts, GitHub credential rotation, webhook replay, failed migration verification, and a reviewer escalation path. Update `BUILDER_OPERATIONS.md` to describe both generic and scaffold code proposals accurately.
4. Roll out behind an org-level feature flag: internal test org → one noncritical foundation → broader opt-in. Keep the old direct code-to-PR route disabled rather than maintaining it as a fallback.
5. Establish success measures after launch: 100% of PR-eligible proposals have a passing current attempt; 0 unverified deployment claims; median review turnaround; repair resolution rate; reviewer rejection/override reasons; and false-positive blocker rate.

**Exit criteria:** Operators can diagnose a failed proposal from IDs and evidence, and metrics demonstrate the gate is protecting quality without becoming an opaque bottleneck.

## Required test strategy

Testing is a deliverable for every phase, not the last task.

| Layer | Coverage required |
| --- | --- |
| Domain unit tests | State transitions, policy evaluation, path rules, manifest/diff hashes, stale-base behavior, retry idempotency, repair budgets. |
| Database/RLS contracts | Fresh canonical migrations, constraints, indexes, org isolation on proposals/revisions/attempts/findings/artifacts, service-role orchestration access. |
| Worker integration | Queue claim, duplicate start, sandbox adapter failure, log caps/redaction, deterministic check matrix, artifact immutability. |
| GitHub/deployment adapters | Fake provider tests for existing PR retry, base drift, closed-unmerged PR, verified merge SHA, webhook replay/signature failure, deployment success/failure. |
| API authorization | Unauthenticated, non-admin, admin without reviewer capability, reviewer from another org, stale/blocked proposal, and valid happy path. |
| UI/Playwright | Review evidence rendering, blocked/repair/retry/reject actions, no premature PR button, merged vs deployed language, stale tab and repeated-action behavior. |
| Security regression | Generated protected paths, oversized files/logs, prompt injection in source/context, malicious patch formats, missing artifact access authorization, and sandbox secret/egress boundaries. |

The project’s local walkthrough convention remains the release-level check: use the canonical `db/migrations` reset, run the affected Builder journey, and add a regression spec for every confirmed defect. Text-search tests that merely assert a source string exists are not adequate evidence for orchestration behavior.

## Delivery increments and ownership

| Increment | Scope | Suggested ownership | Depends on |
| --- | --- | --- | --- |
| 1 | Phase 0 gate, atomic claim, path policy, disable manual shipping | Platform/API | none |
| 2 | Schema consolidation, artifacts, state service, detail APIs | Platform/data | 1 |
| 3 | Isolated verifier and deterministic check matrix | Platform/DevEx | 2 |
| 4 | Structured reviewers and task-specific context | AI/platform | 3 |
| 5 | Repair lineage and Builder Studio evidence UX | Product/frontend + AI | 2–4 |
| 6 | GitHub merge and deployment verification | Integrations/platform | 1–2 |
| 7 | Observability, runbooks, feature-flag rollout | Platform/product | 1–6 |

Work on the UI may start after the detail API contract is settled, but no UI enhancement is a substitute for Phases 0–3. The first merge should be Increment 1: it closes the generic-proposal bypass and makes direct PR creation impossible without a future valid review attempt.

## Definition of done

- No code proposal, including a generic proposal, can create a PR without a fresh passing review attempt for its exact revision.
- Failed typecheck, lint, relevant test, migration/schema validation, path-policy rule, or unresolved blocker prevents PR creation with an actionable reason.
- Every checked revision is tied to a source SHA, authoritative diff hash, context hash, check evidence, review policy version, and immutable attempt history.
- Builder Studio gives authorized reviewers the diff, findings, check results, risk state, and valid next action; it never presents a score as approval.
- Repairs are reviewer-requested, scope-bounded, budgeted, and auditable; they do not overwrite prior evidence.
- PR state, merge state, and deployment state come from verified provider facts. `Deployed` is never a manual label.
- All new schema and behavior are protected by canonical-migration, authorization, integration, and end-to-end regression tests.

## First implementation ticket

**Title:** Prevent unreviewed Builder code proposals from reaching GitHub.

**Scope:** Change generic proposal creation to `plan_ready`; introduce an atomic job claim; make the apply route require a current successful review-attempt record; reject protected paths and stale/no-evidence proposals; remove the manual ship control; add integration tests for generic bypass, duplicate start, blocker rejection, and protected path rejection.

This deliberately narrow first ticket removes the highest-risk escape hatch while creating the state boundary required for the durable schema and verifier work that follows.
