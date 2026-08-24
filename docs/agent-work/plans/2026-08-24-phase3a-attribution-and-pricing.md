# Phase 3A — Attribution and Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every model call in the platform attributable to an organization and priced in dollars, so "what did this organization cost us?" has an answer.

**Architecture:** Builder stops constructing providers directly and reaches the AI gateway through one boundary module, `lib/builder/ai.ts`, on four new platform-only workloads. A rate table in code prices each call at write time, freezing the cost and the rate version onto the usage row. `0057`'s patch block folds back into `0030`, minus the four columns whose foreign keys require the later migration.

**Tech Stack:** TypeScript, Supabase (Postgres + RLS), BullMQ, Next.js 15 App Router, Vitest.

**Spec:** `docs/agent-work/specs/2026-08-24-phase3a-attribution-and-pricing-design.md`

## Global Constraints

Every task's requirements implicitly include these.

- `db/migrations` is the single source of truth. Read the owning migration before assuming any column, table, or function exists.
- The database is prerelease. A correction to an existing concept is folded into that concept's owning migration, not added as a patch.
- Every migration change is followed by `npm run db:types:generate`, and `lib/database.types.ts` is committed with it.
- Org-scoped FK column is `org_id`. RLS helpers are `can_view_org`, `is_org_admin`, `is_app_admin`, `user_org_role`.
- Product code reaches data only through `lib/database-client.ts` and repository modules under `lib/api/repositories/`.
- Product AI execution enters through `lib/ai/runtime.ts` or an injected `AIExecutionGateway`. **After Task 6, `lib/builder/ai.ts` is the only sanctioned caller of `createAIProvider` outside `lib/ai/factory.ts`.**
- `temperature` was removed from `AIRequestConfig` and `AIGenerationRequest` in Phase 1 because it 400s on Claude Opus 5 and Sonnet 5. Do not reintroduce it.
- Model ID strings are exact and complete. Never append a date suffix.
- Rates are per million tokens, in USD. Sonnet 5 is encoded at standard `$3 / $15`, deliberately not its introductory `$2 / $10` which expires 2026-08-31.
- Verification gate for every task: `npm run verify:types`, `npm run verify:lint`, `npm run verify:unit`. Add `npm run verify:build` when `app/` or `components/` changes.

## Prerequisite: run the destructive reset first

This phase edits `0030` and `0057`, both already applied to the local stack. `supabase migration up` cannot verify an edited migration — only a rebuild from scratch proves the pair still produces the right end state.

**Before starting Task 1**, confirm `supabase db reset` is acceptable. It destroys the `benevolence-walkthrough` stack's contents. This was confirmed acceptable on 2026-08-24: no client instances exist.

Run it once at the start to establish a clean baseline, and again in Task 4 to verify the fold:

```bash
npm run verify:migrations
```

The same reset also closes Phase 2B's outstanding `verify:migrations` exit criterion. Update that plan's checkbox when it passes.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `lib/ai/workloads.ts` | `orgRoutable` flag; four `builder_*` workloads | 1 |
| `lib/api/repositories/ai-settings.ts:106` | Filters non-routable workloads from the settings payload | 2 |
| `lib/schemas/ai-settings.ts` | `aiRouteReplaceSchema` rejects non-routable workloads | 2 |
| `lib/ai/resolver.ts` | Short-circuits non-routable workloads to the platform default | 2 |
| `app/api/org/[orgId]/ai-settings/deployments/[deploymentId]/evaluate/route.ts` | Excludes non-routable workloads | 2 |
| `lib/ai/rates.ts` | **New.** `MODEL_RATES`, `RATE_VERSION`, `priceFor` | 3 |
| `db/migrations/0030_ai_usage_log.sql` | Absorbs `0057`'s plain columns; gains cost columns | 4 |
| `db/migrations/0057_org_ai_runtime.sql` | Retains only the four FK column additions | 4 |
| `lib/api/repositories/ai-invocations.ts` | Prices the row before writing it | 5 |
| `lib/builder/ai.ts` | **New.** Builder's sole gateway boundary | 6 |
| `app/api/org/[orgId]/builder/chat/route.ts` | Calls `builderChatStream` | 7 |
| `lib/builder/tools.ts` | Calls `builderPlan` | 7 |
| `lib/builder/scaffold-worker.ts` | Calls `builderBuild` and `builderReview` | 7 |
| `AGENTS.md` / `CLAUDE.md` | Amended carve-out inside a new marked section | 8 |
| `tests/integration/agent-instructions-contract.test.ts` | Covers the new marked section | 8 |
| `.env.example` | Four `AI_CONNECTOR_BUILDER_*` variables | 1 |

---

# Task 1: Workload routing scope and the four Builder workloads

**Why:** `AIWorkloadDefinition` has no notion of whether a workload may be routed to an organization's own model. Adding four Builder workloads without one would expose them in the routing picker and let an organization reprice the platform's code generation onto their key.

**Files:**
- Modify: `lib/ai/workloads.ts`
- Modify: `.env.example`
- Test: `lib/ai/__tests__/builder-workloads.test.ts` (create)

**Interfaces:**
- Consumes: `AI_MODELS` from `lib/ai/models.ts`.
- Produces:
  - `AIWorkloadDefinition` gains `orgRoutable: boolean`.
  - `AIWorkloadId` gains `'builder_chat' | 'builder_plan' | 'builder_build' | 'builder_review'`.
  - `orgRoutableWorkloads(): AIWorkloadDefinition[]` exported from `lib/ai/workloads.ts`.

- [ ] **Step 1: Write the failing test**

Create `lib/ai/__tests__/builder-workloads.test.ts`:

```ts
// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { AI_WORKLOADS, orgRoutableWorkloads } from '@/lib/ai/workloads';

const BUILDER_WORKLOADS = ['builder_chat', 'builder_plan', 'builder_build', 'builder_review'] as const;

describe('builder workloads', () => {
  it('defines one workload per builder phase', () => {
    for (const id of BUILDER_WORKLOADS) {
      expect(AI_WORKLOADS[id], `${id} is missing`).toBeDefined();
    }
  });

  // Builder runs on the platform's credential. Routing it to an organization
  // deployment would reprice the platform's code generation onto their key.
  it('marks every builder workload as not org-routable', () => {
    for (const id of BUILDER_WORKLOADS) {
      expect(AI_WORKLOADS[id].orgRoutable, `${id} must not be org-routable`).toBe(false);
    }
  });

  it('keeps every product workload org-routable', () => {
    const product = Object.values(AI_WORKLOADS).filter(w => !w.id.startsWith('builder_'));
    expect(product).toHaveLength(9);
    for (const workload of product) {
      expect(workload.orgRoutable, `${workload.id} should be org-routable`).toBe(true);
    }
  });

  it('excludes builder workloads from orgRoutableWorkloads', () => {
    const ids = orgRoutableWorkloads().map(w => w.id);
    expect(ids).toHaveLength(9);
    for (const id of BUILDER_WORKLOADS) expect(ids).not.toContain(id);
  });

  it('preserves each phase model, so behaviour is unchanged by default', () => {
    expect(AI_WORKLOADS.builder_plan.platformDefault.model).toBe(AI_WORKLOADS.builder_review.platformDefault.model);
    expect(AI_WORKLOADS.builder_build.platformDefault.model).not.toBe(AI_WORKLOADS.builder_plan.platformDefault.model);
  });

  it('takes each builder connector from the environment, defaulting to anthropic', () => {
    for (const id of BUILDER_WORKLOADS) {
      expect(AI_WORKLOADS[id].platformDefault.connector).toBe('anthropic');
    }
  });

  it('declares tool capability for the chat workload only', () => {
    expect(AI_WORKLOADS.builder_chat.requiredCapabilities).toContain('tools');
    expect(AI_WORKLOADS.builder_build.requiredCapabilities).not.toContain('tools');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/ai/__tests__/builder-workloads.test.ts`
Expected: FAIL — `orgRoutableWorkloads` is not exported and `AI_WORKLOADS.builder_chat` is undefined.

- [ ] **Step 3: Add the routing flag to the workload type**

In `lib/ai/workloads.ts`, add to `AIWorkloadDefinition` (after `toolRisk`):

```ts
  /**
   * Whether an organization may route this workload to its own deployment.
   * False for platform tooling: routing it would move the platform's own
   * spend onto a client's credential.
   */
  orgRoutable: boolean;
```

Extend `AIWorkloadId` with the four builder ids, and add `orgRoutable: true` to each of the nine existing workload definitions.

- [ ] **Step 4: Add the four Builder workloads**

Append to `AI_WORKLOADS`, before the closing `} as const;`:

```ts
  builder_chat: {
    id: 'builder_chat',
    displayName: 'Builder chat',
    operation: 'tool_conversation',
    requiredCapabilities: ['text', 'tools', 'streaming'],
    inputDataClass: 'internal',
    defaultLimits: { maxOutputTokens: 4096, timeoutMs: 120_000 },
    platformDefault: {
      connector: (process.env.AI_CONNECTOR_BUILDER_CHAT ?? 'anthropic') as AIConnectorId,
      model: AI_MODELS.assistant,
    },
    toolRisk: 'mutation',
    orgRoutable: false,
  },
  builder_plan: {
    id: 'builder_plan',
    displayName: 'Builder scaffold planning',
    operation: 'structured_generation',
    requiredCapabilities: ['text', 'json'],
    inputDataClass: 'internal',
    defaultLimits: { maxOutputTokens: 8192, timeoutMs: 180_000 },
    platformDefault: {
      connector: (process.env.AI_CONNECTOR_BUILDER_PLAN ?? 'anthropic') as AIConnectorId,
      model: AI_MODELS.scaffoldPlan,
    },
    orgRoutable: false,
  },
  builder_build: {
    id: 'builder_build',
    displayName: 'Builder scaffold generation',
    operation: 'text_generation',
    requiredCapabilities: ['text'],
    inputDataClass: 'internal',
    defaultLimits: { maxOutputTokens: 16384, timeoutMs: 300_000 },
    platformDefault: {
      connector: (process.env.AI_CONNECTOR_BUILDER_BUILD ?? 'anthropic') as AIConnectorId,
      model: AI_MODELS.scaffoldBuild,
    },
    orgRoutable: false,
  },
  builder_review: {
    id: 'builder_review',
    displayName: 'Builder model review',
    operation: 'text_generation',
    requiredCapabilities: ['text'],
    inputDataClass: 'internal',
    defaultLimits: { maxOutputTokens: 8192, timeoutMs: 300_000 },
    platformDefault: {
      connector: (process.env.AI_CONNECTOR_BUILDER_REVIEW ?? 'anthropic') as AIConnectorId,
      model: AI_MODELS.scaffoldReview,
    },
    orgRoutable: false,
  },
```

`inputDataClass` is `'internal'` for all four: Builder operates on the platform's own codebase, not tenant data.

- [ ] **Step 5: Export the routable filter**

Add at the end of `lib/ai/workloads.ts`:

```ts
export function orgRoutableWorkloads(): AIWorkloadDefinition[] {
  return Object.values(AI_WORKLOADS).filter(workload => workload.orgRoutable);
}
```

- [ ] **Step 6: Document the connector variables**

Append to the AI MODEL SELECTION section of `.env.example`:

```bash
# Connector for each Builder phase. Builder runs on the platform's own
# credential and is never routed to an organization's model, but the vendor
# is not baked in — a white-label instance can point these anywhere.
AI_CONNECTOR_BUILDER_CHAT=""
AI_CONNECTOR_BUILDER_PLAN=""
AI_CONNECTOR_BUILDER_BUILD=""
AI_CONNECTOR_BUILDER_REVIEW=""
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run lib/ai tests/integration/env-template-contract.test.ts && npm run verify:types`
Expected: PASS. The env-template contract test from Phase 1 requires the four new variables; if it fails, they are missing from `.env.example`.

- [ ] **Step 8: Commit**

```bash
git add lib/ai/workloads.ts lib/ai/__tests__/builder-workloads.test.ts .env.example
git commit -m "feat(ai): add builder workloads and a workload routing scope"
```

---

# Task 2: Enforce the routing boundary at every consumer

**Why:** Task 1 declares the flag; nothing reads it yet. Four surfaces would otherwise expose Builder workloads: the settings payload feeds `Object.values(AI_WORKLOADS)` to the routing picker (`lib/api/repositories/ai-settings.ts:106`), `aiRouteReplaceSchema` accepts any workload id, the resolver would query for a route that cannot exist, and the Phase 2B evaluate route would offer Builder for evaluation against an organization's deployment.

**Files:**
- Modify: `lib/api/repositories/ai-settings.ts:106`
- Modify: `lib/schemas/ai-settings.ts`
- Modify: `lib/ai/resolver.ts`
- Modify: `app/api/org/[orgId]/ai-settings/deployments/[deploymentId]/evaluate/route.ts`
- Test: `tests/integration/builder-workload-boundary.test.ts` (create)

**Interfaces:**
- Consumes: `orgRoutableWorkloads`, `AI_WORKLOADS` from Task 1.
- Produces: `aiRouteReplaceSchema` rejects a non-routable `workloadId`. `resolveOrganizationAIExecution` returns the platform default for non-routable workloads without a route lookup.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/builder-workload-boundary.test.ts`:

```ts
// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aiRouteReplaceSchema } from '@/lib/schemas/ai-settings';

