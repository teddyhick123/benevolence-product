# Phase 2A — Bring Your Own Connectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An org admin can add a direct Anthropic key, a direct OpenAI key, or an OpenRouter key, and every one of them drives the assistant using that org's own credential — never the platform's.

**Architecture:** Connector identity becomes a real per-provider contract rather than an OpenRouter special case. The connection schema turns into a discriminated union with per-provider credential, config, and endpoint rules. The gateway stops deciding "whose key is this?" from the connector name and decides it from whether the plan targets an org deployment. The OpenAI-compatible chat-completions transport shared by OpenRouter and OpenAI is extracted once and configured twice.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Zod, Supabase (Postgres + RLS), Vitest, `@anthropic-ai/sdk`.

**Spec:** `docs/agent-work/plans/2026-08-16-tenant-sovereignty-roadmap.md` § Phase 2, scope items 1 and 3, and finding F4. Scope item 2 (the real evaluation suite, F5) is deliberately **not** in this plan — see [Explicitly out of scope](#explicitly-out-of-scope).

## Global Constraints

Every task's requirements implicitly include these. Drawn from `CLAUDE.md` / `AGENTS.md` and from the roadmap's global constraints.

- Product AI execution enters through `lib/ai/runtime.ts` or an injected `AIExecutionGateway` with a stable workload from `lib/ai/workloads.ts`. Product code must not import `createAIProvider`, `AI_MODELS`, or provider SDKs.
- Product code reaches data only through `lib/database-client.ts` and repository modules under `lib/api/repositories/`. No feature-local Supabase clients, no structural casts.
- Org-scoped mutations live under `app/api/org/[orgId]/**`, use shared access guards, and return `jsonOk` / `jsonError`.
- Browser data access goes through `lib/api/client.ts` and `lib/<domain>/hooks.ts`. Components never call raw `fetch` for domain data.
- Client-supplied org identifiers are routing inputs, never authority.
- Durable AI turn semantics (`begin_ai_turn` / `complete_ai_turn` / `fail_ai_turn`, `ai_turns` request-ID idempotency, append-only `ai_messages`) must not be weakened.
- `temperature` was removed from `AIRequestConfig` and `AIGenerationRequest` in Phase 1 because it is rejected with a 400 on Claude Opus 5 and Sonnet 5. Do not reintroduce it in any connector.
- Model ID strings are exact and complete. Never append a date suffix.
- Verification gate for every task: `npm run verify:types`, `npm run verify:lint`, `npm run verify:unit`. Add `npm run verify:build` when `app/` or `components/` changes.

### No migration is required in this plan

Checked before planning, per the Schema Change Decision Protocol. `db/migrations/0057_org_ai_runtime.sql:14` declares:

```sql
connector        text NOT NULL CHECK (btrim(connector) <> ''),
```

There is no enum and no allow-list constraint on `org_ai_connections.connector`, so storing `'anthropic'` or `'openai'` needs no DDL. **Do not add a migration for this plan.** If you believe you need one, stop and re-read the protocol — you are probably about to add a constraint that does not exist today.

---

## The hazard this plan is sequenced around

Read this before touching anything.

`lib/ai/runtime.ts:14` currently decides whose API key to use by inspecting the **connector name**:

```ts
if (plan.connector !== 'openrouter') return createAIConnector(plan.connector);
```

`createAIConnector('anthropic')` with no context returns `new AnthropicConnector()`, which builds `new AnthropicProvider()`, which reads `process.env.ANTHROPIC_API_KEY` — the **platform's** key.

Today that branch is unreachable for org deployments, because `lib/ai/resolver.ts:159` throws on any connection whose connector is not `openrouter`:

```ts
if (connection.connector !== 'openrouter' || !deployment.catalog_template_id) {
  throw new AIExecutionError('policy_unsatisfied', 'Organization AI deployment is unsupported');
}
```

The Phase 2 brief tells you to remove that resolver guard. **Removing it before fixing the gateway silently routes a client's Anthropic traffic onto the platform's key** — no error, no log line, correct-looking responses, and the cost lands on the wrong invoice. It would also mean a client who believes they are running on their own credential is not.

Task 2 fixes the gateway. Task 6 removes the guard. That order is not negotiable, and Task 2 ships a regression test on the invariant so a later refactor cannot quietly restore the hole.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `lib/ai/workloads.ts` | `AIConnectorId` gains `'openai'` | 1 |
| `lib/schemas/ai-settings.ts` | Per-connector connection schemas as a discriminated union; connector/config compatibility helper | 1 |
| `lib/ai/runtime.ts` | Gateway decides credential source from `plan.connectionId`, not connector name | 2 |
| `lib/ai/connectors/registry.ts` | Per-connector factory context carrying an org API key | 2, 3, 5 |
| `lib/ai/connectors/anthropic.ts` | Unchanged class; constructed with a credentialled provider by the registry | 3 |
| `lib/ai/connectors/openai-compatible.ts` | **New.** The chat-completions transport and message/tool translation shared by OpenRouter and OpenAI | 4 |
| `lib/ai/connectors/openrouter.ts` | Thin configuration over the shared core, keeping OpenRouter's `provider` preferences block | 4 |
| `lib/ai/connectors/openai.ts` | **New.** Thin configuration over the shared core against `api.openai.com` | 5 |
| `lib/ai/resolver.ts` | Connector-aware target construction; OpenRouter-only guard removed | 7 |
| `lib/ai/catalog.ts` | Direct-provider deployment templates | 6 |
| `app/api/org/[orgId]/ai-settings/connections/route.ts` | Connector/config compatibility enforcement on update | 1 |
| `app/api/org/[orgId]/ai-settings/deployments/[deploymentId]/evaluate/route.ts` | Compatibility check runs for any connector | 8 |
| `components/settings/AIModelsSettings.tsx` | Provider picker and per-provider credential help | 9 |

---

## Explicitly out of scope

**The real evaluation suite (roadmap scope item 2, finding F5) is not in this plan.** The evaluate endpoint keeps emitting `result: 'conditional'` throughout. Task 8 only stops it rejecting non-OpenRouter connectors; it does not make the check meaningful.

That work — per-workload behavioural evals for tool-call correctness, JSON-mode adherence, streaming, and refusal handling, versioned so the 90-day expiry in `currentVerificationResult` means something — needs a design pass before it needs a plan. Run superpowers:brainstorming on it and give it its own document.

Consequence for this plan's exit criteria: after Phase 2A, an admin bringing any of the three providers still grants write access through the Phase 1 opt-in checkbox. Turning that checkbox into the fallback path rather than the default path is Phase 2B's job.

---

# Task 1: Split the connection schema per provider

**Why:** `aiConnectionCreateSchema.connector` is `z.literal('openrouter')` (`lib/schemas/ai-settings.ts:49`), so the API cannot accept any other provider. Each provider also has a different endpoint and a different notion of valid config — OpenRouter's `provider` routing preferences are meaningless to a direct Anthropic key, and silently accepting them would be a lie about what the platform will do with them.

**Files:**
- Modify: `lib/ai/workloads.ts:28`
- Modify: `lib/schemas/ai-settings.ts:44-62`
- Modify: `app/api/org/[orgId]/ai-settings/connections/[connectionId]/route.ts` (update handler)
- Test: `lib/schemas/__tests__/ai-settings-connectors.test.ts` (create)

**Interfaces:**
- Consumes: `openRouterCredentialSchema`, `openRouterProviderPreferencesSchema`, `openRouterConnectionConfigSchema` — all already exported from `lib/schemas/ai-settings.ts`.
- Produces:
  - `AIConnectorId` becomes `'anthropic' | 'openai' | 'openrouter' | 'transcription_platform'`.
  - `directProviderCredentialSchema` — `{ apiKey: string }`, same validation as the OpenRouter one.
  - `aiConnectionCreateSchema` — a `z.discriminatedUnion('connector', [...])`. `z.infer` gains `connector: 'openrouter' | 'anthropic' | 'openai'`.
  - `assertConnectionConfigMatchesConnector(connector: string, config: unknown): void` — throws `Error` with a human-readable message when config keys do not belong to that connector.

- [x] **Step 1: Write the failing test**

Create `lib/schemas/__tests__/ai-settings-connectors.test.ts`:

```ts
// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  aiConnectionCreateSchema,
  assertConnectionConfigMatchesConnector,
} from '@/lib/schemas/ai-settings';

const API_KEY = 'sk-test-0123456789abcdef';

describe('AI connection create schema', () => {
  it('accepts an OpenRouter connection with routing preferences', () => {
    const parsed = aiConnectionCreateSchema.parse({
      connector: 'openrouter',
      name: 'Ford OpenRouter',
      config: { provider: { order: ['anthropic'] } },
      credential: { apiKey: API_KEY },
    });
    expect(parsed.connector).toBe('openrouter');
  });

  it('accepts a direct Anthropic connection', () => {
    const parsed = aiConnectionCreateSchema.parse({
      connector: 'anthropic',
      name: 'Ford Anthropic',
      credential: { apiKey: API_KEY },
    });
    expect(parsed.connector).toBe('anthropic');
  });

  it('accepts a direct OpenAI connection', () => {
    const parsed = aiConnectionCreateSchema.parse({
      connector: 'openai',
      name: 'Ford OpenAI',
      credential: { apiKey: API_KEY },
    });
    expect(parsed.connector).toBe('openai');
  });

  it('rejects OpenRouter routing preferences on a direct provider', () => {
    const result = aiConnectionCreateSchema.safeParse({
      connector: 'anthropic',
      name: 'Ford Anthropic',
      config: { provider: { order: ['anthropic'] } },
      credential: { apiKey: API_KEY },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an endpoint belonging to a different provider', () => {
    const result = aiConnectionCreateSchema.safeParse({
      connector: 'anthropic',
      name: 'Ford Anthropic',
      endpointUrl: 'https://openrouter.ai/api/v1',
      credential: { apiKey: API_KEY },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown connector', () => {
    const result = aiConnectionCreateSchema.safeParse({
      connector: 'bedrock',
      name: 'Nope',
      credential: { apiKey: API_KEY },
    });
    expect(result.success).toBe(false);
  });
});

describe('assertConnectionConfigMatchesConnector', () => {
  it('allows provider preferences on openrouter', () => {
    expect(() => assertConnectionConfigMatchesConnector(
      'openrouter',
      { provider: { order: ['anthropic'] } },
    )).not.toThrow();
  });

  it('allows an empty config on any connector', () => {
    expect(() => assertConnectionConfigMatchesConnector('anthropic', {})).not.toThrow();
    expect(() => assertConnectionConfigMatchesConnector('openai', {})).not.toThrow();
  });

  it('rejects provider preferences on a direct provider', () => {
    expect(() => assertConnectionConfigMatchesConnector(
      'anthropic',
      { provider: { order: ['anthropic'] } },
    )).toThrow(/routing preferences/i);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/schemas/__tests__/ai-settings-connectors.test.ts`

Expected: FAIL. The Anthropic and OpenAI cases fail because `connector` is `z.literal('openrouter')`, and the `assertConnectionConfigMatchesConnector` block fails to import.

- [x] **Step 3: Add `openai` to the connector identity**

In `lib/ai/workloads.ts`, replace line 28:

```ts
export type AIConnectorId = 'anthropic' | 'openai' | 'openrouter' | 'transcription_platform';
```

- [x] **Step 4: Add the direct-provider credential and config schemas**

In `lib/schemas/ai-settings.ts`, immediately after `openRouterCredentialSchema`:

```ts
/**
 * Direct provider keys carry no routing metadata — the credential is the whole
 * configuration. Validation matches openRouterCredentialSchema so a pasted key
 * fails the same way regardless of which provider it belongs to.
 */
export const directProviderCredentialSchema = z.object({
  apiKey: z.string().trim().min(16).max(512).refine(
    value => !/\s/.test(value),
    'API key must not contain whitespace',
  ),
}).strict();

export const emptyConnectionConfigSchema = z.object({}).strict();
```

- [x] **Step 5: Replace the create schema with a discriminated union**

In `lib/schemas/ai-settings.ts`, replace the whole `aiConnectionCreateSchema` declaration (currently lines 46-54) with:

```ts
const connectionNameSchema = z.string().trim().min(1).max(100);
const connectionRegionSchema = z.string().trim().min(1).max(100).nullable().optional();

const openRouterConnectionCreateSchema = z.object({
  connector: z.literal('openrouter'),
  name: connectionNameSchema,
  endpointUrl: z.literal('https://openrouter.ai/api/v1').optional(),
  region: connectionRegionSchema,
  config: openRouterConnectionConfigSchema.optional().default({}),
  credential: openRouterCredentialSchema,
}).strict();

const anthropicConnectionCreateSchema = z.object({
  connector: z.literal('anthropic'),
  name: connectionNameSchema,
  endpointUrl: z.literal('https://api.anthropic.com').optional(),
  region: connectionRegionSchema,
  config: emptyConnectionConfigSchema.optional().default({}),
  credential: directProviderCredentialSchema,
}).strict();

const openAIConnectionCreateSchema = z.object({
  connector: z.literal('openai'),
  name: connectionNameSchema,
  endpointUrl: z.literal('https://api.openai.com/v1').optional(),
  region: connectionRegionSchema,
  config: emptyConnectionConfigSchema.optional().default({}),
  credential: directProviderCredentialSchema,
}).strict();

export const aiConnectionCreateSchema = z.discriminatedUnion('connector', [
  openRouterConnectionCreateSchema,
  anthropicConnectionCreateSchema,
  openAIConnectionCreateSchema,
]);
```

- [x] **Step 6: Add the connector/config compatibility helper**

The update path (`aiConnectionUpdateSchema`) does not carry a connector — the connector is immutable and lives on the stored row — so the union cannot enforce compatibility there. Add this exported helper to `lib/schemas/ai-settings.ts`, after `aiConnectionUpdateSchema`:

```ts
/**
 * The update payload has no connector discriminant, so config compatibility is
 * checked against the stored connection's connector by the update route.
 */
export function assertConnectionConfigMatchesConnector(
  connector: string,
  config: unknown,
): void {
  if (connector === 'openrouter') return;
  if (!config || typeof config !== 'object') return;
  if ('provider' in (config as Record<string, unknown>)) {
    throw new Error(
      `Provider routing preferences are only supported on OpenRouter connections, not ${connector}`,
    );
  }
}
```

- [x] **Step 7: Enforce compatibility where the update is actually validated**

The PATCH handler at `app/api/org/[orgId]/ai-settings/connections/[connectionId]/route.ts:19` forwards the raw body straight to the repository — the Zod parse lives in `updateConnection` (`lib/api/repositories/ai-settings.ts:135-136`), not the route. **Do not add validation to the route**; that would split the update contract across two files.

In `lib/api/repositories/ai-settings.ts`, add the import:

```ts
import { aiConnectionUpdateSchema, assertConnectionConfigMatchesConnector } from '@/lib/schemas/ai-settings';
```

Then, in `updateConnection`, insert a connector read between the parse and the values object (lines 136-137):

```ts
      const input = aiConnectionUpdateSchema.parse(rawInput);
      if (input.config !== undefined) {
        const { data: existing, error: readError } = await db.from('org_ai_connections')
          .select('connector')
          .eq('id', connectionId)
          .eq('org_id', scope.orgId)
          .maybeSingle();
        if (readError) throw readError;
        if (!existing) throw new Error('AI connection not found');
        assertConnectionConfigMatchesConnector(existing.connector, input.config);
      }
```

The read is skipped entirely when the payload carries no `config`, so the common rename-and-toggle updates cost no extra round trip. Both queries stay scoped by `org_id` through the existing repository client — do not introduce a new Supabase client.

- [x] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run lib/schemas/__tests__/ai-settings-connectors.test.ts`
Expected: PASS (9 tests)

- [x] **Step 9: Run the surrounding contract suites**

Run: `npx vitest run lib/ai tests/integration/org-ai-settings-boundary.test.ts`
Expected: PASS. If the boundary suite fails, it is asserting the old single-literal connector shape — update those assertions to the union rather than reverting the schema.

- [x] **Step 10: Commit**

```bash
git add lib/ai/workloads.ts lib/schemas/ai-settings.ts lib/api/repositories/ai-settings.ts lib/schemas/__tests__/ai-settings-connectors.test.ts
git commit -m "feat(ai-settings): accept direct Anthropic and OpenAI connections"
```

---

# Task 2: Decide the credential source from the deployment, not the connector name

**Why:** The hazard described above. `lib/ai/runtime.ts:14` uses the connector name to decide whether to load an org credential, so any non-OpenRouter org connection would fall through to the platform key. This must land before the resolver guard is removed in Task 6.

**Files:**
- Modify: `lib/ai/runtime.ts:12-38`
- Modify: `lib/ai/connectors/registry.ts`
- Test: `lib/ai/__tests__/runtime-credential-source.test.ts` (create)

**Interfaces:**
- Consumes: `createAICredentialRepository` from `lib/api/repositories/ai-credentials` — `withCredential<T>(connectionId, fn: (credential: { apiKey: string }) => T)`. `AIExecutionPlan` from `lib/ai/execution` — carries optional `connectionId`, `connector`, `providerPreferences`.
- Produces: `AIConnectorFactoryContext` gains `anthropic?: { apiKey: string }` and `openai?: { apiKey: string }` alongside the existing `openrouter?: OpenRouterConnectorOptions`. The invariant every later task depends on: **a bare `createAIConnector(id)` with no context is reached only when `plan.connectionId` is undefined.**

- [x] **Step 1: Write the failing test**

Create `lib/ai/__tests__/runtime-credential-source.test.ts`:

```ts
// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAIConnector, withCredential, createAICredentialRepository } = vi.hoisted(() => {
  const withCredential = vi.fn();
  return {
    createAIConnector: vi.fn(() => ({ id: 'stub' })),
    withCredential,
    createAICredentialRepository: vi.fn(() => ({ withCredential })),
  };
});

