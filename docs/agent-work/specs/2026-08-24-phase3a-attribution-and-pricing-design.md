# Phase 3A — Attribution and Pricing

**Status:** Design approved 2026-08-24. Implementation plan not yet written.

**Goal:** Make every model call in the platform attributable to an organization and priced in dollars, so "what did this organization cost us?" has an answer.

**Roadmap context:** `docs/agent-work/plans/2026-08-16-tenant-sovereignty-roadmap.md` § Phase 3, scope items 1, 2 and 5, and findings F6 and F7. Items 3 (caps) and 4 (dashboard) are deferred to Phase 3B — see [Scope](#scope).

---

## The problem

There is exactly one place that writes `ai_usage_log`: `createAIInvocationRecorder()`, wired into `createAIExecutionGateway` at `lib/ai/runtime.ts:61`. Anything not reaching that gateway records nothing.

Builder does not reach it. Four call sites construct a provider directly — `lib/builder/tools.ts:1905`, `lib/builder/scaffold-worker.ts:494` and `:528`, and `app/api/org/[orgId]/builder/chat/route.ts:69` — each through `createAIProvider()`, which resolves to the platform's `ANTHROPIC_API_KEY`. Its planning and review phases run on `AI_MODELS.scaffoldPlan` and `scaffoldReview`, both Opus-tier. None of that spend is attributed to any organization. That is finding F6.

Separately, `reported_cost` is populated only when a provider volunteers it. OpenRouter does; a direct Anthropic call does not. So even the metered paths carry token counts without dollars. The platform currently has usage, not spend.

## Scope

Phase 3's five scope items form two dependent layers. A cap cannot enforce dollars nobody computed, and a dashboard that omits Builder repeats the lie F6 already tells. This spec covers the lower layer.

**In scope:** Builder through the gateway (item 1), the per-model rate table (item 2), and folding `0057`'s `ALTER` block into `0030` (item 5).

**Deferred to Phase 3B:** per-organization spend caps (item 3) and the org-visible usage dashboard (item 4). Both depend on this phase producing real numbers.

## Decisions

| Decision | Choice |
|---|---|
| Where cost is computed | At write time, frozen on the row with the rate version that produced it |
| Unpriced models | Recorded as `unpriced` with null cost, plus a CI guard over every reachable model |
| Where rates live | Typed data in code, not a database table |
| Builder workloads | Four, mirroring the existing `AI_MODELS` entries |
| Builder configurability | Connector and model both env-overridable; not org-routable |
| Builder's path to the gateway | A single boundary module, `lib/builder/ai.ts` |

### Why write-time pricing

A row records what the call cost at the price in effect then, which is what reconciling against a provider invoice requires. Read-time pricing would silently restate history when a rate changed, so yesterday's report would not reproduce. Correcting a wrong rate here means a deliberate backfill over a date range, which is the right amount of friction for restating money.

### Why rates live in code

The coverage guard cannot statically check a database. Rates as typed data are reviewable in a pull request, versioned with the code that used them, and testable at build time. Changing a vendor price becomes a reviewed deploy, which for something that alters every subsequent invoice is correct rather than inconvenient.

---

## Architecture

| File | Responsibility |
|---|---|
| `lib/ai/workloads.ts` | Four `builder_*` workloads; `orgRoutable` on every definition |
| `lib/ai/rates.ts` | Per-model rates, `RATE_VERSION`, `priceFor(model, usage)` |
| `lib/builder/ai.ts` | The only place Builder touches the gateway |
| `lib/api/repositories/ai-invocations.ts` | Recorder prices the row before writing it |
| `lib/ai/resolver.ts` | Short-circuits non-routable workloads to the platform default |
| `db/migrations/0030_ai_usage_log.sql` | Absorbs `0057`'s plain columns; gains the cost columns |
| `db/migrations/0057_org_ai_runtime.sql` | Retains only the four FK column additions |
| `AGENTS.md` / `CLAUDE.md` | Amended carve-out, inside a new marked section |

### Workload routing scope

`AIWorkloadDefinition` gains `orgRoutable: boolean` — true for the nine existing workloads, false for the four Builder ones. Three consumers enforce it:

1. `lib/api/repositories/ai-settings.ts:106` filters `Object.values(AI_WORKLOADS)` so Builder never appears in the routing picker.
2. `aiRouteReplaceSchema` rejects a non-routable workload. The picker is UX; the POST is the boundary.
3. The Phase 2B evaluate route excludes them — evaluating Builder against an organization's deployment is meaningless.

Without the flag, "not org-routable" is a UI convention, and a hand-rolled request would reprice the platform's code generation onto a client's key.

### Builder workloads

Four, preserving today's per-phase model choice, with connector and model both env-overridable so no vendor is baked into a white-label product:

| Workload | Connector env | Model env | Default model |
|---|---|---|---|
| `builder_chat` | `AI_CONNECTOR_BUILDER_CHAT` | `AI_MODEL_ASSISTANT` | `claude-opus-5` |
| `builder_plan` | `AI_CONNECTOR_BUILDER_PLAN` | `AI_MODEL_SCAFFOLD_PLAN` | `claude-opus-5` |
| `builder_build` | `AI_CONNECTOR_BUILDER_BUILD` | `AI_MODEL_SCAFFOLD_BUILD` | `claude-sonnet-5` |
| `builder_review` | `AI_CONNECTOR_BUILDER_REVIEW` | `AI_MODEL_SCAFFOLD_REVIEW` | `claude-opus-5` |

All connector variables default to `anthropic`, so behaviour is unchanged on an instance that sets none of them. The Phase 1 env-template contract test will require all four connector variables in `.env.example`; the four model variables are already documented.

### The Builder boundary

`lib/builder/ai.ts` owns the gateway for Builder and exposes one function per workload — `builderChatStream`, `builderPlan`, `builderBuild`, `builderReview`. Each constructs the execution scope, resolves the workload plan, and delegates. The four call sites lose all provider knowledge.

The auditable form of the claim: `grep -rn 'createAIProvider(' lib app` returns exactly two hits — the factory definition in `lib/ai/factory.ts` and `lib/builder/ai.ts` — and a test asserts that.

`resolveOrganizationAIExecution` returns the platform default immediately when `!workload.orgRoutable`, rather than querying for a route that cannot exist.

---

## Pricing

### The formula

Cached tokens are a **subset** of input tokens, not an addition, and the two connectors disagree about reporting them. OpenRouter nests `cached_tokens` inside `prompt_tokens_details` (OpenAI semantics), so they are already counted in `prompt_tokens`. The Anthropic provider (`lib/ai/providers/anthropic.ts:50`) does not map cache tokens at all, so `cachedInputTokens` is always zero there.

A formula that added cached to input would double-bill every OpenRouter call.

```
billable_input = input_tokens − cached_input_tokens
cost = billable_input      × input_rate
     + cached_input_tokens × cached_rate
     + output_tokens       × output_rate
```

`reasoning_tokens` is likewise a subset of output and is never added separately.

Rates are expressed per million tokens, matching how vendors publish them, and converted at computation time:

```ts
export const RATE_VERSION = '2026-08';   // bumped whenever any rate changes

export const MODEL_RATES: Readonly<Record<string, ModelRate>> = {
  'claude-opus-5':   { inputPerMTok: 5, cachedPerMTok: 0.5, outputPerMTok: 25 },
  'claude-sonnet-5': { inputPerMTok: 3, cachedPerMTok: 0.3, outputPerMTok: 15 },
};
```

`cachedPerMTok` is the cache-read rate, a tenth of input for Anthropic. `RATE_VERSION` is a year-month string bumped on any rate change, and it is stored on every row priced under it so a historical figure can be traced to the table that produced it.

**Known conservative bias:** because the Anthropic provider never reports cache reads, platform-default Anthropic calls receive no cache discount and are priced slightly high. This is a stated limitation, not a defect to discover later. Mapping Anthropic's `cache_read_input_tokens` is a candidate follow-up, out of scope here.

### Cost precedence

Provider-reported cost wins when present — for an organization's own OpenRouter key it is what they were actually charged. The rate table is the fallback. `unpriced` is the honest third state.

| `cost_source` | Meaning |
|---|---|
| `reported` | Provider supplied `reported_cost`; used as-is |
| `computed` | Priced from the rate table at `rate_version` |
| `unpriced` | No rate entry for this model; cost is null |

### Unpriced models

Never guessed and never fatal. An unpriced row is recorded honestly, and a CI guard makes it mean something.

**The guard covers the platform-default model set only** — the four `AI_MODELS` entries and the four Builder env defaults, which today resolve to two distinct models, `claude-opus-5` and `claude-sonnet-5`. A platform-default model shipping without a rate fails CI.

It deliberately does **not** cover `AI_DEPLOYMENT_CATALOG`. Those models run on the organization's own credential, so that spend is their provider bill rather than platform cost, and this phase exists to answer what the platform spent on an organization's behalf. Where the provider reports a figure — OpenRouter does — it is recorded as `reported`. Where it does not, the row is `unpriced`, which is the truthful answer to "what did this cost the platform?": nothing.

Requiring rates for the catalog would also mean asserting list prices for third-party models the repository has no source for, which is how a metering system starts producing confident fiction.

This mirrors the coverage guard in Phase 2B, and for the same reason: a metering system that can silently omit *platform* spend is worse than one that refuses to build.

---

## Migration

### The fold cannot be total

`0057`'s `ALTER TABLE ai_usage_log` block adds four columns carrying foreign keys to tables that do not exist when `0030` runs: `route_id`, `connection_id` and `deployment_id` reference tables `0057` itself creates, and `turn_id` references `ai_turns`, created in `0033`. A naive fold of the whole block into `0030` fails on a fresh reset.

**`0030` absorbs every plain column** — `scope_kind`, `workload_id`, `operation`, `connector`, `model_vendor`, `resolved_model`, `resolved_provider`, `provider_request_id`, `cached_input_tokens`, `reasoning_tokens`, `audio_input_tokens`, `audio_output_tokens`, `reported_cost`, `cost_currency`, `latency_ms`, `status`, `error_code`, `target_position`, `policy_snapshot`, `policy_hash`, `started_at`, `completed_at` — and declares `requested_model` natively, retiring the conditional `RENAME`. It also declares `user_id` nullable from the start, retiring `0057`'s constraint drop and re-add. The three new cost columns land here too.

**`0057` retains only the four FK column additions**, which its own dependency ordering requires.

### New columns

```sql
computed_cost  numeric,
cost_source    text NOT NULL DEFAULT 'unpriced'
                 CHECK (cost_source IN ('reported','computed','unpriced')),
rate_version   text
```

### Verification is destructive

Unlike Phase 2B, this phase **cannot** be verified with `supabase migration up`. Editing a migration that has already been applied means the only proof that `0030` and `0057` still produce the correct end state is a full `supabase db reset`.

The single local Supabase project is `benevolence-walkthrough` (`supabase/config.toml:1`), so that reset destroys whatever that stack currently holds. This is a prerequisite of the phase, not an optional check. It should be scheduled deliberately before implementation begins rather than discovered at the verification step.

---

## Documentation contract

The roadmap brief states that `tests/integration/agent-instructions-contract.test.ts` prevents the `CLAUDE.md` and `AGENTS.md` copies diverging. **That is only true of two marked sections** — `schema-change-protocol` (AGENTS.md:13–32) and `client-data-protocol` (221–231). The AI-execution carve-out lives at AGENTS.md:353 and CLAUDE.md:377, outside both. Nothing prevents those copies drifting today.

This phase wraps that section in a third marker pair, `ai-execution-protocol`, and extends the contract test to cover it — turning an assumed guarantee into a real one, in the phase that changes the text.

The amended carve-out states that Builder executes through the gateway on `builder_*` workloads, that `lib/builder/ai.ts` is the sole boundary, and that those workloads are platform-only. It also stops naming "constructor" as retaining provider configuration: `app/api/constructor/chat/route.ts` does not call `createAIProvider`, so the current text claims an exception nothing uses.

---

## Error handling

Builder currently throws raw provider SDK errors into its SSE stream. Through the gateway it receives typed `AIExecutionError` codes, which the chat route maps to its existing error events.

The consequence that matters: a failed Builder call now writes an `ai_usage_log` row with `status: 'failed'`. Failed spend is still spend, and today none of it is recorded.

---

## Testing

- **Rate coverage guard** — every platform-default model has a rate; fails CI otherwise. Catalog models are deliberately excluded, per [Unpriced models](#unpriced-models).
- **Pricing arithmetic** — cached tokens discount rather than double-bill; reasoning tokens are not added twice; `reported` beats `computed`; an unknown model yields `unpriced` with null cost.
- **No-bypass guard** — `createAIProvider` appears only in `lib/ai/factory.ts` and `lib/builder/ai.ts`.
- **Routing boundary** — `builder_*` absent from the settings payload, rejected by `aiRouteReplaceSchema`, rejected by the Phase 2B evaluate route.
- **Documentation contract** — the new `ai-execution-protocol` section matches across both files.
- **Migration** — `verify:migrations` from a clean reset, mandatory here rather than optional.

Builder's four call sites are covered by asserting they delegate to `lib/builder/ai.ts`, with the boundary module itself tested against an injected gateway.

---

## Out of scope

- Per-organization spend caps and the usage dashboard — Phase 3B
- Mapping Anthropic `cache_read_input_tokens`, which would remove the conservative pricing bias
- Multi-currency rates; `cost_currency` stays `USD`
- Backfilling cost onto existing `ai_usage_log` rows. Historical rows keep `cost_source: 'unpriced'`; pricing begins at deployment
- Routing Builder workloads to an organization's own model
