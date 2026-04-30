# Sprint B — Security & Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 19 missing-auth routes on the portfolio API, fix a role-enum mismatch that silently breaks admin member management, delete a dead schema, and add lightweight per-org AI usage tracking.

**Architecture:** All auth fixes share one new helper (`lib/portfolio-auth.ts`) that does `getUser()` + `portfolio_members` membership lookup in a single call and returns either `{ user, role }` or a ready-made error `NextResponse`. Routes adopt it with a two-liner guard. The role fix is a one-line enum change in `lib/schemas/admin.ts`. The AI counter is a single Upstash `incr` call added to the existing `POST /api/ai/chat` handler.

**Why these routes lack protection:** Most already rely on RLS (`can_view_portfolio()` in DB policies) for data isolation — authenticated non-members get empty results. The gap is (a) no clean 401 for anonymous requests, and (b) write routes where a silent empty-result is not sufficient. The fix adds an explicit fast-fail guard before the DB call.

**Tech Stack:** Next.js 15 App Router (TypeScript), Supabase (anon SSR client + `portfolio_members` table), `@upstash/redis` (existing), Vitest for static-analysis tests.

---

## Status Summary

| Task | Status | Commit |
|------|--------|--------|
| Task 1: Create `lib/portfolio-auth.ts` helper | ✅ Done | `84ce2d69` |
| Task 2: Add auth to analytics routes (4 routes) | ✅ Done | `84f4279c` |
| Task 3: Add auth to tax data routes (4 routes) | ✅ Done | `ede36ef4` |
| Task 4: Add auth to visualization routes (6 routes) | ✅ Done | `6f28c8d1` |
| Task 5: Add auth to remaining portfolio routes (7 routes) | ✅ Done | `d6adf361` |
| Task 6: Fix admin role enum mismatch (`editor` → `member`) | ✅ Done | `ccf2ac64` |
| Task 7: Delete dead `createPortfolioSchema` | ✅ Done | `640e119b` |
| Task 8: Add per-org AI usage counter | ✅ Done | `6854c4f7` |

---

## File Map

| File | Action | Reason |
|------|--------|--------|
| `lib/portfolio-auth.ts` | **Create** | Shared helper: getUser + membership check |
| `lib/__tests__/portfolio-auth.contract.test.ts` | **Create** | Static contract tests |
| `app/api/portfolio/[id]/analytics/projections/route.ts` | Modify | Add auth guard |
| `app/api/portfolio/[id]/analytics/benchmarks/route.ts` | Modify | Add auth guard |
| `app/api/portfolio/[id]/analytics/risk/route.ts` | Modify | Add auth guard |
| `app/api/portfolio/[id]/analytics/insights/route.ts` | Modify | Add auth guard |
| `app/api/portfolio/[id]/tax/form8283/route.ts` | Modify | Add auth guard |
| `app/api/portfolio/[id]/tax/export/route.ts` | Modify | Add auth guard |
| `app/api/portfolio/[id]/tax/overview/route.ts` | Modify | Add auth guard |
| `app/api/portfolio/[id]/tax/summary/route.ts` | Modify | Add auth guard |
| `app/api/portfolio/[id]/bubble-chart/route.ts` | Modify | Add auth guard |
| `app/api/portfolio/[id]/waterfall/route.ts` | Modify | Add auth guard |
| `app/api/portfolio/[id]/comparison-table/route.ts` | Modify | Add auth guard |
| `app/api/portfolio/[id]/heat-map/route.ts` | Modify | Add auth guard |
| `app/api/portfolio/[id]/timeline/route.ts` | Modify | Add auth guard |
| `app/api/portfolio/[id]/metric-comparison/route.ts` | Modify | Add auth guard |
| `app/api/portfolio/[id]/board-report/route.ts` | Modify | Add auth guard |
| `app/api/portfolio/[id]/kpi-series/route.ts` | Modify | Add auth guard |
| `app/api/portfolio/[id]/letter/route.ts` | Modify | Add auth guard |
| `app/api/portfolio/[id]/meta/route.ts` | Modify | Add auth guard |
| `app/api/portfolio/[id]/settings/route.ts` | Modify | Add auth guard |
| `app/api/portfolio/[id]/targets/route.ts` | Modify | Add auth guard |
| `app/api/portfolio/[id]/metrics/sector-aggregate/route.ts` | Modify | Add auth guard |
| `lib/schemas/admin.ts` | Modify | Fix `editor` → `member` in role enums |
| `lib/schemas/admin.test.ts` | Modify | Update test fixtures to use `member` |
| `app/api/ai/chat/route.ts` | Modify | Add per-org Upstash usage counter |

