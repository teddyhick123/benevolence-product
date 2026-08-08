# Org-Selectable AI Models — Design

**Date:** 2026-08-08
**Status:** Approved design, pending implementation plan

## Purpose

Let each organization choose which AI model powers its client-facing AI surfaces, from a broad curated menu (frontier and open-weight models), with the org controlling its own AI spend. Drivers: cost control, capability preference, and product differentiation. Explicitly **not** a driver: provider mandates / data-governance routing (no Azure/Bedrock/VPC endpoints, no org-hosted custom endpoints).

## Decision Summary

- **Transport:** OpenRouter as a second provider behind the existing `AIProvider` abstraction. One integration (OpenAI-compatible API) reaches every frontier and open-weight model. No self-hosted gateway, no per-provider native SDKs beyond the existing Anthropic implementation.
- **Selection interface:** a Benevolence-owned **curated catalog** (code-owned allowlist with capability metadata), not OpenRouter's raw model list. OpenRouter is transport; the catalog is product.
- **Billing:** org brings its own OpenRouter API key (BYOK). Spend limits, prepaid credits, and usage dashboards are OpenRouter features the org uses directly; Benevolence builds no metering or rebilling.
- **Default:** orgs with nothing configured get today's exact behavior — platform Anthropic key, platform default models from `lib/ai/models.ts`.

## Scope

**In scope — all client-facing AI surfaces honor the org's choice:**
assistant chat, document extraction, import mapping, onboarding assist, letter generation, portfolio summaries. All already consume the neutral `AIProvider` interface (enforced by `lib/ai/__tests__/provider-neutral-surfaces.test.ts`), so each swaps its `createAIProvider()` + `AI_MODELS.*` pair for one resolver call.

**Out of scope (explicit non-goals):**

- **Builder/constructor** (`app/api/constructor/chat/route.ts`): built on `@anthropic-ai/claude-agent-sdk`, a full agent harness. This is Benevolence development tooling, not part of a client org's AI experience. Remains Anthropic.
- **Transcription** (`lib/ai/transcription.ts`): different modality; stays env-configured (`TRANSCRIPTION_MODEL`).
- **Org-hosted or Benevolence-hosted model endpoints:** open-weight models are offered only via OpenRouter's hosted providers.
- **Per-conversation end-user model pickers:** selection is org-admin level.

## Architecture

```
AI request (task, orgId)
  → resolveOrgAI(orgId, task)
      ├─ org configured model for task + valid OpenRouter key
      │     → OpenRouterProvider(org key), resolved model
      └─ otherwise
            → AnthropicProvider(platform key), AI_MODELS default
  → existing neutral request/executor flow (unchanged)
```

### Components

