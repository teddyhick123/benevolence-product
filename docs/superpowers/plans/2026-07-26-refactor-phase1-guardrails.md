# Refactor Phase 1 — Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the refactor's guardrails — tracked lockfile, a CI gate on types/lint/tests/build, a lint-warning floor, unified test conventions (contract tests in `tests/integration/`, shared mocks in `tests/helpers/`, quiet test output), and local cleanup — with zero behavior change.

**Architecture:** Phase 1 of `docs/superpowers/specs/2026-07-26-full-refactor-design.md`. Everything here is infrastructure: no route, page, or library behavior changes. The only product-code file touched is `lib/builder/check-matrix.ts`, whose hardcoded contract-suite paths must follow the moved test files (the spec's sanctioned shared-infrastructure touch on Builder).

**Tech Stack:** Next.js 15, TypeScript, Vitest 4 (`vitest.config.mts`, jsdom, `@` → repo root), ESLint (`eslint . --ext .js,.jsx,.ts,.tsx`), GitHub Actions, npm (lockfileVersion 3).

## Global Constraints

- No URL changes, no schema changes, no dependency upgrades, no lint-rule changes (spec cross-phase rules). `npm install --package-lock-only` must not alter any resolved version — if it does, stop.
- Verified baseline that must hold at every commit: **1,939 tests passed / 6 skipped across 133 files** (Tasks 4–5 add tests; none may be lost), **`tsc --noEmit` clean**, **lint 0 errors / 511 warnings** (344 `no-unused-vars`, 129 `no-console`, 33 `react-hooks/exhaustive-deps`, 5 `@next/next/no-img-element`; **none auto-fixable** — do not attempt `--fix` burn-down).
- Lint floor starts at **511** and only ratchets down.
- `lib/builder/**` is out of scope **except** the contract-suite path constants in `check-matrix.ts` + their tests (Task 3) and the `console.warn` spy in `lib/builder/__tests__/verification.test.ts` (Task 5).
- Behavior quirks discovered along the way: log to `docs/superpowers/specs/2026-07-26-refactor-findings.md`, don't fix. Security bugs: fix inline and call out in the commit message.
- Dev machine is macOS: BSD sed (`sed -i ''`). CI runners are ubuntu.
- All work on branch `refactor/phase1-guardrails` (create it in Task 1 if the worktree flow hasn't already). Commit messages use the repo's conventional style (`chore:`, `ci:`, `test:`) and end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- The full suite takes ~20s locally; run it before every commit (superpowers:verification-before-completion).

---

### Task 1: Track package-lock.json + findings log stub

**Files:**
- Modify: `.gitignore` (line 7: `package-lock.json`)
- Add (already exists on disk, currently ignored): `package-lock.json`
- Create: `docs/superpowers/specs/2026-07-26-refactor-findings.md`

**Interfaces:**
- Produces: a tracked, in-sync `package-lock.json` that Task 2's `npm ci` CI step and `cache: npm` depend on; the findings file every later task appends quirks to.

- [ ] **Step 1: Create the branch**

```bash
git checkout -b refactor/phase1-guardrails
```

- [ ] **Step 2: Stop ignoring the npm lockfile**

In `.gitignore`, delete only the `package-lock.json` line. **Keep** `yarn.lock` and `pnpm-lock.yaml` ignored — that is deliberate: npm is the only supported package manager, and ignoring the other lockfiles blocks accidental competing ones.

```diff
 npm-debug.log*
 yarn-debug.log*
 yarn-error.log*
 pnpm-debug.log*
-package-lock.json
 yarn.lock
 pnpm-lock.yaml
```

- [ ] **Step 3: Verify the existing lockfile is in sync with package.json**

```bash
before=$(shasum -a 256 package-lock.json | cut -d' ' -f1)
npm install --package-lock-only
after=$(shasum -a 256 package-lock.json | cut -d' ' -f1)
[ "$before" = "$after" ] && echo "lockfile in sync" || echo "LOCKFILE CHANGED — inspect the diff before committing"
```

Expected: `lockfile in sync`. If it changed, inspect `git diff package-lock.json` — metadata-only churn (e.g. field ordering) is acceptable; **any resolved-version change violates the no-upgrades constraint: stop and surface it**.

- [ ] **Step 4: Confirm git no longer ignores it**

```bash
git check-ignore package-lock.json; echo "exit: $?"
```

Expected: no output, `exit: 1` (not ignored).

- [ ] **Step 5: Create the findings log stub**

Create `docs/superpowers/specs/2026-07-26-refactor-findings.md`:

```markdown
# Refactor Findings — Behavior Quirks Log

**Spec:** [2026-07-26-full-refactor-design.md](2026-07-26-full-refactor-design.md)

Non-security behavior quirks discovered during the refactor are logged here
instead of fixed. Security bugs are fixed inline and called out in commit
messages — see the spec's bug policy.

Each entry: date, phase/task, `file:line`, what the code actually does vs.
what was expected, and why it was left alone.

## Findings

_None yet._
```

- [ ] **Step 6: Commit**

```bash
git add .gitignore package-lock.json docs/superpowers/specs/2026-07-26-refactor-findings.md
git commit -m "chore: track package-lock.json and add refactor findings log

Reproducible installs are a precondition for the CI gate (npm ci). yarn/pnpm
lockfiles stay ignored deliberately: npm is the only supported package manager.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Lint floor + CI gate workflow

**Files:**
- Modify: `package.json` (the `verify:lint` script)
- Create: `.github/workflows/ci.yml`
- Modify: `.github/workflows/walkthrough-smoke.yml` (`npm install` → `npm ci`, add npm cache)

**Interfaces:**
- Consumes: tracked `package-lock.json` from Task 1.
- Produces: `verify:lint` with `--max-warnings=511` (the floor later phases ratchet down by editing this one number); a `CI` workflow whose green check gates every later commit of this refactor.

- [ ] **Step 1: Bake the floor into `verify:lint`**

In `package.json`, change:

```json
"verify:lint": "eslint . --ext .js,.jsx,.ts,.tsx",
```

to:

```json
"verify:lint": "eslint . --ext .js,.jsx,.ts,.tsx --max-warnings=511",
```

(Leave the plain `lint` and `lint:fix` scripts untouched for interactive use.)

- [ ] **Step 2: Verify the floor passes at the current count**

```bash
npm run verify:lint; echo "exit: $?"
```

Expected: `✖ 511 problems (0 errors, 511 warnings)` and `exit: 0`.

- [ ] **Step 3: Verify the gate actually trips one below the floor**

```bash
npx eslint . --ext .js,.jsx,.ts,.tsx --max-warnings=510; echo "exit: $?"
```

Expected: `ESLint found too many warnings (maximum: 510).` and `exit: 1`. (Transient check only — nothing to commit from this step.)

- [ ] **Step 4: Prove `verify:build` works under placeholder env**

`lib/supabase.ts` reads `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE` inside factory functions, so `next build` should not need real values — prove it before encoding that assumption in CI. Temporarily hide local env files so the build sees only the placeholders:

```bash
ls .env* 2>/dev/null   # note which exist
moved=""
for f in .env .env.local .env.production; do
  if [ -f "$f" ]; then mv "$f" "$f.ci-check"; moved="$moved $f"; fi
done
NEXT_PUBLIC_SUPABASE_URL=http://placeholder.invalid \
NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder-anon-key \
SUPABASE_SERVICE_ROLE=ci-placeholder-service-role \
npm run verify:build
status=$?
for f in $moved; do mv "$f.ci-check" "$f"; done
echo "build exit: $status"
```

Expected: build completes with `✓ Compiled successfully`, the route table includes `ƒ Middleware`, and `build exit: 0`. **If the build fails**, some page evaluates Supabase at build time — do not work around it silently: restore env files (the script does), log the failing page to the findings file, and stop for user input.

- [ ] **Step 5: Create the CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      # lib/supabase.ts reads these inside factory functions; no page evaluates
      # Supabase during `next build` (verified locally before this landed).
      NEXT_PUBLIC_SUPABASE_URL: http://placeholder.invalid
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ci-placeholder-anon-key
      SUPABASE_SERVICE_ROLE: ci-placeholder-service-role
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci
      - run: npm run verify:types
      - run: npm run verify:lint
      - run: npm run verify:unit
      - run: npm run verify:build
```

Notes: node 22 matches the existing `walkthrough-smoke.yml`; the env-gated `builder-rls.live.test.ts` self-skips in CI (`describe.skipIf(!RUN_LIVE)`); `verify:migrations` needs a local Supabase Docker stack and stays out of this gate.

- [ ] **Step 6: Switch walkthrough-smoke to reproducible installs**

In `.github/workflows/walkthrough-smoke.yml`, change:

```yaml
      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - run: npm install
```

to:

```yaml
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci
```

- [ ] **Step 7: Validate the YAML parses**

```bash
python3 -c "import yaml, sys; [yaml.safe_load(open(f)) for f in sys.argv[1:]]; print('yaml ok')" \
  .github/workflows/ci.yml .github/workflows/walkthrough-smoke.yml
```

Expected: `yaml ok`. (If this python3 lacks PyYAML, skip — the push in Task 7 is the authoritative validation.)

- [ ] **Step 8: Run the full local equivalent of the gate**

```bash
npm run verify:types && npm run verify:lint && npm run verify:unit
```

Expected: tsc silent, lint 511/0, vitest `1939 passed | 6 skipped`. (`verify:build` already proven in Step 4.)

- [ ] **Step 9: Commit**

```bash
git add package.json .github/workflows/ci.yml .github/workflows/walkthrough-smoke.yml
git commit -m "ci: gate pushes and PRs on types, lint floor, unit tests, and build

Lint floor starts at the verified current count (511 warnings, none
auto-fixable) and only ratchets down at phase boundaries per the refactor spec.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Move contract tests to tests/integration/ + repoint Builder check matrix

**Files:**
- Move: all 26 `app/api/__tests__/*.test.ts` → `tests/integration/` (directory `app/api/__tests__/` disappears)
- Modify: `lib/builder/check-matrix.ts:36,44-45,119` (suite-path constants + comments + one prefix check)
- Modify: `lib/builder/__tests__/check-matrix.test.ts:68,80` (+ one new test)
- Modify: `lib/builder/__tests__/verification-runner.integration.test.ts:121-136,367-370,386` (fixture paths + assertion)
- Modify: `tests/integration/grants-api.test.ts:96-97` (relative imports break on move)
- Modify: `lib/__tests__/tax-schema-contract.test.ts:6` (comment reference)

**Interfaces:**
- Produces: `tests/integration/` as the canonical contract-test home (Tasks 4–5 edit files at these new paths); `check-matrix.ts` constants `SCHEMA_CONTRACT_SUITE = 'tests/integration/builder-schema-contract.test.ts'`, `API_CONTRACT_SUITE_GLOB = 'tests/integration/*.test.ts'`, new `INTEGRATION_TEST_PREFIX = 'tests/integration/'`.

Background: Vitest's `include` is repo-wide (`**/*.{test,spec}.*`), Playwright is pinned to `./tests/walkthrough`, and tsconfig includes `**/*.ts` — so the move needs no config changes. The Builder verification worker, however, hardcodes the old paths in `check-matrix.ts`, and its tests assert them.

- [ ] **Step 1: Write the failing expectations first (TDD on the check matrix)**

In `lib/builder/__tests__/check-matrix.test.ts`:

a. Rewrite the two suite-path assertions (currently lines 68 and 80):

```bash
sed -i '' 's|app/api/__tests__|tests/integration|g' lib/builder/__tests__/check-matrix.test.ts
```

Leave every other `app/api/...` fixture path in that file alone (e.g. `app/api/health/route.ts` as a *changed file* — `API_PREFIX` behavior is unchanged); the sed only matches the `__tests__` directory string, which appears only in the two suite-path assertions.

b. Add this test next to the existing `unitTestTargets` tests (import `unitTestTargets` from `../check-matrix` if that describe doesn't already). It pins behavior that would otherwise regress: before the move, editing a contract test (under `app/api/`) re-ran the contract suites; after the move that trigger must follow the files:

```ts
it('adds the api contract glob when an integration test itself changes', () => {
  const { relatedFiles, extraSuiteGlobs } = unitTestTargets(['tests/integration/grants-api.test.ts']);
  expect(relatedFiles).toEqual([]);
  expect(extraSuiteGlobs).toEqual(['tests/integration/*.test.ts']);
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run lib/builder/__tests__/check-matrix.test.ts
```

Expected: FAIL — the two rewritten assertions plus the new test (the glob currently comes back as `app/api/__tests__/*.test.ts`, and a `tests/integration/` path triggers nothing).

- [ ] **Step 3: Repoint the check matrix**

In `lib/builder/check-matrix.ts`:

a. Rewrite the constants and comment mentions:

```bash
sed -i '' 's|app/api/__tests__|tests/integration|g' lib/builder/check-matrix.ts
```

(This changes line 36's `SCHEMA_CONTRACT_SUITE`, line 44's `API_CONTRACT_SUITE_GLOB`, and the glob examples in the comments at ~37–43 and ~119. `API_PREFIX = 'app/api/'` is untouched.)

b. Add the new prefix constant directly below `API_PREFIX` (line 45):

```ts
const API_PREFIX = 'app/api/';
const INTEGRATION_TEST_PREFIX = 'tests/integration/';
```

c. In `unitTestTargets`, change the glob trigger:

```ts
  if (paths.some((p) => p.startsWith(API_PREFIX))) {
    extraSuiteGlobs.add(API_CONTRACT_SUITE_GLOB);
  }
```

to:

```ts
  if (paths.some((p) => p.startsWith(API_PREFIX) || p.startsWith(INTEGRATION_TEST_PREFIX))) {
    extraSuiteGlobs.add(API_CONTRACT_SUITE_GLOB);
  }
```

- [ ] **Step 4: Run to verify they pass**

```bash
npx vitest run lib/builder/__tests__/check-matrix.test.ts
```

Expected: PASS, all tests.

- [ ] **Step 5: Update the runner integration fixture to the new layout**

In `lib/builder/__tests__/verification-runner.integration.test.ts`, replace the fixture block (lines 121–136):

```ts
  //   app/api/__tests__/contract.test.ts -> the extraSuiteGlobs case: a contract
  //     suite that imports NOTHING, so the ONLY way it runs is the app/api glob
  //     (app/api/__tests__/*.test.ts) shell-expanding inside the bash wrapper.
  fs.mkdirSync(path.join(fixtureRepo, 'app', 'api', '__tests__'), { recursive: true });
  fs.writeFileSync(
    path.join(fixtureRepo, 'app', 'api', '__tests__', 'contract.test.ts'),
```

with:

```ts
  //   tests/integration/contract.test.ts -> the extraSuiteGlobs case: a contract
  //     suite that imports NOTHING, so the ONLY way it runs is the contract glob
  //     (tests/integration/*.test.ts) shell-expanding inside the bash wrapper.
  fs.mkdirSync(path.join(fixtureRepo, 'tests', 'integration'), { recursive: true });
  fs.writeFileSync(
    path.join(fixtureRepo, 'tests', 'integration', 'contract.test.ts'),
```

Then fix the remaining string literals (the comment at 367–370 and the assertion at 386):

```bash
sed -i '' 's|app/api/__tests__|tests/integration|g' lib/builder/__tests__/verification-runner.integration.test.ts
```

(Test 10's *trigger* file `app/api/health/route.ts` stays as-is — an `app/api/` source change must still run the contract suites.)

- [ ] **Step 6: Run the runner integration suite**

```bash
npx vitest run lib/builder/__tests__/verification-runner.integration.test.ts
```

Expected: PASS, 10 tests (~40s — it drives real git worktrees and subprocesses).

- [ ] **Step 7: Move the 26 contract test files**

```bash
mkdir -p tests/integration
git mv app/api/__tests__/*.test.ts tests/integration/
```

Then fix the only relative imports among them, `tests/integration/grants-api.test.ts` lines 96–97:

```ts
import { GET as collectionGET, POST as collectionPOST } from '../org/[orgId]/grants/route';
import { GET as detailGET, PATCH as detailPATCH } from '../org/[orgId]/grants/[grantId]/route';
```

become:

```ts
import { GET as collectionGET, POST as collectionPOST } from '@/app/api/org/[orgId]/grants/route';
import { GET as detailGET, PATCH as detailPATCH } from '@/app/api/org/[orgId]/grants/[grantId]/route';
```

Then update stale path references in header comments (moved files self-reference their old location; one lib test references the old dir):

```bash
sed -i '' 's|app/api/__tests__|tests/integration|g' tests/integration/*.test.ts lib/__tests__/tax-schema-contract.test.ts
```

- [ ] **Step 8: Verify nothing still references the old location**

```bash
grep -rn 'app/api/__tests__' --include='*.ts' --include='*.tsx' --include='*.yml' --include='*.json' . 2>/dev/null | grep -v node_modules | grep -v '\.claude' | grep -v '\.next'
grep -rn "from '\.\." tests/integration/*.test.ts
ls app/api/__tests__ 2>&1
```

Expected: first two greps empty; `ls` reports `No such file or directory`. (A hit in `docs/` is fine to update in the same commit; product code hits are not expected.)

- [ ] **Step 9: Full suite — count must be identical**

```bash
npx vitest run 2>&1 | tail -5
```

Expected: `Test Files  132 passed | 1 skipped (133)` and `Tests  1939 passed | 6 skipped (1945)` — exactly the baseline; a move loses nothing.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "test: move API contract suites to tests/integration and repoint builder check matrix

Same 26 suites, new canonical home per the refactor spec's test conventions.
check-matrix.ts is the sanctioned Builder touch: its hardcoded suite paths must
follow the files, and integration-test edits now trigger the contract glob the
same way app/api edits always have.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Shared test helpers in tests/helpers/ + exemplar adoption

**Files:**
- Create: `tests/helpers/supabase-mock.ts`
- Create: `tests/helpers/request.ts`
- Test: `tests/helpers/__tests__/supabase-mock.test.ts`
- Test: `tests/helpers/__tests__/request.test.ts`
- Modify: `tests/integration/tax-contributions.auth.test.ts` (mock plumbing only; test bodies untouched)

**Interfaces:**
- Consumes: `tests/integration/` layout from Task 3.
- Produces (used by the exemplar here and by every Phase 2 contract test):
  - `stubQuery<T>(result: SupabaseResult<T>, overrides?: { single?: SupabaseResult; maybeSingle?: SupabaseResult }): QueryStub` — thenable chainable builder; records `calls: {method, args}[]`.
  - `stubSupabase(config: { tables?: Record<string, () => object>; rpc?: Record<string, (args?: Record<string, unknown>) => SupabaseResult>; fallbackTable?: () => object }): { from: Mock; rpc: Mock }`.
  - `makeRequest(path, init?)`, `makeJsonRequest(path, body, method = 'POST')`, `makeRouteCtx(params)`, `readJson(res)`.

Scope note: Phase 1 creates the helpers and proves them on **one** exemplar file. The other 25 contract suites migrate opportunistically in Phase 2 as each route family gets its contract pass — bulk-rewriting working test mocks now is churn without payoff. `vi.mock('@/lib/supabase', …)` stays in each test file (Vitest hoists it per-module; a helper cannot install it for the importing file) — the helpers build what goes *inside* the mock.

- [ ] **Step 1: Write the failing supabase-mock tests**

Create `tests/helpers/__tests__/supabase-mock.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { stubQuery, stubSupabase } from '../supabase-mock';

describe('stubQuery', () => {
  it('chains builder methods and resolves the configured result on await', async () => {
    const q = stubQuery({ data: [{ id: 1 }], error: null });
    const result = await q.select('*').eq('org_id', 'o1').order('created_at');
    expect(result).toEqual({ data: [{ id: 1 }], error: null });
  });

  it('resolves .single() to the single override when provided, list result otherwise', async () => {
    const q = stubQuery({ data: [1, 2], error: null }, { single: { data: { id: 'x' }, error: null } });
    expect(await q.select('*').single()).toEqual({ data: { id: 'x' }, error: null });
    expect(await q.select('*')).toEqual({ data: [1, 2], error: null });
  });

  it('records chained calls with their arguments for assertions', async () => {
    const q = stubQuery({ data: null, error: null });
    await q.insert({ a: 1 }).select();
    expect(q.calls).toEqual([
      { method: 'insert', args: [{ a: 1 }] },
      { method: 'select', args: [] },
    ]);
  });
});

describe('stubSupabase', () => {
  it('dispatches .from(table) to its factory, fresh per call', async () => {
    let built = 0;
    const client = stubSupabase({
      tables: {
        holdings: () => {
          built += 1;
          return stubQuery({ data: ['h'], error: null });
        },
      },
    });
    await client.from('holdings').select('*');
    await client.from('holdings').select('*');
    expect(built).toBe(2);
  });

  it('routes unknown tables to fallbackTable when provided', async () => {
    const client = stubSupabase({
      fallbackTable: () => stubQuery({ data: 'fallback', error: null }),
    });
    expect(await client.from('anything').select()).toEqual({ data: 'fallback', error: null });
  });

  it('throws on an unstubbed table with no fallback so typos fail loudly', () => {
    const client = stubSupabase({ tables: {} });
    expect(() => client.from('nope')).toThrow('no stub for table "nope"');
  });

  it('dispatches rpc handlers by name and defaults unknown fns to { data: null, error: null }', async () => {
    const client = stubSupabase({
      rpc: { can_view_org: (args) => ({ data: args?.p_org_id === 'o1', error: null }) },
    });
    expect(await client.rpc('can_view_org', { p_org_id: 'o1' })).toEqual({ data: true, error: null });
    expect(await client.rpc('mystery_fn')).toEqual({ data: null, error: null });
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/helpers
```

Expected: FAIL — cannot resolve `../supabase-mock`.

- [ ] **Step 3: Implement the supabase mock helper**

Create `tests/helpers/supabase-mock.ts`:

```ts
import { vi } from 'vitest';

export type SupabaseResult<T = unknown> = {
  data: T | null;
  error: { message: string } | null;
};

const CHAIN_METHODS = [
  'select', 'insert', 'update', 'upsert', 'delete',
  'eq', 'neq', 'in', 'is', 'gt', 'gte', 'lt', 'lte',
  'like', 'ilike', 'contains', 'not', 'or', 'filter', 'match',
  'order', 'range', 'limit',
] as const;

type ChainMethod = (typeof CHAIN_METHODS)[number];

export type QueryStub = Record<ChainMethod, ReturnType<typeof vi.fn>> & {
  calls: Array<{ method: string; args: unknown[] }>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: (
    onFulfilled: (r: SupabaseResult) => unknown,
    onRejected?: (e: unknown) => unknown
  ) => Promise<unknown>;
};

/**
 * Thenable Supabase query-builder stub: every chain method records its call
 * and returns the stub; awaiting the chain (or calling .single()/.maybeSingle())
 * resolves to the configured result.
 */
export function stubQuery<T = unknown>(
  result: SupabaseResult<T>,
  overrides: { single?: SupabaseResult; maybeSingle?: SupabaseResult } = {}
): QueryStub {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const stub = {
    calls,
    single: vi.fn(async () => overrides.single ?? result),
    maybeSingle: vi.fn(async () => overrides.maybeSingle ?? result),
    then: (
      onFulfilled: (r: SupabaseResult) => unknown,
      onRejected?: (e: unknown) => unknown
    ) => Promise.resolve(result as SupabaseResult).then(onFulfilled, onRejected),
  } as QueryStub;
  for (const method of CHAIN_METHODS) {
    stub[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return stub;
    });
  }
  return stub;
}

/**
 * Supabase client stub: .from(table) dispatches to per-table stub factories —
 * a fresh stub per call, so factories can read current test state — and
 * .rpc(fn, args) to configured handlers. Unstubbed tables throw (typos fail
 * loudly); unstubbed rpcs resolve { data: null, error: null }.
 */
export function stubSupabase(config: {
  tables?: Record<string, () => object>;
  rpc?: Record<string, (args?: Record<string, unknown>) => SupabaseResult>;
  fallbackTable?: () => object;
}) {
  const from = vi.fn((table: string) => {
    const factory = config.tables?.[table] ?? config.fallbackTable;
    if (!factory) {
      throw new Error(`stubSupabase: no stub for table "${table}"`);
    }
    return factory();
  });
  const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
    const handler = config.rpc?.[fn];
    return handler ? handler(args) : { data: null, error: null };
  });
  return { from, rpc };
}
```

- [ ] **Step 4: Run to verify the supabase-mock tests pass**

```bash
npx vitest run tests/helpers
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Write the failing request-helper tests**