---

## Task 1: Create `lib/portfolio-auth.ts` helper

**Files:**
- Create: `lib/portfolio-auth.ts`
- Create: `lib/__tests__/portfolio-auth.contract.test.ts`

This helper is the foundation for every task that follows. It provides a single call that gets the current user, checks `portfolio_members`, and either returns `{ user, role }` or a ready-made `NextResponse` error. Routes call it at the very top and early-return on denial.

- [ ] **Step 1: Create the helper**

Create `lib/portfolio-auth.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export type PortfolioRole = 'viewer' | 'member' | 'admin' | 'owner';

const ROLE_RANK: Record<PortfolioRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export interface PortfolioAccess {
  user: { id: string };
  role: PortfolioRole;
}

export interface PortfolioAccessDenied {
  error: NextResponse;
}

/**
 * Verifies the current session user is a member of the given portfolio.
 * Returns { user, role } on success, or { error: NextResponse } on failure.
 *
 * Usage:
 *   const access = await requirePortfolioAccess(portfolioId);
 *   if (isAccessDenied(access)) return access.error;
 *   const { user, role } = access;
 */
export async function requirePortfolioAccess(
  portfolioId: string,
  options: { minRole?: PortfolioRole } = {}
): Promise<PortfolioAccess | PortfolioAccessDenied> {
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: membership } = await supabase
    .from('portfolio_members')
    .select('role')
    .eq('portfolio_id', portfolioId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership) {
    return { error: NextResponse.json({ error: 'Access denied' }, { status: 403 }) };
  }

  const role = membership.role as PortfolioRole;

  if (options.minRole && ROLE_RANK[role] < ROLE_RANK[options.minRole]) {
    return {
      error: NextResponse.json(
        { error: `Requires ${options.minRole} role or higher` },
        { status: 403 }
      ),
    };
  }

  return { user, role };
}

export function isAccessDenied(
  result: PortfolioAccess | PortfolioAccessDenied
): result is PortfolioAccessDenied {
  return 'error' in result;
}
```

- [ ] **Step 2: Write static contract tests**

Create `lib/__tests__/portfolio-auth.contract.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('portfolio-auth helper contract', () => {
  const src = readFileSync('lib/portfolio-auth.ts', 'utf8');

  it('exports requirePortfolioAccess', () => {
    expect(src).toContain('export async function requirePortfolioAccess');
  });

  it('exports isAccessDenied type guard', () => {
    expect(src).toContain('export function isAccessDenied');
  });

  it('returns 401 when no user', () => {
    expect(src).toContain('status: 401');
  });

  it('returns 403 when not a member', () => {
    expect(src).toContain('status: 403');
  });

  it('checks portfolio_members table', () => {
    expect(src).toContain("from('portfolio_members')");
  });

  it('filters by user_id', () => {
    expect(src).toContain("eq('user_id', user.id)");
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/teddyhickenlooper/Desktop/Benevolence/impact-viz-mvp
npx vitest run lib/__tests__/portfolio-auth.contract.test.ts
```

Expected: 6 passing.

- [ ] **Step 4: Commit**

```bash
git add lib/portfolio-auth.ts lib/__tests__/portfolio-auth.contract.test.ts
git commit -m "feat: add requirePortfolioAccess helper for portfolio route auth"
```

---

## Task 2: Add auth to analytics routes

**Files:**
- Modify: `app/api/portfolio/[id]/analytics/projections/route.ts`
- Modify: `app/api/portfolio/[id]/analytics/benchmarks/route.ts`
- Modify: `app/api/portfolio/[id]/analytics/risk/route.ts`
- Modify: `app/api/portfolio/[id]/analytics/insights/route.ts`

All four analytics routes expose financial projections and benchmarks with no auth check. Add the two-liner guard to each.

The pattern to apply to every handler function in each file:

