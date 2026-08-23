# Tenant Sovereignty & OS Constructor Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement Phase 1 task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Phases 2–6 are **briefs, not executable plans** — expand each into its own plan with superpowers:writing-plans before implementing it.

**Goal:** Take the platform from "a demo that breaks the moment a client brings their own API key" to a best-in-class operating-system constructor a foundation can own, inspect, extend, and export — starting with the Ford Foundation engagement.

**Architecture:** Ford gets a dedicated instance (app + Supabase project) that we host and they own. Ownership is made real through four capabilities layered in order: their own model credentials with full write access, transparent metering and spend caps, complete data + configuration export, and a Builder that carries changes from chat to merged, deployed code with verified evidence at every step.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (Postgres + RLS), BullMQ + Redis, Docker (verifier isolation), Anthropic + OpenRouter connectors, Vitest, Playwright.

**Spec:** This document's [Findings](#findings-the-evidence-behind-this-roadmap) section. Findings were verified against the tree at commit `7222c4dd` on 2026-08-16.

## Global Constraints

Every task's requirements implicitly include these. They are drawn from `CLAUDE.md` / `AGENTS.md` and are non-negotiable.

- `db/migrations` is the single source of truth. Read the owning migration before assuming any column, table, or function exists.
- The database is prerelease. A correction to an existing concept is folded into that concept's owning migration — **not** an `ALTER TABLE ... ADD COLUMN` patch. A genuinely new canonical concept gets a new numbered migration.
- Every migration change is followed by `npm run db:types:generate`, and `lib/database.types.ts` is committed with the migration.
- Org-scoped FK column is `org_id`, never `organization_id`. RLS helpers are `can_view_org`, `can_edit_org`, `is_org_admin`, `is_app_admin`, `user_org_role`, `org_has_module(p_org_id, p_module)`.
- Product code reaches data only through `lib/database-client.ts` and repository modules under `lib/api/repositories/`. No feature-local Supabase clients, no structural casts.
- Org-scoped mutations live under `app/api/org/[orgId]/**`, use shared access guards, and return `jsonOk` / `jsonError`.
- Browser data access goes through `lib/api/client.ts` and `lib/<domain>/hooks.ts`. Components never call raw `fetch` for domain data.
- Client-supplied org/portfolio IDs are routing inputs, never authority.
- Product AI execution enters through `lib/ai/runtime.ts` or an injected `AIExecutionGateway` with a stable workload from `lib/ai/workloads.ts`. Product code must not import `createAIProvider`, `AI_MODELS`, or provider SDKs. **Builder is the sanctioned exception** and keeps its own provider configuration (see Phase 3, which changes this deliberately).
- Durable AI turn semantics (`begin_ai_turn` / `complete_ai_turn` / `fail_ai_turn`, `ai_turns` request-ID idempotency, append-only `ai_messages`) must not be weakened.
- Verification gate for every task: `npm run verify:types`, `npm run verify:lint`, `npm run verify:unit`. Add `npm run verify:migrations` when `db/migrations/` changes and `npm run verify:build` when `app/`, `components/`, `middleware.ts`, or config files change.

---

## Scope note — read this before planning work

This roadmap spans six subsystems that do not share state and can each ship independently. Only **Phase 1** is decomposed to executable task granularity here, because it is small, urgent, and unblocks the demo. Phases 2–6 are **briefs**: goal, evidence, key files, exit criteria, and rough size. Each brief should be expanded into its own plan (via superpowers:writing-plans) when it is selected, so its tasks are written against the tree as it exists at that point rather than against today's guesses.

Writing all six as task-level plans now would produce detailed instructions for code that Phase 1 through Phase N-1 will have already changed.

---

## Findings: the evidence behind this roadmap

