# Phase 3B — Spend Caps and Transparency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Bound what the platform spends on an organization's behalf, and show that organization exactly what it was.

**Architecture:** One SQL function is the single definition of platform-funded spend, called by the turn RPC, the Builder claim RPC, and the dashboard, so the number that stops an assistant is the number an admin sees. Caps live in a per-org table with a platform ceiling and an optional lower org limit. Only `hard_stop` refuses at turn start; `read_only` and `own_key` are resolution modifiers applied in the resolver.

**Tech Stack:** Supabase (Postgres + RLS + plpgsql), TypeScript, Next.js 15 App Router, Vitest.

**Spec:** `docs/agent-work/specs/2026-08-24-phase3b-caps-and-transparency-design.md`

## Global Constraints

- `db/migrations` is the single source of truth. A new canonical concept gets a new numbered migration; a prerelease correction is folded into the owning migration.
- Every migration change is followed by `npm run db:types:generate`, and `lib/database.types.ts` is committed with it.
- Org-scoped FK column is `org_id`. RLS helpers are `can_view_org`, `is_org_admin`, `is_app_admin`, `user_org_role`.
- Product code reaches data only through `lib/database-client.ts` and repository modules under `lib/api/repositories/`.
- Org-scoped routes live under `app/api/org/[orgId]/**`, use shared access guards, and return `jsonOk` / `jsonError`.
- Browser data access goes through `lib/api/client.ts` and `lib/<domain>/hooks.ts`. Components never call raw `fetch` for domain data.
- Durable AI turn semantics must not be weakened. `begin_ai_turn` stays idempotent per `(user_id, request_id)`.
- **Spend is `COALESCE(reported_cost, computed_cost)` over rows where `deployment_id IS NULL`.** That expression appears in exactly one place — `org_platform_spend`. Do not re-derive it anywhere else.
- The period is a calendar month, passed in as `p_period_start` rather than computed inside the function, so tests can pin it.
- Verification gate for every task: `npm run verify:types`, `npm run verify:lint`, `npm run verify:unit`. Add `npm run verify:migrations` when `db/migrations/` changes and `npm run verify:build` when `app/` or `components/` changes.

## Prerequisite

Task 1 adds migration `0059`, so `npm run verify:migrations` runs a `supabase db reset`, destroying the local `benevolence-walkthrough` stack's contents. Confirmed acceptable on 2026-08-24: no client instances exist. Unlike Phase 3A this does not edit an existing migration, so `supabase migration up` is sufficient for local iteration; the full reset is needed only for the exit criteria.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `db/migrations/0059_org_ai_spend_caps.sql` | Cap table, `org_platform_spend`, `org_ai_usage_report` | 1, 2, 3 |
| `lib/api/repositories/ai-spend-caps.ts` | Cap read/write, clamp on ceiling change | 4 |
| `db/migrations/0033_ai_sessions.sql` | `begin_ai_turn` refuses at the cap | 5 |
| `lib/api/repositories/ai-chat.ts` | Maps the refusal to a typed error before identity check | 5 |
| `lib/ai/resolver.ts` | `read_only` and `own_key` behaviours | 6 |
| `db/migrations/0025_*.sql` (Builder claim) | `builder_claim_code_run` refuses at the cap | 7 |
| `app/api/org/[orgId]/ai-settings/usage/route.ts` | Usage report endpoint | 8 |
| `lib/ai/hooks.ts` | `useAiUsageReport` domain hook | 8 |
| `components/settings/AIUsagePanel.tsx` | Dashboard | 9 |
| `components/settings/AISpendCapSettings.tsx` | Org limit control | 10 |
| `app/api/admin/org/[orgId]/spend-cap/route.ts` | Platform ceiling, app admin only | 10 |
| `scripts/verify/schema-behavior.sql` | Cap constraint and RLS assertions | 11 |

---

# Task 1: The cap table

**Why:** Nothing stores a limit today. The table carries both the platform ceiling and an organization's optional lower limit, with a constraint keeping the second under the first.

**Files:**
- Create: `db/migrations/0059_org_ai_spend_caps.sql`
- Modify: `lib/database.types.ts` (regenerated)
- Test: `tests/integration/ai-spend-caps-schema.test.ts` (create)

**Interfaces:**
- Consumes: `public.organizations`, `public.is_org_admin` from `0001`.
- Produces: table `public.org_ai_spend_caps`, keyed by `org_id`.

- [x] **Step 1: Write the failing test**

Create `tests/integration/ai-spend-caps-schema.test.ts`:

```ts
// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  join(__dirname, '..', '..', 'db/migrations/0059_org_ai_spend_caps.sql'),
  'utf8',
);

describe('org_ai_spend_caps schema', () => {
  it('keys the cap by org_id, not organization_id', () => {
    expect(SQL).toMatch(/org_id\s+uuid PRIMARY KEY REFERENCES public\.organizations/);
    expect(SQL).not.toMatch(/organization_id/);
  });

  it('keeps an organization limit at or below the platform ceiling', () => {
    expect(SQL).toMatch(/org_limit_usd <= platform_limit_usd/);
  });

  it('treats a null limit as absent rather than zero', () => {
    expect(SQL).toMatch(/platform_limit_usd IS NULL OR platform_limit_usd >= 0/);
    expect(SQL).toMatch(/org_limit_usd IS NULL OR org_limit_usd >= 0/);
  });

  it('constrains the behaviour at the ceiling to the three supported modes', () => {
    expect(SQL).toMatch(/CHECK \(on_limit IN \('hard_stop','read_only','own_key'\)\)/);
    expect(SQL).toMatch(/DEFAULT 'hard_stop'/);
  });

  it('lets org admins read but never write', () => {
    expect(SQL).toMatch(/ALTER TABLE public\.org_ai_spend_caps ENABLE ROW LEVEL SECURITY/);
    expect(SQL).toMatch(/FOR SELECT TO authenticated USING \(public\.is_org_admin\(org_id\)\)/);
    expect(SQL).not.toMatch(/FOR ALL TO authenticated/);
    expect(SQL).toMatch(/GRANT SELECT ON public\.org_ai_spend_caps TO authenticated/);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/ai-spend-caps-schema.test.ts`
Expected: FAIL — the migration file does not exist.

- [x] **Step 3: Write the migration**

Create `db/migrations/0059_org_ai_spend_caps.sql`:

```sql
-- =============================================================================
-- 0059_org_ai_spend_caps.sql
-- Per-organization ceilings on platform-funded AI spend, plus the single
-- definition of that spend used by enforcement and reporting alike.
-- Depends on: 0001, 0030
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.org_ai_spend_caps (
  org_id              uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Null means uncapped. Written only through the app-admin route.
  platform_limit_usd  numeric CHECK (platform_limit_usd IS NULL OR platform_limit_usd >= 0),
  -- An organization's self-imposed limit, never above the platform's.
  org_limit_usd       numeric CHECK (org_limit_usd IS NULL OR org_limit_usd >= 0),
  warn_at_percent     integer NOT NULL DEFAULT 80
                        CHECK (warn_at_percent BETWEEN 1 AND 100),
  on_limit            text NOT NULL DEFAULT 'hard_stop'
                        CHECK (on_limit IN ('hard_stop','read_only','own_key')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_ai_spend_caps_org_limit_within_platform
    CHECK (org_limit_usd IS NULL
           OR platform_limit_usd IS NULL
           OR org_limit_usd <= platform_limit_usd)
);

ALTER TABLE public.org_ai_spend_caps ENABLE ROW LEVEL SECURITY;

-- Read-only for org admins: the authority split between the platform ceiling
-- and the organization's own limit lives in the route guards, which RLS
-- cannot express per column.
CREATE POLICY "org_ai_spend_caps_admin_read" ON public.org_ai_spend_caps
  FOR SELECT TO authenticated USING (public.is_org_admin(org_id));
CREATE POLICY "org_ai_spend_caps_service" ON public.org_ai_spend_caps
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.org_ai_spend_caps TO authenticated;
GRANT ALL ON public.org_ai_spend_caps TO service_role;
```

- [x] **Step 4: Apply and regenerate types**

Run: `npx supabase migration up --local && npm run db:types:generate`
Expected: `lib/database.types.ts` gains `org_ai_spend_caps` and is otherwise unchanged.

- [x] **Step 5: Run the tests**

Run: `npx vitest run tests/integration/ai-spend-caps-schema.test.ts && npm run verify:types`
Expected: PASS (5 tests)

- [x] **Step 6: Commit**