```typescript
// Add import at top of file (after existing imports):
import { requirePortfolioAccess, isAccessDenied } from '@/lib/portfolio-auth';

// Add as FIRST lines of each exported handler (GET, POST, etc.):
const access = await requirePortfolioAccess(portfolioId);
if (isAccessDenied(access)) return access.error;
```

`portfolioId` is always extracted from `ctx.params` (or equivalent) at the top of the function — use whatever variable name already exists in each route.

- [ ] **Step 1: Write failing tests**

Create `lib/__tests__/analytics-routes.auth.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const routes = [
  'app/api/portfolio/[id]/analytics/projections/route.ts',
  'app/api/portfolio/[id]/analytics/benchmarks/route.ts',
  'app/api/portfolio/[id]/analytics/risk/route.ts',
  'app/api/portfolio/[id]/analytics/insights/route.ts',
];

describe('analytics routes auth contract', () => {
  for (const route of routes) {
    it(`${route} imports requirePortfolioAccess`, () => {
      const src = readFileSync(route, 'utf8');
      expect(src).toContain('requirePortfolioAccess');
    });

    it(`${route} calls isAccessDenied`, () => {
      const src = readFileSync(route, 'utf8');
      expect(src).toContain('isAccessDenied');
    });
  }
});
```

- [ ] **Step 2: Run — expect failures**

```bash
npx vitest run lib/__tests__/analytics-routes.auth.test.ts
```

Expected: 8 failures (2 per route).

- [ ] **Step 3: Read each file and add the guard**

For each of the 4 route files:
1. Read the file to find the exact param extraction line (e.g., `const { id: portfolio_id } = await ctx.params`)
2. Add the import at the top
3. Add the two-liner guard immediately after param extraction in every exported function

For `analytics/projections/route.ts` — read it first, then add guard after `const { id: portfolioId } = await params` (or equivalent). The pattern:

```typescript
import { requirePortfolioAccess, isAccessDenied } from '@/lib/portfolio-auth';

// Inside each exported function, immediately after param extraction:
const access = await requirePortfolioAccess(portfolioId);
if (isAccessDenied(access)) return access.error;
```

Repeat for benchmarks, risk, and insights. Each file may use a different variable name for the portfolio ID — look at the existing param extraction line and use the same name.

- [ ] **Step 4: Run — expect pass**

```bash
npx vitest run lib/__tests__/analytics-routes.auth.test.ts
```

Expected: 8 passing.

- [ ] **Step 5: Commit**

```bash
git add \
  app/api/portfolio/\[id\]/analytics/projections/route.ts \
  app/api/portfolio/\[id\]/analytics/benchmarks/route.ts \
  app/api/portfolio/\[id\]/analytics/risk/route.ts \
  app/api/portfolio/\[id\]/analytics/insights/route.ts \
  lib/__tests__/analytics-routes.auth.test.ts
git commit -m "fix: add portfolio auth guard to all analytics routes"
```

---

## Task 3: Add auth to tax data routes

**Files:**
- Modify: `app/api/portfolio/[id]/tax/form8283/route.ts`
- Modify: `app/api/portfolio/[id]/tax/export/route.ts`
- Modify: `app/api/portfolio/[id]/tax/overview/route.ts`
- Modify: `app/api/portfolio/[id]/tax/summary/route.ts`

These routes expose tax filings, carryforward data, and Form 8283 detail — sensitive financial data. Same two-liner pattern as Task 2.

- [ ] **Step 1: Write failing tests**

Create `lib/__tests__/tax-routes.auth.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const routes = [
  'app/api/portfolio/[id]/tax/form8283/route.ts',
  'app/api/portfolio/[id]/tax/export/route.ts',
  'app/api/portfolio/[id]/tax/overview/route.ts',
  'app/api/portfolio/[id]/tax/summary/route.ts',
];

describe('tax routes auth contract', () => {
  for (const route of routes) {
    it(`${route} imports requirePortfolioAccess`, () => {
      const src = readFileSync(route, 'utf8');
      expect(src).toContain('requirePortfolioAccess');
    });

    it(`${route} calls isAccessDenied`, () => {
      const src = readFileSync(route, 'utf8');
      expect(src).toContain('isAccessDenied');
    });
  }
});
```

- [ ] **Step 2: Run — expect failures**