vi.mock('@/lib/ai/connectors/registry', () => ({ createAIConnector }));
vi.mock('@/lib/api/repositories/ai-credentials', () => ({ createAICredentialRepository }));
vi.mock('@/lib/api/repositories/ai-invocations', () => ({
  createAIInvocationRecorder: () => ({ record: vi.fn() }),
}));

import { createAIExecutionGateway } from '@/lib/ai/runtime';

const ORG_SCOPE = { kind: 'organization' as const, orgId: 'org-1', actorId: 'user-1' };
const CONNECTION_ID = '00000000-0000-4000-8000-000000000010';

/** Reach the gateway's connector factory without running a full turn. */
function connectorFactory() {
  const gateway = createAIExecutionGateway(ORG_SCOPE) as unknown as {
    options: { connector: (plan: unknown) => Promise<unknown> };
  };
  return gateway.options.connector;
}

beforeEach(() => {
  createAIConnector.mockClear();
  createAICredentialRepository.mockClear();
  withCredential.mockReset();
  withCredential.mockImplementation((_id: string, fn: (c: { apiKey: string }) => unknown) =>
    Promise.resolve(fn({ apiKey: 'org-supplied-key' })));
});

describe('gateway credential source', () => {
  it('loads the org credential for a direct Anthropic deployment', async () => {
    await connectorFactory()({
      connector: 'anthropic',
      connectionId: CONNECTION_ID,
      requestedModel: 'claude-opus-5',
    });

    expect(withCredential).toHaveBeenCalledWith(CONNECTION_ID, expect.any(Function));
    expect(createAIConnector).toHaveBeenCalledWith('anthropic', expect.objectContaining({
      anthropic: { apiKey: 'org-supplied-key' },
    }));
  });

  it('loads the org credential for a direct OpenAI deployment', async () => {
    await connectorFactory()({
      connector: 'openai',
      connectionId: CONNECTION_ID,
      requestedModel: 'gpt-5.6-sol',
    });

    expect(createAIConnector).toHaveBeenCalledWith('openai', expect.objectContaining({
      openai: { apiKey: 'org-supplied-key' },
    }));
  });

  it('still loads the org credential for OpenRouter', async () => {
    await connectorFactory()({
      connector: 'openrouter',
      connectionId: CONNECTION_ID,
      requestedModel: 'anthropic/claude-opus-5',
      providerPreferences: {},
    });

    expect(createAIConnector).toHaveBeenCalledWith('openrouter', expect.objectContaining({
      openrouter: expect.objectContaining({ apiKey: 'org-supplied-key' }),
    }));
  });

  // The regression guard. A platform-key connector must never be constructed
  // for a plan that names an org connection, whatever the connector is called.
  it('never builds an unkeyed connector when the plan names a connection', async () => {
    for (const connector of ['anthropic', 'openai', 'openrouter']) {
      createAIConnector.mockClear();
      await connectorFactory()({ connector, connectionId: CONNECTION_ID, requestedModel: 'm' });

      for (const call of createAIConnector.mock.calls) {
        expect(call[1]).toBeDefined();
      }
    }
  });

  it('uses the platform connector only when no connection is named', async () => {
    await connectorFactory()({ connector: 'anthropic', requestedModel: 'claude-opus-5' });

    expect(withCredential).not.toHaveBeenCalled();
    expect(createAIConnector).toHaveBeenCalledWith('anthropic');
  });
});
```

If `AIExecutionGateway` does not expose its options under `.options`, read `lib/ai/gateway.ts` and address the stored factory by whatever field name the constructor assigns. Do not change the gateway's shape to suit the test.

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/ai/__tests__/runtime-credential-source.test.ts`
Expected: FAIL. The Anthropic and OpenAI cases show `createAIConnector` called with one argument and `withCredential` never called — this is the hazard, reproduced.