| # | Finding | Evidence | Phase |
|---|---|---|---|
| F1 | An org that routes a workload to its own model gets a **read-only assistant** — every write tool is stripped. | `lib/ai/catalog.ts:37,48` ship `verifiedWorkloads: {}`; the evaluate endpoint records only `result: 'conditional'` (`.../evaluate/route.ts:72`); the UI hardcodes `mutationTools: 'verified_only'` (`AIModelsSettings.tsx:139`); `lib/ai/resolver.ts:193` therefore yields `toolMode: 'read_only'`, and `portfolio-assistant.ts:142,316` filter out `WRITE_TOOLS`. | 1 |
| F2 | `GITHUB_TOKEN`, `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`, and `REDIS_URL` are read at runtime but absent from `.env.example` — a template-configured instance has a silently broken Builder. | `lib/builder/github-apply.ts:18-20`, `lib/builder/scaffold-worker.ts:49`; `.env.example` contains neither. | 1 |
| F3 | Platform default models are a generation behind, and the Anthropic connector forwards `temperature`, which **400s** on current models. | `lib/ai/models.ts` pins `claude-sonnet-4-6` / `claude-opus-4-7`; `lib/ai/providers/anthropic.ts:22,60` forward `config.temperature`; non-default values are set in `lib/ai/document-extractor.ts:164`, `lib/import/ai/client.ts:22,42`, `lib/import/ai/reconcile.ts:89`, `lib/import/ai/generate-report.ts:132`. | 1 |
| F4 | BYO credentials are OpenRouter-only; a direct Anthropic or OpenAI key cannot be added. | `lib/schemas/ai-settings.ts:49` is `z.literal('openrouter')`; `lib/ai/resolver.ts:159` and `lib/ai/runtime.ts:14` reject other connectors. | 2 |
| F5 | The "evaluation" that gates org deployments is a four-token smoke test, so no deployment can ever legitimately reach `passed`. | `.../evaluate/route.ts:56-72` asks the model to reply `BENE_OK` and records `evalSuiteVersion: 'phase1-compatibility-v1'`. | 2 |
| F6 | Builder bypasses the AI gateway at four call sites, so its model usage is **unmetered and uncapped**. | `lib/builder/tools.ts:1905`, `lib/builder/scaffold-worker.ts:494,528`, `app/api/org/[orgId]/builder/chat/route.ts:69` all call `createAIProvider()` directly; none writes to `ai_usage_log`. | 3 |
| F7 | Metering substrate already exists and is rich — per-org, per-workload, per-deployment, with `reported_cost`. Only Builder and the caps/dashboard layer are missing. | `db/migrations/0030_ai_usage_log.sql` + `0057_org_ai_runtime.sql:368-431`; recorder at `lib/api/repositories/ai-invocations.ts`. | 3 |
| F8 | There is no org-level data or configuration export. Existing exports are per-domain CSV; `scripts/export-client-package.ts` exports **source code**, not tenant data. | `find app/api -ipath '*export*'` returns only tax/grants/reports/QuickBooks/990-PF domain exports. | 4 |
| F9 | Builder code proposals cannot run in production: the digest-pinned verifier image has never been built or published, and production fails closed without it. | BLD-01, `docs/agent-work/BACKLOG.md`; `docs/engineering/BUILDER_OPERATIONS.md` § Increment 3b. | 5 |
| F10 | Builder stops at `pr_opened`. Merge and deploy state is tracked by hand, and there are **no webhook endpoints anywhere** in the app. | BLD-03; `find app/api -ipath '*webhook*'` returns nothing. | 6 |
| F11 | There is no migrations ledger — `scripts/run-migrations.sh` re-runs every file, and guarded DDL silently no-ops against an existing database. | `docs/engineering/BUILDER_OPERATIONS.md` § Dev/preview database reset requirement. | 4 |

---

# Phase 1 — Correctness (days, not weeks)

**Goal:** A Ford admin can add their own OpenRouter key and get a fully functional assistant, on current models, in an instance configured from the template with nothing silently missing.

Ship this before any Ford demo. Everything else can wait; these cannot.

---

### Task 1: Let an org grant write access to its own model deployment

**Why:** F1. Today, choosing your own model silently downgrades the assistant to read-only. The resolver already supports the escape hatch (`policy.mutationTools === 'allow_experimental'`) and the schema already accepts it — the UI just never sends it. This task surfaces it as a deliberate, informed opt-in.

We are **not** making the evaluate endpoint emit `passed`. A four-token smoke test does not justify a verification claim (F5); a real eval suite is Phase 2. This task gives the admin an explicit, auditable choice in the meantime.

**Files:**
- Modify: `components/settings/AIModelsSettings.tsx:125-170` (route save payload + routing section render)
- Create: `components/settings/__tests__/AIModelsSettings.write-access.test.tsx`

**Interfaces:**
- Consumes: `aiRoutePolicySchema` from `lib/schemas/ai-settings.ts` — `{ experimentalUseAccepted?: boolean; mutationTools?: 'verified_only' | 'allow_experimental'; fallbackOn?: (...)[]; provider?: {...} }`. Already accepts both `mutationTools` values; no schema change needed.
- Produces: no new exports. The `PUT /api/org/[orgId]/ai-settings/routes` payload gains a non-default `policy.mutationTools` value.

- [ ] **Step 1: Write the failing test**

Create `components/settings/__tests__/AIModelsSettings.write-access.test.tsx`:

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

const DEPLOYMENT_ID = '00000000-0000-4000-8000-000000000011';