```bash
npx vitest run lib/__tests__/tax-routes.auth.test.ts
```

Expected: 8 failures.

- [ ] **Step 3: Read each file and add the guard**

For each of the 4 route files, read it first to identify the param extraction pattern, then add:

```typescript
import { requirePortfolioAccess, isAccessDenied } from '@/lib/portfolio-auth';

// Inside each exported function, immediately after extracting portfolioId from params:
const access = await requirePortfolioAccess(portfolioId);
if (isAccessDenied(access)) return access.error;
```

- [ ] **Step 4: Run — expect pass**

```bash
npx vitest run lib/__tests__/tax-routes.auth.test.ts
```

Expected: 8 passing.

- [ ] **Step 5: Commit**

```bash
git add \
  app/api/portfolio/\[id\]/tax/form8283/route.ts \
  app/api/portfolio/\[id\]/tax/export/route.ts \
  app/api/portfolio/\[id\]/tax/overview/route.ts \
  app/api/portfolio/\[id\]/tax/summary/route.ts \
  lib/__tests__/tax-routes.auth.test.ts
git commit -m "fix: add portfolio auth guard to tax data routes"
```

---

## Task 4: Add auth to visualization routes

**Files:**
- Modify: `app/api/portfolio/[id]/bubble-chart/route.ts`
- Modify: `app/api/portfolio/[id]/waterfall/route.ts`
- Modify: `app/api/portfolio/[id]/comparison-table/route.ts`
- Modify: `app/api/portfolio/[id]/heat-map/route.ts`
- Modify: `app/api/portfolio/[id]/timeline/route.ts`
- Modify: `app/api/portfolio/[id]/metric-comparison/route.ts`

Visualization routes expose portfolio holdings, metrics, and financials laid out for charting. Same pattern.

- [ ] **Step 1: Write failing tests**

Create `lib/__tests__/viz-routes.auth.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const routes = [
  'app/api/portfolio/[id]/bubble-chart/route.ts',
  'app/api/portfolio/[id]/waterfall/route.ts',
  'app/api/portfolio/[id]/comparison-table/route.ts',
  'app/api/portfolio/[id]/heat-map/route.ts',
  'app/api/portfolio/[id]/timeline/route.ts',
  'app/api/portfolio/[id]/metric-comparison/route.ts',
];

describe('visualization routes auth contract', () => {
  for (const route of routes) {
    it(`${route} imports requirePortfolioAccess`, () => {
      const src = readFileSync(route, 'utf8');
      expect(src).toContain('requirePortfolioAccess');
    });

    it(`${route} calls isAccessDenied`, () => {
      const src = readFileSync(route, 'utf8');
      expect(src).toContain('isAccessDenied');
    });
  }
});
```

- [ ] **Step 2: Run — expect failures**

```bash
npx vitest run lib/__tests__/viz-routes.auth.test.ts
```

Expected: 12 failures.

- [ ] **Step 3: Read each file and add the guard**

For each of the 6 route files, read first then add:

```typescript
import { requirePortfolioAccess, isAccessDenied } from '@/lib/portfolio-auth';

// Inside each exported function, immediately after extracting portfolioId:
const access = await requirePortfolioAccess(portfolioId);
if (isAccessDenied(access)) return access.error;
```

- [ ] **Step 4: Run — expect pass**

```bash
npx vitest run lib/__tests__/viz-routes.auth.test.ts
```

Expected: 12 passing.

- [ ] **Step 5: Commit**

```bash
git add \
  app/api/portfolio/\[id\]/bubble-chart/route.ts \
  app/api/portfolio/\[id\]/waterfall/route.ts \
  app/api/portfolio/\[id\]/comparison-table/route.ts \
  app/api/portfolio/\[id\]/heat-map/route.ts \
  app/api/portfolio/\[id\]/timeline/route.ts \
  app/api/portfolio/\[id\]/metric-comparison/route.ts \
  lib/__tests__/viz-routes.auth.test.ts
git commit -m "fix: add portfolio auth guard to visualization routes"
```

---

## Task 5: Add auth to remaining portfolio routes