- [x] **Step 3: Widen the connector factory context**

In `lib/ai/connectors/registry.ts`, replace the `AIConnectorFactoryContext` type:

```ts
export type DirectProviderConnectorOptions = { apiKey: string };

export type AIConnectorFactoryContext = {
  openrouter?: OpenRouterConnectorOptions;
  anthropic?: DirectProviderConnectorOptions;
  openai?: DirectProviderConnectorOptions;
};
```

- [x] **Step 4: Rewrite the gateway's connector factory**

In `lib/ai/runtime.ts`, replace the `connector` callback (lines 13-37) with:

```ts
    connector: async (plan) => {
      // A plan without a connection is a platform-default target: the platform
      // key is correct there and nowhere else. Every org deployment loads its
      // own credential, whatever provider it names.
      if (!plan.connectionId) return createAIConnector(plan.connector);
      if (scope.kind !== 'organization' || !scope.orgId) {
        throw new AIExecutionError(
          'policy_unsatisfied',
          'Organization AI deployments require an organization scope',
        );
      }
      try {
        return await createAICredentialRepository({
          orgId: scope.orgId,
          actorId: scope.actorId,
        }).withCredential(plan.connectionId, credential => createAIConnector(
          plan.connector,
          connectorContext(plan, credential.apiKey),
        ));
      } catch (error) {
        if (error instanceof AIExecutionError) throw error;
        throw new AIExecutionError(
          'credential_decryption_failed',
          'Organization AI credential could not be loaded',
          { cause: error },
        );
      }
    },
```

- [x] **Step 5: Add the context builder**

Above `createAIExecutionGateway` in `lib/ai/runtime.ts`:

```ts
function connectorContext(
  plan: { connector: string; providerPreferences?: Readonly<Record<string, unknown>> },
  apiKey: string,
): AIConnectorFactoryContext {
  if (plan.connector === 'openrouter') {
    return {
      openrouter: {
        apiKey,
        provider: openRouterProviderPreferencesSchema.parse(plan.providerPreferences ?? {}),
      },
    };
  }
  if (plan.connector === 'anthropic') return { anthropic: { apiKey } };
  if (plan.connector === 'openai') return { openai: { apiKey } };
  throw new AIExecutionError(
    'policy_unsatisfied',
    `Connector ${plan.connector} cannot be used with an organization credential`,
  );
}
```

