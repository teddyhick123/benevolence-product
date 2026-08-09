# Organization-Controlled AI Runtime — Phase 0 Neutral Execution Boundary

**Date:** 2026-08-08
**Status:** In progress
**Branch:** `codex/org-ai-runtime-phase0`
**Design:** [Organization-Controlled AI Runtime](../specs/2026-08-08-org-model-selection-design.md)
**Prerequisite:** The full refactor and server-page access closeout are merged into local `main`.

## Objective

Introduce one provider-neutral execution boundary for current client-facing AI workloads while preserving today's platform-managed model choices, output shapes, access rules, and durable assistant semantics. Phase 0 creates the code contracts that Phase 1 organization-managed routing will use; it does not add organization credentials, OpenRouter, settings UI, route tables, or model pickers.

## Verified starting point

- `createAIProvider()` exposes a lowest-common-denominator Anthropic message/stream interface and callers supply raw `AI_MODELS` values.
- Assistant chat has durable request-id idempotency, append-only `ai_messages`, transactional `begin_ai_turn`/`complete_ai_turn`/`fail_ai_turn`, and persisted `ai_actions`; those boundaries are authoritative.
- Text generation is shared by extraction, letters, summaries, financial profiles, and onboarding assistance, but it has no workload or organization scope.
- Import AI uses the same provider factory directly. Onboarding owns a separate multi-tool loop. Transcription directly constructs the OpenAI SDK.
- Builder/constructor/scaffold workloads are development infrastructure and deliberately remain outside the organization runtime.
- `ai_usage_log` currently stores only assistant token totals. Phase 1's single canonical AI-routing migration will expand that table and `ai_turns`; Phase 0 must not create an interim schema or patch migration.

## Non-negotiable boundaries

1. Product surfaces request an operation by stable workload id; they do not select a connector or raw model.
2. Provider SDKs, credentials, and provider payloads remain inside server-only connector adapters.
3. Current Anthropic and transcription model defaults remain unchanged.
4. Every post-organization call passes proven organization scope. Pre-organization onboarding and user-only transcription use explicit platform scope rather than an invented tenant.
5. The assistant resolves one execution plan per durable turn and reuses it across every model/tool iteration. Replay never invokes the gateway again.
6. The gateway does not execute or authorize product tools. Existing `AssistantToolCapabilities` remain authoritative.
7. Invocation metadata never contains prompts, responses, tool arguments/results, document contents, or credentials.
8. Phase 0 does not edit `db/migrations` or `lib/database.types.ts`. Its recorder projects the compatible portion of a normalized invocation into the existing usage table; Phase 1 persists the complete record in the planned canonical migration.
9. Builder, constructor, and scaffold workers keep their separate AI provider/model configuration.

## Phase 0 architecture

### Workload registry

Add a code-owned registry with stable workload ids, operation, required capabilities, data class, limits, and platform default deployment. Initial product workloads are:

- `assistant` — streaming/non-streaming tool conversation;
- `extraction` — structured generation from text;
- `import` — structured generation from migration data;
- `onboarding` — non-streaming tool conversation;
- `letters`, `summaries`, and `financial_profile` — text generation;
- `transcription` — platform transcription.

### Operation contracts and execution plan

Add provider-neutral text, structured, tool-conversation, and transcription request/result types. Preserve the current message/tool shapes during Phase 0, while normalizing usage, stop reason, provider request id, model, connector, outcome, and error taxonomy. An immutable execution plan contains the workload, connector, requested model, limits, and non-secret policy snapshot.

Phase 0's resolver always selects the workload's platform default. Its signature already accepts organization and actor scope so Phase 1 can replace only resolution, not every caller.

### Connector adapters

- Adapt the current Anthropic implementation behind text, structured, and tool-conversation ports. Structured generation validates parsed JSON with a caller-supplied validator; JSON Schema transport enforcement remains a Phase 1 connector capability.
- Adapt current OpenAI transcription behind a platform-only transcription connector.
- Keep the legacy provider factory available only for excluded Builder/constructor infrastructure until that tooling receives its own migration.

### Gateway and invocation recorder

The gateway resolves once, validates workload/operation compatibility, applies limits and abort/timeout handling, invokes the connector, normalizes errors and usage, and records one invocation for each provider request in a `finally`-safe path.