**Files:**
- Modify: `app/api/portfolio/[id]/board-report/route.ts`
- Modify: `app/api/portfolio/[id]/kpi-series/route.ts`
- Modify: `app/api/portfolio/[id]/letter/route.ts`
- Modify: `app/api/portfolio/[id]/meta/route.ts`
- Modify: `app/api/portfolio/[id]/settings/route.ts`
- Modify: `app/api/portfolio/[id]/targets/route.ts`
- Modify: `app/api/portfolio/[id]/metrics/sector-aggregate/route.ts`

Includes board-report (very sensitive — full portfolio narrative), settings (write route — highest risk), and letter generation. Same pattern.

For `settings/route.ts`: this route currently builds its own inline Supabase client from scratch instead of using `createServerClient()` from `@/lib/supabase`. After adding the auth guard (which calls `createServerClient()` internally), the existing inline client construction can remain as-is for the data query — only the guard needs to run first.

- [ ] **Step 1: Write failing tests**

Create `lib/__tests__/misc-routes.auth.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const routes = [
  'app/api/portfolio/[id]/board-report/route.ts',
  'app/api/portfolio/[id]/kpi-series/route.ts',
  'app/api/portfolio/[id]/letter/route.ts',
  'app/api/portfolio/[id]/meta/route.ts',
  'app/api/portfolio/[id]/settings/route.ts',
  'app/api/portfolio/[id]/targets/route.ts',
  'app/api/portfolio/[id]/metrics/sector-aggregate/route.ts',
];

describe('misc portfolio routes auth contract', () => {
  for (const route of routes) {
    it(`${route} imports requirePortfolioAccess`, () => {
      const src = readFileSync(route, 'utf8');
      expect(src).toContain('requirePortfolioAccess');
    });

    it(`${route} calls isAccessDenied`, () => {
      const src = readFileSync(route, 'utf8');
      expect(src).toContain('isAccessDenied');
    });
  }
});
```

- [ ] **Step 2: Run — expect failures**

```bash
npx vitest run lib/__tests__/misc-routes.auth.test.ts
```

Expected: 14 failures.

- [ ] **Step 3: Read each file and add the guard**

For each of the 7 route files, read it first to find the portfolio ID extraction, then add:

```typescript
import { requirePortfolioAccess, isAccessDenied } from '@/lib/portfolio-auth';

// Inside each exported function, immediately after extracting portfolioId:
const access = await requirePortfolioAccess(portfolioId);
if (isAccessDenied(access)) return access.error;
```

For `settings/route.ts`, note that the GET handler constructs its own Supabase client inline using `createServerClient` from `@supabase/ssr`. Add the guard call BEFORE this inline construction — don't remove the existing client setup since it's used for the data query.

For write handlers (POST/PATCH/DELETE), use `minRole: 'member'` to prevent viewers from mutating:

```typescript
const access = await requirePortfolioAccess(portfolioId, { minRole: 'member' });
if (isAccessDenied(access)) return access.error;
```

- [ ] **Step 4: Run — expect pass**

```bash
npx vitest run lib/__tests__/misc-routes.auth.test.ts
```

Expected: 14 passing.

- [ ] **Step 5: Run all auth tests together**

```bash
npx vitest run lib/__tests__/portfolio-auth.contract.test.ts \
              lib/__tests__/analytics-routes.auth.test.ts \
              lib/__tests__/tax-routes.auth.test.ts \
              lib/__tests__/viz-routes.auth.test.ts \
              lib/__tests__/misc-routes.auth.test.ts
```

Expected: all 48 passing.

- [ ] **Step 6: Commit**

```bash
git add \
  app/api/portfolio/\[id\]/board-report/route.ts \
  app/api/portfolio/\[id\]/kpi-series/route.ts \
  app/api/portfolio/\[id\]/letter/route.ts \
  app/api/portfolio/\[id\]/meta/route.ts \
  app/api/portfolio/\[id\]/settings/route.ts \
  app/api/portfolio/\[id\]/targets/route.ts \
  app/api/portfolio/\[id\]/metrics/sector-aggregate/route.ts \
  lib/__tests__/misc-routes.auth.test.ts
git commit -m "fix: add portfolio auth guard to board-report, settings, and remaining portfolio routes"
```

---

## Task 6: Fix admin role enum mismatch

**Files:**
- Modify: `lib/schemas/admin.ts`
- Modify: `lib/schemas/admin.test.ts`