Add `AIConnectorFactoryContext` to the existing registry import in that file.

- [x] **Step 6: Run the test to verify it passes**

Run: `npx vitest run lib/ai/__tests__/runtime-credential-source.test.ts`
Expected: PASS (5 tests)

- [x] **Step 7: Run the AI suite for regressions**

Run: `npx vitest run lib/ai tests/integration/org-ai-settings-boundary.test.ts`
Expected: PASS

- [x] **Step 8: Commit**

```bash
git add lib/ai/runtime.ts lib/ai/connectors/registry.ts lib/ai/__tests__/runtime-credential-source.test.ts
git commit -m "fix(ai): source org credentials from the deployment, never the connector name"
```

---

# Task 3: Make the Anthropic connector credential-aware

**Why:** `AnthropicConnector` takes an injected `AIProvider` (`lib/ai/connectors/anthropic.ts:21`) and `AnthropicProvider` already accepts an optional `apiKey` (`lib/ai/providers/anthropic.ts:9`), falling back to `process.env.ANTHROPIC_API_KEY`. Wiring an org key through is a registry change, not a connector rewrite. Task 2 already passes `{ anthropic: { apiKey } }`; the registry currently ignores it.

**Files:**
- Modify: `lib/ai/connectors/registry.ts:17`
- Test: `lib/ai/__tests__/connector-registry.test.ts` (create)

**Interfaces:**
- Consumes: `AIConnectorFactoryContext` from Task 2. `AnthropicProvider` constructor — `new AnthropicProvider(apiKey?: string)`.
- Produces: no new exports. `createAIConnector('anthropic', { anthropic: { apiKey } })` returns a connector bound to that key; `createAIConnector('anthropic')` keeps the platform-key behaviour.

- [x] **Step 1: Write the failing test**

Create `lib/ai/__tests__/connector-registry.test.ts`:

```ts
// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { AnthropicProvider } = vi.hoisted(() => ({ AnthropicProvider: vi.fn() }));

vi.mock('@/lib/ai/providers/anthropic', () => ({ AnthropicProvider }));

import { createAIConnector } from '@/lib/ai/connectors/registry';

beforeEach(() => {
  AnthropicProvider.mockClear();
});

describe('Anthropic connector construction', () => {
  it('binds an organization key when one is supplied', () => {
    createAIConnector('anthropic', { anthropic: { apiKey: 'org-supplied-key' } });

    expect(AnthropicProvider).toHaveBeenCalledWith('org-supplied-key');
  });

  it('falls back to the platform key when no context is supplied', () => {
    createAIConnector('anthropic');

    expect(AnthropicProvider).toHaveBeenCalledWith(undefined);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/ai/__tests__/connector-registry.test.ts`
Expected: FAIL on the first case — `AnthropicProvider` is called with no arguments because the registry ignores the context.

- [x] **Step 3: Wire the key through the registry**

In `lib/ai/connectors/registry.ts`, add the provider import:

```ts
import { AnthropicProvider } from '@/lib/ai/providers/anthropic';
```

Then replace the `anthropic` factory entry:

```ts
  anthropic: (context) => new AnthropicConnector(
    new AnthropicProvider(context?.anthropic?.apiKey),
  ),
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/ai/__tests__/connector-registry.test.ts`
Expected: PASS (2 tests)

- [x] **Step 5: Run the AI suite**

Run: `npx vitest run lib/ai`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add lib/ai/connectors/registry.ts lib/ai/__tests__/connector-registry.test.ts
git commit -m "feat(ai): bind organization credentials to the Anthropic connector"
```

---

# Task 4: Extract the OpenAI-compatible chat-completions core

**Why:** `lib/ai/connectors/openrouter.ts` is 384 lines, of which the message translation, tool translation, stop-reason mapping, usage mapping, error normalisation, and SSE stream parsing are all plain OpenAI chat-completions behaviour. A direct OpenAI connector needs every one of them. Copying the file would leave two 380-line siblings drifting apart. This task moves the shared core out with **no behaviour change**, guarded by the existing OpenRouter suite.

**Files:**
- Create: `lib/ai/connectors/openai-compatible.ts`
- Modify: `lib/ai/connectors/openrouter.ts`
- Test: `lib/ai/__tests__/openrouter-connector.test.ts` (existing — must stay green untouched)

**Interfaces:**
- Consumes: `AIConnector`, `AIExecutionPlan`, `AIGenerationRequest`, `AIToolConversationRequest`, `AIUsage`, `AIExecutionError` from `lib/ai/execution`; `AIContentBlock`, `AIMessage`, `AIResponse`, `AIStreamChunk`, `ToolDefinition` from `lib/ai/types`.
- Produces from `lib/ai/connectors/openai-compatible.ts`:
  - `type OpenAICompatibleConfig = { id: AIConnectorId; origin: string; apiKey: string; fetch?: typeof fetch; headers?: Record<string, string>; bodyExtras?: Record<string, unknown> }`
  - `abstract class OpenAICompatibleConnector implements AIConnector` with `readonly id`, `readonly capabilities = ['text','json','tools','streaming','parallel_tool_results']`, and the concrete `generateText`, `generateStructured`, `streamText`, `runToolConversation`, `streamToolConversation` methods.
  - Named helpers `messages`, `toolDefinitions`, `parseToolInput`, `stopReason`, `normalizedError`, `usage` — exported so both connectors and their tests can reach them.

- [x] **Step 1: Confirm the existing suite is green before moving anything**

Run: `npx vitest run lib/ai/__tests__/openrouter-connector.test.ts`
Expected: PASS. This suite is the safety net for the whole task. If it is red before you start, stop and fix that first — you cannot tell a refactor regression from a pre-existing failure otherwise.

- [x] **Step 2: Create the shared module**

Create `lib/ai/connectors/openai-compatible.ts`. Move these declarations out of `lib/ai/connectors/openrouter.ts` **verbatim**, changing only their export status:

- `usage(value)` (currently line 50)
- `stopReason(reason)` (line 63)
- `normalizedError(status)` (line 70)
- `toolDefinitions(tools)` (line 83)
- `parseToolInput(input)` (line 95)
- `messages(system, input)` (line 106)
- the `OpenRouterUsage`, `OpenRouterToolCall`, and `OpenRouterResponse` types (lines 25-49), renamed to `OpenAICompatibleUsage`, `OpenAICompatibleToolCall`, `OpenAICompatibleResponse`

Export each of `usage`, `stopReason`, `normalizedError`, `toolDefinitions`, `parseToolInput`, and `messages`.

Then add the base class, moving the request/stream methods off `OpenRouterConnector` unchanged except that the hardcoded `OPENROUTER_API_ORIGIN` becomes `this.config.origin`, the `authorization` header block gains `...this.config.headers`, and the `provider: { ... }` block in `payload` becomes `...this.config.bodyExtras`:

```ts
export type OpenAICompatibleConfig = {
  id: AIConnectorId;
  origin: string;
  apiKey: string;
  fetch?: typeof fetch;
  /** Extra request headers, e.g. OpenRouter's attribution headers. */
  headers?: Record<string, string>;
  /** Extra top-level body fields, e.g. OpenRouter's `provider` routing block. */
  bodyExtras?: Record<string, unknown>;
};

export abstract class OpenAICompatibleConnector implements AIConnector {
  readonly capabilities = ['text', 'json', 'tools', 'streaming', 'parallel_tool_results'] as const;

  protected constructor(protected readonly config: OpenAICompatibleConfig) {}

  get id() { return this.config.id; }

  // ...the payload/send/generateText/generateStructured/streamText/
  // runToolConversation/streamToolConversation bodies moved from
  // OpenRouterConnector, with the three substitutions above.
}
```

Do not change any logic while moving. If you find yourself improving something, stop — that belongs in a separate commit after this one is green.

- [x] **Step 3: Reduce OpenRouterConnector to configuration**

Replace the body of `lib/ai/connectors/openrouter.ts` with:

```ts
import type { AIConnectorId } from '@/lib/ai/workloads';
import {
  OpenAICompatibleConnector,
  type OpenAICompatibleConfig,
} from '@/lib/ai/connectors/openai-compatible';
import {
  openRouterCredentialSchema,
  openRouterProviderPreferencesSchema,
} from '@/lib/schemas/ai-settings';
import type { z } from 'zod';