The normalized recorder receives complete non-secret invocation metadata. Its Phase 0 database sink writes the compatible assistant/text token subset to `ai_usage_log` only when the current schema can represent the actor; recorder failures are observable but cannot replace a successful model result. Tests use an injected recorder and assert both success and failure records.

## Implementation sequence

### Task 1 — Registry and contracts

1. Add workload ids, operation/capability definitions, platform defaults, and invariant tests.
2. Add scope, execution-plan, request/result, streaming-event, normalized usage, invocation, and error contracts.
3. Add source contracts rejecting raw model/provider selection in client-facing surfaces.

### Task 2 — Connector registry and adapters

1. Implement the Anthropic adapter by translating the neutral contracts to the existing provider implementation.
2. Preserve text/tool response and streaming semantics, including tool input assembly and terminal usage metadata.
3. Implement the platform transcription adapter around the existing OpenAI runtime.
4. Add shared connector contract tests for capability declaration, result normalization, errors, cancellation, and credential isolation.

### Task 3 — Resolver, gateway, and recording

1. Implement the platform-default resolver with immutable execution plans.
2. Implement gateway operation dispatch, capability/operation validation, timeout/abort behavior, normalized errors, and injected recording.
3. Add the Phase 0 `ai_usage_log` projection repository without exposing an elevated client.
4. Test success/failure telemetry, secret/content exclusion, scope propagation, and recorder failure isolation.

### Task 4 — Text, structured, import, and transcription workloads

1. Replace raw-model `generateText` calls with `generateTextForWorkload` and explicit scope.
2. Move extraction/import JSON parsing and validation behind structured workload helpers where behavior can be preserved exactly.
3. Route transcription through the gateway using explicit platform scope.
4. Migrate letters, summaries, financial profiles, document extraction, import AI, and onboarding assistance.

### Task 5 — Durable assistant and onboarding tool conversations

1. Resolve the assistant execution plan only after `begin_ai_turn` starts a new durable turn.
2. Snapshot the Phase 0 plan in application memory for that turn and reuse it for every tool iteration; do not alter the database lifecycle functions in this phase.
3. Remove route-owned assistant usage inserts because the gateway owns invocation recording.
4. Preserve deterministic completed-turn replay and at-most-once tool side effects.
5. Route onboarding's current multi-tool loop through the same gateway with explicit pre/post-organization scope.

### Task 6 — Contracts, documentation, and verification

1. Update agent/docs guidance so client AI work enters through workload helpers/gateway while Builder remains explicitly separate.
2. Expand provider-neutral source tests to forbid client-facing `createAIProvider`, `AI_MODELS`, provider SDKs, and raw model properties.
3. Run focused connector, gateway, workload, assistant durability, onboarding, import, route, and provider-neutral tests.
4. Run hygiene, types, lint, unit, and production build verification.
5. Confirm `db/migrations` and generated database types are unchanged.

## Commit sequence

1. `docs(ai): plan neutral execution phase`
2. `feat(ai): add workload and connector contracts`
3. `feat(ai): centralize platform AI execution`
4. `refactor(ai): route product workloads through gateway`
5. `test(ai): enforce neutral execution boundary`
6. `refactor(ai): complete runtime phase 0`

## Exit criteria

Phase 0 is complete only when:

- all current client-facing AI invocations name a workload and carry explicit available scope;
- product surfaces import no provider SDK, provider factory, model registry, or provider-specific credential;
- the same current platform model is selected for every migrated workload;
- assistant replay, turn lifecycle, message persistence, action persistence, and idempotency tests remain green;
- one plan is reused across all model iterations in a durable assistant turn;
- successful and failed provider calls emit normalized content-free invocation metadata;
- transcription uses the gateway but remains platform-only;
- Builder/constructor/scaffold behavior is unchanged and explicitly excluded;
- no migration or generated database type changes occur; and
- the full verification suite passes with a clean worktree.

## Expected review focus

- Behavior preservation at streaming/tool-call boundaries.
- No hidden model/provider escape hatch in routes, assistants, extraction, or import code.
- Correct organization and actor scope without trusting browser-provided tenant authority.
- Invocation records contain metadata only and cannot leak content or credentials.
- Gateway telemetry does not weaken the durable assistant transaction/idempotency boundary.
- Phase 0 abstractions are sufficient for Phase 1 route resolution without speculative provider branches in product code.