beforeEach(() => {
  requestJson.mockClear();
  useApiData.mockReturnValue({
    isLoading: false,
    error: null,
    mutate: vi.fn(),
    data: {
      connections: [],
      deployments: [{
        id: DEPLOYMENT_ID,
        connection_id: '00000000-0000-4000-8000-000000000010',
        name: 'Ford Sonnet',
        status: 'active',
        catalog_template_id: 'openrouter-anthropic-claude-sonnet',
        verified_workloads: {},
      }],
      routes: [],
      workloads: [{ id: 'assistant', displayName: 'Assistant' }],
      catalog: [],
      usageSummary: {
        periodDays: 30, invocations: 0, failedInvocations: 0,
        inputTokens: 0, outputTokens: 0, reportedCost: 0,
      },
    },
  });
});

// The page renders three selects (connection, catalog, route), so the route
// select is addressed by its accessible name rather than by role alone.
function routeSelect() {
  return screen.getByLabelText('Assistant model');
}

function selectOwnDeployment() {
  render(<AIModelsSettings orgId="org-1" />);
  fireEvent.change(routeSelect(), { target: { value: DEPLOYMENT_ID } });
}

function savedRoutePolicy() {
  const call = requestJson.mock.calls.find(([url]) => String(url).endsWith('/ai-settings/routes'));
  if (!call) throw new Error('route save was not requested');
  return JSON.parse(call[1].body).policy;
}