`addPortfolioMemberSchema` and `updateMemberRoleSchema` both enumerate `'editor'` as a valid role. The DB `member_role_enum` is `owner / admin / member / viewer` — no `editor` value exists. Any admin action that tries to set role `editor` silently fails with a Postgres enum violation. Fix: replace `'editor'` with `'member'` in both schemas and their tests.

- [ ] **Step 1: Write a failing test**

Create `lib/__tests__/admin-schema-roles.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { addPortfolioMemberSchema, updateMemberRoleSchema } from '../schemas/admin';

describe('admin schema role enum matches DB member_role_enum', () => {
  const validRoles = ['owner', 'admin', 'member', 'viewer'];
  const invalidRoles = ['editor'];

  it('addPortfolioMemberSchema accepts valid DB roles', () => {
    for (const role of validRoles) {
      const result = addPortfolioMemberSchema.safeParse({ user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', role });
      expect(result.success, `role '${role}' should be valid`).toBe(true);
    }
  });

  it('addPortfolioMemberSchema rejects editor', () => {
    const result = addPortfolioMemberSchema.safeParse({ user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', role: 'editor' });
    expect(result.success).toBe(false);
  });

  it('updateMemberRoleSchema accepts valid DB roles', () => {
    for (const role of validRoles) {
      const result = updateMemberRoleSchema.safeParse({ role });
      expect(result.success, `role '${role}' should be valid`).toBe(true);
    }
  });

  it('updateMemberRoleSchema rejects editor', () => {
    const result = updateMemberRoleSchema.safeParse({ role: 'editor' });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect failures**

```bash
npx vitest run lib/__tests__/admin-schema-roles.test.ts
```

Expected: 2 failures (the `rejects editor` tests will PASS since editor is currently accepted, and the `accepts member` tests will FAIL since member is not currently in the enum — or vice versa depending on the test assertions).

Actually: `addPortfolioMemberSchema` currently has `z.enum(['viewer', 'editor', 'owner'])` — missing `admin` and `member`, has `editor`. So:
- "accepts valid DB roles" → FAIL for `admin` and `member`
- "rejects editor" → FAIL (editor currently accepted)

Expected: 4 failures across both schemas.

- [ ] **Step 3: Fix the schemas**

In `lib/schemas/admin.ts`, find:

```typescript
export const addPortfolioMemberSchema = z.object({
  user_id: z.string().uuid().min(1, 'User ID required'),
  role: z.enum(['viewer', 'editor', 'owner']),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['viewer', 'editor', 'owner']),
});
```

Replace with:

```typescript
export const addPortfolioMemberSchema = z.object({
  user_id: z.string().uuid().min(1, 'User ID required'),
  role: z.enum(['owner', 'admin', 'member', 'viewer']),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['owner', 'admin', 'member', 'viewer']),
});
```

- [ ] **Step 4: Fix existing tests in `lib/schemas/admin.test.ts`**

Open `lib/schemas/admin.test.ts`. Find any test fixtures using `role: 'editor'` and change them to `role: 'member'`. There are two occurrences (around lines 166 and 216 of the original file).

```bash
grep -n "editor" lib/schemas/admin.test.ts
```

For each line found, change `'editor'` to `'member'`.

- [ ] **Step 5: Run both test files**

```bash
npx vitest run lib/__tests__/admin-schema-roles.test.ts lib/schemas/admin.test.ts
```

Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add lib/schemas/admin.ts lib/schemas/admin.test.ts lib/__tests__/admin-schema-roles.test.ts
git commit -m "fix: admin schemas — replace editor with member to match DB member_role_enum"
```

---

## Task 7: Delete dead `createPortfolioSchema`

**Files:**
- Modify: `lib/schemas/admin.ts`

`createPortfolioSchema` in `lib/schemas/admin.ts` has zero callers outside the schema file itself. The actual portfolio creation flow (in the admin panel and onboarding) either inlines the validation or uses other mechanisms. Deleting dead schema prevents future confusion and keeps the file authoritative.

- [ ] **Step 1: Confirm zero callers**

```bash
grep -r "createPortfolioSchema" \
  /Users/teddyhickenlooper/Desktop/Benevolence/impact-viz-mvp \
  --include="*.ts" --include="*.tsx" \
  | grep -v "lib/schemas/admin"
```