const OPENROUTER_API_ORIGIN = 'https://openrouter.ai/api/v1';

type ProviderPreferences = z.infer<typeof openRouterProviderPreferencesSchema>;

export type OpenRouterConnectorOptions = {
  apiKey: string;
  provider?: ProviderPreferences;
  fetch?: typeof fetch;
};

export class OpenRouterConnector extends OpenAICompatibleConnector {
  readonly id = 'openrouter' as const satisfies AIConnectorId;

  constructor(options: OpenRouterConnectorOptions) {
    const provider = options.provider
      ? openRouterProviderPreferencesSchema.parse(options.provider)
      : undefined;
    super({
      id: 'openrouter',
      origin: OPENROUTER_API_ORIGIN,
      apiKey: openRouterCredentialSchema.parse({ apiKey: options.apiKey }).apiKey,
      fetch: options.fetch,
      // allow_fallbacks stays false: a silent reroute to another upstream is a
      // different model than the one the deployment names.
      bodyExtras: { provider: { ...(provider ?? {}), allow_fallbacks: false } },
    } satisfies OpenAICompatibleConfig);
  }
}
```

If the base class's `get id()` conflicts with the subclass's `readonly id`, drop the getter from the base and let each subclass declare `readonly id`.

- [x] **Step 4: Run the existing OpenRouter suite to prove nothing moved**

Run: `npx vitest run lib/ai/__tests__/openrouter-connector.test.ts`
Expected: PASS, with the same test count as Step 1. Do not edit this test file in this task — if it fails, the refactor changed behaviour and the refactor is what needs fixing.

- [x] **Step 5: Run types and the full AI suite**

Run: `npm run verify:types && npx vitest run lib/ai`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add lib/ai/connectors/openai-compatible.ts lib/ai/connectors/openrouter.ts
git commit -m "refactor(ai): extract the OpenAI-compatible chat-completions core"
```

---

# Task 5: Add the direct OpenAI connector

**Why:** F4. An org with an OpenAI key has no way to use it. With Task 4 done this is a configuration object plus a registry entry.

**Files:**
- Create: `lib/ai/connectors/openai.ts`
- Modify: `lib/ai/connectors/registry.ts`
- Test: `lib/ai/__tests__/openai-connector.test.ts` (create)

**Interfaces:**
- Consumes: `OpenAICompatibleConnector` and `OpenAICompatibleConfig` from Task 4; `directProviderCredentialSchema` from Task 1.
- Produces: `OpenAIConnector` and `OpenAIConnectorOptions` (`{ apiKey: string; fetch?: typeof fetch }`) from `lib/ai/connectors/openai.ts`. Registry entry `openai`.

- [x] **Step 1: Write the failing test**

Create `lib/ai/__tests__/openai-connector.test.ts`:

```ts
// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { OpenAIConnector } from '@/lib/ai/connectors/openai';

const API_KEY = 'sk-test-0123456789abcdef';

const PLAN = {
  connector: 'openai' as const,
  requestedModel: 'gpt-5.6-sol',
  maxOutputTokens: 1024,
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('OpenAIConnector', () => {
  it('posts to the OpenAI chat-completions endpoint with the supplied key', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ finish_reason: 'stop', message: { content: 'hello' } }],
      usage: { prompt_tokens: 5, completion_tokens: 2 },
    }));

    const connector = new OpenAIConnector({ apiKey: API_KEY, fetch: fetcher });
    const result = await connector.generateText(PLAN as never, {
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result.text).toBe('hello');
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers.authorization).toBe(`Bearer ${API_KEY}`);
  });

  it('sends no OpenRouter provider routing block', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ finish_reason: 'stop', message: { content: 'ok' } }],
    }));

    await new OpenAIConnector({ apiKey: API_KEY, fetch: fetcher })
      .generateText(PLAN as never, { messages: [{ role: 'user', content: 'hi' }] });

    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.provider).toBeUndefined();
    expect(body.model).toBe('gpt-5.6-sol');
  });

  it('maps an auth failure to credential_invalid', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));

    await expect(
      new OpenAIConnector({ apiKey: API_KEY, fetch: fetcher })
        .generateText(PLAN as never, { messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toMatchObject({ code: 'credential_invalid' });
  });

  it('rejects a malformed key at construction', () => {
    expect(() => new OpenAIConnector({ apiKey: 'short' })).toThrow();
  });
});
```

If `AIExecutionError` exposes its discriminant under a field other than `code`, read `lib/ai/execution.ts` and match the real field name in the third test.

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/ai/__tests__/openai-connector.test.ts`
Expected: FAIL — `lib/ai/connectors/openai.ts` does not exist.

- [x] **Step 3: Write the connector**

Create `lib/ai/connectors/openai.ts`:

```ts
import type { AIConnectorId } from '@/lib/ai/workloads';
import {
  OpenAICompatibleConnector,
  type OpenAICompatibleConfig,
} from '@/lib/ai/connectors/openai-compatible';
import { directProviderCredentialSchema } from '@/lib/schemas/ai-settings';

const OPENAI_API_ORIGIN = 'https://api.openai.com/v1';

export type OpenAIConnectorOptions = {
  apiKey: string;
  fetch?: typeof fetch;
};

/**
 * Direct OpenAI. Same wire format as OpenRouter minus the routing preferences,
 * which are an OpenRouter marketplace concept with no meaning against a
 * first-party endpoint.
 */
export class OpenAIConnector extends OpenAICompatibleConnector {
  readonly id = 'openai' as const satisfies AIConnectorId;

  constructor(options: OpenAIConnectorOptions) {
    super({
      id: 'openai',
      origin: OPENAI_API_ORIGIN,
      apiKey: directProviderCredentialSchema.parse({ apiKey: options.apiKey }).apiKey,
      fetch: options.fetch,
    } satisfies OpenAICompatibleConfig);
  }
}
```

- [x] **Step 4: Register it**

In `lib/ai/connectors/registry.ts`, add the import and the factory entry:

```ts
import { OpenAIConnector } from '@/lib/ai/connectors/openai';
```

```ts
  openai: (context) => {
    if (!context?.openai) {
      throw new Error('OpenAI connectors require an organization credential');
    }
    return new OpenAIConnector(context.openai);
  },