Create `tests/helpers/__tests__/request.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeRequest, makeJsonRequest, makeRouteCtx, readJson } from '../request';

describe('request helpers', () => {
  it('makeRequest prefixes bare paths with the local test origin', () => {
    expect(makeRequest('/api/me').url).toBe('http://localhost/api/me');
    expect(makeRequest('http://example.com/x').url).toBe('http://example.com/x');
  });

  it('makeJsonRequest sends a JSON body with the right header and method', async () => {
    const req = makeJsonRequest('/api/org/o1/grants', { name: 'g' });
    expect(req.method).toBe('POST');
    expect(req.headers.get('Content-Type')).toBe('application/json');
    expect(await req.json()).toEqual({ name: 'g' });
  });

  it('makeRouteCtx wraps params in a promise like Next.js 15 route context', async () => {
    const ctx = makeRouteCtx({ orgId: 'o1' });
    expect(await ctx.params).toEqual({ orgId: 'o1' });
  });

  it('readJson unpacks status and parsed body from a Response', async () => {
    const res = new Response(JSON.stringify({ ok: true }), { status: 201 });
    expect(await readJson(res)).toEqual({ status: 201, body: { ok: true } });
  });
});
```

- [ ] **Step 6: Run to verify failure, then implement**

```bash
npx vitest run tests/helpers
```