describe('AIModelsSettings write-access opt-in', () => {
  it('defaults an org deployment to read-only tools', async () => {
    selectOwnDeployment();
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(savedRoutePolicy().mutationTools).toBe('verified_only'));
  });

  it('sends allow_experimental once the admin opts in', async () => {
    selectOwnDeployment();
    fireEvent.click(screen.getByLabelText(/allow this model to make changes/i));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(savedRoutePolicy().mutationTools).toBe('allow_experimental'));
  });

  it('hides the write-access control for the platform default', () => {
    render(<AIModelsSettings orgId="org-1" />);
    fireEvent.change(routeSelect(), { target: { value: 'platform_default' } });

    expect(screen.queryByLabelText(/allow this model to make changes/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/settings/__tests__/AIModelsSettings.write-access.test.tsx`
Expected: FAIL on all three — `Unable to find a label with the text of: Assistant model`, because the route select has no accessible name yet. After Step 5 adds it, the remaining failure should be the second test alone, unable to find the write-access checkbox.

- [ ] **Step 3: Add the state hook**

In `components/settings/AIModelsSettings.tsx`, alongside the existing `platformFallback` state declaration:

```tsx
const [writeAccess, setWriteAccess] = useState<Record<string, boolean>>({});
```

- [ ] **Step 4: Send the chosen policy**

Replace the hardcoded policy block at `AIModelsSettings.tsx:136-140`:

```tsx
          policy: {
            experimentalUseAccepted: selected !== 'platform_default',
            mutationTools: selected !== 'platform_default' && writeAccess[workload.id]
              ? 'allow_experimental'
              : 'verified_only',
          },
```

- [ ] **Step 5: Name the route select, then render the opt-in beside the existing fallback control**

The routing section's `<select>` has no accessible name, and the page renders two other selects. Add one so it is addressable — replace its opening tag:

```tsx
                  <select
                    aria-label={`${workload.displayName} model`}
                    className="w-full rounded border px-3 py-2 text-sm"
                    value={value}
                    onChange={event => setRouteChoices(current => ({ ...current, [workload.id]: event.target.value }))}
                  >
```

Then, immediately after the `Explicitly allow platform-funded fallback` label, inside the same `value && value !== 'platform_default'` guard:

```tsx
                      <label className="flex items-center gap-2 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={writeAccess[workload.id] ?? false}
                          onChange={event => setWriteAccess(current => ({ ...current, [workload.id]: event.target.checked }))}
                        />
                        Allow this model to make changes (unverified — the assistant is read-only without this)
                      </label>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run components/settings/__tests__/AIModelsSettings.write-access.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 7: Run the resolver contract suite for regressions**

Run: `npx vitest run lib/ai/__tests__/resolver-phase1.test.ts tests/integration/org-ai-settings-boundary.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add components/settings/AIModelsSettings.tsx components/settings/__tests__/AIModelsSettings.write-access.test.tsx
git commit -m "feat(ai-settings): let orgs grant write access to their own model deployment"
```

---

### Task 2: Make the env template complete, and keep it that way

**Why:** F2. An instance configured from `.env.example` has a Builder that cannot open pull requests and a worker that silently falls back to `redis://localhost:6379`. The guard test matters as much as the fix: this class of drift will recur every time someone adds a `process.env` read.

**Files:**
- Modify: `.env.example`
- Create: `tests/integration/env-template-contract.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing importable. The contract is `.env.example` documenting every server-side `process.env.X` read in `lib/`, `app/`, and `scripts/`.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/env-template-contract.test.ts`:

```ts
// @vitest-environment node

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const SCAN_DIRS = ['lib', 'app', 'scripts'];

/** Runtime-provided or test-only variables that must not be documented as client config. */
const EXEMPT = new Set([
  'NODE_ENV', 'CI', 'VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'PORT',
  'PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'SHELL', 'USER',
  'NO_COLOR', 'FORCE_COLOR', 'NEXT_TELEMETRY_DISABLED',
  'NODE_OPTIONS_SAFE_UNUSED', 'WALKTHROUGH_MODE',
]);

function sourceFiles(dir: string): string[] {
  const absolute = join(ROOT, dir);
  return readdirSync(absolute).flatMap((entry) => {
    const path = join(absolute, entry);
    if (statSync(path).isDirectory()) return sourceFiles(join(dir, entry));
    return /\.(ts|tsx|mjs)$/.test(entry) && !/\.test\.|__tests__/.test(path) ? [path] : [];
  });
}

function referencedVars(): Set<string> {
  const found = new Set<string>();
  for (const dir of SCAN_DIRS) {
    for (const file of sourceFiles(dir)) {
      for (const match of readFileSync(file, 'utf8').matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
        if (!EXEMPT.has(match[1])) found.add(match[1]);
      }
    }
  }
  return found;
}

describe('env template contract', () => {
  it('documents every environment variable the application reads', () => {
    const template = readFileSync(join(ROOT, '.env.example'), 'utf8');
    const undocumented = [...referencedVars()]
      .filter(name => !new RegExp(`^\\s*#?\\s*${name}=`, 'm').test(template))
      .sort();

    expect(undocumented, `Add these to .env.example: ${undocumented.join(', ')}`).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/env-template-contract.test.ts`
Expected: FAIL, listing at minimum `GITHUB_REPO_NAME`, `GITHUB_REPO_OWNER`, `GITHUB_TOKEN`, `REDIS_URL`. Record the full list — it may include others.

- [ ] **Step 3: Document the missing variables**

Append to `.env.example`:

```bash
# ==============================================================================
# BUILDER DELIVERY (Required for Builder code proposals to open pull requests)
# ==============================================================================
# Fine-grained PAT with Contents: Read and write + Pull requests: Read and write
# on the target repository. Without all three values, Builder proposals reach
# ready_to_apply and then fail at the apply step.

GITHUB_TOKEN=""
GITHUB_REPO_OWNER=""
GITHUB_REPO_NAME=""

# ==============================================================================
# BUILDER WORKER QUEUE (Required wherever the Builder worker runs)
# ==============================================================================
# BullMQ connection for `npm run builder:worker`. Defaults to
# redis://localhost:6379 when unset, which silently fails in a hosted instance.

REDIS_URL="redis://localhost:6379"
```

Then add any further variables the test reported, each under an appropriately named section with a one-line explanation of what breaks without it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/env-template-contract.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add .env.example tests/integration/env-template-contract.test.ts
git commit -m "fix(config): document Builder GitHub and Redis env vars, guard template drift"
```

---

### Task 3: Move platform defaults to current models and stop sending rejected parameters

**Why:** F3. `claude-sonnet-4-6` and `claude-opus-4-7` are a generation behind. The bump is not a one-line change: **`temperature` is rejected with a 400 on Claude Opus 5 and Claude Sonnet 5**, and the Anthropic connector forwards it from four separate call sites that set non-default values. Removing the parameter and changing the model IDs must land together, or every extraction, import, and reconciliation call starts failing.

Model IDs below are exact and complete — do not append date suffixes.

**Files:**
- Modify: `lib/ai/models.ts`
- Modify: `lib/ai/providers/anthropic.ts:22,60`
- Modify: `lib/ai/connectors/anthropic.ts:32,56,71,86`
- Modify: `lib/ai/document-extractor.ts:164`, `lib/import/ai/client.ts:22,42`, `lib/import/ai/reconcile.ts:89`, `lib/import/ai/generate-report.ts:132`
- Test: `lib/ai/__tests__/models.test.ts`, `lib/ai/__tests__/anthropic-connector.test.ts`

**Interfaces:**
- Consumes: `AIGenerationRequest` from `lib/ai/execution.ts` and `AIProviderConfig` from `lib/ai/provider.ts`; both currently declare an optional `temperature?: number`.
- Produces: `AI_MODELS` keeps its four keys (`assistant`, `scaffoldPlan`, `scaffoldBuild`, `scaffoldReview`) and its env-override behaviour. `temperature` is removed from `AIGenerationRequest` and `AIProviderConfig`, so any caller still setting it becomes a compile error rather than a runtime 400.

- [ ] **Step 1: Write the failing test**

Create `lib/ai/__tests__/models.test.ts` (or extend it if present):

```ts
// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { AI_MODELS } from '@/lib/ai/models';

describe('platform default models', () => {
  it('uses current-generation model identifiers', () => {
    expect(AI_MODELS.assistant).toBe('claude-opus-5');
    expect(AI_MODELS.scaffoldPlan).toBe('claude-opus-5');
    expect(AI_MODELS.scaffoldBuild).toBe('claude-sonnet-5');
    expect(AI_MODELS.scaffoldReview).toBe('claude-opus-5');
  });

  it('never carries a date suffix', () => {
    for (const id of Object.values(AI_MODELS)) {
      expect(id).not.toMatch(/-\d{8}$/);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/ai/__tests__/models.test.ts`
Expected: FAIL — received `claude-sonnet-4-6`, expected `claude-opus-5`.

- [ ] **Step 3: Update the model constants**

Replace the four defaults in `lib/ai/models.ts`, updating each `@default` doc comment to match:

```ts
  assistant: process.env.AI_MODEL_ASSISTANT ?? 'claude-opus-5',
  scaffoldPlan: process.env.AI_MODEL_SCAFFOLD_PLAN ?? 'claude-opus-5',
  scaffoldBuild: process.env.AI_MODEL_SCAFFOLD_BUILD ?? 'claude-sonnet-5',
  scaffoldReview: process.env.AI_MODEL_SCAFFOLD_REVIEW ?? 'claude-opus-5',
```

- [ ] **Step 4: Remove `temperature` from the request types**

Delete the `temperature?: number;` line from `lib/ai/provider.ts:18` and from `lib/ai/execution.ts:55`.

- [ ] **Step 5: Run the type checker to enumerate every affected call site**

Run: `npm run verify:types`
Expected: FAIL, with errors at `lib/ai/providers/anthropic.ts:22,60`, `lib/ai/connectors/anthropic.ts:32,56,71,86`, `lib/ai/connectors/openrouter.ts:172`, `lib/ai/document-extractor.ts:164`, `lib/import/ai/client.ts:22,42`, `lib/import/ai/reconcile.ts:89`, `lib/import/ai/generate-report.ts:132`, and `app/api/org/[orgId]/ai-settings/deployments/[deploymentId]/evaluate/route.ts:62`. Treat this list as the work queue for the next step.

- [ ] **Step 6: Delete every `temperature` line the type checker flagged**

Remove the property from each request object and each forwarded config — including the spread guard at `lib/ai/connectors/openrouter.ts:172` and the `temperature: options.temperature ?? 0.1` defaults in `lib/import/ai/client.ts`. Delete the now-unused `temperature?: number` field from `lib/import/ai/client.ts:10`. Determinism previously sought through `temperature: 0` is not lost in a way these callers depend on — `temperature: 0` never guaranteed identical outputs on any model.

- [ ] **Step 7: Run the type checker and the AI suite**

Run: `npm run verify:types && npx vitest run lib/ai lib/import`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add lib/ai lib/import app/api/org
git commit -m "feat(ai): move platform defaults to Claude Opus 5 / Sonnet 5 and drop rejected temperature"
```

---

### Task 4: Refresh the BYO deployment catalog

**Why:** F3, and the org-facing half of it. `lib/ai/catalog.ts` offers Ford exactly two choices — Claude Sonnet 4.5 and GPT-4o — both a generation behind what their key can reach.

**Files:**
- Modify: `lib/ai/catalog.ts`
- Test: `lib/ai/__tests__/catalog.test.ts` (create)

**Interfaces:**
- Consumes: `VerifiedDeploymentTemplate` — `{ id, connector, providerModelId, displayName, modelVendor, openWeight, versionPolicy, advertisedCapabilities, verifiedWorkloads, notes? }`, already exported from `lib/ai/catalog.ts`.
- Produces: `AI_DEPLOYMENT_CATALOG` gains entries. `getAIDeploymentTemplate(id)` keeps throwing on unknown IDs. **Existing template IDs must not change** — `org_ai_deployments.catalog_template_id` stores them, and `lib/ai/resolver.ts:163` throws if a stored ID no longer resolves.

- [ ] **Step 1: Confirm the provider slugs before writing them**

OpenRouter's model slugs are its own namespace and are not the same strings as Anthropic's first-party model IDs. Fetch the live list rather than guessing:

```bash
curl -s https://openrouter.ai/api/v1/models | jq -r '.data[].id' | grep -Ei 'anthropic/|openai/' | sort
```

Record the exact slugs for the current Anthropic and OpenAI flagships. Use those verbatim in Step 3; if the endpoint is unreachable, stop and ask rather than inventing a slug — a wrong `provider_model_id` fails at request time, after the admin has already saved the deployment.

- [ ] **Step 2: Write the failing test**

Create `lib/ai/__tests__/catalog.test.ts`:

```ts
// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { AI_DEPLOYMENT_CATALOG, getAIDeploymentTemplate } from '@/lib/ai/catalog';

describe('AI deployment catalog', () => {
  it('keeps template ids stable for already-stored deployments', () => {
    expect(() => getAIDeploymentTemplate('openrouter-anthropic-claude-sonnet')).not.toThrow();
    expect(() => getAIDeploymentTemplate('openrouter-openai-gpt-4o')).not.toThrow();
  });

  it('offers a current-generation option from each vendor', () => {
    const vendors = new Set(AI_DEPLOYMENT_CATALOG.map(t => t.modelVendor));
    expect(vendors).toContain('anthropic');
    expect(vendors).toContain('openai');
    expect(AI_DEPLOYMENT_CATALOG.length).toBeGreaterThanOrEqual(4);
  });

  it('declares tool and streaming capability on every assistant-eligible template', () => {
    for (const template of AI_DEPLOYMENT_CATALOG) {
      expect(template.advertisedCapabilities).toContain('tools');
      expect(template.advertisedCapabilities).toContain('streaming');
    }
  });

  it('makes no unearned verification claim', () => {
    for (const template of AI_DEPLOYMENT_CATALOG) {
      expect(template.verifiedWorkloads).toEqual({});
    }
  });
});
```

- [ ] **Step 3: Add the new templates**

Append to `AI_DEPLOYMENT_CATALOG` in `lib/ai/catalog.ts`, substituting the slugs recorded in Step 1 for `<slug>`. Leave the two existing entries untouched.

```ts
  {
    id: 'openrouter-anthropic-claude-opus-5',
    connector: 'openrouter',
    providerModelId: '<slug>',
    displayName: 'Claude Opus 5',
    modelVendor: 'anthropic',
    openWeight: false,
    versionPolicy: 'moving_alias',
    advertisedCapabilities: ['text', 'json', 'tools', 'streaming', 'parallel_tool_results'],
    verifiedWorkloads: {},
  },
  {
    id: 'openrouter-anthropic-claude-sonnet-5',
    connector: 'openrouter',
    providerModelId: '<slug>',
    displayName: 'Claude Sonnet 5',
    modelVendor: 'anthropic',
    openWeight: false,
    versionPolicy: 'moving_alias',
    advertisedCapabilities: ['text', 'json', 'tools', 'streaming', 'parallel_tool_results'],
    verifiedWorkloads: {},
  },
  {
    id: 'openrouter-openai-flagship',
    connector: 'openrouter',
    providerModelId: '<slug>',
    displayName: '<display name matching the slug>',
    modelVendor: 'openai',
    openWeight: false,
    versionPolicy: 'moving_alias',
    advertisedCapabilities: ['text', 'json', 'tools', 'streaming', 'parallel_tool_results'],
    verifiedWorkloads: {},
  },
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/ai/__tests__/catalog.test.ts lib/ai/__tests__/resolver-phase1.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/ai/catalog.ts lib/ai/__tests__/catalog.test.ts
git commit -m "feat(ai): add current-generation templates to the BYO deployment catalog"
```

---

### Phase 1 exit criteria

- [ ] `npm run verify:types && npm run verify:lint && npm run verify:unit` all pass
- [ ] `npm run verify:build` passes
- [ ] Manual check: add an OpenRouter connection, create a deployment, route the `assistant` workload to it with write access enabled, and confirm the assistant can complete a mutation (for example, creating a holding) end to end

---

# Phase 2 — Bring your own everything (1–2 weeks)

**Goal:** Ford can bring a key from any of the three providers they asked about, and the write-access decision rests on real evidence rather than an admin checkbox.

**Evidence:** F4, F5.

**Scope:**
1. **Direct Anthropic and OpenAI connectors.** Turn `aiConnectionCreateSchema.connector` into a discriminated union over `'openrouter' | 'anthropic' | 'openai'`, with a per-connector credential schema. `AnthropicConnector` already takes an injected `AIProvider` (`lib/ai/connectors/anthropic.ts:22`), so making it credential-aware is a constructor change, not a rewrite. Remove the connector guards at `lib/ai/resolver.ts:159` and `lib/ai/runtime.ts:14`. An OpenAI connector is new work; model it on `lib/ai/connectors/openrouter.ts`, which already speaks the OpenAI-compatible chat-completions shape.
2. **A real evaluation suite.** Replace the `BENE_OK` smoke test with per-workload behavioural evals — tool-call correctness, JSON-mode adherence, streaming, and refusal handling — that can legitimately emit `result: 'passed'` and let `lib/ai/resolver.ts:193` grant full tools on evidence. Version it properly (`evalSuiteVersion`) so the 90-day expiry in `currentVerificationResult` means something.
3. **Connection UX.** Provider picker, per-provider credential help, and a clear surface for what a given deployment is and is not verified for.

**Key files:** `lib/schemas/ai-settings.ts`, `lib/ai/connectors/*`, `lib/ai/resolver.ts`, `lib/ai/runtime.ts`, `app/api/org/[orgId]/ai-settings/**`, `components/settings/AIModelsSettings.tsx`, `lib/ai/catalog.ts`.

**Exit criteria:** An org admin can add an Anthropic key, an OpenAI key, or an OpenRouter key; run an evaluation that produces a real pass/fail per workload; and get full write tools without ticking an "unverified" box. Task 1's checkbox becomes the fallback path for models the suite has not yet covered, not the default path.

**Depends on:** Phase 1 Task 1 (establishes the policy plumbing end to end).

---

# Phase 3 — Metering, caps, and transparency (1–2 weeks)

**Goal:** Every model call in the platform — Builder included — is attributed to an org, priced, visible to that org, and bounded by a spend cap.

**Evidence:** F6, F7. You chose "platform key with metering and caps," and the substrate is already there: `ai_usage_log` carries `org_id`, `workload_id`, `connector`, `reported_cost`, and per-org indexes. The gap is that Builder does not use it.

**Scope:**
1. **Route Builder through the gateway.** Add a `builder` workload (or `builder_chat` / `builder_scaffold` pair) to `lib/ai/workloads.ts` and convert the four bypass sites (`lib/builder/tools.ts:1905`, `lib/builder/scaffold-worker.ts:494,528`, `app/api/org/[orgId]/builder/chat/route.ts:69`) to resolve through `createAIExecutionGateway`. This deliberately narrows the CLAUDE.md carve-out that lets Builder own its provider config — **update `CLAUDE.md` and `AGENTS.md` together**, since `tests/integration/agent-instructions-contract.test.ts` enforces that they match. Keep the platform-default connector as Builder's target so the cost still lands on your key; the point is attribution, not repricing.
2. **Cost model.** `reported_cost` is populated only when the provider reports it. Add a per-model rate table so platform-default Anthropic calls are priced too, and reconcile against provider invoices.
3. **Caps.** A per-org monthly spend ceiling checked before `begin_ai_turn` and before a Builder run is claimed, with a soft-warning threshold and a hard stop. Model it on the existing limiter pattern in `lib/api/rate-limit.ts`, but back it with `ai_usage_log` aggregates rather than Redis counters — spend must survive a Redis flush.
4. **Org-visible dashboard.** The four-tile summary in `AIModelsSettings.tsx:163-173` is the seed. Expand to per-workload, per-deployment, and per-user breakdowns with a time series. This is the "viewable" half of the sovereignty pitch and closes the admin AI usage dashboard item already in the backlog.
5. **Migration hygiene.** `0057_org_ai_runtime.sql:368-431` patches `ai_usage_log` with `ALTER TABLE ... ADD COLUMN`. Per the prerelease protocol, fold those columns into `0030_ai_usage_log.sql` while adding the cost fields.

**Exit criteria:** Ford's admin can see exactly what the platform spent on their behalf, broken down by workload; a configured cap stops new turns and new Builder runs when reached; and no model call in the codebase reaches a provider without writing an `ai_usage_log` row.

**Depends on:** nothing in Phase 2 — can run in parallel.

---

# Phase 4 — Tenant sovereignty: export, import, and portability (2–3 weeks)

**Goal:** Make "they own the full tech stack and DB" literally true. Ford can export everything — data, configuration, and schema — re-import it, and walk away with a running instance if they ever want to.

**Evidence:** F8, F11. This is the phase your positioning depends on and the one with the least existing code.

**Scope:**
1. **Full org export.** A job-backed export producing a signed, downloadable archive: every org-scoped table, the `organizations.modules` state, `org_custom_field_definitions` / `_values`, `kpi_definitions` / `metric_facts`, `widgets`, `org_view_config`, `configurable_automations`, `workflow_config`, `org_ai_context`, Builder history, and the storage buckets (`tax-documents`, `compliance-documents`, `builder-artifacts`). Manifest with per-file hashes, as `lib/builder/artifacts.ts` already does for revisions. It must be large-safe — stream it, do not buffer.
2. **Configuration export/import as a first-class artifact.** Separate from bulk data: a portable, human-readable description of *how this org's OS is configured*, which can be diffed, reviewed, version-controlled, and applied to another instance. This is what makes the constructor a constructor rather than a one-way settings panel, and it is what lets you carry a proven Ford configuration to the next client.
3. **Import.** Re-import into an empty org with referential integrity preserved and idempotency on retry.
4. **Schema transparency.** A read-only view of their own schema and migration state — part of "viewable," and the honest counterpart to hosting their database for them.
5. **A migrations ledger (F11).** Portability is a promise you cannot keep while `run-migrations.sh` re-runs every file and guarded DDL silently no-ops. An applied-migrations table with checksums, and a runner that refuses to apply a changed file that has already run, is a prerequisite for handing anyone a database they can upgrade.

**Key files:** new `lib/export/`, new `app/api/org/[orgId]/export/**`, `scripts/run-migrations.sh`, `scripts/migrate-client.ts`, new migration for the ledger.

**Exit criteria:** A full export of a populated org can be imported into a fresh instance and produce a functionally identical org. Re-running migrations against an up-to-date database is a no-op that says so, rather than silently doing nothing.

**Depends on:** nothing. Highest-value phase for the pitch; also the largest.

---

# Phase 5 — Builder in production (2–3 weeks)

**Goal:** Ford can ask Builder for a real code change and get a reviewed pull request against their instance's repository.

**Evidence:** F9, F2.

**Scope:**
1. **BLD-01.** Build `docker/builder-verifier/Dockerfile` from a trusted revision in CI, publish it under a digest reference, and set `BUILDER_VERIFIER_IMAGE` for production workers. Then run the container-backed verification suite. This is release-gate work, not feature work — the code is written and fails closed correctly; what is missing is the image and the pipeline.
2. **Per-instance delivery configuration.** Phase 1 Task 2 documents `GITHUB_TOKEN` / `GITHUB_REPO_OWNER` / `GITHUB_REPO_NAME`; this phase makes them a validated part of instance provisioning, with a preflight check that fails loudly at startup rather than at apply time.
3. **Worker deployment.** `docs/engineering/BUILDER_OPERATIONS.md` § Worker host requirements is explicit that a tarball deployment without a fetchable `origin` cannot verify anything. Production worker hosts need a real checkout, and the walkthrough-stack reset hazard needs an operational answer before a Ford proposal touching `db/migrations/` is ever verified.
4. **Operator UX.** Surface verification results, findings, and the review gate to a Ford admin in language they can act on.

**Exit criteria:** A Ford org admin submits a code proposal through Builder Studio, watches deterministic verification run in the isolated container, and opens a pull request from `ready_to_apply` — with every state traceable to a row in the five durable Builder tables.

**Depends on:** Phase 1 Task 2.

---

# Phase 6 — The autonomous loop (3–4 weeks)

**Goal:** Close the loop you asked for. A change goes from Builder conversation to merged and deployed, with the platform knowing — from provider evidence, not from a human clicking "done" — that it actually shipped.

**Evidence:** F10.

**Scope:**
1. **GitHub webhooks.** The first webhook endpoint in the codebase: HMAC-verified, replay-safe, idempotent on delivery ID. `pull_request` (merged/closed) and `check_suite` events write `builder_delivery_records` rows and drive `pr_opened -> merged`.
2. **Deploy evidence (BLD-03).** A deployment webhook or poller that records `deploy_pending` / `deploy_succeeded` / `deploy_failed` and drives `merged -> deployed`. `builder_delivery_records` already has the columns and the status vocabulary; nothing writes them today.
3. **Auto-merge policy with guardrails.** The genuinely new capability, and the one that needs the most care. Per-org, opt-in, scoped by path policy and change class; anything touching `db/migrations/`, auth, RLS, or protected paths stays human-gated regardless of policy. Full audit trail and a kill switch.
4. **Rollback.** Autonomy without a reverse gear is not autonomy. A recorded, one-action revert path from a bad `deployed` record.

**Exit criteria:** A Ford admin describes a change in Builder Studio and, without you in the loop, sees it verified, reviewed, merged, and deployed — with every transition backed by a provider-verified delivery record, and with a documented, tested path to revert it.

**Depends on:** Phase 5.

---

## Sequencing

```
Phase 1  ██                                    days      demo unblock
Phase 2      ████████                          1–2 wk    BYO everything
Phase 3      ████████                          1–2 wk    metering + caps    ┐ parallel
Phase 4      ████████████                      2–3 wk    export/portability ┘
Phase 5              ████████████              2–3 wk    Builder production
Phase 6                       ████████████████ 3–4 wk    autonomous loop
```

Phase 1 is a hard prerequisite for showing anything to Ford. Phases 2, 3, and 4 are independent of each other and can run in parallel given the people. Phase 5 needs Phase 1's env work; Phase 6 needs Phase 5.

**Total to a Ford engagement that matches the pitch:** roughly 8–12 weeks of focused work, with a demonstrable, honest product after Phase 1 and a genuinely differentiated one after Phase 4.

## Open decisions

- **Auto-merge blast radius (Phase 6).** Which change classes are ever eligible? The conservative default — config-only proposals plus additive code in non-protected paths — is worth agreeing before implementation rather than during it.
- **Cap behaviour at the ceiling (Phase 3).** Hard stop, degrade to read-only tools, or fall back to Ford's own key if one is configured? The third is the most useful and the most surprising; it needs to be an explicit org setting.
- **Export cadence (Phase 4).** On demand only, or scheduled snapshots the org can browse? Scheduled snapshots are a meaningfully stronger sovereignty claim and meaningfully more storage.