```

- [x] **Step 5: Run the tests**

Run: `npx vitest run lib/ai/__tests__/openai-connector.test.ts lib/ai/__tests__/connector-registry.test.ts lib/ai/__tests__/runtime-credential-source.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add lib/ai/connectors/openai.ts lib/ai/connectors/registry.ts lib/ai/__tests__/openai-connector.test.ts
git commit -m "feat(ai): add a direct OpenAI connector"
```

---

# Task 6: Add direct-provider catalog templates

**Why:** `AI_DEPLOYMENT_CATALOG` is entirely OpenRouter templates, so an admin with a direct Anthropic key has no deployment to create. Direct providers use first-party model IDs (`claude-opus-5`), not OpenRouter slugs (`anthropic/claude-opus-5`) — these are different namespaces and mixing them fails at request time.

**Files:**
- Modify: `lib/ai/catalog.ts`
- Test: `lib/ai/__tests__/catalog.test.ts` (extend)

**Interfaces:**
- Consumes: `VerifiedDeploymentTemplate` — already exported from `lib/ai/catalog.ts`, with a `connector: AIConnectorId` field.
- Produces: new template ids `anthropic-claude-opus-5`, `anthropic-claude-sonnet-5`, `openai-gpt-5-6-sol`. **Existing template ids must not change** — `org_ai_deployments.catalog_template_id` stores them and `lib/ai/resolver.ts` throws when a stored id no longer resolves.

- [x] **Step 1: Write the failing test**

Append to `lib/ai/__tests__/catalog.test.ts`:

```ts
describe('direct provider templates', () => {
  it('offers direct Anthropic and OpenAI deployments', () => {
    const connectors = new Set(AI_DEPLOYMENT_CATALOG.map(t => t.connector));
    expect(connectors).toContain('anthropic');
    expect(connectors).toContain('openai');
  });

  it('uses first-party model ids on direct connectors, not OpenRouter slugs', () => {
    for (const template of AI_DEPLOYMENT_CATALOG) {
      if (template.connector === 'openrouter') {
        expect(template.providerModelId).toContain('/');
      } else {
        expect(template.providerModelId).not.toContain('/');
      }
    }
  });

  it('never carries a date suffix on a model id', () => {
    for (const template of AI_DEPLOYMENT_CATALOG) {
      expect(template.providerModelId).not.toMatch(/-\d{8}$/);
    }
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/ai/__tests__/catalog.test.ts`
Expected: FAIL — no template declares connector `anthropic` or `openai`.

- [x] **Step 3: Append the direct templates**

Add to `AI_DEPLOYMENT_CATALOG` in `lib/ai/catalog.ts`, leaving every existing entry untouched:

```ts
  {
    id: 'anthropic-claude-opus-5',
    connector: 'anthropic',
    providerModelId: 'claude-opus-5',
    displayName: 'Claude Opus 5 (direct)',
    modelVendor: 'anthropic',
    openWeight: false,
    versionPolicy: 'moving_alias',
    advertisedCapabilities: ['text', 'json', 'tools', 'streaming', 'parallel_tool_results'],
    verifiedWorkloads: {},
    notes: 'Uses the organization\'s own Anthropic API key.',
  },
  {
    id: 'anthropic-claude-sonnet-5',
    connector: 'anthropic',
    providerModelId: 'claude-sonnet-5',
    displayName: 'Claude Sonnet 5 (direct)',
    modelVendor: 'anthropic',
    openWeight: false,
    versionPolicy: 'moving_alias',
    advertisedCapabilities: ['text', 'json', 'tools', 'streaming', 'parallel_tool_results'],
    verifiedWorkloads: {},
    notes: 'Uses the organization\'s own Anthropic API key.',
  },
  {
    id: 'openai-gpt-5-6-sol',
    connector: 'openai',
    providerModelId: 'gpt-5.6-sol',
    displayName: 'GPT-5.6 Sol (direct)',
    modelVendor: 'openai',
    openWeight: false,
    versionPolicy: 'moving_alias',
    advertisedCapabilities: ['text', 'json', 'tools', 'streaming', 'parallel_tool_results'],
    verifiedWorkloads: {},
    notes: 'Uses the organization\'s own OpenAI API key.',
  },
```

The OpenRouter catalog already carries all three GPT-5.6 variants. Only `sol` gets a direct template here; add `luna` and `terra` direct templates if an admin asks for them rather than pre-populating the picker with three near-identical rows.

- [x] **Step 4: Filter the deployment picker by the connection's connector**

A template must only be offerable against a connection that can run it. In `app/api/org/[orgId]/ai-settings/route.ts` (the GET that assembles the settings payload), the `catalog` array is returned whole. Leave the payload as is, but ensure each catalog entry in the response includes its `connector` field so the UI can filter — Task 9 depends on it. Verify with:

```bash
grep -n "catalog" "app/api/org/[orgId]/ai-settings/route.ts"
```

If the route projects a subset of template fields, add `connector` to that projection.

- [x] **Step 5: Run the tests**

Run: `npx vitest run lib/ai/__tests__/catalog.test.ts lib/ai/__tests__/resolver-phase1.test.ts`
Expected: PASS. The resolver suite is included because `getAIDeploymentTemplate` throws on an unknown id — a malformed template entry here surfaces as a resolver failure, not a catalog one.

- [x] **Step 6: Commit**

```bash
git add lib/ai/catalog.ts lib/ai/__tests__/catalog.test.ts app/api/org
git commit -m "feat(ai): add direct Anthropic and OpenAI deployment templates"
```

---

# Task 7: Make the resolver connector-aware and remove the OpenRouter-only guard

**Why:** F4. `lib/ai/resolver.ts:159` rejects every non-OpenRouter org deployment, and lines 177-190 build OpenRouter provider preferences and hardcode `connector: 'openrouter'` into the target regardless of the connection. Task 2 must already be merged — see [the hazard](#the-hazard-this-plan-is-sequenced-around).

**Ordering:** This task runs after Task 6, not before. Its tests resolve deployments whose `catalog_template_id` names a direct-provider template, and `getAIDeploymentTemplate` throws on an id that does not exist yet — so the resolver work cannot be proven green until the catalog carries those templates.

**Files:**
- Modify: `lib/ai/resolver.ts:159-196`
- Test: `lib/ai/__tests__/resolver-connectors.test.ts` (create)

**Interfaces:**
- Consumes: `getAIDeploymentTemplate` from `lib/ai/catalog`; `openRouterProviderPreferencesSchema` from `lib/schemas/ai-settings`.
- Produces: `AIExecutionTarget.connector` now reflects the stored connection's connector. `providerPreferences` is present only for OpenRouter targets.

- [x] **Step 1: Confirm Task 2 is in the branch**

Run: `git log --oneline --grep="source org credentials from the deployment"`
Expected: one commit. If empty, **stop** — removing the guard before that fix routes client traffic onto the platform key.

- [x] **Step 2: Write the failing test**

Create `lib/ai/__tests__/resolver-connectors.test.ts`. Model the fixture shape on the existing `lib/ai/__tests__/resolver-phase1.test.ts` — read it first and reuse its resolved-route builder rather than inventing a second one.

```ts
// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { resolveOrganizationAIExecution } from '@/lib/ai/resolver';

// Build the resolved-route fixture the same way resolver-phase1.test.ts does.
// Replace this import with that file's helper once you have read it.
import { resolvedRouteFixture } from './resolver-phase1.test-helpers';

describe('resolver connector awareness', () => {
  it('resolves a direct Anthropic deployment', () => {
    const plan = resolveOrganizationAIExecution(
      { kind: 'organization', orgId: 'org-1', actorId: 'user-1' },
      'assistant',
      resolvedRouteFixture({
        connector: 'anthropic',
        catalogTemplateId: 'anthropic-claude-opus-5',
        providerModelId: 'claude-opus-5',
        policy: { experimentalUseAccepted: true, mutationTools: 'allow_experimental' },
      }),
    );

    expect(plan.targets[0].connector).toBe('anthropic');
    expect(plan.targets[0].requestedModel).toBe('claude-opus-5');
    expect(plan.targets[0].providerPreferences).toBeUndefined();
  });

  it('resolves a direct OpenAI deployment', () => {
    const plan = resolveOrganizationAIExecution(
      { kind: 'organization', orgId: 'org-1', actorId: 'user-1' },
      'assistant',
      resolvedRouteFixture({
        connector: 'openai',
        catalogTemplateId: 'openai-gpt-5-6-sol',
        providerModelId: 'gpt-5.6-sol',
        policy: { experimentalUseAccepted: true, mutationTools: 'allow_experimental' },
      }),
    );

    expect(plan.targets[0].connector).toBe('openai');
  });

  it('still carries provider preferences for OpenRouter', () => {
    const plan = resolveOrganizationAIExecution(
      { kind: 'organization', orgId: 'org-1', actorId: 'user-1' },
      'assistant',
      resolvedRouteFixture({
        connector: 'openrouter',
        catalogTemplateId: 'openrouter-anthropic-claude-opus-5',
        providerModelId: 'anthropic/claude-opus-5',
        connectionConfig: { provider: { order: ['anthropic'] } },
        policy: { experimentalUseAccepted: true, mutationTools: 'allow_experimental' },
      }),
    );

    expect(plan.targets[0].connector).toBe('openrouter');
    expect(plan.targets[0].providerPreferences).toMatchObject({ order: ['anthropic'] });
  });

  it('still rejects a deployment with no catalog template', () => {
    expect(() => resolveOrganizationAIExecution(
      { kind: 'organization', orgId: 'org-1', actorId: 'user-1' },
      'assistant',
      resolvedRouteFixture({ connector: 'anthropic', catalogTemplateId: null }),
    )).toThrow(/unsupported/i);
  });

  it('rejects a connector the platform does not implement', () => {
    expect(() => resolveOrganizationAIExecution(
      { kind: 'organization', orgId: 'org-1', actorId: 'user-1' },
      'assistant',
      resolvedRouteFixture({ connector: 'bedrock', catalogTemplateId: 'whatever' }),
    )).toThrow(/unsupported/i);
  });
});
```

The exported resolver function may be named differently — read `lib/ai/resolver.ts` and use the real name and signature. If `resolver-phase1.test.ts` builds its fixture inline rather than exporting a helper, extract that helper into `lib/ai/__tests__/resolver-phase1.test-helpers.ts` and have both suites import it. Do not duplicate the fixture.

- [x] **Step 3: Run the test to verify it fails**

Run: `npx vitest run lib/ai/__tests__/resolver-connectors.test.ts`
Expected: FAIL — the Anthropic and OpenAI cases throw "Organization AI deployment is unsupported".

- [x] **Step 4: Replace the connector guard with an allow-list**

In `lib/ai/resolver.ts`, add near the top of the module:

```ts
const ORG_CONNECTORS = new Set(['openrouter', 'anthropic', 'openai']);
```

Replace the guard at line 159:

```ts
    if (!ORG_CONNECTORS.has(connection.connector) || !deployment.catalog_template_id) {
      throw new AIExecutionError('policy_unsatisfied', 'Organization AI deployment is unsupported');
    }
```

This is still a closed allow-list — an unrecognised connector in the database is rejected, not passed through to the registry.

- [x] **Step 5: Compute provider preferences only for OpenRouter**

Replace the `connectionConfig` / `deploymentConfig` / `preferences` block (currently lines 177-184) with:

```ts
    const connectionConfig = connection.config as Record<string, unknown>;
    const deploymentConfig = deployment.config as Record<string, unknown>;
    // Routing preferences are an OpenRouter marketplace concept. Parsing them
    // for a direct provider would fabricate a default that is then attached to
    // a request that has nowhere to put it.
    const preferences = connection.connector === 'openrouter'
      ? openRouterProviderPreferencesSchema.parse({
        ...((connectionConfig.provider as Record<string, unknown> | undefined) ?? {}),
        ...((deploymentConfig.provider as Record<string, unknown> | undefined) ?? {}),
        ...((policy.provider as Record<string, unknown> | undefined) ?? {}),
      })
      : undefined;
```

- [x] **Step 6: Carry the real connector into the target**

In the returned target object (currently lines 185-196), replace the two hardcoded lines:

```ts
      connector: connection.connector as AIConnectorId,
      requestedModel: deployment.provider_model_id,
      modelVendor: template.modelVendor,
      connectionId: connection.id,
      deploymentId: deployment.id,
      ...(preferences ? { providerPreferences: Object.freeze(preferences) } : {}),
```

Add `AIConnectorId` to the existing `lib/ai/workloads` import in that file.

- [x] **Step 7: Run the tests**

Run: `npx vitest run lib/ai/__tests__/resolver-connectors.test.ts lib/ai/__tests__/resolver-phase1.test.ts lib/ai/__tests__/runtime-credential-source.test.ts`
Expected: PASS

- [x] **Step 8: Commit**

```bash
git add lib/ai/resolver.ts lib/ai/__tests__/resolver-connectors.test.ts lib/ai/__tests__/resolver-phase1.test-helpers.ts
git commit -m "feat(ai): resolve organization deployments for every supported connector"
```

---

# Task 8: Run the compatibility check for every connector

**Why:** `app/api/org/[orgId]/ai-settings/deployments/[deploymentId]/evaluate/route.ts:32` returns 400 for any non-OpenRouter connection, and line 60 constructs `new OpenRouterConnector(...)` directly — bypassing the registry that Tasks 2, 3, and 5 just made connector-aware. An admin with a direct key would be unable to run any check at all.

**This task does not make the check meaningful.** It still emits `result: 'conditional'` from a four-token smoke test. Real evals are Phase 2B.

**Files:**
- Modify: `app/api/org/[orgId]/ai-settings/deployments/[deploymentId]/evaluate/route.ts`
- Test: `tests/integration/ai-deployment-evaluate-connectors.test.ts` (create)

**Interfaces:**
- Consumes: `createAIConnector` from `lib/ai/connectors/registry`; `createAICredentialRepository` from `lib/api/repositories/ai-credentials`.
- Produces: no new exports. The endpoint accepts `anthropic` and `openai` connections and still records `evalSuiteVersion: 'phase1-compatibility-v1'` with `result: 'conditional'`.

- [x] **Step 1: Write the failing test**

Create `tests/integration/ai-deployment-evaluate-connectors.test.ts`. Read `tests/integration/org-ai-settings-boundary.test.ts` first and reuse its access-guard and repository mocking approach rather than inventing a new one.

```ts
// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTE = join(
  __dirname, '..', '..',
  'app/api/org/[orgId]/ai-settings/deployments/[deploymentId]/evaluate/route.ts',
);

describe('deployment evaluation connector coverage', () => {
  const source = readFileSync(ROUTE, 'utf8');

  it('does not gate evaluation on the OpenRouter connector', () => {
    expect(source).not.toMatch(/connection\.connector !== 'openrouter'/);
  });

  it('builds its connector through the registry, not a direct constructor', () => {
    expect(source).not.toMatch(/new OpenRouterConnector\(/);
    expect(source).toMatch(/createAIConnector\(/);
  });

  it('still records a conditional result until a real eval suite exists', () => {
    expect(source).toMatch(/result: 'conditional'/);
    expect(source).not.toMatch(/result: 'passed'/);
  });
});
```

This is a source-shape assertion rather than a behavioural one because the endpoint's only observable effect is a network call to a third-party provider. When Phase 2B replaces the smoke test with a real suite, replace this file with behavioural tests against the eval harness.

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/ai-deployment-evaluate-connectors.test.ts`
Expected: FAIL on the first two assertions.

- [x] **Step 3: Replace the connector gate**

In the route, replace the check at line 32:

```ts
    if (!deployment.catalog_template_id) {
      return jsonError('Deployment has no catalog template and cannot be evaluated', 400);
    }
```

- [x] **Step 4: Build the connector through the registry**

Replace the import of `OpenRouterConnector` with:

```ts
import { createAIConnector, type AIConnectorFactoryContext } from '@/lib/ai/connectors/registry';
```

Replace the `preferences` computation and the `withCredential` call body with:

```ts
    const preferences = connection.connector === 'openrouter'
      ? openRouterProviderPreferencesSchema.parse({
        ...(((connection.config as Record<string, unknown>).provider as Record<string, unknown>) ?? {}),
        ...(((deployment.config as Record<string, unknown>).provider as Record<string, unknown>) ?? {}),
      })
      : undefined;
    const basePlan = resolveAIExecution({ kind: 'organization', orgId }, parsed.data.workloadId);
    const plan = {
      ...basePlan,
      connector: connection.connector as typeof basePlan.connector,
      requestedModel: deployment.provider_model_id,
      connectionId: connection.id,
      deploymentId: deployment.id,
      modelVendor: template.modelVendor,
      ...(preferences ? { providerPreferences: preferences } : {}),
    };
    const result = await createAICredentialRepository({ orgId, actorId })
      .withCredential(connection.id, (credential) => {
        const context: AIConnectorFactoryContext = connection.connector === 'openrouter'
          ? { openrouter: { apiKey: credential.apiKey, provider: preferences } }
          : connection.connector === 'anthropic'
            ? { anthropic: { apiKey: credential.apiKey } }
            : { openai: { apiKey: credential.apiKey } };
        return createAIConnector(connection.connector as never, context).generateText(plan, {
          system: 'This is a bounded model compatibility check. Follow the requested output exactly.',
          messages: [{ role: 'user', content: 'Reply with exactly: BENE_OK' }],
          maxOutputTokens: 16,
          signal: AbortSignal.timeout(20_000),
        });
      });
```

Leave the `BENE_OK` comparison, the `evalSuiteVersion`, and `result: 'conditional'` exactly as they are.

- [x] **Step 5: Run the tests**

Run: `npx vitest run tests/integration/ai-deployment-evaluate-connectors.test.ts tests/integration/org-ai-settings-boundary.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add app/api/org tests/integration/ai-deployment-evaluate-connectors.test.ts
git commit -m "feat(ai-settings): evaluate deployments on any supported connector"
```

---

# Task 9: Provider picker and per-provider credential help

**Why:** `components/settings/AIModelsSettings.tsx:92` hardcodes `connector: 'openrouter'` in the add-connection payload, so none of the previous eight tasks is reachable from the UI. Admins also need to know which key to paste and where to get it — a pasted OpenRouter key on an Anthropic connection fails at request time, long after the form was submitted.

**Files:**
- Modify: `components/settings/AIModelsSettings.tsx`
- Test: `components/settings/__tests__/AIModelsSettings.connectors.test.tsx` (create)

**Interfaces:**
- Consumes: `requestJson` from `lib/api/client`; `useApiData` from `lib/api/client-hooks`; the settings payload's `catalog` entries, which carry `connector` after Task 7 Step 4.
- Produces: no new exports. The `POST /api/org/[orgId]/ai-settings/connections` payload gains a chosen `connector`.

- [x] **Step 1: Write the failing test**

Create `components/settings/__tests__/AIModelsSettings.connectors.test.tsx`. Model the mock setup on `components/settings/__tests__/AIModelsSettings.write-access.test.tsx` from Phase 1 — read it first.

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { requestJson, useApiData } = vi.hoisted(() => ({
  requestJson: vi.fn().mockResolvedValue({}),
  useApiData: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({ requestJson }));
vi.mock('@/lib/api/client-hooks', () => ({ useApiData }));

import AIModelsSettings from '../AIModelsSettings';

const API_KEY = 'sk-test-0123456789abcdef';

beforeEach(() => {
  requestJson.mockClear();
  useApiData.mockReturnValue({
    isLoading: false,
    error: null,
    mutate: vi.fn(),
    data: {
      connections: [],
      deployments: [],
      routes: [],
      workloads: [{ id: 'assistant', displayName: 'Assistant' }],
      catalog: [
        { id: 'openrouter-anthropic-claude-opus-5', displayName: 'Claude Opus 5', modelVendor: 'anthropic', connector: 'openrouter' },
        { id: 'anthropic-claude-opus-5', displayName: 'Claude Opus 5 (direct)', modelVendor: 'anthropic', connector: 'anthropic' },
      ],
      usageSummary: {
        periodDays: 30, invocations: 0, failedInvocations: 0,
        inputTokens: 0, outputTokens: 0, reportedCost: 0,
      },
    },
  });
});

function submitConnection(connector: string) {
  render(<AIModelsSettings orgId="org-1" />);
  fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: connector } });
  fireEvent.change(screen.getByLabelText(/api key/i), { target: { value: API_KEY } });
  fireEvent.click(screen.getByText('Add connection'));
}

function savedConnectionBody() {
  const call = requestJson.mock.calls.find(([url]) => String(url).endsWith('/ai-settings/connections'));
  if (!call) throw new Error('connection save was not requested');
  return JSON.parse(call[1].body);
}

describe('AIModelsSettings provider picker', () => {
  it('sends the chosen direct Anthropic connector', async () => {
    submitConnection('anthropic');
    await waitFor(() => expect(savedConnectionBody().connector).toBe('anthropic'));
  });

  it('sends the chosen direct OpenAI connector', async () => {
    submitConnection('openai');
    await waitFor(() => expect(savedConnectionBody().connector).toBe('openai'));
  });

  it('still supports OpenRouter', async () => {
    submitConnection('openrouter');
    await waitFor(() => expect(savedConnectionBody().connector).toBe('openrouter'));
  });

  it('shows provider-specific credential guidance', () => {
    render(<AIModelsSettings orgId="org-1" />);
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: 'anthropic' } });
    expect(screen.getByText(/console\.anthropic\.com/i)).toBeTruthy();
  });
});
```

If the submit button's label is not exactly `Add connection`, read the component and use the real label.

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/settings/__tests__/AIModelsSettings.connectors.test.tsx`
Expected: FAIL — there is no control labelled "provider".

- [x] **Step 3: Add the connector state and its metadata**

In `components/settings/AIModelsSettings.tsx`, alongside the existing `connectionName` state:

```tsx
const [connector, setConnector] = useState<'openrouter' | 'anthropic' | 'openai'>('openrouter');
```

Above the component, add:

```tsx
const CONNECTOR_OPTIONS = [
  {
    id: 'openrouter' as const,
    label: 'OpenRouter',
    help: 'One key, many models. Create a key at openrouter.ai/keys.',
  },
  {
    id: 'anthropic' as const,
    label: 'Anthropic (direct)',
    help: 'Your own Anthropic account. Create a key at console.anthropic.com.',
  },
  {
    id: 'openai' as const,
    label: 'OpenAI (direct)',
    help: 'Your own OpenAI account. Create a key at platform.openai.com/api-keys.',
  },
];
```

- [x] **Step 4: Send the chosen connector**

In `addConnection`, replace the hardcoded line:

```tsx
          connector,
```

- [x] **Step 5: Render the picker and its help text**

In the add-connection form, before the API key input:

```tsx
                <label className="block text-sm">
                  <span className="text-xs uppercase tracking-wide text-gray-500">Provider</span>
                  <select
                    aria-label="Provider"
                    className="mt-1 w-full rounded border px-3 py-2 text-sm"
                    value={connector}
                    onChange={event => setConnector(event.target.value as typeof connector)}
                  >
                    {CONNECTOR_OPTIONS.map(option => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <p className="text-xs text-gray-500">
                  {CONNECTOR_OPTIONS.find(option => option.id === connector)?.help}
                </p>
```

Give the API key input `aria-label="API key"` if it does not already have an accessible name.

- [x] **Step 6: Filter the deployment template picker by connection**

The catalog now mixes connectors. In the add-deployment form, the template `<select>` must offer only templates whose `connector` matches the selected connection's connector, or an admin can attach an OpenRouter template to a direct Anthropic key and get a request-time failure:

```tsx
                    {data.catalog
                      .filter(template => template.connector === activeConnections
                        .find(connection => connection.id === deploymentConnection)?.connector)
                      .map(template => (
                        <option key={template.id} value={template.id}>{template.displayName}</option>
                      ))}
```

Add `connector: string` to the `CatalogTemplate` type and `connector: string` to the `Connection` type at the top of the file if not already present.

- [x] **Step 7: Run the tests**

Run: `npx vitest run components/settings`
Expected: PASS, including the Phase 1 write-access suite.

- [x] **Step 8: Run the full gate**

Run: `npm run verify:types && npm run verify:unit && npm run verify:build`
Expected: PASS

- [x] **Step 9: Commit**

```bash
git add components/settings
git commit -m "feat(ai-settings): add a provider picker with per-provider credential guidance"
```

---

## Phase 2A exit criteria

- [x] `npm run verify:types && npm run verify:lint && npm run verify:unit` all pass
- [x] `npm run verify:build` passes
- [x] An org admin can create an OpenRouter connection, an Anthropic connection, and an OpenAI connection from the settings UI
- [x] Each connection can host a deployment whose catalog template matches its connector, and the template picker offers no mismatched templates
- [ ] Manual check with live keys: route the `assistant` workload to a direct Anthropic deployment and confirm a mutation completes end to end using the org's key
- [ ] Manual check: with a direct Anthropic deployment configured, confirm no request is attributable to the platform `ANTHROPIC_API_KEY` — the Task 2 regression test covers the code path, but confirm once against a real provider dashboard

## Deferred to Phase 2B

- Real per-workload behavioural evals replacing the `BENE_OK` smoke test (F5)
- `result: 'passed'` becoming reachable, so `lib/ai/resolver.ts` grants full tools on evidence
- Demoting the Phase 1 write-access checkbox from the default path to the fallback path for uncovered models
- A deployment-level surface showing what a model is and is not verified for