Expected: request tests FAIL (module not found). Then create `tests/helpers/request.ts`:

```ts
/** Request against the local test origin; path may be absolute ("/api/…"). */
export function makeRequest(path: string, init?: RequestInit): Request {
  const url = path.startsWith('http') ? path : `http://localhost${path}`;
  return new Request(url, init);
}

/** JSON-body request with the content-type header routes expect. */
export function makeJsonRequest(path: string, body: unknown, method = 'POST'): Request {
  return makeRequest(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Next.js 15 route-handler context: params arrive as a Promise. */
export function makeRouteCtx<P extends Record<string, string>>(params: P): { params: Promise<P> } {
  return { params: Promise.resolve(params) };
}

/** Unpack a route Response for assertions. */
export async function readJson(res: Response): Promise<{ status: number; body: any }> {
  return { status: res.status, body: await res.json() };
}
```

Re-run: `npx vitest run tests/helpers` — expected PASS, 11 tests total.

- [ ] **Step 7: Adopt the helpers in the exemplar contract suite**

In `tests/integration/tax-contributions.auth.test.ts`, keep the mock-state variables, the `mockRpc`/`mockFrom` consts, and the `vi.mock('@/lib/supabase', …)` block exactly as they are (that hoisting-safe pattern is proven), add the import:

```ts
import { stubQuery, stubSupabase } from '@/tests/helpers/supabase-mock';
```

and replace the entire hand-built `setupMocks()` function (currently the `mockRpc.mockImplementation`/`mockFrom.mockImplementation` body with per-table `if` chains, lines ~36–70) with:

```ts
function setupMocks() {
  const stub = stubSupabase({
    rpc: {
      can_view_portfolio: () => ({ data: _canView, error: _canViewError }),
      can_edit_portfolio: () => ({ data: _canEdit, error: _canEditError }),
    },
    tables: {
      v_tax_contributions_enriched: () =>
        stubQuery(
          { data: _contributions, error: _contributionsError },
          { single: { data: _enrichedResult, error: null } }
        ),
      tax_documents: () => stubQuery({ data: [], error: null }),
      tax_contributions: () => {
        const q = stubQuery({ data: _insertResult, error: _insertError });
        q.insert.mockImplementation((args: unknown) => {
          _capturedInsertArgs = args;
          return q;
        });
        return q;
      },
    },
    fallbackTable: () => stubQuery({ data: null, error: null }),
  });
  mockRpc.mockImplementation(stub.rpc);
  mockFrom.mockImplementation(stub.from);
}
```

(The existing `beforeEach` resets the state vars then calls `setupMocks()` — unchanged. Factories run per `.from()` call during the request, after the test has set its state, so the closures read current values exactly as before.)

- [ ] **Step 8: Run the exemplar file**

```bash
npx vitest run tests/integration/tax-contributions.auth.test.ts
```

Expected: PASS with the same test count the file had before this edit (record the count from the run output; it must not change).

- [ ] **Step 9: Lint the new files and run the full suite**

```bash
npx eslint tests/helpers --ext .ts
npx vitest run 2>&1 | tail -4
```

Expected: eslint reports nothing (new code must not consume floor headroom); vitest `Tests  1950 passed | 6 skipped (1956)` — baseline 1,939 + 11 helper tests, `Test Files  134 passed | 1 skipped (135)`.

- [ ] **Step 10: Commit**

```bash
git add tests/helpers tests/integration/tax-contributions.auth.test.ts
git commit -m "test: add shared Supabase/request test helpers and adopt in tax contributions suite

tests/helpers is the go-forward mock convention for Phase 2's per-family
contract passes; one exemplar file migrates now to prove the helpers, the rest
migrate opportunistically as each family is touched.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Silence expected-error logging in tests

**Files (7, identified from a stripped-ANSI stderr scan of the full run):**
- Modify: `tests/integration/tax-documents.behavior.test.ts` (3 stderr lines — route `console.error`)
- Modify: `tests/integration/tax-documents.auth.test.ts` (1)
- Modify: `tests/integration/cpa-share.test.ts` (3)
- Modify: `tests/integration/tax-form8283.test.ts` (1)
- Modify: `tests/integration/builder-build-claim.test.ts` (1 — `console.error` in `app/api/org/[orgId]/builder/proposals/[proposalId]/build/route.ts:89`)
- Modify: `lib/builder/__tests__/verification.test.ts` (3 — **`console.warn`** in `lib/builder/verification.ts:57,67`)
- Modify: `components/compliance/DisqualifiedPersonsRegistry.test.tsx` (1 — React `act(...)` warning, fixed properly, not silenced)

**Interfaces:**
- Consumes: `tests/integration/` paths from Task 3.
- Produces: a stderr-clean full-suite run (the exit check other phases can re-verify with one grep).

- [ ] **Step 1: Capture the baseline noise count**

```bash
npx vitest run 2>&1 | perl -pe 's/\e\[[0-9;]*m//g' | grep -c '^stderr' || true
```

Expected: `13`.

- [ ] **Step 2: Spy the expected console output in the six console files**

In each of the five `console.error` files (`tax-documents.behavior`, `tax-documents.auth`, `cpa-share`, `tax-form8283`, `builder-build-claim` under `tests/integration/`), add — **after** any existing top-level `beforeEach` (hooks run in registration order; the spy must be installed last so a `vi.restoreAllMocks()` in an earlier hook can't strip it):

```ts
// The routes under test log their expected error paths; keep suite output clean.
let consoleErrorSpy: MockInstance;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});
```

Extend each file's vitest import as needed, e.g.:

```ts
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
```

In `lib/builder/__tests__/verification.test.ts`, do the same with `console.warn`:

```ts
// lib/builder/verification.ts warns on expected log-upload failures; keep suite output clean.
let consoleWarnSpy: MockInstance;

beforeEach(() => {
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  consoleWarnSpy.mockRestore();
});
```

- [ ] **Step 3: Fix (not silence) the act() warning in the compliance component test**

In `components/compliance/DisqualifiedPersonsRegistry.test.tsx`, the first test asserts synchronously while the component's `useEffect` fetch is still settling, so the `setLoading(false)` update lands outside `act`. Anchor the test on the post-load DOM (with `setupFetch([])` the component renders `No disqualified persons registered.` once loading flips). Replace:

```ts
  it('renders the quick-screen panel', async () => {
    setupFetch([]);
    render(<DisqualifiedPersonsRegistry orgId="org-1" />);
    expect(screen.getByText('Quick Transaction Screen')).toBeInTheDocument();
  });
```

with:

```ts
  it('renders the quick-screen panel', async () => {
    setupFetch([]);
    render(<DisqualifiedPersonsRegistry orgId="org-1" />);
    expect(screen.getByText('Quick Transaction Screen')).toBeInTheDocument();
    // Settle the fetch-driven load before the test ends so the state update
    // happens inside act.
    await screen.findByText('No disqualified persons registered.');
  });
```

- [ ] **Step 4: Verify zero stderr and unchanged counts**

```bash
npx vitest run 2>&1 | perl -pe 's/\e\[[0-9;]*m//g' | grep -c '^stderr' || true
npx vitest run 2>&1 | tail -4
```

Expected: `0`, then `Tests  1950 passed | 6 skipped (1956)`. If any stderr line survives, it names its source test file — fix that file the same way (spy the specific console method it uses) rather than silencing globally in `vitest.setup.ts`.

- [ ] **Step 5: Commit**

```bash
git add tests/integration lib/builder/__tests__/verification.test.ts components/compliance/DisqualifiedPersonsRegistry.test.tsx
git commit -m "test: silence expected-error logging and fix act warning in compliance test

Per-file console spies for routes that log expected error paths; the
DisqualifiedPersonsRegistry act() warning is a real test gap (assertion raced
the fetch effect) and is fixed by awaiting the settled empty state.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Local cleanup — stale worktrees and empty directory

**Files:** none tracked — everything here is gitignored local state, so there is **no commit**.

Context: `.claude/worktrees/` holds six stale, **locked** agent worktrees (~48MB) registered in `git worktree list` on `worktree-agent-*` branches; `impact-viz-mvp/` contains only an empty `.next` cache.

- [ ] **Step 1: Safety check — confirm no stale worktree holds unique uncommitted work**

```bash
for wt in .claude/worktrees/agent-*; do
  echo "== $wt"; git -C "$wt" status --porcelain | head -5
done
```

Expected: every worktree shows no output (clean). **If any shows modifications, stop and ask the user before removing that one** — the rest may proceed.

- [ ] **Step 2: Remove the worktrees, their branches, and the empty directory**

```bash
for wt in .claude/worktrees/agent-*; do
  git worktree unlock "$wt" 2>/dev/null || true
  git worktree remove --force "$wt"
done
git worktree prune
git for-each-ref --format='%(refname:short)' 'refs/heads/worktree-agent-*' | xargs -n1 git branch -D
rm -rf impact-viz-mvp
```

- [ ] **Step 3: Verify**

```bash
git worktree list
ls .claude/worktrees 2>/dev/null; ls impact-viz-mvp 2>&1
git status --porcelain
```

Expected: `git worktree list` shows only the main checkout (plus this phase's own worktree if executing in one); `.claude/worktrees` empty or gone; `impact-viz-mvp` `No such file or directory`; `git status` clean.

---

### Task 7: Push, PR, CI green — phase exit

**Interfaces:**
- Consumes: all prior commits on `refactor/phase1-guardrails`.
- Produces: the phase-boundary review artifact (an open PR with green CI). **Do not merge** — the spec's cross-phase rule gives the user review at phase boundaries.

- [ ] **Step 1: Final local verification sweep**

```bash
npm run verify:types && npm run verify:lint && npm run verify:unit
git log --oneline main..HEAD
```

Expected: all green (1950 passed / 6 skipped; 511/0 lint); exactly the 5 commits from Tasks 1–5.

- [ ] **Step 2: Ratchet check**

```bash
npm run verify:lint 2>&1 | tail -3
```

If the warning total now prints **below** 511 (possible if edits incidentally removed warned lines), lower `--max-warnings` in `package.json` `verify:lint` to the printed count and commit:

```bash
git add package.json
git commit -m "chore: ratchet lint floor to post-guardrails count

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

If it still prints 511, skip this — the floor only moves down.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin refactor/phase1-guardrails
gh pr create --title "Phase 1 — Refactor guardrails: lockfile, CI gate, test conventions" --body "$(cat <<'EOF'
Phase 1 of docs/superpowers/specs/2026-07-26-full-refactor-design.md. Infrastructure only — no route, page, or library behavior changes.

- Track package-lock.json (npm is the single supported package manager); add the refactor findings log stub
- New CI workflow gating pushes/PRs: npm ci → verify:types → verify:lint (--max-warnings=511 floor, ratchets down only) → verify:unit → verify:build; walkthrough-smoke switched to npm ci
- 26 API contract suites moved from app/api/__tests__/ to tests/integration/; Builder check-matrix suite paths follow them (the spec's sanctioned Builder touch), and integration-test edits now trigger the contract glob like app/api edits always have
- Shared test helpers in tests/helpers/ (thenable Supabase query stub, request builders), adopted by one exemplar suite; remaining suites migrate per-family in Phase 2
- Test output is stderr-clean: per-file console spies for expected error paths; one real act() race fixed in DisqualifiedPersonsRegistry.test.tsx

Baseline held: 1,939 → 1,950 passed (11 new helper tests) / 6 skipped; tsc clean; lint 0 errors / 511 warnings.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Watch CI to green**

```bash
gh pr checks --watch
```

Expected: both `CI / verify` and `Walkthrough Smoke` green. If `CI / verify` fails on a step that passed locally, the divergence is environmental (env placeholders, node version, npm ci) — fix forward on this branch and re-push; do not weaken the gate to get to green.

- [ ] **Step 5: Hand off for phase-boundary review**

Report to the user: PR URL, CI status, final test/lint numbers, and any entries added to the findings file. Phase 2 planning starts only after their review, per the spec.

---

## Self-review notes (already applied)

- Spec item 3 originally said "auto-fix mechanical warnings" — verified false (0 of 511 warnings carry an ESLint fixer); the spec was corrected on 2026-07-26 and this plan sets the floor at 511 with no bulk edits.
- The contract-test move would silently break the Builder verification gate (hardcoded suite paths in `check-matrix.ts`) and drop the "contract-test edit re-runs contract suites" trigger — both handled in Task 3 with tests first.
- `builder-rls.live.test.ts` self-skips without `RUN_LIVE`; Playwright is pinned to `tests/walkthrough`; vitest/tsconfig need no config changes for the new directories — all verified against the working tree, not assumed.
