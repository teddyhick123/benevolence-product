# Builder Operations

Builder Studio uses a separate BullMQ process for implementation proposals created through the scaffold or generic code-proposal workflows. As of the Increment 2 durable data contract, every fact about a code proposal — its files, its review outcome, its verification results, and its delivery record — is a row in a dedicated table or an object in the private `builder-artifacts` bucket, never a JSONB blob on the proposal itself.

## Required services

- The web application (`npm run dev` locally)
- Redis, configured through `REDIS_URL` (defaults to `redis://localhost:6379`)
- The Builder worker:

```bash
npm run builder:worker
```

The worker advances a claimed revision through generation/collection and automated review. It must run separately from Next.js in every environment where implementation review is enabled.

> **Worker restart required on this release.** The BullMQ job payload gained a `revisionId` field (`{ proposalId, orgId, revisionId }`, job id keyed by `revisionId`). Any long-lived worker process from before this release is reading the old two-field payload shape and must be restarted after deploy — it will not pick up `revisionId` on its own.

## Dev/preview database reset requirement

Migration `0025_builder.sql` was rewritten in place (not patched) and migration `0026_builder_enhancement.sql` was deleted outright. Both use `CREATE TABLE IF NOT EXISTS` / guarded DDL, so **neither migration will apply the new schema to a database that already ran the old 0025/0026** — those statements silently no-op against existing objects. There is no migrations ledger tracking "already applied" state in this project; `scripts/run-migrations.sh` just re-runs every file.

Any dev or preview instance that ran Builder migrations before this release **must have its database reset** (drop and recreate, or drop the `builder_*` tables and objects manually) and then re-run `scripts/run-migrations.sh` from `db/migrations`. In-flight proposals under the old schema are lost — acceptable pre-release, but call this out loudly to anyone with a live dev/preview Builder session before they upgrade.

## Data model: `code_state`

Code proposals (`builder_proposals.proposal_type = 'code'`) move through an 11-value `code_state` state machine (`lib/builder/proposal-state.ts`, `CODE_STATES`). Config proposals (`proposal_type = 'config'`) use the separate `status` column and never touch `code_state` — the two are mutually exclusive by a table CHECK constraint.

| State | Meaning |
|---|---|
| `plan_ready` | Plan/generic submission accepted; awaiting a build claim. |
| `queued` | Claimed by `builder_claim_code_run`; a BullMQ job has been enqueued. |
| `generating` | Worker is producing files (scaffold path only; generic submissions skip straight to `verifying`). |
| `verifying` | Automated review and verification checks are running. |
| `needs_repair` | Blocking findings, a protected-path violation, or an unreadable review result. Retriable. |
| `ready_to_apply` | Review passed the gate; an org admin can open a PR. |
| `pr_opened` | PR opened on GitHub; a `builder_delivery_records` row exists. |
| `merged` | PR merged (tracked manually today; no automated merge listener yet). |
| `deployed` | Terminal success state. |
| `rejected` | Terminal — proposal will not proceed (`rejected_reason` explains why). |
| `failed` | Infrastructure/unexpected failure. Retriable from `plan_ready`-equivalent via `needs_repair`/`failed` claim states. |

