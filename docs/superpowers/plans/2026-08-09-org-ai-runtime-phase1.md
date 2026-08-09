# Organization-Controlled AI Runtime — Phase 1 Implementation Plan

**Date:** 2026-08-09
**Status:** In progress
**Branch:** `codex/org-ai-runtime-phase1`
**Design:** [Organization-Controlled AI Runtime](../specs/2026-08-08-org-model-selection-design.md)
**Prerequisite:** Phase 0 and the 2026-08-09 design-review corrections are merged into local `main`.

## Objective

Ship organization-managed OpenRouter connections and workload routing on top of the Phase 0 gateway without weakening tenant access, credential isolation, durable assistant persistence, request-id idempotency, or the schema canon. Organizations with no route continue to use current platform defaults. A configured route never consumes a platform credential unless its snapshotted target list explicitly contains `platform_default`.

## Current provider contract

The implementation targets OpenRouter's documented Chat Completions API and provider-routing object as reviewed on 2026-08-09:

- bearer authentication against the fixed `https://openrouter.ai/api/v1` origin;
- `provider.order`, `only`, `ignore`, `allow_fallbacks`, `require_parameters`, `data_collection`, `zdr`, and `max_price` controls;
- streaming usage on the terminal event and generation correlation metadata;
- standard pre-stream HTTP failures and in-stream error payloads after output begins; and
- no transport-level failover after partial streamed output.

Official references:

- <https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request>
- <https://openrouter.ai/docs/guides/routing/provider-selection>
- <https://openrouter.ai/docs/api/reference/streaming>
- <https://openrouter.ai/docs/api/reference/errors-and-debugging>

## Non-negotiable boundaries

1. `db/migrations` remains the schema canon. The product increment uses `0057_org_ai_runtime.sql`; prerelease naming/deletion corrections are folded into owning migrations `0024_settings_ops_hub.sql` and `0034_onboarding.sql`.
2. Product routes request a workload with proven scope. Only the resolver selects a connection, deployment, connector, or raw provider model id.
3. Credentials are encrypted/authenticated at rest, available only through a server-only repository, and never present in plans, logs, browser payloads, audit metadata, errors, or provider-neutral records.
4. Organization route rows are tenant-scoped by composite keys. All mutations use an organization-admin repository capability after `requireOrgAccess(orgId, 'admin')`.
5. Route target replacement is one transaction and produces a nonempty, contiguous list with exactly one primary, no duplicate deployment, and at most one explicit platform default.
6. The complete ordered target chain and policy are immutable in a durable assistant turn snapshot. The selected target pins after the first accepted provider event; later failure calls `fail_ai_turn` and never changes model.
7. Completed-turn replay invokes neither resolver nor provider. `(user_id, request_id)` remains the at-most-once boundary for messages, tools, and actions.
8. Invocation records contain metadata only. Recorder failure is observable but does not replace successful model output.
9. Builder, constructor, and scaffold AI remain outside organization runtime routing.
10. Deployment verification is authoritative per workload in `verified_workloads`; no independently writable aggregate tier exists.

## Task 1 — Canonical schema and database contracts

1. In `0024_settings_ops_hub.sql`, make `org_audit_log.actor_id` nullable with `ON DELETE SET NULL`; add and backfill non-FK `actor_subject_id`; require both on new repository-written events.
2. In `0034_onboarding.sql`, rename the prerelease `onboarding_sessions.organization_id` canon to `org_id` and update all product/tests/type references.
3. Add `0057_org_ai_runtime.sql` with:
   - `org_ai_connections`;
   - service-only `org_ai_credentials`;
   - `org_ai_deployments` with workload-specific verification evidence;
   - `org_ai_routes` and `org_ai_route_targets` with composite tenant FKs, deployment uniqueness, and the partial platform-default uniqueness index;
   - explicit org-admin read/service-write RLS and least-privilege grants;
   - expanded `ai_usage_log` columns, nullable `user_id ... ON DELETE SET NULL`, self/org-admin/app-admin read policies, and service-only writes; and
   - immutable `ai_turns.execution_plan` plus a one-time, authenticated `bind_ai_turn_execution_plan` RPC that does not change lifecycle status.
4. Preserve historical invocation rows with `ON DELETE SET NULL` references to connection/deployment records.
5. Update migration README and add a Phase 1 schema contract covering exact tables, columns, actor deletion behavior, RLS/grants, composite FKs, route uniqueness, usage policies, and snapshot immutability.
6. Reset the clean local database, regenerate `lib/database.types.ts`, and run the Builder schema/type-drift gate.

## Task 2 — Credential and settings foundations

1. Add versioned AES-256-GCM credential encryption with associated tenant/connection data and independent versioned HMAC-SHA-256 fingerprints.
2. Configure active/decryption key rings through server-only environment variables; update `.env.example` without real values.
3. Add Zod schemas for connection configuration, credential payloads, deployments, route policies, OpenRouter provider preferences, and atomic route target lists.
4. Add a tenant-scoped AI settings repository for non-secret reads and admin mutations. It owns route transactions, deployment-reference checks, status transitions, and secret-free audit writes.
5. Add a separate server-only credential repository that owns create/rotate/decrypt/test access and never returns database credential rows outside the execution boundary.
6. Add an invocation repository that writes the complete Phase 1 record, including actor-less platform invocations.
7. Add a code-owned deployment catalog. Catalog claims are workload-specific and may be marked verified only with non-stale evaluation evidence.