```bash
git add db/migrations/0059_org_ai_spend_caps.sql lib/database.types.ts tests/integration/ai-spend-caps-schema.test.ts
git commit -m "feat(db): add per-organization AI spend caps"
```

---

# Task 2: The single definition of spend

**Why:** The number that stops an assistant and the number an administrator sees must be the same number. This function is that number; nothing else may re-derive it.

**Files:**
- Modify: `db/migrations/0059_org_ai_spend_caps.sql`
- Test: `tests/integration/ai-spend-caps-schema.test.ts` (extend)

**Interfaces:**
- Consumes: `public.ai_usage_log` from `0030` — `deployment_id`, `reported_cost`, `computed_cost`, `org_id`, `created_at`.
- Produces: `public.org_platform_spend(p_org_id uuid, p_period_start timestamptz) RETURNS numeric`, executable by `service_role` only.

- [x] **Step 1: Write the failing test**

Append to `tests/integration/ai-spend-caps-schema.test.ts`:

```ts
describe('org_platform_spend', () => {
  it('counts only platform-funded rows', () => {
    expect(SQL).toMatch(/deployment_id IS NULL/);
  });

  it('uses the same cost precedence as the recorder', () => {
    expect(SQL).toMatch(/COALESCE\(reported_cost, computed_cost\)/);
  });

  it('takes the period start as a parameter so tests can pin it', () => {
    expect(SQL).toMatch(/org_platform_spend\(\s*p_org_id uuid,\s*p_period_start timestamptz/);
  });

  it('is executable by the service role only', () => {
    expect(SQL).toMatch(/REVOKE ALL ON FUNCTION public\.org_platform_spend/);
    expect(SQL).toMatch(/GRANT EXECUTE ON FUNCTION public\.org_platform_spend[\s\S]*TO service_role/);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/ai-spend-caps-schema.test.ts`
Expected: FAIL — the function is not defined.

- [x] **Step 3: Add the function**

Append to `db/migrations/0059_org_ai_spend_caps.sql`:

```sql
-- ---------------------------------------------------------------------------
-- The single definition of platform-funded spend.
--
-- Only rows with no deployment_id count: an organization routing a workload to
-- its own deployment is spending its own money, and capping that would
-- throttle something the platform does not pay for.
--
-- Cost precedence matches resolveCost in lib/api/repositories/ai-invocations.ts.
-- If the two disagreed, the cap and the row it read would disagree about the
-- same call.
--
-- Unpriced rows contribute zero, so a platform-default model shipping without
-- a rate under-counts spend. The rate coverage guard added in Phase 3A is what
-- prevents that, and is therefore load-bearing for cap correctness.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.org_platform_spend(
  p_org_id       uuid,
  p_period_start timestamptz
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(COALESCE(reported_cost, computed_cost)), 0)::numeric
  FROM public.ai_usage_log
  WHERE org_id = p_org_id
    AND deployment_id IS NULL
    AND created_at >= p_period_start;
$$;

REVOKE ALL ON FUNCTION public.org_platform_spend(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_platform_spend(uuid, timestamptz) TO service_role;

CREATE INDEX IF NOT EXISTS ai_usage_log_org_platform_spend_idx
  ON public.ai_usage_log(org_id, created_at DESC)
  WHERE deployment_id IS NULL;
```

- [x] **Step 4: Apply and verify against a real database**

Run: `npx supabase migration up --local`

Then confirm the function returns zero rather than null for an organization with no usage — a null would make every comparison against a limit fail silently:

```bash
docker exec supabase_db_benevolence-walkthrough psql -U postgres -d postgres -Atc \
  "SELECT public.org_platform_spend('00000000-0000-0000-0000-000000000000', now() - interval '30 days')"
```

Expected: `0`

- [x] **Step 5: Run the tests**

Run: `npx vitest run tests/integration/ai-spend-caps-schema.test.ts && npm run verify:types`
Expected: PASS (9 tests)

- [x] **Step 6: Commit**

```bash
git add db/migrations/0059_org_ai_spend_caps.sql tests/integration/ai-spend-caps-schema.test.ts
git commit -m "feat(db): add org_platform_spend as the single definition of platform spend"
```

---

# Task 3: The usage report and the reconciliation test

**Why:** The dashboard needs a funding split, a per-workload breakdown and a daily series. The reconciliation test is the reason this is one function rather than three queries: the report's platform total must equal `org_platform_spend`, or the dashboard and the cap disagree.

**Files:**
- Modify: `db/migrations/0059_org_ai_spend_caps.sql`
- Test: `tests/integration/ai-usage-report.behavior.test.ts` (create)

**Interfaces:**
- Consumes: `org_platform_spend` from Task 2.
- Produces: `public.org_ai_usage_report(p_org_id uuid, p_period_start timestamptz) RETURNS jsonb` with keys `platform_cost`, `org_cost`, `invocations`, `failed_invocations`, `by_workload` (array of `{workload_id, funding, cost, invocations}`), `daily` (array of `{day, platform_cost, org_cost}`).

- [x] **Step 1: Write the failing behavioural test**

Create `tests/integration/ai-usage-report.behavior.test.ts`. This one runs against the live local database because the guarantee is about SQL agreement, which a text assertion cannot check:

```ts
// @vitest-environment node

import { execFileSync } from 'node:child_process';
import { describe, expect, it, beforeAll } from 'vitest';

const CONTAINER = 'supabase_db_benevolence-walkthrough';
const ORG = '3b000000-0000-4000-8000-000000000001';
const PERIOD = "date_trunc('month', now())";

function sql(statement: string): string {
  return execFileSync(
    'docker',
    ['exec', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', statement],
    { encoding: 'utf8' },
  ).trim();
}

beforeAll(() => {
  // A deterministic fixture: two platform-funded rows and one org-funded row.
  sql(`
    DELETE FROM public.ai_usage_log WHERE org_id = '${ORG}';
    DELETE FROM public.organizations WHERE id = '${ORG}';
    INSERT INTO public.organizations (id, name, org_type)
      VALUES ('${ORG}', 'Spend Report Org', 'private_foundation');
    INSERT INTO public.ai_usage_log
      (org_id, scope_kind, workload_id, operation, connector, requested_model,
       input_tokens, output_tokens, computed_cost, cost_source, status)
    VALUES
      ('${ORG}', 'organization', 'assistant', 'tool_conversation', 'anthropic',
       'claude-opus-5', 1000, 100, 10.00, 'computed', 'succeeded'),
      ('${ORG}', 'organization', 'builder_review', 'text_generation', 'anthropic',
       'claude-opus-5', 1000, 100, 5.00, 'computed', 'succeeded');
  `);
});

describe('org_ai_usage_report', () => {
  // The reason this function exists rather than three separate queries.
  it('reports a platform total equal to org_platform_spend', () => {
    const reported = sql(
      `SELECT (public.org_ai_usage_report('${ORG}', ${PERIOD})->>'platform_cost')::numeric`,
    );
    const enforced = sql(`SELECT public.org_platform_spend('${ORG}', ${PERIOD})`);
    expect(Number(reported)).toBeCloseTo(Number(enforced), 6);
    expect(Number(enforced)).toBeCloseTo(15, 6);
  });

  it('breaks spend down by workload, summing to the platform total', () => {
    const rows = JSON.parse(sql(
      `SELECT public.org_ai_usage_report('${ORG}', ${PERIOD})->'by_workload'`,
    )) as Array<{ workload_id: string; cost: number }>;
    const ids = rows.map(row => row.workload_id).sort();
    expect(ids).toEqual(['assistant', 'builder_review']);
    expect(rows.reduce((sum, row) => sum + Number(row.cost), 0)).toBeCloseTo(15, 6);
  });

  it('excludes organization-funded rows from the platform total', () => {
    sql(`
      INSERT INTO public.ai_usage_log
        (org_id, scope_kind, workload_id, operation, connector, requested_model,
         deployment_id, reported_cost, cost_source, status)
      SELECT '${ORG}', 'organization', 'assistant', 'tool_conversation', 'openrouter',
             'anthropic/claude-opus-5', d.id, 99.00, 'reported', 'succeeded'
      FROM public.org_ai_deployments d LIMIT 1;
    `);
    const platform = sql(`SELECT public.org_platform_spend('${ORG}', ${PERIOD})`);
    // Unchanged: the org-funded row is their provider bill, not platform cost.
    expect(Number(platform)).toBeCloseTo(15, 6);
  });

  // An unpriced row adds nothing, so a platform-default model shipping
  // without a rate under-counts spend and the cap under-enforces. Phase 3A's
  // rate coverage guard is what prevents that; this test is where the
  // dependency is visible rather than only described in prose.
  it('counts an unpriced row as zero, not as an error', () => {
    const before = Number(sql(`SELECT public.org_platform_spend('${ORG}', ${PERIOD})`));
    sql(`
      INSERT INTO public.ai_usage_log
        (org_id, scope_kind, workload_id, operation, connector, requested_model,
         input_tokens, output_tokens, cost_source, status)
      VALUES ('${ORG}', 'organization', 'letters', 'text_generation', 'anthropic',
              'some-unpriced-model', 5000, 5000, 'unpriced', 'succeeded');
    `);
    const after = Number(sql(`SELECT public.org_platform_spend('${ORG}', ${PERIOD})`));
    expect(after).toBeCloseTo(before, 6);
  });

  it('returns a daily series covering the period', () => {
    const daily = JSON.parse(sql(
      `SELECT public.org_ai_usage_report('${ORG}', ${PERIOD})->'daily'`,
    )) as Array<{ day: string; platform_cost: number }>;
    expect(daily.length).toBeGreaterThan(0);
    expect(daily.reduce((sum, row) => sum + Number(row.platform_cost), 0)).toBeCloseTo(15, 6);
  });
});
```