Expected: no output (zero callers outside the schema file).

- [ ] **Step 2: Delete the schema**

In `lib/schemas/admin.ts`, remove the entire `createPortfolioSchema` block:

```typescript
// Delete this block:
/**
 * Schema for portfolio creation
 */
export const createPortfolioSchema = z.object({
  name: z.string().min(1, 'Portfolio name is required').max(255, 'Name too long'),
  description: z.string().max(1000).optional().nullable(),
});
```

- [ ] **Step 3: Run existing schema tests to confirm no regression**

```bash
npx vitest run lib/schemas/admin.test.ts
```

Expected: all passing (no test references the deleted schema).

- [ ] **Step 4: Commit**

```bash
git add lib/schemas/admin.ts
git commit -m "chore: delete dead createPortfolioSchema (zero callers)"
```

---

## Task 8: Add per-org AI usage counter

**Files:**
- Modify: `app/api/ai/chat/route.ts`

Every time `POST /api/ai/chat` completes successfully, increment an Upstash counter keyed by `usage:ai:{orgId}:{YYYY-MM}`. This lets the admin see which orgs are heavy AI users without any schema changes — it's entirely in Redis. The counter is fire-and-forget (errors are swallowed) so it never affects the chat response.

The `orgId` is already resolved in the route (stored in `orgId` variable). The month key is `new Date().toUTCString().slice(4, 11).replace(' ', '-')` — simpler: use `new Date().toISOString().slice(0, 7)` which gives `YYYY-MM`.

- [ ] **Step 1: Write failing test**

Create `lib/__tests__/ai-chat-org-tracking.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('AI chat per-org usage counter', () => {
  const src = readFileSync('app/api/ai/chat/route.ts', 'utf8');

  it('imports Redis from @upstash/redis', () => {
    expect(src).toMatch(/from ['"]@upstash\/redis['"]/);
  });

  it('increments a usage counter keyed by orgId', () => {
    expect(src).toMatch(/usage:ai.*orgId|orgId.*usage:ai/);
  });

  it('counter is fire-and-forget (catch swallows errors)', () => {
    expect(src).toMatch(/\.incr\(.*\).*\.catch|catch.*\.incr/s);
  });
});
```

- [ ] **Step 2: Run — expect failures**

```bash
npx vitest run lib/__tests__/ai-chat-org-tracking.test.ts
```

Expected: 2-3 failures.

- [ ] **Step 3: Add the counter to the chat route**

In `app/api/ai/chat/route.ts`:

**Edit 1** — Add Redis import at the top (after existing imports):

```typescript
import { Redis } from '@upstash/redis';
```

**Edit 2** — Add a module-level Redis client after the import block (after the `supabaseService` function definition):

```typescript
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});
```

**Edit 3** — After `const result = await assistant.chat({...})` completes and just before building the `widgetActions` block, add the fire-and-forget counter:

```typescript
    // Fire-and-forget per-org AI usage counter (keyed by orgId + month)
    if (orgId) {
      const month = new Date().toISOString().slice(0, 7); // YYYY-MM
      redis.incr(`usage:ai:${orgId}:${month}`).catch(() => {});
    }
```

- [ ] **Step 4: Run — expect pass**

```bash
npx vitest run lib/__tests__/ai-chat-org-tracking.test.ts
```

Expected: 3 passing.

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```

Expected: all passing. If the existing AI chat tests fail because of the new import, check that `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are present in the test environment or that the Redis client is lazily initialized.

- [ ] **Step 6: Commit**

```bash
git add app/api/ai/chat/route.ts lib/__tests__/ai-chat-org-tracking.test.ts
git commit -m "feat: add per-org AI usage counter to chat endpoint (fire-and-forget Redis incr)"
```

---

## Final Verification

- [ ] **Run the full test suite**

```bash
npx vitest run
```

Expected: all passing.

- [ ] **TypeScript check**

```bash
npx tsc --noEmit
```

Fix any type errors before calling Sprint B done. The most likely issue is `PortfolioRole` type not matching the string returned by Supabase — if so, cast with `membership.role as PortfolioRole` (already done in the helper).

- [ ] **Push to main**

```bash
git push origin main
```