const ROOT = join(__dirname, '..', '..');

describe('builder workloads are not routable by an organization', () => {
  it('rejects a route replace for a builder workload', () => {
    const result = aiRouteReplaceSchema.safeParse({
      workloadId: 'builder_chat',
      targets: [{ kind: 'platform_default' }],
    });
    expect(result.success).toBe(false);
  });

  it('still accepts a route replace for a product workload', () => {
    const result = aiRouteReplaceSchema.safeParse({
      workloadId: 'assistant',
      targets: [{ kind: 'platform_default' }],
    });
    expect(result.success).toBe(true);
  });

  it('offers only routable workloads in the settings payload', () => {
    const source = readFileSync(join(ROOT, 'lib/api/repositories/ai-settings.ts'), 'utf8');
    expect(source).toMatch(/workloads:\s*orgRoutableWorkloads\(\)/);
    expect(source).not.toMatch(/workloads:\s*Object\.values\(AI_WORKLOADS\)/);
  });

  it('excludes non-routable workloads from deployment evaluation', () => {
    const source = readFileSync(
      join(ROOT, 'app/api/org/[orgId]/ai-settings/deployments/[deploymentId]/evaluate/route.ts'),
      'utf8',
    );
    expect(source).toMatch(/orgRoutable/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/builder-workload-boundary.test.ts`
Expected: FAIL — the schema accepts `builder_chat` and the payload still spreads all workloads.

- [ ] **Step 3: Reject non-routable workloads in the schema**

In `lib/schemas/ai-settings.ts`, add to `aiRouteReplaceSchema`'s existing `superRefine` body:

```ts
  if (!AI_WORKLOADS[value.workloadId].orgRoutable) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['workloadId'],
      message: `${value.workloadId} is platform tooling and cannot be routed to an organization deployment`,
    });
  }
```

`AI_WORKLOADS` is already imported at the top of that file.

- [ ] **Step 4: Filter the settings payload**

In `lib/api/repositories/ai-settings.ts`, change the import to include the filter and replace line 106:

```ts
        workloads: orgRoutableWorkloads(),
```

Add `orgRoutableWorkloads` to the existing `@/lib/ai/workloads` import.

- [ ] **Step 5: Short-circuit resolution for non-routable workloads**

In `lib/ai/resolver.ts`, inside `resolveOrganizationAIExecution`, immediately after the workload is available and before the routing repository is queried:

```ts
  // Platform tooling has no organization route to find, so skip the lookup
  // entirely rather than querying for a row that cannot exist.
  if (!getAIWorkload(workloadId).orgRoutable) {
    return bindDurableTurnPlan(scope, resolveAIExecution(scope, workloadId));
  }
```

Place this above the `if (!scope.orgId)` guard so a platform-tooling call resolves identically regardless of scope shape.

- [ ] **Step 6: Exclude them from deployment evaluation**

In the evaluate route, change `defaultWorkloadsFor` to filter on the flag as well as capabilities:

```ts
function defaultWorkloadsFor(template: VerifiedDeploymentTemplate): AIWorkloadId[] {
  return (Object.keys(AI_WORKLOADS) as AIWorkloadId[]).filter(workloadId =>
    AI_WORKLOADS[workloadId].orgRoutable
    && AI_WORKLOADS[workloadId].requiredCapabilities.every(capability =>
      template.advertisedCapabilities.includes(capability)));
}
```

And add the same condition to the `unsupported` check below it, so an explicitly requested `builder_*` workload is rejected rather than silently accepted:

```ts
    const unsupported = requested.filter(workloadId =>
      !AI_WORKLOADS[workloadId].orgRoutable
      || !AI_WORKLOADS[workloadId].requiredCapabilities.every(capability =>
        template.advertisedCapabilities.includes(capability)));
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run lib/ai tests/integration && npm run verify:types`
Expected: PASS. `lib/ai/__tests__/resolver-phase1.test.ts` and `resolver-connectors.test.ts` must still pass — they use `assistant`, which stays routable.

- [ ] **Step 8: Commit**

```bash
git add lib/ai lib/schemas lib/api/repositories/ai-settings.ts app/api/org tests/integration
git commit -m "feat(ai): enforce the builder workload routing boundary at every consumer"
```

---

# Task 3: The rate table

**Why:** `reported_cost` is populated only when a provider volunteers it. OpenRouter does; a direct Anthropic call does not. Without a rate table, platform-default spend has token counts and no dollars.

**Files:**
- Create: `lib/ai/rates.ts`
- Test: `lib/ai/__tests__/rates.test.ts` (create)

**Interfaces:**
- Consumes: `AI_MODELS` from `lib/ai/models.ts`; `AI_WORKLOADS` from `lib/ai/workloads.ts`.
- Produces:
  - `RATE_VERSION: string`
  - `type ModelRate = { inputPerMTok: number; cachedPerMTok: number; outputPerMTok: number }`
  - `MODEL_RATES: Readonly<Record<string, ModelRate>>`
  - `type PricedUsage = { inputTokens: number; outputTokens: number; cachedInputTokens?: number }`
  - `priceFor(model: string, usage: PricedUsage): { cost: number; rateVersion: string } | null` — null when the model has no rate.

- [ ] **Step 1: Write the failing test**

Create `lib/ai/__tests__/rates.test.ts`:

```ts
// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { MODEL_RATES, RATE_VERSION, priceFor } from '@/lib/ai/rates';
import { AI_MODELS } from '@/lib/ai/models';
import { AI_WORKLOADS } from '@/lib/ai/workloads';

describe('rate coverage guard', () => {
  // A platform-default model shipping without a rate would record spend the
  // platform pays for as costing nothing.
  it('prices every platform-default model', () => {
    const models = new Set<string>([
      ...Object.values(AI_MODELS),
      ...Object.values(AI_WORKLOADS)
        .filter(workload => !workload.orgRoutable)
        .map(workload => workload.platformDefault.model),
    ]);
    for (const model of models) {
      expect(MODEL_RATES[model], `${model} has no rate`).toBeDefined();
    }
  });

  it('states a rate version', () => {
    expect(RATE_VERSION).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('priceFor', () => {
  it('prices input and output at the published rates', () => {
    // 1M input at $5 + 1M output at $25 on Opus 5.
    const priced = priceFor('claude-opus-5', { inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(priced?.cost).toBeCloseTo(30, 6);
    expect(priced?.rateVersion).toBe(RATE_VERSION);
  });

  // Cached tokens are a SUBSET of input tokens, not an addition. Adding them
  // would double-bill every OpenRouter call.
  it('discounts cached tokens rather than adding them', () => {
    const priced = priceFor('claude-opus-5', {
      inputTokens: 1_000_000,
      cachedInputTokens: 1_000_000,
      outputTokens: 0,
    });
    // All input was a cache read: 1M x $0.50, not 1M x $5 + 1M x $0.50.
    expect(priced?.cost).toBeCloseTo(0.5, 6);
  });

  it('prices the uncached remainder at the full input rate', () => {
    const priced = priceFor('claude-opus-5', {
      inputTokens: 1_000_000,
      cachedInputTokens: 400_000,
      outputTokens: 0,
    });
    // 600k x $5/M + 400k x $0.50/M = 3.00 + 0.20
    expect(priced?.cost).toBeCloseTo(3.2, 6);
  });

  it('returns null for a model with no rate', () => {
    expect(priceFor('some-unknown-model', { inputTokens: 100, outputTokens: 100 })).toBeNull();
  });

  it('prices a zero-token call as zero, not null', () => {
    expect(priceFor('claude-opus-5', { inputTokens: 0, outputTokens: 0 })?.cost).toBe(0);
  });

  it('never returns a negative cost when cached exceeds input', () => {
    const priced = priceFor('claude-opus-5', {
      inputTokens: 100,
      cachedInputTokens: 5_000,
      outputTokens: 0,
    });
    expect(priced?.cost).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/ai/__tests__/rates.test.ts`
Expected: FAIL — `lib/ai/rates.ts` does not exist.

- [ ] **Step 3: Write the rate table**

Create `lib/ai/rates.ts`:

```ts
// lib/ai/rates.ts
// Per-model list prices, in USD per million tokens, used to price calls the
// provider does not report a cost for. Rates live in code so the coverage
// guard can check them at build time and so a price change is reviewed.

export type ModelRate = {
  inputPerMTok: number;
  /** Cache-read rate. A tenth of input for Anthropic models. */
  cachedPerMTok: number;
  outputPerMTok: number;
};

export type PricedUsage = {
  inputTokens: number;
  outputTokens: number;
  /** A SUBSET of inputTokens, never an addition. */
  cachedInputTokens?: number;
};

/**
 * Bumped whenever any rate changes. Stored on every row priced under it so a
 * historical figure can be traced to the table that produced it.
 */
export const RATE_VERSION = '2026-08';

/**
 * Sonnet 5 is deliberately at standard pricing, not its introductory
 * $2 / $10 which expires 2026-08-31. Over-pricing is the safe direction:
 * under-pricing would let a future spend cap pass spend it should stop.
 */
export const MODEL_RATES: Readonly<Record<string, ModelRate>> = {
  'claude-opus-5': { inputPerMTok: 5, cachedPerMTok: 0.5, outputPerMTok: 25 },
  'claude-sonnet-5': { inputPerMTok: 3, cachedPerMTok: 0.3, outputPerMTok: 15 },
};

const PER_MTOK = 1_000_000;

export function priceFor(
  model: string,
  usage: PricedUsage,
): { cost: number; rateVersion: string } | null {
  const rate = MODEL_RATES[model];
  if (!rate) return null;

  // Cached tokens are already counted in inputTokens by the OpenAI-compatible
  // connectors, so they are subtracted rather than added. Clamped at zero
  // because a provider reporting more cached than total must not yield a
  // negative charge.
  const cached = Math.min(usage.cachedInputTokens ?? 0, usage.inputTokens);
  const billableInput = Math.max(usage.inputTokens - cached, 0);

  const cost =
    (billableInput * rate.inputPerMTok
      + cached * rate.cachedPerMTok
      + usage.outputTokens * rate.outputPerMTok) / PER_MTOK;

  return { cost, rateVersion: RATE_VERSION };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/ai/__tests__/rates.test.ts && npm run verify:types`
Expected: PASS (8 tests)

- [ ] **Step 5: Verify the coverage guard actually bites**

Temporarily delete the `claude-sonnet-5` entry from `MODEL_RATES` and run:

Run: `npx vitest run lib/ai/__tests__/rates.test.ts`
Expected: FAIL with `claude-sonnet-5 has no rate`. Restore the entry and re-run to confirm PASS.

A guard that has never been seen to fail is not known to work.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/rates.ts lib/ai/__tests__/rates.test.ts
git commit -m "feat(ai): add the per-model rate table and pricing function"
```

---

# Task 4: Fold the usage log migration and add the cost columns

**Why:** `0057` patches `ai_usage_log` with twenty-odd `ADD COLUMN IF NOT EXISTS` statements and a conditional `RENAME`. Per the prerelease protocol those belong in the concept's owning migration. The three cost columns land in the same fold.

**The fold cannot be total.** Four of `0057`'s columns carry foreign keys to tables that do not exist when `0030` runs: `route_id`, `connection_id` and `deployment_id` reference tables `0057` creates, and `turn_id` references `ai_turns`, created in `0033`. Those four stay in `0057`.

**Files:**
- Modify: `db/migrations/0030_ai_usage_log.sql`
- Modify: `db/migrations/0057_org_ai_runtime.sql`
- Modify: `lib/database.types.ts` (regenerated)
- Test: `tests/integration/ai-usage-log-schema.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `ai_usage_log` gains `computed_cost numeric`, `cost_source text NOT NULL DEFAULT 'unpriced'`, `rate_version text`.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/ai-usage-log-schema.test.ts`:

```ts
// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const OWNER = readFileSync(join(ROOT, 'db/migrations/0030_ai_usage_log.sql'), 'utf8');
const RUNTIME = readFileSync(join(ROOT, 'db/migrations/0057_org_ai_runtime.sql'), 'utf8');

describe('ai_usage_log owning migration', () => {
  it('declares the cost columns', () => {
    expect(OWNER).toMatch(/computed_cost\s+numeric/);
    expect(OWNER).toMatch(/cost_source\s+text NOT NULL DEFAULT 'unpriced'/);
    expect(OWNER).toMatch(/CHECK \(cost_source IN \('reported','computed','unpriced'\)\)/);
    expect(OWNER).toMatch(/rate_version\s+text/);
  });

  it('declares requested_model natively rather than renaming it later', () => {
    expect(OWNER).toMatch(/requested_model\s+text NOT NULL/);
    expect(RUNTIME).not.toMatch(/RENAME COLUMN model TO requested_model/);
  });

  it('absorbs the plain provider-neutral columns', () => {
    for (const column of ['scope_kind', 'workload_id', 'operation', 'connector', 'resolved_model', 'policy_hash', 'latency_ms']) {
      expect(OWNER, `${column} should be declared in 0030`).toMatch(new RegExp(`${column}\\s+text|${column}\\s+integer`));
      expect(RUNTIME, `${column} should not be patched in 0057`)
        .not.toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${column}\\b`));
    }
  });

  // These four reference tables created in 0033 and 0057, so they cannot be
  // declared in 0030 — the fold is deliberately partial.
  it('leaves the foreign-key columns in 0057', () => {
    for (const column of ['route_id', 'connection_id', 'deployment_id', 'turn_id']) {
      expect(RUNTIME, `${column} must stay in 0057`)
        .toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`));
    }
  });

  it('declares user_id nullable from the start', () => {
    expect(RUNTIME).not.toMatch(/ALTER COLUMN user_id DROP NOT NULL/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/ai-usage-log-schema.test.ts`
Expected: FAIL — `0030` declares neither the cost columns nor the folded ones.

- [ ] **Step 3: Rewrite the owning migration**

Replace the `CREATE TABLE` in `db/migrations/0030_ai_usage_log.sql` with the full definition. Keep the file's existing indexes, RLS enable, policies and grants below it, and add the `0057` indexes that do not reference later tables:

```sql
CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id                uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  portfolio_id          uuid REFERENCES public.portfolios(id) ON DELETE SET NULL,
  session_id            uuid,
  scope_kind            text NOT NULL DEFAULT 'platform'
                          CHECK (scope_kind IN ('organization', 'platform')),
  workload_id           text NOT NULL DEFAULT 'assistant',
  operation             text NOT NULL DEFAULT 'tool_conversation'
                          CHECK (operation IN ('text_generation', 'structured_generation', 'tool_conversation', 'transcription')),
  connector             text NOT NULL DEFAULT 'anthropic',
  model_vendor          text,
  requested_model       text NOT NULL,
  resolved_model        text,
  resolved_provider     text,
  provider_request_id   text,
  input_tokens          integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens         integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  total_tokens          integer GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  cached_input_tokens   integer NOT NULL DEFAULT 0 CHECK (cached_input_tokens >= 0),
  reasoning_tokens      integer NOT NULL DEFAULT 0 CHECK (reasoning_tokens >= 0),
  audio_input_tokens    integer NOT NULL DEFAULT 0 CHECK (audio_input_tokens >= 0),
  audio_output_tokens   integer NOT NULL DEFAULT 0 CHECK (audio_output_tokens >= 0),
  -- Provider-reported cost when the provider supplies one; otherwise computed
  -- from the rate table at write time and frozen with its version.
  reported_cost         numeric,
  computed_cost         numeric,
  cost_source           text NOT NULL DEFAULT 'unpriced'
                          CHECK (cost_source IN ('reported','computed','unpriced')),
  rate_version          text,
  cost_currency         text,
  latency_ms            integer NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  status                text NOT NULL DEFAULT 'succeeded'
                          CHECK (status IN ('succeeded', 'failed', 'aborted', 'timed_out')),
  error_code            text,
  target_position       integer NOT NULL DEFAULT 0 CHECK (target_position >= 0),
  policy_snapshot       jsonb NOT NULL DEFAULT '{}'::jsonb
                          CHECK (jsonb_typeof(policy_snapshot) = 'object'),
  policy_hash           text,
  started_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_usage_log_scope_org_check
    CHECK (scope_kind = 'platform' OR org_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS ai_usage_log_org_workload_created_idx
  ON public.ai_usage_log(org_id, workload_id, created_at DESC);
```

- [ ] **Step 4: Reduce the 0057 patch block**

In `db/migrations/0057_org_ai_runtime.sql`, delete the `user_id` constraint drop/re-add, the conditional `RENAME` `DO` block, and every `ADD COLUMN IF NOT EXISTS` and `ADD CONSTRAINT` now declared in `0030`. Replace the block with only the four FK columns:

```sql
-- Columns whose foreign keys reference tables created in 0033 and here, so
-- they cannot be declared in 0030 where the rest of the table lives.
ALTER TABLE public.ai_usage_log
  ADD COLUMN IF NOT EXISTS route_id uuid REFERENCES public.org_ai_routes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS connection_id uuid REFERENCES public.org_ai_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deployment_id uuid REFERENCES public.org_ai_deployments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS turn_id uuid REFERENCES public.ai_turns(id) ON DELETE SET NULL;
```

Keep `0057`'s `ai_usage_log_turn_id_idx` and `ai_usage_log_deployment_created_idx` indexes and its policy replacements where they are — they depend on these columns.

- [ ] **Step 5: Rebuild the database and regenerate types**

Run: `npm run verify:migrations`
Expected: PASS. This is the destructive reset described in the plan's prerequisite; it rebuilds from `0001` and proves the fold produces the same end state.

Run: `npm run db:types:generate`
Expected: `lib/database.types.ts` gains `computed_cost`, `cost_source` and `rate_version` on `ai_usage_log` and is otherwise unchanged. Inspect the diff — anything beyond those three columns means the fold changed the schema rather than reorganising it.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/integration/ai-usage-log-schema.test.ts && npm run verify:types`
Expected: PASS

- [ ] **Step 7: Close the Phase 2B criterion**

`verify:migrations` passing also satisfies the outstanding exit criterion in `docs/agent-work/plans/2026-08-23-phase2b-evaluation-suite.md`. Tick it:

```
- [x] `npm run verify:migrations` passes from a clean local Supabase reset
```

- [ ] **Step 8: Commit**

```bash
git add db/migrations lib/database.types.ts tests/integration/ai-usage-log-schema.test.ts docs/agent-work/plans/2026-08-23-phase2b-evaluation-suite.md
git commit -m "refactor(db): fold the usage log patch into its owning migration and add cost columns"
```

---

# Task 5: Price the row at write time

**Why:** The recorder writes token counts and whatever cost the provider volunteered. With the rate table in place it can freeze a dollar figure and the rate version that produced it.

**Files:**
- Modify: `lib/api/repositories/ai-invocations.ts`
- Test: `lib/api/repositories/__tests__/ai-invocations-pricing.test.ts` (create)

**Interfaces:**
- Consumes: `priceFor`, `RATE_VERSION` from Task 3; `AIInvocationRecord` from `lib/ai/execution.ts`.
- Produces: `resolveCost(record): { reported_cost, computed_cost, cost_source, rate_version, cost_currency }`, exported from `lib/api/repositories/ai-invocations.ts` so it is testable without a database.

- [ ] **Step 1: Write the failing test**

Create `lib/api/repositories/__tests__/ai-invocations-pricing.test.ts`:

```ts
// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { resolveCost } from '@/lib/api/repositories/ai-invocations';
import { RATE_VERSION } from '@/lib/ai/rates';

function record(overrides: Record<string, unknown> = {}) {
  return {
    requestedModel: 'claude-opus-5',
    resolvedModel: undefined,
    usage: { inputTokens: 1_000_000, outputTokens: 0 },
    ...overrides,
  } as never;
}

describe('resolveCost', () => {
  it('prefers the provider-reported figure when present', () => {
    const cost = resolveCost(record({ reportedCost: 0.42, costCurrency: 'USD' }));
    expect(cost.cost_source).toBe('reported');
    expect(cost.reported_cost).toBe(0.42);
    expect(cost.computed_cost).toBeNull();
  });

  it('computes from the rate table when the provider reports nothing', () => {
    const cost = resolveCost(record());
    expect(cost.cost_source).toBe('computed');
    expect(cost.computed_cost).toBeCloseTo(5, 6);
    expect(cost.rate_version).toBe(RATE_VERSION);
    expect(cost.cost_currency).toBe('USD');
  });

  it('prices the resolved model when it differs from the requested one', () => {
    const cost = resolveCost(record({
      requestedModel: 'anthropic/claude-sonnet-5',
      resolvedModel: 'claude-sonnet-5',
    }));
    expect(cost.cost_source).toBe('computed');
    expect(cost.computed_cost).toBeCloseTo(3, 6);
  });

  it('records unpriced rather than guessing for an unknown model', () => {
    const cost = resolveCost(record({ requestedModel: 'some-unknown-model' }));
    expect(cost.cost_source).toBe('unpriced');
    expect(cost.computed_cost).toBeNull();
    expect(cost.rate_version).toBeNull();
  });

  it('records unpriced when there is no usage at all', () => {
    const cost = resolveCost(record({ usage: undefined }));
    expect(cost.cost_source).toBe('unpriced');
  });

  it('applies the cache discount from reported cached tokens', () => {
    const cost = resolveCost(record({
      usage: { inputTokens: 1_000_000, cachedInputTokens: 1_000_000, outputTokens: 0 },
    }));
    expect(cost.computed_cost).toBeCloseTo(0.5, 6);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/api/repositories/__tests__/ai-invocations-pricing.test.ts`
Expected: FAIL — `resolveCost` is not exported.

- [ ] **Step 3: Add the cost resolver**

In `lib/api/repositories/ai-invocations.ts`, above `createAIInvocationRecorder`:

```ts
import { priceFor } from '@/lib/ai/rates';
import type { AIInvocationRecord } from '@/lib/ai/execution';

export type ResolvedCost = {
  reported_cost: number | null;
  computed_cost: number | null;
  cost_source: 'reported' | 'computed' | 'unpriced';
  rate_version: string | null;
  cost_currency: string | null;
};

/**
 * A provider-reported figure is what the account was actually charged, so it
 * always wins. The rate table is the fallback for providers that report
 * nothing — a direct Anthropic call, for instance. Unknown models are recorded
 * as unpriced rather than guessed.
 */
export function resolveCost(record: AIInvocationRecord): ResolvedCost {
  if (record.reportedCost !== undefined && record.reportedCost !== null) {
    return {
      reported_cost: record.reportedCost,
      computed_cost: null,
      cost_source: 'reported',
      rate_version: null,
      cost_currency: record.costCurrency ?? 'USD',
    };
  }

  // Price what actually ran when the provider resolved a different model.
  const model = record.resolvedModel ?? record.requestedModel;
  const priced = record.usage ? priceFor(model, record.usage) : null;
  if (!priced) {
    return {
      reported_cost: null,
      computed_cost: null,
      cost_source: 'unpriced',
      rate_version: null,
      cost_currency: null,
    };
  }

  return {
    reported_cost: null,
    computed_cost: priced.cost,
    cost_source: 'computed',
    rate_version: priced.rateVersion,
    cost_currency: 'USD',
  };
}
```

- [ ] **Step 4: Use it in the insert**

In the recorder's `db.from('ai_usage_log').insert({ ... })`, replace the existing `reported_cost` and `cost_currency` lines with a spread:

```ts
      ...resolveCost(record),
```

Remove the now-duplicated `reported_cost: record.reportedCost ?? null` and `cost_currency: record.costCurrency ?? null` entries.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run lib/api lib/ai && npm run verify:types`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/api/repositories/ai-invocations.ts lib/api/repositories/__tests__/ai-invocations-pricing.test.ts
git commit -m "feat(ai): price every invocation at write time and freeze the rate version"
```

---

# Task 6: The Builder AI boundary

**Why:** Four call sites construct providers directly. Converting each in place would repeat scope construction, plan resolution and error mapping four times. A single module makes the carve-out one auditable place rather than four scattered ones.

**Files:**
- Create: `lib/builder/ai.ts`
- Test: `lib/builder/__tests__/builder-ai.test.ts` (create)

**Interfaces:**
- Consumes: `createAIExecutionGateway` from `lib/ai/runtime.ts`; `AIMessage`, `AIStreamChunk`, `ToolDefinition` from `lib/ai/types`.
- Produces from `lib/builder/ai.ts`:
  - `type BuilderScope = { orgId: string; actorId?: string }`
  - `builderChatStream(scope, input: { system: string; messages: AIMessage[]; tools: ToolDefinition[] }): AsyncIterable<AIStreamChunk>`
  - `builderPlan(scope, input: { system: string; prompt: string }): Promise<string>`
  - `builderBuild(scope, input: { system: string; prompt: string }): Promise<string>`
  - `builderReview(scope, input: { system: string; prompt: string }): Promise<string>`
  - Each accepts an optional `gateway` for tests.

- [ ] **Step 1: Write the failing test**

Create `lib/builder/__tests__/builder-ai.test.ts`:

```ts
// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { builderChatStream, builderPlan, builderBuild, builderReview } from '@/lib/builder/ai';

function fakeGateway(text = 'result') {
  const resolve = vi.fn().mockImplementation(async (workloadId: string) => ({
    workloadId,
    operation: 'text_generation',
    connector: 'anthropic',
    requestedModel: 'm',
    maxOutputTokens: 4096,
  }));
  return {
    resolve,
    generateText: vi.fn().mockResolvedValue({ text, response: {} }),
    streamToolConversation: vi.fn().mockImplementation(async function* () {
      yield { type: 'text_delta', text };
    }),
  };
}

const SCOPE = { orgId: 'org-1', actorId: 'user-1' };

describe('builder AI boundary', () => {
  it('resolves each phase on its own workload', async () => {
    const cases = [
      [builderPlan, 'builder_plan'],
      [builderBuild, 'builder_build'],
      [builderReview, 'builder_review'],
    ] as const;

    for (const [fn, workloadId] of cases) {
      const gateway = fakeGateway();
      await fn(SCOPE, { system: 's', prompt: 'p' }, gateway as never);
      expect(gateway.resolve).toHaveBeenCalledWith(workloadId);
    }
  });

  it('streams chat on the builder_chat workload', async () => {
    const gateway = fakeGateway('hello');
    const chunks = [];
    for await (const chunk of builderChatStream(
      SCOPE,
      { system: 's', messages: [{ role: 'user', content: 'hi' }], tools: [] },
      gateway as never,
    )) chunks.push(chunk);

    expect(gateway.resolve).toHaveBeenCalledWith('builder_chat');
    expect(chunks).toHaveLength(1);
  });

  it('returns the generated text', async () => {
    const gateway = fakeGateway('a plan');
    await expect(builderPlan(SCOPE, { system: 's', prompt: 'p' }, gateway as never))
      .resolves.toBe('a plan');
  });

  it('scopes execution to the organization so spend is attributable', async () => {
    const gateway = fakeGateway();
    await builderBuild(SCOPE, { system: 's', prompt: 'p' }, gateway as never);
    expect(gateway.generateText).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/builder/__tests__/builder-ai.test.ts`
Expected: FAIL — `lib/builder/ai.ts` does not exist.

- [ ] **Step 3: Write the boundary module**

Create `lib/builder/ai.ts`:

```ts
// lib/builder/ai.ts
// The only place Builder touches the AI gateway. Every Builder model call is
// attributed to an organization and metered through the shared recorder;
// nothing here constructs a provider directly.

import { createAIExecutionGateway } from '@/lib/ai/runtime';
import type { AIMessage, AIStreamChunk, ToolDefinition } from '@/lib/ai/types';

export type BuilderScope = {
  orgId: string;
  /** Absent for queued scaffold work, which runs with no user present. */
  actorId?: string;
};

type Gateway = ReturnType<typeof createAIExecutionGateway>;

function gatewayFor(scope: BuilderScope): Gateway {
  return createAIExecutionGateway({
    kind: 'organization',
    orgId: scope.orgId,
    actorId: scope.actorId,
  });
}

async function generate(
  scope: BuilderScope,
  workloadId: 'builder_plan' | 'builder_build' | 'builder_review',
  input: { system: string; prompt: string },
  gateway?: Gateway,
): Promise<string> {
  const active = gateway ?? gatewayFor(scope);
  const plan = await active.resolve(workloadId);
  const { text } = await active.generateText(plan, {
    system: input.system,
    messages: [{ role: 'user', content: input.prompt }],
  });
  return text;
}

export function builderPlan(
  scope: BuilderScope,
  input: { system: string; prompt: string },
  gateway?: Gateway,
): Promise<string> {
  return generate(scope, 'builder_plan', input, gateway);
}

export function builderBuild(
  scope: BuilderScope,
  input: { system: string; prompt: string },
  gateway?: Gateway,
): Promise<string> {
  return generate(scope, 'builder_build', input, gateway);
}

export function builderReview(
  scope: BuilderScope,
  input: { system: string; prompt: string },
  gateway?: Gateway,
): Promise<string> {
  return generate(scope, 'builder_review', input, gateway);
}

export async function* builderChatStream(
  scope: BuilderScope,
  input: { system: string; messages: AIMessage[]; tools: ToolDefinition[] },
  gateway?: Gateway,
): AsyncIterable<AIStreamChunk> {
  const active = gateway ?? gatewayFor(scope);
  const plan = await active.resolve('builder_chat');
  for await (const chunk of active.streamToolConversation(plan, {
    system: input.system,
    messages: input.messages,
    tools: input.tools,
  })) {
    yield chunk;
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/builder/__tests__/builder-ai.test.ts && npm run verify:types`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/builder/ai.ts lib/builder/__tests__/builder-ai.test.ts
git commit -m "feat(builder): add the Builder AI boundary module"
```

---

# Task 7: Convert the four call sites

**Why:** The boundary exists but nothing uses it. Until these four sites change, Builder's spend is still unattributed and `createAIProvider` still has four callers.

**Files:**
- Modify: `app/api/org/[orgId]/builder/chat/route.ts:69`
- Modify: `lib/builder/tools.ts:1905`
- Modify: `lib/builder/scaffold-worker.ts:494` and `:528`
- Test: `tests/integration/builder-no-provider-bypass.test.ts` (create)

**Interfaces:**
- Consumes: `builderChatStream`, `builderPlan`, `builderBuild`, `builderReview` from Task 6.
- Produces: no new exports. `createAIProvider` has exactly two references after this task.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/builder-no-provider-bypass.test.ts`:

```ts
// @vitest-environment node

import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');

function callersOf(symbol: string): string[] {
  const output = execSync(
    `grep -rn "${symbol}(" lib app --include=*.ts --include=*.tsx || true`,
    { cwd: ROOT, encoding: 'utf8' },
  );
  return output.split('\n').filter(Boolean).filter(line => !line.includes('__tests__'));
}

describe('no provider bypass', () => {
  // After Phase 3A the only sanctioned caller is the Builder boundary. Any
  // other hit is a path whose spend is invisible.
  it('confines createAIProvider to the factory and the Builder boundary', () => {
    const offenders = callersOf('createAIProvider')
      .filter(line => !line.startsWith('lib/ai/factory.ts'))
      .filter(line => !line.startsWith('lib/builder/ai.ts'));
    expect(offenders, `unmetered provider construction:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('routes builder call sites through the boundary', () => {
    const boundaryUsers = callersOf('builderPlan')
      .concat(callersOf('builderBuild'))
      .concat(callersOf('builderReview'))
      .concat(callersOf('builderChatStream'));
    expect(boundaryUsers.length).toBeGreaterThanOrEqual(4);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/builder-no-provider-bypass.test.ts`
Expected: FAIL, listing four offenders — the chat route, `tools.ts`, and both `scaffold-worker.ts` sites.

- [ ] **Step 3: Convert the planning call in tools.ts**

`orgId` and `userId` are already in scope at `lib/builder/tools.ts:1905`. Replace `const provider = createAIProvider();` and the subsequent generation call with:

```ts
        const planText = await builderPlan(
          { orgId, actorId: userId },
          { system: planningSystemPrompt, prompt: planningUserPrompt },
        );
```

Use `planText` wherever the previous response text was consumed, and remove the `createAIProvider` import if it becomes unused.

- [ ] **Step 4: Thread the organization into the scaffold worker**

`ScaffoldBuildJobData` carries `orgId` (`lib/builder/scaffold-worker.ts:54`) but the two generation helpers do not receive it. Add it to both signatures:

```ts
async function generateFilesFromPlan(
  supabase: ReturnType<typeof createElevatedClient>,
  orgId: string,
  revisionId: string,
  planContent: ScaffoldPlanContent
): Promise<ProposalFile[]> {
```

```ts
async function runModelReview(
  orgId: string,
  planContent: ScaffoldPlanContent | null,
  authoritativeDiff: string | null
): Promise<{ promptText: string; rawResponse: string }> {
```

Pass `orgId` from the job data at both call sites.

- [ ] **Step 5: Convert both scaffold worker calls**

In `generateFilesFromPlan`, replace the provider construction and per-file generation with:

```ts
    const content = await builderBuild(
      { orgId },
      { system: systemPrompt, prompt: userPrompt },
    );
```

In `runModelReview`, the system prompt is an inline string on the existing provider call — `'You are a senior code reviewer. Return only valid JSON.'`. Carry it across verbatim:

```ts
  const rawResponse = await builderReview(
    { orgId },
    {
      system: 'You are a senior code reviewer. Return only valid JSON.',
      prompt: promptText,
    },
  );
```

The function already returns `{ promptText, rawResponse }`, so its signature is unchanged apart from the new `orgId` parameter.

Neither passes `actorId`: a queued job has no user present, so those rows carry `user_id: null`, which the schema permits.

- [ ] **Step 6: Convert the chat route**

In `app/api/org/[orgId]/builder/chat/route.ts`, replace `const provider = createAIProvider();` and the `provider.createStream({...})` call inside the loop with:

```ts
          const aiStream = builderChatStream(
            { orgId, actorId: userId },
            { system: systemPrompt, messages: currentMessages, tools: BUILDER_TOOLS as ToolDefinition[] },
          );
```

The chunk shapes are the same `AIStreamChunk` union the route already consumes.

The route's existing `catch` sends an error event through its local `send` helper. Widen it so a typed gateway failure carries its code, which the raw SDK error had no equivalent for:

```ts
      } catch (error) {
        send({
          type: 'error',
          message: error instanceof Error ? error.message : 'Builder request failed',
          ...(error instanceof AIExecutionError ? { code: error.code } : {}),
        });
      }
```

Import `AIExecutionError` from `@/lib/ai/execution`. Keep whatever event `type` string the route already uses rather than introducing a new one.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/integration lib/builder && npm run verify:types && npm run verify:build`
Expected: PASS. `tests/integration/builder-ship-retired.test.ts` and the other Builder suites must stay green.

- [ ] **Step 8: Commit**

```bash
git add app/api/org lib/builder tests/integration
git commit -m "feat(builder): route every model call through the metered gateway"
```

---

# Task 8: Amend the carve-out and cover it with the contract test

**Why:** `CLAUDE.md` and `AGENTS.md` still say Builder "retains its dedicated provider/model configuration," which is now false. And the contract test that supposedly keeps the two files aligned covers only two marked sections — the AI carve-out at `AGENTS.md:353` / `CLAUDE.md:377` is outside both, so those copies can drift silently today.

**Files:**
- Modify: `AGENTS.md`, `CLAUDE.md`
- Modify: `tests/integration/agent-instructions-contract.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a third marker pair, `<!-- ai-execution-protocol:start -->` / `<!-- ai-execution-protocol:end -->`, present and identical in both files.

- [ ] **Step 1: Write the failing test**

Add to `tests/integration/agent-instructions-contract.test.ts`, following the existing `markedSection` pattern already in that file:

```ts
const AI_START = '<!-- ai-execution-protocol:start -->';
const AI_END = '<!-- ai-execution-protocol:end -->';

describe('agent AI execution instructions', () => {
  const agents = markedSection('AGENTS.md', AI_START, AI_END);
  const claude = markedSection('CLAUDE.md', AI_START, AI_END);

  it('keeps both copies identical', () => {
    expect(claude).toBe(agents);
  });

  it('names the Builder boundary rather than a blanket carve-out', () => {
    expect(agents).toMatch(/lib\/builder\/ai\.ts/);
    expect(agents).not.toMatch(/retain their dedicated provider\/model configuration/);
  });

  it('states that builder workloads are platform-only', () => {
    expect(agents).toMatch(/not routable|platform-only|never routed/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/agent-instructions-contract.test.ts`
Expected: FAIL — `markedSection` throws because neither file contains the new markers.

- [ ] **Step 3: Wrap and amend the section in AGENTS.md**

Wrap the AI execution section (from the `## AI Tool Development` heading through the carve-out paragraph at line 353) in the marker pair, and replace the final paragraph with:

```markdown
Builder executes through the same gateway as product code. Its four
workloads — `builder_chat`, `builder_plan`, `builder_build`,
`builder_review` — resolve platform defaults whose connector and model are
environment-configurable, and `lib/builder/ai.ts` is the only module that may
construct a provider directly. Builder workloads are never routable to an
organization deployment: routing them would move platform spend onto a
client's credential. Every Builder call is metered through
`ai_usage_log` like any other.
```

The replaced paragraph currently reads "Builder, constructor, and scaffold workers are separate development tooling and retain their dedicated provider/model configuration." Drop the reference to **constructor** entirely rather than carrying it forward: `app/api/constructor/chat/route.ts` does not call `createAIProvider`, so the current text grants an exception nothing uses. Confirm with `grep -n 'createAIProvider' app/api/constructor/chat/route.ts`, which should return nothing.

- [ ] **Step 4: Mirror it into CLAUDE.md**

Copy the marked section verbatim from `AGENTS.md` into `CLAUDE.md`, replacing the equivalent section. The test compares them byte for byte, so copy rather than retype.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/integration/agent-instructions-contract.test.ts`
Expected: PASS

- [ ] **Step 6: Run the full gate**

Run: `npm run verify:types && npm run verify:lint && npm run verify:unit && npm run verify:build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add AGENTS.md CLAUDE.md tests/integration/agent-instructions-contract.test.ts
git commit -m "docs: narrow the Builder carve-out and put it under contract test"
```

---

## Phase 3A exit criteria

- [ ] `npm run verify:types && npm run verify:lint && npm run verify:unit` all pass
- [ ] `npm run verify:migrations` passes from a clean local Supabase reset
- [ ] `npm run verify:build` passes
- [ ] The rate coverage guard fails when a platform-default model's rate is removed — verify by deleting one and re-running
- [ ] `grep -rn 'createAIProvider(' lib app` returns exactly two hits: `lib/ai/factory.ts` and `lib/builder/ai.ts`
- [ ] Manual check: run a Builder scaffold end to end and confirm `ai_usage_log` gains rows with the correct `org_id`, a `builder_*` `workload_id`, and a non-null `computed_cost`
- [ ] Manual check: confirm the AI models settings page no longer lists any `builder_*` workload in the routing section