If the third test finds no `org_ai_deployments` row to borrow, insert a connection and deployment fixture in `beforeAll` the way `scripts/verify/schema-behavior.sql` does — do not weaken the assertion to skip the case.

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/ai-usage-report.behavior.test.ts`
Expected: FAIL — `org_ai_usage_report` does not exist.

- [x] **Step 3: Add the report function**

Append to `db/migrations/0059_org_ai_spend_caps.sql`:

```sql
-- ---------------------------------------------------------------------------
-- The dashboard's aggregate. Its platform_cost must equal org_platform_spend
-- for the same period; a behavioural test asserts that, because a dashboard
-- reading 80% while the cap fires destroys trust in both numbers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.org_ai_usage_report(
  p_org_id       uuid,
  p_period_start timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH rows AS (
    SELECT
      workload_id,
      status,
      deployment_id IS NULL AS platform_funded,
      COALESCE(reported_cost, computed_cost, 0) AS cost,
      date_trunc('day', created_at) AS day
    FROM public.ai_usage_log
    WHERE org_id = p_org_id
      AND created_at >= p_period_start
  )
  SELECT jsonb_build_object(
    'period_start', p_period_start,
    'platform_cost', COALESCE((SELECT SUM(cost) FROM rows WHERE platform_funded), 0),
    'org_cost',      COALESCE((SELECT SUM(cost) FROM rows WHERE NOT platform_funded), 0),
    'invocations',        (SELECT COUNT(*) FROM rows),
    'failed_invocations', (SELECT COUNT(*) FROM rows WHERE status <> 'succeeded'),
    'by_workload', COALESCE((
      SELECT jsonb_agg(entry ORDER BY entry->>'workload_id')
      FROM (
        SELECT jsonb_build_object(
                 'workload_id', workload_id,
                 'funding', CASE WHEN platform_funded THEN 'platform' ELSE 'org' END,
                 'cost', SUM(cost),
                 'invocations', COUNT(*)
               ) AS entry
        FROM rows
        WHERE platform_funded
        GROUP BY workload_id, platform_funded
      ) grouped
    ), '[]'::jsonb),
    'daily', COALESCE((
      SELECT jsonb_agg(entry ORDER BY entry->>'day')
      FROM (
        SELECT jsonb_build_object(
                 'day', day,
                 'platform_cost', SUM(cost) FILTER (WHERE platform_funded),
                 'org_cost',      SUM(cost) FILTER (WHERE NOT platform_funded)
               ) AS entry
        FROM rows
        GROUP BY day
      ) series
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.org_ai_usage_report(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_ai_usage_report(uuid, timestamptz) TO service_role;
```

`by_workload` deliberately filters to platform-funded rows: it exists to explain the capped number, and mixing funding sources into one breakdown would make the column not sum to anything meaningful.

- [x] **Step 4: Apply and run the tests**

Run: `npx supabase migration up --local && npx vitest run tests/integration/ai-usage-report.behavior.test.ts`
Expected: PASS (4 tests)

If the daily test fails on `SUM(...) FILTER` producing null for a day with only org-funded rows, wrap both sums in `COALESCE(..., 0)` — a null in the series renders as a gap in the chart rather than a zero.

- [x] **Step 5: Commit**

```bash
git add db/migrations/0059_org_ai_spend_caps.sql tests/integration/ai-usage-report.behavior.test.ts
git commit -m "feat(db): add the usage report and pin it to the enforcement total"
```

---

# Task 4: The cap repository

**Why:** Two write paths with different authority — an app admin sets the ceiling, an org admin sets a lower limit — and one read path used by enforcement and display. Lowering the ceiling below an existing org limit would violate the CHECK, so the app-admin path clamps.

**Files:**
- Create: `lib/api/repositories/ai-spend-caps.ts`
- Test: `lib/api/repositories/__tests__/ai-spend-caps.test.ts` (create)

**Interfaces:**
- Consumes: `createElevatedClient` from `lib/api/admin-client`; `OrgAccessContext` from `lib/api/principals`.
- Produces `createAISpendCapRepository(scope)` with:
  - `periodStart(now?: Date): Date` — first instant of the calendar month
  - `getStatus(): Promise<SpendCapStatus>` where `SpendCapStatus = { effectiveLimitUsd: number | null; platformLimitUsd: number | null; orgLimitUsd: number | null; spendUsd: number; onLimit: 'hard_stop' | 'read_only' | 'own_key'; warnAtPercent: number; state: 'uncapped' | 'under' | 'warn' | 'over'; periodStart: string }`
  - `setOrgLimit(limitUsd: number | null): Promise<void>` — rejects a value above the platform ceiling
  - `setPlatformLimit(limitUsd: number | null): Promise<void>` — clamps `org_limit_usd` in the same statement

- [x] **Step 1: Write the failing test**

Create `lib/api/repositories/__tests__/ai-spend-caps.test.ts`:

```ts
// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { effectiveLimit, capState, periodStartFor } from '@/lib/api/repositories/ai-spend-caps';

describe('effectiveLimit', () => {
  it('takes the lower of the two limits', () => {
    expect(effectiveLimit(500, 200)).toBe(200);
    expect(effectiveLimit(200, 500)).toBe(200);
  });

  // A null limit is absent, not zero. Treating it as zero would cap every
  // organization at nothing the moment a row exists.
  it('treats null as absent rather than zero', () => {
    expect(effectiveLimit(500, null)).toBe(500);
    expect(effectiveLimit(null, 200)).toBe(200);
    expect(effectiveLimit(null, null)).toBeNull();
  });
});

describe('capState', () => {
  it('is uncapped when there is no effective limit', () => {
    expect(capState({ effectiveLimitUsd: null, spendUsd: 9999, warnAtPercent: 80 })).toBe('uncapped');
  });

  it('is under below the warning threshold', () => {
    expect(capState({ effectiveLimitUsd: 100, spendUsd: 79, warnAtPercent: 80 })).toBe('under');
  });

  it('warns at the threshold', () => {
    expect(capState({ effectiveLimitUsd: 100, spendUsd: 80, warnAtPercent: 80 })).toBe('warn');
  });

  it('is over at exactly the limit, not just past it', () => {
    expect(capState({ effectiveLimitUsd: 100, spendUsd: 100, warnAtPercent: 80 })).toBe('over');
    expect(capState({ effectiveLimitUsd: 100, spendUsd: 100.01, warnAtPercent: 80 })).toBe('over');
  });

  it('is over when the limit is zero and nothing has been spent', () => {
    expect(capState({ effectiveLimitUsd: 0, spendUsd: 0, warnAtPercent: 80 })).toBe('over');
  });
});

describe('periodStartFor', () => {
  it('is the first instant of the calendar month in UTC', () => {
    expect(periodStartFor(new Date('2026-08-24T13:45:00Z')).toISOString())
      .toBe('2026-08-01T00:00:00.000Z');
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/api/repositories/__tests__/ai-spend-caps.test.ts`
Expected: FAIL — the module does not exist.

- [x] **Step 3: Write the pure helpers**

Create `lib/api/repositories/ai-spend-caps.ts` beginning with the logic that needs no database:

```ts
import { createElevatedClient, type ElevatedClient } from '@/lib/api/admin-client';
import type { OrgAccessContext } from '@/lib/api/principals';

export type CapBehaviour = 'hard_stop' | 'read_only' | 'own_key';
export type CapState = 'uncapped' | 'under' | 'warn' | 'over';

export type SpendCapStatus = {
  effectiveLimitUsd: number | null;
  platformLimitUsd: number | null;
  orgLimitUsd: number | null;
  spendUsd: number;
  onLimit: CapBehaviour;
  warnAtPercent: number;
  state: CapState;
  periodStart: string;
};

/** Null is an absent limit, never a limit of zero. */
export function effectiveLimit(
  platformLimitUsd: number | null,
  orgLimitUsd: number | null,
): number | null {
  const limits = [platformLimitUsd, orgLimitUsd].filter(
    (value): value is number => value !== null && value !== undefined,
  );
  return limits.length === 0 ? null : Math.min(...limits);
}

export function capState(input: {
  effectiveLimitUsd: number | null;
  spendUsd: number;
  warnAtPercent: number;
}): CapState {
  if (input.effectiveLimitUsd === null) return 'uncapped';
  // At the limit is over: allowing one more turn at exactly the ceiling would
  // spend past it, since the turn's cost is not known until after it runs.
  if (input.spendUsd >= input.effectiveLimitUsd) return 'over';
  const used = input.effectiveLimitUsd === 0 ? 100 : (input.spendUsd / input.effectiveLimitUsd) * 100;
  return used >= input.warnAtPercent ? 'warn' : 'under';
}

/** Calendar month, UTC. Rolling windows never reset cleanly. */
export function periodStartFor(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
```

- [x] **Step 4: Run the helper tests**

Run: `npx vitest run lib/api/repositories/__tests__/ai-spend-caps.test.ts`
Expected: PASS (9 tests)

- [x] **Step 5: Add the repository**

Append to `lib/api/repositories/ai-spend-caps.ts`. `setPlatformLimit` clamps so the platform can always lower a ceiling it owns:

```ts
type SpendCapScope = Pick<OrgAccessContext, 'orgId'>;

export function createAISpendCapRepository(
  scope: SpendCapScope,
  dependencies: { db?: ElevatedClient; now?: () => Date } = {},
) {
  const db = dependencies.db ?? createElevatedClient();
  const now = dependencies.now ?? (() => new Date());

  async function readRow() {
    const { data, error } = await db.from('org_ai_spend_caps')
      .select('*').eq('org_id', scope.orgId).maybeSingle();
    if (error) throw error;
    return data;
  }

  return {
    periodStart: () => periodStartFor(now()),

    async getStatus(): Promise<SpendCapStatus> {
      const periodStart = periodStartFor(now());
      const [row, spend] = await Promise.all([
        readRow(),
        db.rpc('org_platform_spend', {
          p_org_id: scope.orgId,
          p_period_start: periodStart.toISOString(),
        }),
      ]);
      if (spend.error) throw spend.error;

      const platformLimitUsd = row?.platform_limit_usd === null || row?.platform_limit_usd === undefined
        ? null : Number(row.platform_limit_usd);
      const orgLimitUsd = row?.org_limit_usd === null || row?.org_limit_usd === undefined
        ? null : Number(row.org_limit_usd);
      const limit = effectiveLimit(platformLimitUsd, orgLimitUsd);
      const spendUsd = Number(spend.data ?? 0);
      const warnAtPercent = row?.warn_at_percent ?? 80;

      return {
        effectiveLimitUsd: limit,
        platformLimitUsd,
        orgLimitUsd,
        spendUsd,
        onLimit: (row?.on_limit ?? 'hard_stop') as CapBehaviour,
        warnAtPercent,
        state: capState({ effectiveLimitUsd: limit, spendUsd, warnAtPercent }),
        periodStart: periodStart.toISOString(),
      };
    },

    async setOrgLimit(limitUsd: number | null) {
      const row = await readRow();
      const ceiling = row?.platform_limit_usd === null || row?.platform_limit_usd === undefined
        ? null : Number(row.platform_limit_usd);
      if (limitUsd !== null && ceiling !== null && limitUsd > ceiling) {
        throw new Error(`Organization limit cannot exceed the platform ceiling of ${ceiling}`);
      }
      const { error } = await db.from('org_ai_spend_caps').upsert({
        org_id: scope.orgId,
        org_limit_usd: limitUsd,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id' });
      if (error) throw error;
    },

    /**
     * Clamps the organization's limit in the same statement. Without it, an
     * app admin lowering the ceiling below an existing org limit would violate
     * the CHECK — the platform unable to reduce a budget it owns.
     */
    async setPlatformLimit(limitUsd: number | null) {
      const row = await readRow();
      const currentOrgLimit = row?.org_limit_usd === null || row?.org_limit_usd === undefined
        ? null : Number(row.org_limit_usd);
      const clamped = limitUsd === null || currentOrgLimit === null
        ? currentOrgLimit
        : Math.min(currentOrgLimit, limitUsd);

      const { error } = await db.from('org_ai_spend_caps').upsert({
        org_id: scope.orgId,
        platform_limit_usd: limitUsd,
        org_limit_usd: clamped,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id' });
      if (error) throw error;
    },

    async setBehaviour(onLimit: CapBehaviour, warnAtPercent: number) {
      const { error } = await db.from('org_ai_spend_caps').upsert({
        org_id: scope.orgId,
        on_limit: onLimit,
        warn_at_percent: warnAtPercent,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id' });
      if (error) throw error;
    },
  };
}

export type AISpendCapRepository = ReturnType<typeof createAISpendCapRepository>;
```

- [x] **Step 6: Run the gate**

Run: `npx vitest run lib/api && npm run verify:types`
Expected: PASS

- [x] **Step 7: Commit**

```bash
git add lib/api/repositories/ai-spend-caps.ts lib/api/repositories/__tests__/ai-spend-caps.test.ts
git commit -m "feat(ai): add the spend cap repository with a clamping ceiling"
```

---

# Task 5: Hard stop at turn start

**Why:** `hard_stop` is the only behaviour that refuses, and `begin_ai_turn` is where a refusal costs nothing — before a turn row, a session, or a model call.

**The envelope cannot carry a refusal unchanged.** `requireRpcIdentity` (`lib/api/repositories/ai-chat.ts:66`) runs before the `started` branch and throws when `turn_id` is absent. A refusal has no turn, so `beginTurn` must test for it first.

**Files:**
- Modify: `db/migrations/0033_ai_sessions.sql` (`begin_ai_turn`)
- Modify: `lib/api/repositories/ai-chat.ts`
- Test: `tests/integration/ai-turn-spend-cap.test.ts` (create)

**Interfaces:**
- Consumes: `org_platform_spend` from Task 2; `org_ai_spend_caps` from Task 1.
- Produces: `begin_ai_turn` returns `{ started: false, cap_exceeded: true, effective_limit_usd, period_spend_usd, period_start }` when over. `BeginAiTurnResult` gains a `{ state: 'spend_cap_reached', effectiveLimitUsd, spendUsd, periodStart }` variant.

- [x] **Step 1: Write the failing test**

Create `tests/integration/ai-turn-spend-cap.test.ts`:

```ts
// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const SESSIONS = readFileSync(join(ROOT, 'db/migrations/0033_ai_sessions.sql'), 'utf8');
const CHAT = readFileSync(join(ROOT, 'lib/api/repositories/ai-chat.ts'), 'utf8');

describe('spend cap at turn start', () => {
  it('checks the cap inside begin_ai_turn', () => {
    expect(SESSIONS).toMatch(/org_platform_spend/);
    expect(SESSIONS).toMatch(/cap_exceeded/);
  });

  // Only hard_stop refuses. read_only and own_key change how a turn resolves,
  // which is the resolver's job.
  it('refuses only for hard_stop', () => {
    expect(SESSIONS).toMatch(/on_limit\s*=\s*'hard_stop'/);
  });

  // A workload routed to an organization deployment is org-funded and must
  // not be capped: that is their provider bill, not platform cost.
  it('exempts workloads with an enabled organization route', () => {
    expect(SESSIONS).toMatch(/org_ai_routes/);
  });

  it('returns rather than raises, so a cap is distinguishable from a fault', () => {
    const body = SESSIONS.slice(SESSIONS.indexOf('FUNCTION public.begin_ai_turn'));
    const capBlock = body.slice(body.indexOf('cap_exceeded') - 400, body.indexOf('cap_exceeded') + 400);
    expect(capBlock).not.toMatch(/RAISE EXCEPTION/);
  });

  it('handles the refusal before the identity check that would reject it', () => {
    const capIndex = CHAT.indexOf('cap_exceeded');
    const identityIndex = CHAT.indexOf('requireRpcIdentity(result)');
    expect(capIndex).toBeGreaterThan(-1);
    expect(capIndex).toBeLessThan(identityIndex);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/ai-turn-spend-cap.test.ts`
Expected: FAIL — neither file mentions the cap.

- [x] **Step 3: Add the check to begin_ai_turn**

In `db/migrations/0033_ai_sessions.sql`, add to the `DECLARE` block of `begin_ai_turn`:

```sql
  v_org_id UUID;
  v_cap public.org_ai_spend_caps%ROWTYPE;
  v_limit NUMERIC;
  v_spend NUMERIC;
  v_period_start TIMESTAMPTZ;
```

Then, immediately after the existing content validation and before the advisory lock:

```sql
  -- Spend cap. Only hard_stop refuses here; read_only and own_key change how
  -- the turn resolves and are applied in lib/ai/resolver.ts.
  SELECT org_id INTO v_org_id FROM public.portfolios WHERE id = p_portfolio_id;

  SELECT * INTO v_cap FROM public.org_ai_spend_caps WHERE org_id = v_org_id;

  IF FOUND AND v_cap.on_limit = 'hard_stop' THEN
    v_limit := LEAST(
      COALESCE(v_cap.platform_limit_usd, v_cap.org_limit_usd),
      COALESCE(v_cap.org_limit_usd, v_cap.platform_limit_usd)
    );

    -- A workload routed to an organization deployment spends the org's own
    -- money and is not counted, so it is not capped either.
    IF v_limit IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.org_ai_routes r
      WHERE r.org_id = v_org_id
        AND r.workload_id = 'assistant'
        AND r.is_enabled
        AND EXISTS (
          SELECT 1 FROM public.org_ai_route_targets t
          WHERE t.route_id = r.id AND t.target_kind = 'deployment'
        )
    ) THEN
      v_period_start := date_trunc('month', now());
      v_spend := public.org_platform_spend(v_org_id, v_period_start);

      IF v_spend >= v_limit THEN
        RETURN jsonb_build_object(
          'started', false,
          'cap_exceeded', true,
          'effective_limit_usd', v_limit,
          'period_spend_usd', v_spend,
          'period_start', v_period_start
        );
      END IF;
    END IF;
  END IF;
```

`LEAST` with the two `COALESCE` expressions yields the lower of whichever limits are present, and null when both are absent — `LEAST(NULL, x)` in Postgres ignores nulls, which would otherwise make a single null limit win.

- [x] **Step 4: Map the refusal in the repository**

In `lib/api/repositories/ai-chat.ts`, extend `BeginTurnRpcResult`:

```ts
  cap_exceeded?: boolean;
  effective_limit_usd?: number | string | null;
  period_spend_usd?: number | string | null;
  period_start?: string | null;
```

Add the variant to `BeginAiTurnResult` and branch before the identity check:

```ts
      const result = (data ?? {}) as BeginTurnRpcResult;

      // Before requireRpcIdentity: a refusal has no turn, and that check
      // throws on a result without one.
      if (result.cap_exceeded) {
        return {
          state: 'spend_cap_reached',
          effectiveLimitUsd: Number(result.effective_limit_usd ?? 0),
          spendUsd: Number(result.period_spend_usd ?? 0),
          periodStart: result.period_start ?? new Date().toISOString(),
        };
      }

      const identity = requireRpcIdentity(result);
```

- [x] **Step 5: Surface it in the chat route**

Find the route consuming `beginTurn` (`grep -rn "beginTurn" app/api`) and add a branch for `state === 'spend_cap_reached'` returning `jsonError` with 402 and a message naming the limit and the reset date. 402 rather than 429: this is a spending limit, not a rate limit, and the distinction matters to anyone reading logs.

- [x] **Step 6: Apply and run the tests**

Run: `npx supabase migration up --local && npx vitest run tests/integration lib/api && npm run verify:types`

`migration up` will not re-run `0033`. Apply the changed function directly for local testing:

```bash
docker exec -i supabase_db_benevolence-walkthrough psql -U postgres -d postgres \
  < db/migrations/0033_ai_sessions.sql
```

Expected: PASS

- [x] **Step 7: Commit**

```bash
git add db/migrations/0033_ai_sessions.sql lib/api/repositories/ai-chat.ts app/api tests/integration
git commit -m "feat(ai): refuse new turns at the spend cap"
```

---

# Task 6: read_only and own_key in the resolver

**Why:** Neither behaviour refuses anything — they change how a turn resolves. Putting them in the RPC would mean returning routing instructions from a function whose job is turn identity.

**Files:**
- Modify: `lib/ai/resolver.ts`
- Test: `lib/ai/__tests__/resolver-spend-cap.test.ts` (create)

**Interfaces:**
- Consumes: `createAISpendCapRepository` from Task 4; the resolved-route fixture from `lib/ai/__tests__/resolver-fixtures.ts`.
- Produces: `resolveOrganizationAIExecution` applies the cap behaviour. No new exports.

- [x] **Step 1: Write the failing test**

Create `lib/ai/__tests__/resolver-spend-cap.test.ts`:

```ts
// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getWorkloadRoute, rpc, getStatus } = vi.hoisted(() => ({
  getWorkloadRoute: vi.fn(),
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  getStatus: vi.fn(),
}));

vi.mock('@/lib/api/repositories/ai-routing', () => ({
  createAIRoutingRepository: () => ({ getWorkloadRoute }),
}));
vi.mock('@/lib/api/admin-client', () => ({ createElevatedClient: () => ({ rpc }) }));
vi.mock('@/lib/api/repositories/ai-spend-caps', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/repositories/ai-spend-caps')>()),
  createAISpendCapRepository: () => ({ getStatus }),
}));

import { resolveOrganizationAIExecution } from '@/lib/ai/resolver';
import { RESOLVER_SCOPE, connectorRoute } from './resolver-fixtures';

function underCap() {
  return { state: 'under', onLimit: 'hard_stop', effectiveLimitUsd: 100, spendUsd: 1 };
}

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: null, error: null });
  getStatus.mockResolvedValue(underCap());
  getWorkloadRoute.mockResolvedValue(null);
});

describe('read_only at the cap', () => {
  it('strips write tools from a platform-default plan', async () => {
    getStatus.mockResolvedValue({ ...underCap(), state: 'over', onLimit: 'read_only' });
    const plan = await resolveOrganizationAIExecution(RESOLVER_SCOPE, 'assistant');
    expect(plan.toolMode).toBe('read_only');
  });

  it('leaves tools alone below the cap', async () => {
    const plan = await resolveOrganizationAIExecution(RESOLVER_SCOPE, 'assistant');
    expect(plan.toolMode).toBe('full');
  });
});

describe('own_key at the cap', () => {
  it('resolves to an organization deployment instead of the platform default', async () => {
    getStatus.mockResolvedValue({ ...underCap(), state: 'over', onLimit: 'own_key' });
    getWorkloadRoute.mockResolvedValue(connectorRoute({
      connector: 'anthropic',
      catalogTemplateId: 'anthropic-claude-opus-5',
      providerModelId: 'claude-opus-5',
    }));

    const plan = await resolveOrganizationAIExecution(RESOLVER_SCOPE, 'assistant');
    expect(plan.targets[0].kind).toBe('deployment');
  });

  // Without an eligible deployment there is nowhere to fall back to, and
  // continuing would spend past the cap.
  it('degrades to a refusal when no eligible deployment exists', async () => {
    getStatus.mockResolvedValue({ ...underCap(), state: 'over', onLimit: 'own_key' });
    getWorkloadRoute.mockResolvedValue(null);

    await expect(resolveOrganizationAIExecution(RESOLVER_SCOPE, 'assistant'))
      .rejects.toMatchObject({ code: 'policy_unsatisfied' });
  });
});

describe('platform tooling', () => {
  it('does not consult the cap for non-routable workloads', async () => {
    await resolveOrganizationAIExecution(RESOLVER_SCOPE, 'builder_plan');
    expect(getStatus).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/ai/__tests__/resolver-spend-cap.test.ts`
Expected: FAIL — the resolver never calls `getStatus`.

- [x] **Step 3: Apply the behaviours**

In `lib/ai/resolver.ts`, inside `resolveOrganizationAIExecution` after the non-routable short-circuit added in Phase 3A and before the route lookup:

```ts
  const cap = await createAISpendCapRepository({ orgId: scope.orgId }).getStatus();
  const overCap = cap.state === 'over';
```

Then, where the platform-default plan is returned when no route exists, apply `read_only`, and where `own_key` has no deployment to fall back to, refuse:

```ts
  if (!resolved) {
    if (overCap && cap.onLimit === 'own_key') {
      // own_key needs an organization deployment to move onto. Without one,
      // continuing would spend past the cap, so it degrades to a stop.
      throw new AIExecutionError(
        'policy_unsatisfied',
        'Monthly AI spend limit reached and no organization deployment is available',
      );
    }
    const plan = resolveAIExecution(scope, workloadId);
    return bindDurableTurnPlan(
      scope,
      overCap && cap.onLimit === 'read_only' ? withReadOnlyTools(plan) : plan,
    );
  }
```

Add the helper near `platformTarget`:

```ts
/** Strips write tools without changing routing, for the read_only cap mode. */
function withReadOnlyTools(plan: AIExecutionPlan): AIExecutionPlan {
  return Object.freeze({
    ...plan,
    toolMode: 'read_only' as const,
    targets: plan.targets.map(target => Object.freeze({ ...target, toolMode: 'read_only' as const })),
  });
}
```

Apply the same `read_only` wrap to the configured-route return at the end of the function.

- [x] **Step 4: Place the read_only banner, or drop read_only**

`read_only` silently removes the assistant's ability to act. The spec makes a visible banner a condition of shipping it, because "it stopped being able to do things and nobody said why" is worse than offering two behaviours instead of three.

Find the assistant surface that consumes the chat route:

```bash
grep -rln "useAssistant\|assistant" components/ --include=*.tsx | head
```

The plan cannot name the file because the assistant UI was not read while writing it. Whichever component renders the conversation gains a banner when the org is over its cap with `onLimit: 'read_only'` — "Monthly AI limit reached. The assistant can answer questions but cannot make changes until 1 September." The cap state is already available from `useAiUsageReport` (Task 8).

**If there is no coherent place to put it, stop and say so.** The correct response is removing `'read_only'` from the `on_limit` CHECK in `0059` and from the enum in Tasks 4, 6 and 10 — not shipping a silent capability change. That is a decision to raise, not to make quietly.

- [x] **Step 5: Run the tests**

Run: `npx vitest run lib/ai && npm run verify:types`
Expected: PASS. `resolver-phase1.test.ts` and `resolver-connectors.test.ts` must stay green — they mock no cap repository, so `getStatus` resolving undefined would break them. If they fail, give the mock a default in those files rather than making the resolver tolerate a missing cap.

- [x] **Step 6: Commit**

```bash
git add lib/ai/resolver.ts lib/ai/__tests__
git commit -m "feat(ai): apply read_only and own_key cap behaviours in the resolver"
```

---

# Task 7: Builder hard-stops at the cap

**Why:** Phase 3A made Builder workloads non-routable and platform-funded, so `own_key` is impossible and `read_only` is meaningless for a scaffold run. Builder refuses regardless of the configured behaviour — and a proposal that stalls with no explanation is the worst available outcome, so the run is marked failed with a reason.

**Files:**
- Modify: `lib/builder/proposal-state.ts` (claim wrapper, line 266 onward)
- Test: `lib/builder/__tests__/builder-spend-cap.test.ts` (create)

**Interfaces:**
- Consumes: `createAISpendCapRepository` from Task 4.
- Produces: the claim wrapper returns a spend-cap outcome the worker maps to a failed run.

- [x] **Step 1: Write the failing test**

Create `lib/builder/__tests__/builder-spend-cap.test.ts`:

```ts
// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getStatus } = vi.hoisted(() => ({ getStatus: vi.fn() }));

vi.mock('@/lib/api/repositories/ai-spend-caps', () => ({
  createAISpendCapRepository: () => ({ getStatus }),
}));

import { isBlockedBySpendCap } from '@/lib/builder/proposal-state';

beforeEach(() => vi.clearAllMocks());

describe('builder spend cap', () => {
  it('blocks a run when the organization is over its cap', async () => {
    getStatus.mockResolvedValue({ state: 'over', onLimit: 'hard_stop', effectiveLimitUsd: 100, spendUsd: 120 });
    await expect(isBlockedBySpendCap('org-1')).resolves.toMatchObject({ blocked: true });
  });

  // Builder is platform-funded and non-routable, so own_key cannot apply and
  // read_only is meaningless for a scaffold run.
  it('blocks regardless of the configured behaviour', async () => {
    for (const onLimit of ['read_only', 'own_key'] as const) {
      getStatus.mockResolvedValue({ state: 'over', onLimit, effectiveLimitUsd: 100, spendUsd: 120 });
      await expect(isBlockedBySpendCap('org-1')).resolves.toMatchObject({ blocked: true });
    }
  });

  it('allows a run below the cap', async () => {
    getStatus.mockResolvedValue({ state: 'under', onLimit: 'hard_stop', effectiveLimitUsd: 100, spendUsd: 1 });
    await expect(isBlockedBySpendCap('org-1')).resolves.toMatchObject({ blocked: false });
  });

  it('allows a run when the organization is uncapped', async () => {
    getStatus.mockResolvedValue({ state: 'uncapped', onLimit: 'hard_stop', effectiveLimitUsd: null, spendUsd: 999 });
    await expect(isBlockedBySpendCap('org-1')).resolves.toMatchObject({ blocked: false });
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/builder/__tests__/builder-spend-cap.test.ts`
Expected: FAIL — `isBlockedBySpendCap` is not exported.

- [x] **Step 3: Add the check**

In `lib/builder/proposal-state.ts`, above the claim wrapper:

```ts
import { createAISpendCapRepository } from '@/lib/api/repositories/ai-spend-caps';

/**
 * Builder is platform-funded and its workloads are not routable to an
 * organization deployment, so own_key cannot apply and read_only is
 * meaningless for a scaffold run. Builder stops at the cap whatever the
 * organization configured.
 */
export async function isBlockedBySpendCap(
  orgId: string,
): Promise<{ blocked: boolean; limitUsd?: number; spendUsd?: number }> {
  const status = await createAISpendCapRepository({ orgId }).getStatus();
  if (status.state !== 'over') return { blocked: false };
  return {
    blocked: true,
    limitUsd: status.effectiveLimitUsd ?? undefined,
    spendUsd: status.spendUsd,
  };
}
```

Then call it in the claim wrapper before the `builder_claim_code_run` RPC, and when blocked, mark the run failed through the existing `markProposalRunFailed(proposalId, orgId, message)` helper with a message naming the limit — rather than leaving the proposal queued.

- [x] **Step 4: Run the tests**

Run: `npx vitest run lib/builder && npm run verify:types`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add lib/builder
git commit -m "feat(builder): stop scaffold runs at the organization spend cap"
```

---

# Task 8: The usage endpoint and hook

**Why:** The settings payload already carries connections, deployments, routes and catalog and is fetched on every settings page load. The report belongs on its own endpoint so a page that is not looking at spend does not pay for it.

**Files:**
- Create: `app/api/org/[orgId]/ai-settings/usage/route.ts`
- Modify: `lib/ai/hooks.ts`
- Modify: `lib/api/repositories/ai-settings.ts` (replace the in-memory reduction with cap status)
- Test: `tests/integration/ai-usage-endpoint.test.ts` (create)

**Interfaces:**
- Consumes: `org_ai_usage_report` from Task 3; `createAISpendCapRepository` from Task 4.
- Produces: `GET /api/org/[orgId]/ai-settings/usage` → `{ report, cap }`. `useAiUsageReport(orgId)` from `lib/ai/hooks.ts`.

- [x] **Step 1: Write the failing test**

Create `tests/integration/ai-usage-endpoint.test.ts`:

```ts
// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const ROUTE = readFileSync(
  join(ROOT, 'app/api/org/[orgId]/ai-settings/usage/route.ts'), 'utf8',
);
const SETTINGS = readFileSync(join(ROOT, 'lib/api/repositories/ai-settings.ts'), 'utf8');

describe('usage endpoint', () => {
  it('guards org admin access', () => {
    expect(ROUTE).toMatch(/requireOrgAccess\(orgId, 'admin'\)/);
  });

  it('reads the report from SQL rather than reducing rows in TypeScript', () => {
    expect(ROUTE).toMatch(/org_ai_usage_report/);
    expect(ROUTE).not.toMatch(/\.reduce\(/);
  });

  it('returns cap status alongside the report', () => {
    expect(ROUTE).toMatch(/getStatus\(\)/);
  });

  // The heavy aggregation moves out; the settings payload keeps only status.
  it('drops the in-memory usage reduction from the settings payload', () => {
    expect(SETTINGS).not.toMatch(/usageRows\.reduce/);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/ai-usage-endpoint.test.ts`
Expected: FAIL — the route does not exist.

- [x] **Step 3: Write the endpoint**

Create `app/api/org/[orgId]/ai-settings/usage/route.ts`:

```ts
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createElevatedClient } from '@/lib/api/admin-client';
import { createAISpendCapRepository } from '@/lib/api/repositories/ai-spend-caps';
import { jsonError, jsonOk } from '@/lib/api/responses';

type RouteParams = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;

  const caps = createAISpendCapRepository({ orgId });
  const periodStart = caps.periodStart();
  try {
    const [cap, report] = await Promise.all([
      caps.getStatus(),
      createElevatedClient().rpc('org_ai_usage_report', {
        p_org_id: orgId,
        p_period_start: periodStart.toISOString(),
      }),
    ]);
    if (report.error) throw report.error;
    return jsonOk({ cap, report: report.data });
  } catch {
    return jsonError('Usage report could not be loaded', 502);
  }
}
```

- [x] **Step 4: Add the hook and slim the settings payload**

In `lib/ai/hooks.ts`:

```ts
export function useAiUsageReport(orgId: string) {
  return useApiData<{ cap: SpendCapStatus; report: UsageReport }>(
    `/api/org/${orgId}/ai-settings/usage`,
  );
}
```

Declare `UsageReport` to match the JSONB from Task 3 — `platform_cost`, `org_cost`, `invocations`, `failed_invocations`, `by_workload`, `daily`, `period_start`.

In `lib/api/repositories/ai-settings.ts`, delete the `usageResult` query and the `usageSummary` reduction, and replace `usageSummary` in the returned payload with `cap: await createAISpendCapRepository({ orgId: scope.orgId }).getStatus()`.

- [x] **Step 5: Run the tests**

Run: `npx vitest run tests/integration lib/api && npm run verify:types && npm run verify:build`
Expected: PASS. `components/settings/__tests__/*` will fail if they assert on `usageSummary`; update those fixtures to `cap` rather than restoring the field.

- [x] **Step 6: Commit**

```bash
git add app/api/org lib/ai/hooks.ts lib/api/repositories/ai-settings.ts tests/integration components/settings
git commit -m "feat(ai-settings): serve the usage report from SQL on its own endpoint"
```

---

# Task 9: The dashboard

**Why:** Without it the cap is invisible and the phase's second half does not exist.

**Files:**
- Create: `components/settings/AIUsagePanel.tsx`
- Modify: `components/settings/AIModelsSettings.tsx`
- Test: `components/settings/__tests__/AIUsagePanel.test.tsx` (create)

**Interfaces:**
- Consumes: `useAiUsageReport` from Task 8.
- Produces: `<AIUsagePanel orgId={orgId} />`, rendered by `AIModelsSettings` in place of the four tiles.

- [x] **Step 1: Write the failing test**

Create `components/settings/__tests__/AIUsagePanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useAiUsageReport } = vi.hoisted(() => ({ useAiUsageReport: vi.fn() }));
vi.mock('@/lib/ai/hooks', () => ({ useAiUsageReport }));

import AIUsagePanel from '../AIUsagePanel';

function withData(cap: Record<string, unknown>) {
  useAiUsageReport.mockReturnValue({
    isLoading: false,
    error: null,
    data: {
      cap: { warnAtPercent: 80, periodStart: '2026-08-01T00:00:00.000Z', ...cap },
      report: {
        platform_cost: 412.8,
        org_cost: 88.2,
        invocations: 120,
        failed_invocations: 2,
        by_workload: [
          { workload_id: 'assistant', funding: 'platform', cost: 210.4, invocations: 80 },
          { workload_id: 'builder_review', funding: 'platform', cost: 202.4, invocations: 40 },
        ],
        daily: [{ day: '2026-08-01', platform_cost: 12.5, org_cost: 1 }],
      },
    },
  });
  render(<AIUsagePanel orgId="org-1" />);
}

beforeEach(() => useAiUsageReport.mockReset());

describe('AIUsagePanel', () => {
  it('separates platform-funded spend from the organization own-key spend', () => {
    withData({ state: 'under', effectiveLimitUsd: 500, spendUsd: 412.8, onLimit: 'hard_stop' });
    expect(screen.getByText(/\$412\.80/)).toBeTruthy();
    expect(screen.getByText(/\$88\.20/)).toBeTruthy();
    expect(screen.getByText(/not capped/i)).toBeTruthy();
  });

  it('shows the limit and the period reset', () => {
    withData({ state: 'under', effectiveLimitUsd: 500, spendUsd: 412.8, onLimit: 'hard_stop' });
    expect(screen.getByText(/of \$500/)).toBeTruthy();
  });

  it('warns when approaching the limit', () => {
    withData({ state: 'warn', effectiveLimitUsd: 500, spendUsd: 420, onLimit: 'hard_stop' });
    expect(screen.getByText(/approaching/i)).toBeTruthy();
  });

  it('states plainly when the limit is reached', () => {
    withData({ state: 'over', effectiveLimitUsd: 500, spendUsd: 500, onLimit: 'hard_stop' });
    expect(screen.getByText(/limit reached/i)).toBeTruthy();
  });

  it('says nothing about a limit when the organization is uncapped', () => {
    withData({ state: 'uncapped', effectiveLimitUsd: null, spendUsd: 412.8, onLimit: 'hard_stop' });
    expect(screen.queryByText(/limit reached/i)).toBeNull();
    expect(screen.getByText(/no limit set/i)).toBeTruthy();
  });

  it('breaks platform spend down by workload', () => {
    withData({ state: 'under', effectiveLimitUsd: 500, spendUsd: 412.8, onLimit: 'hard_stop' });
    expect(screen.getByText('assistant')).toBeTruthy();
    expect(screen.getByText('builder_review')).toBeTruthy();
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/settings/__tests__/AIUsagePanel.test.tsx`
Expected: FAIL — the component does not exist.

- [x] **Step 3: Write the panel**

Create `components/settings/AIUsagePanel.tsx` as a client component. The shape:

```tsx
'use client';

import { useAiUsageReport } from '@/lib/ai/hooks';

const money = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const STATE_MESSAGE: Record<string, string> = {
  uncapped: 'No limit set for this organization.',
  under: '',
  warn: 'Approaching your monthly limit.',
  over: 'Monthly limit reached.',
};

export default function AIUsagePanel({ orgId }: { orgId: string }) {
  const { data, error, isLoading } = useAiUsageReport(orgId);
  if (isLoading) return <div className="card p-6 text-sm text-gray-500">Loading usage…</div>;
  if (error || !data) return <div className="card p-6 text-sm text-red-700">Usage could not be loaded.</div>;

  const { cap, report } = data;
  const peak = Math.max(...report.daily.map(day => Number(day.platform_cost ?? 0)), 1);

  return (
    <section className="card space-y-4 p-6">
      <div>
        <h2 className="text-lg font-semibold">AI usage</h2>
        <p className="text-sm text-gray-500">
          Since {new Date(cap.periodStart).toLocaleDateString()}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">Platform-funded</div>
          <div className="text-xl font-semibold">
            {money(Number(report.platform_cost))}
            {cap.effectiveLimitUsd !== null && ` of ${money(cap.effectiveLimitUsd)}`}
          </div>
          {STATE_MESSAGE[cap.state] && (
            <div className="text-xs text-gray-600">{STATE_MESSAGE[cap.state]}</div>
          )}
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">Your own key</div>
          <div className="text-xl font-semibold">{money(Number(report.org_cost))}</div>
          <div className="text-xs text-gray-600">Not capped — billed by your provider.</div>
        </div>
      </div>

      <div className="space-y-1">
        {report.by_workload.map(row => (
          <div key={row.workload_id} className="flex justify-between text-sm">
            <span>{row.workload_id}</span>
            <span>{money(Number(row.cost))}</span>
          </div>
        ))}
      </div>

      <div className="flex items-end gap-0.5" aria-label="Daily platform spend">
        {report.daily.map(day => (
          <div
            key={day.day}
            className="w-2 bg-azure/60"
            style={{ height: `${Math.max((Number(day.platform_cost ?? 0) / peak) * 40, 2)}px` }}
            title={`${day.day}: ${money(Number(day.platform_cost ?? 0))}`}
          />
        ))}
      </div>
    </section>
  );
}
```

Do not add a charting dependency. The series is one number per day for at most 31 days; proportional divs are enough and keep the bundle unchanged.

When `cap.onLimit === 'own_key'` and `cap.state === 'over'`, add a line naming which deployment execution moved to and whether it carries write access — per the spec, `own_key` can quietly become `read_only` when the fallback deployment is unverified, and that has to be visible rather than discovered. The deployment is available from the settings payload's `deployments` array; pass it in as a prop rather than fetching it twice.

- [x] **Step 4: Render it from the settings page**

In `components/settings/AIModelsSettings.tsx`, replace the four-tile `<section>` (which read `data.usageSummary`, removed in Task 8) with `<AIUsagePanel orgId={orgId} />`.

- [x] **Step 5: Run the tests**

Run: `npx vitest run components/settings && npm run verify:build`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add components/settings
git commit -m "feat(ai-settings): add the organization AI usage dashboard"
```

---

# Task 10: Cap configuration

**Why:** A cap nobody can set is a constant. The org limit is self-serve; the platform ceiling is not.

**Files:**
- Create: `components/settings/AISpendCapSettings.tsx`
- Create: `app/api/org/[orgId]/ai-settings/spend-cap/route.ts`
- Create: `app/api/admin/org/[orgId]/spend-cap/route.ts`
- Test: `tests/integration/ai-spend-cap-routes.test.ts` (create)

**Interfaces:**
- Consumes: `createAISpendCapRepository` from Task 4.
- Produces: `PUT /api/org/[orgId]/ai-settings/spend-cap` (org admin: `orgLimitUsd`, `onLimit`, `warnAtPercent`) and `PUT /api/admin/org/[orgId]/spend-cap` (app admin: `platformLimitUsd`).

- [x] **Step 1: Write the failing test**

Create `tests/integration/ai-spend-cap-routes.test.ts`:

```ts
// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const ORG = readFileSync(join(ROOT, 'app/api/org/[orgId]/ai-settings/spend-cap/route.ts'), 'utf8');
const ADMIN = readFileSync(join(ROOT, 'app/api/admin/org/[orgId]/spend-cap/route.ts'), 'utf8');

describe('spend cap routes', () => {
  it('lets an org admin set only the organization limit', () => {
    expect(ORG).toMatch(/requireOrgAccess\(orgId, 'admin'\)/);
    expect(ORG).toMatch(/setOrgLimit/);
    expect(ORG).not.toMatch(/setPlatformLimit/);
  });

  // The platform pays for platform-funded spend, so an org raising its own
  // ceiling would make the cap advisory.
  it('confines the platform ceiling to an app admin', () => {
    expect(ADMIN).toMatch(/requireAppAdmin\(\)/);
    expect(ADMIN).toMatch(/setPlatformLimit/);
  });

  it('validates the behaviour against the three supported modes', () => {
    expect(ORG).toMatch(/'hard_stop'[\s\S]*'read_only'[\s\S]*'own_key'/);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/ai-spend-cap-routes.test.ts`
Expected: FAIL — neither route exists.

- [x] **Step 3: Write the organization route**

Create `app/api/org/[orgId]/ai-settings/spend-cap/route.ts` with a `PUT` guarded by `requireOrgAccess(orgId, 'admin')`, validating with:

```ts
const inputSchema = z.object({
  orgLimitUsd: z.number().nonnegative().nullable().optional(),
  onLimit: z.enum(['hard_stop', 'read_only', 'own_key']).optional(),
  warnAtPercent: z.number().int().min(1).max(100).optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'At least one field is required');
```

Call `setOrgLimit` and `setBehaviour` as the payload dictates, and return `jsonOk({ cap: await caps.getStatus() })` so the client gets the recomputed state without a second request. A limit above the platform ceiling throws from the repository; map it to `jsonError(message, 400)`.

- [x] **Step 4: Write the platform route**

Create `app/api/admin/org/[orgId]/spend-cap/route.ts` with a `PUT` guarded by `requireAppAdmin()`, validating `{ platformLimitUsd: z.number().nonnegative().nullable() }`, calling `setPlatformLimit`, and returning the recomputed status. The repository clamps the organization's limit in the same write.

- [x] **Step 5: Add the organization control**

Create `components/settings/AISpendCapSettings.tsx`: a number input for the organization limit, a select for `onLimit`, and a number input for `warnAtPercent`, saving through `requestJson`. Show the platform ceiling as read-only text so an administrator can see what they are working under. When `onLimit` is `own_key` and the organization has no active deployment, render the caveat that it will stop instead — the fallback from the spec, made visible rather than discovered.

Render it from `AIModelsSettings.tsx` beneath the usage panel.

- [x] **Step 6: Run the tests**

Run: `npx vitest run tests/integration components/settings && npm run verify:types && npm run verify:build`
Expected: PASS

- [x] **Step 7: Commit**

```bash
git add app/api components/settings tests/integration
git commit -m "feat(ai-settings): let organizations set a limit and the platform set a ceiling"
```

---

# Task 11: Database-level guarantees

**Why:** The constraint and the RLS split are Postgres behaviours; assert them where the repository asserts Postgres behaviour rather than trusting the migration text.

**Files:**
- Modify: `scripts/verify/schema-behavior.sql`

**Interfaces:**
- Consumes: `org_ai_spend_caps` from Task 1.
- Produces: no exports.

- [x] **Step 1: Add the assertions**

Append to `scripts/verify/schema-behavior.sql`, before the final `ROLLBACK`, following the style of the blocks already there:

```sql
-- Spend caps: an organization limit may never exceed the platform ceiling.
DO $$
DECLARE
  v_org uuid;
BEGIN
  INSERT INTO public.organizations (name, org_type)
    VALUES ('Spend Cap Guard Org', 'private_foundation') RETURNING id INTO v_org;

  INSERT INTO public.org_ai_spend_caps (org_id, platform_limit_usd, org_limit_usd)
    VALUES (v_org, 500, 200);

  BEGIN
    UPDATE public.org_ai_spend_caps SET org_limit_usd = 900 WHERE org_id = v_org;
    RAISE EXCEPTION 'an organization limit above the platform ceiling was permitted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- A null platform ceiling means uncapped, so any organization limit is fine.
  UPDATE public.org_ai_spend_caps
    SET platform_limit_usd = NULL, org_limit_usd = 900 WHERE org_id = v_org;

  -- Only the three behaviours are accepted.
  BEGIN
    UPDATE public.org_ai_spend_caps SET on_limit = 'throttle' WHERE org_id = v_org;
    RAISE EXCEPTION 'an unsupported cap behaviour was permitted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END $$;

-- Spend caps are readable by org admins and writable only by the service role.
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.org_ai_spend_caps', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated can update org_ai_spend_caps';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.org_ai_spend_caps', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated cannot read org_ai_spend_caps';
  END IF;
END $$;
```

- [x] **Step 2: Run the assertions against the live database**

```bash
docker exec -i supabase_db_benevolence-walkthrough psql -U postgres -d postgres \
  < scripts/verify/schema-behavior.sql
```

Expected: a series of `DO` results ending in `ROLLBACK`, with no `ERROR`. The script wraps everything in a transaction and rolls back, so nothing is modified.

- [x] **Step 3: Run the full migration verification**

Run: `npm run verify:migrations`
Expected: PASS. This is the destructive reset described in the prerequisite.

- [x] **Step 4: Commit**

```bash
git add scripts/verify/schema-behavior.sql
git commit -m "test(db): assert the spend cap constraint and read boundary"
```

---

## Phase 3B exit criteria

- [x] `npm run verify:types && npm run verify:lint && npm run verify:unit` all pass
- [x] `npm run verify:migrations` passes from a clean local Supabase reset
- [x] `npm run verify:build` passes
- [x] The reconciliation test passes: the report's platform total equals `org_platform_spend`
- [x] The cap constraint bites — verify by attempting an organization limit above the platform ceiling and watching it fail
- [ ] Manual check: set a low platform ceiling for a test organization, run the assistant past it, and confirm the turn is refused with a 402 naming the limit
- [ ] Manual check: with `read_only` configured, confirm the assistant still answers, loses write tools, **and shows the banner**.
      Resolved during Task 6: the banner ships. `AIAssistantPanel.tsx` renders it from cap status carried on the
      history fetch it already makes, so `read_only` stays in the enum. The manual confirmation is still open.
- [ ] Manual check: confirm a Builder run is refused at the cap and the proposal is marked failed with a spend-cap reason rather than sitting queued