## Task 3 — OpenRouter connector

1. Add `openrouter` to the connector registry and implement Chat Completions mapping for current text, structured, tool-conversation, and streaming operations.
2. Restrict the base URL to the fixed approved OpenRouter origin; do not accept arbitrary endpoint URLs in Phase 1.
3. Translate neutral messages/tool definitions/tool results and strict structured-output requests without leaking OpenRouter payload types to product code.
4. Apply only validated, snapshotted provider preferences and set `allow_fallbacks: false` inside each Benevolence route target so fallback across deployments remains gateway-owned and auditable.
5. Parse SSE comments, deltas, tool calls, terminal usage, generation id, resolved model/provider metadata, and in-stream errors.
6. Normalize 401/403/402/408/429/502/503 and provider error payloads into the gateway taxonomy without exposing native messages.
7. Run a shared connector contract suite for text, structure, tools, multi-tool streaming, usage, cancellation, timeout, and error behavior.

## Task 4 — Route resolution, fallback, and persistence

1. Extend `AIExecutionPlan` with a non-secret ordered target snapshot, policy snapshot/hash, connection/deployment ids, model vendor, and resolution source.
2. Make gateway resolution asynchronous while preserving the product call shape `await gateway.resolve(workloadId)` and explicit `AIExecutionScope` construction.
3. Resolve no-row organization workloads to the code-owned platform default; reject configured-but-disabled/invalid routes rather than silently using platform funds.
4. Validate every target against connection/deployment status, workload capabilities, verification evidence, tool-risk policy, and credential availability before execution.
5. Implement fallback only for eligible availability/rate failures before a result or first stream event is accepted. Record every attempted target and pin the first accepted assistant target for all later tool iterations.
6. Persist full invocation metadata for success, failure, abort, timeout, retry, and fallback without content.
7. Bind the resolved assistant snapshot once after a newly started `begin_ai_turn`; replay reads the stored snapshot and does not resolve or invoke again.
8. Preserve append-only `ai_messages`, `ai_actions`, deterministic replay, and existing completion/failure RPC ownership.

## Task 5 — Settings API and experience

1. Add organization-admin settings routes under `app/api/org/[orgId]/ai-settings/**` using shared access guards and repository capabilities.
2. Return only non-secret connection hints/config, derived workload verification state, compatible workloads, route targets, and code-owned registry/catalog projections.
3. Implement create/update/disable/delete connection, rotate credential, create/delete/evaluate deployment, and atomic route replacement.
4. Add strict user+organization+connection rate limiting and single-flight behavior for credential tests; separately limit expensive deployment evaluations.
5. Add `/dashboard/settings/ai`, link it from settings navigation, and provide connection, deployment, and per-workload routing sections with explicit fallback/platform-spend controls.
6. Keep all browser requests in shared `requestJson`/`useApiData` hooks and show credentials only in write-only inputs.
7. Add admin usage summaries through a repository aggregation over `ai_usage_log`; do not expose raw elevated access to UI code.

## Task 6 — Verification and closeout

1. Run focused migration, RLS, repository, crypto, connector, resolver, gateway, assistant durability, API, UI, and provider-neutral source tests.
2. Verify no product surface imports provider SDKs, provider credentials, raw model registry, or connector factories.
3. Run `verify:migrations`, `db:types:check`, hygiene, TypeScript, lint, complete unit suite, and production build.
4. Inspect the final diff for secret-bearing fields, unscoped elevated clients, migration drift, route bypasses, and replay regressions.
5. Update the design/plan completion records, commit in reviewable increments, and merge the verified branch into local `main`.

## Commit sequence

1. `docs(ai): plan organization routing phase`
2. `feat(ai): add organization routing schema`
3. `feat(ai): add credential and settings repositories`
4. `feat(ai): add OpenRouter connector`
5. `feat(ai): resolve organization AI routes`
6. `feat(ai): add organization AI settings`
7. `test(ai): enforce organization routing contracts`
8. `refactor(ai): complete organization routing phase`

## Exit criteria

- A clean organization with no route retains current platform behavior.
- An organization admin can configure, test, rotate, disable, and remove an OpenRouter connection without ever reading the stored credential.
- Supported workloads can route through an explicit compatible deployment and policy.
- Invalid configured routes fail closed and never silently consume platform funds.
- Route target lists and durable-turn snapshots satisfy all reviewed invariants.
- No fallback occurs after client-visible output, an accepted assistant provider event, or tool execution.
- Invocation metadata is complete for user, organization, and actor-less platform work and contains no content or secrets.
- User deletion neither blocks on AI/audit actor links nor deletes configuration/invocation history.
- Usage visibility follows self/org-admin/app-admin boundaries.
- Provider-backed tests/evaluations are rate-limited and audited.
- Builder behavior is unchanged.
- Migrations, generated types, focused contracts, full unit suite, lint, hygiene, and production build pass with a clean worktree.