Valid transitions are enforced in code by `canTransition()`/`assertTransition()` and in the database by the `builder_revision_immutability_guard` trigger (a revision's artifact hashes and content can never change once its first review attempt starts — `ERRCODE P0031` on violation). `CLAIMABLE_STATES` (`plan_ready`, `needs_repair`, `failed`) are the only states `builder_claim_code_run` will atomically move to `queued`.

## Tables

The durable data contract is five tables plus the two pre-existing proposal/session tables, all created in `db/migrations/0025_builder.sql`:

| Table | Purpose |
|---|---|
| `builder_proposals` | The proposal itself: `org_id`, `proposal_type`, `status` (config) / `code_state` (code), `current_revision_id`, `plan_content`, `rejected_reason`. Holds no generated content and no review results. |
| `builder_sessions` | Chat session state for the Builder assistant UI. |
| `builder_proposal_revisions` | One immutable, hash-anchored snapshot of a proposal's files per build attempt: `revision_number`, `parent_revision_id`, `kind` (`scaffold_generation` / `generic_submission` / `repair` / `rebase`), `base_commit_sha`, `head_commit_sha`, `manifest_hash`, `diff_hash`, `context_hash`, `artifact_prefix`, `file_count`, `total_bytes`. |
| `builder_review_attempts` | One row per automated-review run against a revision: `attempt_number`, `trigger` (`initial`/`retry`/`repair`/`rebase`/`policy_change`), `status` (`running`/`passed`/`blocked`/`failed`), `policy_version`, `required_check_keys`, `summary_score`, `decision_reason`. |
| `builder_verification_runs` | One row per automated check within an attempt: `check_key`, `command_version`, `status`, `exit_code`, `duration_ms`, `log_artifact_key`, `evidence_hash`. |
| `builder_review_findings` | One row per individual reviewer finding: `reviewer_kind`, `severity` (`blocker`/`error`/`warning`/`info`), `category`, `rule_id`, `file_path`, `line_start`/`line_end`, `evidence`, `recommendation`, `state` (`open`/`resolved`/`dismissed`). |
| `builder_delivery_records` | One row per delivery event (PR open, merge, deploy): `provider`, `pr_number`, `pr_url`, `branch_name`, `commit_sha`, `environment`, `status` (`pr_open`/`pr_closed`/`pr_merged`/`deploy_pending`/`deploy_succeeded`/`deploy_failed`), `provider_event_id`, `payload_hash`. |

Child tables (`builder_proposal_revisions`, `builder_review_attempts`, `builder_verification_runs`, `builder_review_findings`, `builder_delivery_records`) authorize reads/writes via an inner join to `builder_proposals.org_id`, not a duplicated `org_id` column of their own. Every table enables RLS with an org-admin read policy plus a service-role bypass policy.

### Removed columns — do not recreate

`builder_proposals.generated_code`, `builder_proposals.review_report`, `builder_proposals.phase`, and `builder_proposals.pr_url` were deleted by the 0025 rewrite and must never be recreated. Their replacements:

- Generated files → `builder_proposal_revisions` artifacts (`files.json`, `manifest.json`) in the `builder-artifacts` bucket.
- Review results → `builder_review_attempts` + `builder_review_findings` rows.
- Lifecycle phase → `builder_proposals.code_state` (code) / `status` (config).
- PR URL → `builder_delivery_records.pr_url` (this is the *only* legitimate `pr_url` column in the schema).

A regression test (`app/api/__tests__/builder-schema-contract.test.ts`, `transitional builder field guard`) recursively scans `app/`, `lib/`, and `components/` and fails the suite if any live (non-comment, non-test) source references these transitional tokens.

## Artifact bucket and keys

Artifacts live in the private `builder-artifacts` storage bucket (`public = false`, migration 0025), never inline in a table column. Every artifact is uploaded with `upsert: false` — artifacts are immutable once written, matching the revision immutability guarantee.

Object keys are namespaced under `artifactPrefix(orgId, proposalId, revisionId)` = `"{orgId}/{proposalId}/{revisionId}"` (the same prefix `builder_claim_code_run` stamps onto `builder_proposal_revisions.artifact_prefix`). Within that prefix (`lib/builder/artifacts.ts`, `ARTIFACT_KEYS`):

| Key | Contents |
|---|---|
| `context.json` | Scaffold/codebase context supplied to the model. |
| `files.json` | The file set for this revision (path/content), canonical-JSON hashed into `manifest_hash`. |
| `manifest.json` | The `FileManifest` (path, byte count, per-file SHA-256) — the tamper-detection anchor. |
| `diff.patch` | Unified diff for the revision. **Synthesized as add-hunks against `/dev/null`** — there is no real base-content diff yet. Until Increment 3's sandbox produces an authoritative base checkout, this is adds-only and does not reflect true before/after content for modified files. The hash-match gate still detects tampering between worker and apply; the Studio UI discloses this limitation in its caption. |
| `review/{attemptId}/prompt.txt` | The reviewer prompt sent for a given attempt. |
| `review/{attemptId}/response.json` | The raw reviewer response for a given attempt. |
| `checks/{checkKey}.log` | Redacted, size-capped log output for an individual verification check. |

API routes never return artifact bytes directly — they return signed URLs via `signArtifactUrl()` (`createSignedUrl`, 1 hour default), consistent with the tax-documents pattern elsewhere in this codebase.

## Proposal review gate

Every code proposal — generic (`submit_code_proposal`) and scaffolded (`scaffold_module`) — starts in `plan_ready` and must pass the automated review gate before a pull request can open:

1. An implementation reviewer starts a run (`POST /api/org/[orgId]/builder/proposals/[proposalId]/build`). The start is an atomic claim via `builder_claim_code_run`: duplicate requests while a run is active return `alreadyRunning` and never enqueue a second job. For a scaffold proposal, every claim creates a fresh `builder_proposal_revisions` row (retry ⇒ new revision); a generic submission's claim reuses the already-submitted revision (retry ⇒ new `builder_review_attempts` row against the same revision). Either way the claim moves `code_state` to `queued`. Runs can be retried from `needs_repair` and `failed`.
2. The worker (`lib/builder/scaffold-worker.ts`) generates files (scaffold) or takes the supplied files (generic), enforces the protected-path policy (`lib/builder/path-policy.ts`), freezes the revision's artifacts/hashes, and records a `builder_review_attempts` row plus its `builder_review_findings` and `builder_verification_runs`. The immutability trigger requires artifacts to be frozen strictly before the first attempt row is inserted for a revision.
3. Blocking findings, protected paths, or an unreadable review result leave the proposal in `needs_repair`; an infrastructure failure leaves it in `failed`.
4. Only a proposal in `ready_to_apply` whose latest passing `builder_review_attempts` row clears the gate (`lib/builder/review-gate.ts` — blocking findings, not score) can open a PR. The apply endpoint re-checks the attempt/findings and the path policy before writing to GitHub, and re-hashes the revision's frozen artifacts to detect tampering between worker and apply.
5. On success the apply route inserts a `builder_delivery_records` row (`status: 'pr_open'`, `pr_url`, `pr_number`, `branch_name`, `commit_sha`) and transitions `ready_to_apply -> pr_opened`. Proposals stop at `pr_opened`; merge and deployment are handled through the normal engineering release process. There is no automated "mark shipped" action — delivery state changes only ever come from evidence recorded in `builder_delivery_records`.

## Detail API contract

`GET /api/org/[orgId]/builder/proposals/[proposalId]` explains every state from persisted evidence alone: the current revision, the review attempts and their findings, the verification runs, and the delivery history, each with signed artifact links where applicable. It never reconstructs state from a cached/derived field — every claim in the response traces back to a row in one of the five durable tables.
