# Phase 3 — AI Subsystem Split and Durable Turns

**Date:** 2026-08-05  
**Spec:** `docs/agent-work/specs/2026-07-26-full-refactor-design.md`  
**Depends on:** Phase 2 through `5bc6b935`  
**Status:** Implemented

**Verification:** TypeScript clean; lint green at the reduced 467-warning
ceiling; 2,482 unit/contract tests green (6 live tests skipped); production
build green; canonical local migration reset green with 134 public tables.

## Goal

Split the portfolio AI assistant into registered, typed module units while
preserving the Phase 2 access/repository boundary. Replace session-level JSON
read/replace message persistence with durable, idempotent turns shared by the
streaming and non-streaming endpoints.

## Non-negotiable invariants

- Existing URLs and successful response shapes remain supported.
- Routes authorize a user and portfolio before creating AI services.
- The portfolio, organization, user, and principal are fixed at repository
  construction. No route or executor receives an elevated client.
- Elevated writes live only in tenant-scoped `lib/api/repositories/` methods.
- Every registered tool definition has exactly one registered executor and no
  executor exists without a definition.
- `lib/ai/portfolio-assistant.ts` remains the public entry point.
- Builder and onboarding remain separate bounded systems.
- `db/migrations` is the schema canon. Because the database is prerelease, fold
  the durable-turn schema into migration 0033 rather than creating migration
  archaeology.

## Durable-turn decisions

### Canonical tables

Keep `ai_sessions` as session metadata. Replace its `messages` JSON array with:

- `ai_turns`: one row per client request, scoped by session, portfolio, and user;
  stores `request_id`, `status`, the completed response payload, and failure
  metadata.
- `ai_messages`: append-only user/assistant rows, linked to a turn and ordered by
  a generated sequence. One user and one assistant row are allowed per turn.

Existing prerelease `ai_sessions.messages` data does not require a compatibility
shim. History reads come only from `ai_messages` after the canonical migration
is reset.

### Idempotency contract

- The dashboard client generates one UUID per send and includes it as
  `requestId`. The same UUID is retained for transport retries of that send.
- `begin_ai_turn` atomically resolves the active session, inserts the turn, and
  appends the user message.
- A new request returns `started`; a completed duplicate returns the stored API
  result; an in-progress or failed duplicate is terminal for that request ID and
  never invokes the model again.
- `complete_ai_turn` atomically appends the assistant message and stores the
  response used for deterministic replay.
- Route failures call `fail_ai_turn`. A process death can leave a turn in
  progress, but a retry cannot repeat its tool side effects; operational cleanup
  may mark abandoned rows failed later.
- Tool/action execution remains inside the single claimed turn. Since a request
  ID is never reclaimed, a retry cannot execute the tool loop twice.

### Transport contract

- Both POST endpoints use one route-neutral turn service.
- Persisted server history is authoritative; caller-supplied
  `conversationHistory` remains accepted for request compatibility but is not
  used as model context.
- Non-streaming completion is persisted before the success response.
- Streaming completion is persisted before the terminal `meta` event. Partial
  text may already have reached the client; reconnecting with the same request
  ID replays the durable completed result or reports the non-retryable turn
  state without invoking the model.

## Task 1 — Characterization and schema contracts

- Extend chat route/repository tests for authorization-before-persistence,
  tenant-fixed operations, completed replay, in-progress/failed duplicates,
  streaming parity, and failure recording.
- Add migration contract coverage for scopes, uniqueness, RLS, grants, and RPC
  privilege checks.
- Update `db/migrations/README.md` to name the new canonical assistant tables.

## Task 2 — Durable persistence repository

- Fold `ai_turns`, `ai_messages`, and the begin/complete/fail RPCs into 0033.
- Replace `createAiChatRepository.start/finish` with `beginTurn`,
  `completeTurn`, `failTurn`, and normalized `listHistory`.
- Keep usage and widget reads tenant-scoped; move any elevated audit operation
  needed by AI tools behind an existing or new scoped repository method.

## Task 3 — Route and client integration

- Add optional `requestId` validation for backwards-compatible callers; create
  a server UUID only when absent.
- Use persisted history from `beginTurn` for the assistant context.
- Share response shaping between transports so the stored replay payload is the
  same payload the client receives.
- Generate and send stable request IDs in `AIAssistantPanel`.

## Task 4 — Tool definition registry

- Split definitions into module-owned files under
  `lib/ai/assistant/tool-definitions/`.
- Compose the public tool list through one registry derived from module IDs.
- Keep a short compatibility barrel at `tool-definitions.ts` while internal
  consumers move to the registry.

## Task 5 — Executor registry

- Introduce typed assistant scope, arguments, and executor contracts.
- Split the monolithic switch into core, custom-fields, impact, reporting,
  external-data, tax, analytics, grants, donors, and compliance units. Large
  modules may use private submodules while exporting one module registration.
- Make `executor.ts` a small lookup/authorization dispatcher.
- Replace direct grant audit elevation with a repository capability fixed to the
  already-authorized organization and user.

## Task 6 — Type and size ratchets

- Remove `@ts-nocheck` from assistant context, prompts, helpers, dispatcher, and
  portfolio assistant.
- Remove the remaining annotations from `lib/ai-action-executor.ts` and
  `lib/onboarding-assistant.ts` without moving those bounded systems into the
  portfolio assistant architecture.
- Add invariant tests for definition/executor bijection, no `@ts-nocheck` under
  `lib/`, and no TypeScript file under `lib/ai/` above 500 lines.

## Task 7 — Entrypoint cleanup

- Delete `lib/claude-assistant.ts`.
- Remove `ClaudePortfolioAssistant` compatibility exports and replace the legacy
  contract test with provider-neutral registry and schema tests.
- Update stale comments and docs that identify the retired shim as canonical.

## Verification

Run after each implementation slice where practical, then run the complete gate:

1. focused AI/API/migration tests;
2. `npm run verify:types`;
3. `npm run verify:lint` with a reduced warning floor if touched-file cleanup
   lowers it;
4. `npm run verify:unit`;
5. `npm run verify:build`;
6. `npm run verify:migrations` against local Supabase.

## Exit

- Durable-turn and idempotency contracts are green for both transports.
- Tool definitions and executors have an exact one-to-one registration.
- No `@ts-nocheck` remains under `lib/`.
- No TypeScript file under `lib/ai/` exceeds 500 lines.
- The Claude compatibility shim is gone.
- Full TypeScript, lint, unit, build, and canonical migration gates pass.