**1. `OpenRouterProvider` (`lib/ai/providers/openrouter.ts`)**
Implements the existing `AIProvider` interface (`createMessage`, `createStream`). Translates neutral `AIMessage`/`ToolDefinition` shapes to OpenAI-style chat completions (`tools`/`tool_calls`, `role: "tool"` results) and back, including streaming deltas and multi-tool turns. Constructed with an explicit API key (the org's decrypted key). `createAIProvider` in `lib/ai/factory.ts` grows an `'openrouter'` case that requires a key parameter.

**2. Task-aware resolver (`lib/ai/resolve.ts`)**
`resolveOrgAI(orgId, task)` where `task ∈ 'assistant' | 'extraction' | 'import' | 'onboarding' | 'letters' | 'summaries'`. Resolution order:

1. `organizations.ai_config.task_models[task]` if set
2. `organizations.ai_config.default_model` if set
3. Platform default (`AI_MODELS`) via `AnthropicProvider` — the only path that uses the platform key

A resolved org model requires the org's OpenRouter credential; the resolver decrypts it server-side and returns a ready provider instance plus model id. Resolution results may be cached per-request only; no long-lived key material in memory.

**No silent fallback:** if an org has selected a model but its key fails at runtime (revoked, out of credits), the surface returns an actionable error ("Your organization's AI key was declined — an admin can fix this in Settings → AI"). It must not silently fall back to the platform key.

**3. Model catalog (`lib/ai/catalog.ts`)**
Code-owned allowlist. Entry shape:

```typescript
interface CatalogModel {
  id: string;                  // OpenRouter slug, e.g. 'anthropic/claude-sonnet-4-6', 'deepseek/deepseek-v3'
  displayName: string;
  vendor: string;              // grouping label for UI
  openWeight: boolean;
  contextWindow: number;
  tier: 'verified' | 'experimental';
  capabilities: {
    tools: boolean;            // reliable structured tool calling
    vision: boolean;           // document/image input
    jsonReliable: boolean;     // dependable strict-JSON output
  };
  notes?: string;              // short admin-facing guidance
}
```

Per-task requirements are declared alongside the catalog (data, not code branches):

| Task | Requires |
|---|---|
| assistant | `tools` |
| extraction | `vision`, `jsonReliable` |
| import | `jsonReliable` |
| onboarding | `tools` |
| letters | — |
| summaries | — |

Rules:

- The settings UI offers a model for a task only if it satisfies that task's requirements. A model can be verified for chat yet unavailable for extraction.
- **Verified** = passed the per-surface smoke evals (below). **Experimental** = listed with a warning the org admin must acknowledge before selecting; mutation tools remain available (undo/redo is the safety net).
- Adding a model later = one catalog entry + one smoke-eval run. This is the extensibility mechanism; it is deliberately boring.

**4. Smoke-eval harness (`npm run ai:smoke -- --model <id>`)**
Scenario suites per task, run manually against a live key (not in CI):

- assistant: read a portfolio, create + undo a holding, multi-tool query — asserts correct tool-call structure and argument fidelity
- extraction: fixture document through the real extractor — asserts schema-valid output
- import: fixture mapping — asserts schema-valid output

Reports per-task pass/fail; results populate the capability flags and tier for the catalog entry.

## Data Model

Follows the Schema Change Decision Protocol. Two pieces with different sensitivity:

**Model selection — `organizations.ai_config` JSONB** (sanctioned extension point, `modules` precedent). Zod-validated shape:

```typescript
{
  default_model?: string;                    // catalog id
  task_models?: Partial<Record<AITask, string>>;
}
```

Readable by org members via existing org RLS — model names are not sensitive. Writes validated against the catalog server-side (unknown ids rejected). Per protocol step 3 this is a genuine product increment introducing a new canonical concept, so the `ai_config` column addition ships in the same new numbered migration as `org_ai_credentials` (not folded into the `organizations` owning migration).

**API key — new table `org_ai_credentials`** (genuine product increment, new numbered migration):

```sql
id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
provider      TEXT NOT NULL DEFAULT 'openrouter' CHECK (provider = 'openrouter'),
encrypted_key TEXT NOT NULL,      -- AES-256-GCM ciphertext (iv + tag + data)
key_last4     TEXT NOT NULL,
created_by    UUID NOT NULL,
created_at / updated_at TIMESTAMPTZ,
UNIQUE (org_id, provider)
```

- **RLS posture: no `authenticated` policies at all.** Service-role-only. Admin reads/writes go through API routes that check `is_org_admin` via the session client, then use the service client; responses expose only `key_last4` and metadata. The raw key never reaches the browser after entry.
- Encryption key: `AI_CREDENTIALS_ENCRYPTION_KEY` server env secret. Decryption happens only inside the resolver and the test-connection route.
- Migration is followed by `npm run db:types:generate` (committed) and `npm run verify:migrations` with behavioral assertions for the RLS posture (authenticated role cannot select), grants, and the uniqueness constraint.

**Usage logging:** `ai_usage_log` already records `model` per call; add a `provider` dimension (`'anthropic' | 'openrouter'`) so platform vs BYOK usage is distinguishable in analytics. Billing truth lives at OpenRouter; this is analytics only.

## Settings UI + API

**Page:** `/dashboard/settings/ai`, admin-gated.

- Model picker grouped by vendor; Verified/Experimental badges; open-weight filter; per-task availability driven by catalog capability flags. Advanced section for per-task overrides; the primary control is the single org default.
- Experimental selection requires an explicit acknowledgment step.
- Write-only key field; existing key shown as `••••` + last4. "Test connection" button. Link out to OpenRouter's dashboard for spend limits/usage — the cost-control story is operated by OpenRouter, not rebuilt.

**API routes** (all writes require `is_org_admin`; module-gated under `ai_assistant`):

- `GET /api/org/[orgId]/ai-settings` — current config + key metadata (last4 only) + catalog
- `PUT /api/org/[orgId]/ai-settings` — validates models against catalog and task requirements
- `POST /api/org/[orgId]/ai-settings/key` — set/replace key (encrypt, store, return last4)
- `DELETE /api/org/[orgId]/ai-settings/key` — remove key; org reverts to platform default
- `POST /api/org/[orgId]/ai-settings/test` — cheap live call through the stored key; maps OpenRouter errors

**Client transport (per Client Data Transport Canon):** the settings page uses a domain hook (`lib/ai/hooks.ts` or equivalent under the owning domain) backed by `lib/api/client-hooks.ts`; mutations via `requestJson`. No component-local SWR fetchers or raw `fetch`. Assistant streaming continues through `requestStream` with the durable turn lifecycle untouched.

## Error Handling

| Condition | Behavior |
|---|---|
| OpenRouter 401 | "API key invalid or revoked" → admin-actionable message |
| OpenRouter 402 | "Out of OpenRouter credits" → admin-actionable message |
| Model unavailable/down | Named-model unavailable message; suggest retry or switching models |
| Key decryption failure | Treated as missing key: explicit error, never platform-key fallback |
| Org model set but key missing | Same explicit error path |
| Stream abort/timeout | Existing turn-lifecycle failure path (`fail_ai_turn`) unchanged |

## Testing

- **OpenRouterProvider contract tests:** mocked fetch; request mapping (system, messages, tools), response mapping (text, tool_calls, finish reasons), streaming including multi-tool turns and usage extraction.
- **Resolver tests:** full fallback chain; task override precedence; no-silent-fallback on key failure; decryption failure path.
- **Settings API tests:** member vs admin vs cross-org access; key never returned; catalog validation on PUT; task-requirement enforcement.
- **Catalog invariant tests:** unique ids; every entry offered for a task satisfies that task's requirements; every `verified` entry has recorded eval coverage.
- **Migration assertions** in `verify:migrations`: `org_ai_credentials` RLS (authenticated cannot read), grants, uniqueness.
- **Crypto round-trip tests** for the AES-256-GCM helper.
- **Provider-neutral surfaces test** extended to keep new resolver-consuming files SDK-free.
- Smoke evals stay manual (live keys), outside CI.

## Rollout Notes

- Ship dark: with no org config present, behavior is byte-for-byte today's. The settings page is the only activation surface.
- Seed catalog: current Claude tiers (verified by definition of current usage) + a small set of cross-vendor and open-weight models that pass smoke evals; grow from there.
