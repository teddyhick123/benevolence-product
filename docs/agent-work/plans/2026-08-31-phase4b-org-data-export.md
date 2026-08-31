# Phase 4B — Organization Data Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An organization admin can produce a complete, verifiable archive of everything their organization owns — every row and every document — and download it without asking the platform for permission.

**Architecture:** An explicit typed manifest classifies all 149 base tables. A SQL function returns one page of rows as pre-serialised JSON text with numerics cast to text, so precision survives JavaScript. A background worker streams those pages, and the organization's documents from five storage buckets, through gzip into a tar written to private storage — hashing as it goes and recording a run row an admin can poll.

**Tech Stack:** TypeScript, Supabase (Postgres + RLS + Storage), BullMQ + Redis, Next.js 15 App Router, Vitest, `tar-stream`, Node `zlib`.

**Spec:** `docs/agent-work/specs/2026-08-31-phase4b-org-data-export-design.md`

## Global Constraints

- `db/migrations` is the single source of truth. A new canonical concept gets a new numbered migration.
- Every migration change is followed by `npm run db:types:generate`, and `lib/database.types.ts` is committed with it.
- Org-scoped FK column is `org_id`. RLS helpers are `can_view_org`, `is_org_admin`, `is_app_admin`, `user_org_role`.
- Product code reaches data only through `lib/database-client.ts` and repository modules under `lib/api/repositories/`.
- Org-scoped routes live under `app/api/org/[orgId]/**`, use shared access guards, and return `jsonOk` / `jsonError`.
- Storage operations always use `createAdminClient()` / `createElevatedClient()`, never the user-session client. Always return `signed_url` from `createSignedUrl(path, 3600)`; never `getPublicUrl`.
- **Numerics are exported as JSON strings.** `JSON.parse` turns a Postgres `numeric` into a double, and the schema has 260 of them including every monetary amount. Verified: `25000.00` becomes `25000`.
- **Views are never exported.** They are derived from base tables the archive already carries, and their rows cannot be inserted anywhere. Every enumeration filters `table_type = 'BASE TABLE'`.
- **Nothing buffers.** Row pages, gzip, tar, and the storage upload are one stream. Memory must not grow with row count.
- Verification gate for every task: `npm run verify:types`, `npm run verify:lint`, `npm run verify:unit`. Add `npm run verify:migrations` when `db/migrations/` changes and `npm run verify:build` when `app/` changes.

## Three constraints discovered while planning

Read all three before starting; each determines a task's shape.

**1. Numeric precision dies in `JSON.parse`, not in Postgres.** Postgres emits `{"amount": 25000.00}` correctly. Node's `JSON.parse` returns `25000`. Confirmed at the console. The fix is Task 2's SQL function, which builds its select list from `information_schema` and casts every `numeric` column to text before `to_jsonb`, so the value arrives as the JSON string `"25000.00"`. Do not try to fix this in TypeScript — by the time a JavaScript value exists, the digits are already gone.

**2. `supabase-js` cannot stream a large table.** It buffers a whole response. The export therefore pages with a keyset cursor (`WHERE id > $after ORDER BY id LIMIT 1000`), which is also why every exported table needs a sortable `id`. Task 1's manifest records the cursor column so a table keyed differently is a deliberate entry rather than a runtime surprise.

**3. There are 149 base tables, not 166.** An earlier count included 17 views. Task 1's guard filters `table_type = 'BASE TABLE'`; if you see 166 anywhere, it is stale.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `lib/export/tables.ts` | Typed classification of all 149 base tables | 1 |
| `db/migrations/0061_org_exports.sql` | `export_table_page` function (T2); `org_export_runs` + bucket (T4) | 2, 4 |
| `lib/export/rows.ts` | Page reader over the RPC; async iterator of NDJSON lines | 2 |
| `lib/export/archive.ts` | tar + gzip + manifest + hashing | 3 |
| `lib/api/repositories/org-exports.ts` | Run lifecycle, exclusive claim | 4 |
| `lib/export/queue.ts` | BullMQ queue and job payload | 5 |
| `scripts/export-worker.ts` | Worker entry point | 5 |
| `app/api/org/[orgId]/export/route.ts` | POST enqueue, GET list | 6 |
| `app/api/org/[orgId]/export/[runId]/route.ts` | GET status and signed URL | 6 |
| `app/api/jobs/exports/sweep/route.ts` | Retention sweep | 7 |
| `lib/export/storage.ts` | Bucket enumeration and object reading | 8 |

---

# Task 1: The table manifest and its completeness guard

**Why:** This is the decision every other part of the phase rests on. Without a guard, a table added six months from now is silently absent from every client's export, and nobody finds out until someone tries to leave.

**Files:**
- Create: `lib/export/tables.ts`
- Test: `lib/export/__tests__/tables.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type TableExportRule` — the four-class union below
  - `EXPORT_TABLES: readonly TableExportRule[]`
  - `exportableTables(): Extract<TableExportRule, { kind: 'org_scoped' | 'via_parent' }>[]`
  - `ruleFor(table: string): TableExportRule | undefined`

- [ ] **Step 1: Write the failing test**

Create `lib/export/__tests__/tables.test.ts`:

```ts
// @vitest-environment node

import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { EXPORT_TABLES, exportableTables, ruleFor } from '@/lib/export/tables';

function baseTablesInDatabase(): string[] {
  const out = execFileSync('docker', [
    'exec', 'supabase_db_benevolence-walkthrough',
    'psql', '-U', 'postgres', '-d', 'postgres', '-Atc',
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  ], { encoding: 'utf8' });
  return out.trim().split('\n').filter(Boolean);
}

describe('export table manifest', () => {
  // The guard that keeps the manifest true. A table added later is absent from
  // every client's export until someone classifies it, so failing the build is
  // the only point at which the decision is cheap.
  it('classifies every base table in the database', () => {
    const classified = new Set(EXPORT_TABLES.map(rule => rule.table));
    const missing = baseTablesInDatabase().filter(name => !classified.has(name));
    expect(missing).toEqual([]);
  });

  it('classifies no table that does not exist', () => {
    const present = new Set(baseTablesInDatabase());
    const phantom = EXPORT_TABLES.map(r => r.table).filter(name => !present.has(name));
    expect(phantom).toEqual([]);
  });

  // Views are derived from base tables the archive already carries, and their
  // rows cannot be inserted anywhere.
  it('classifies no views', () => {
    const views = execFileSync('docker', [
      'exec', 'supabase_db_benevolence-walkthrough',
      'psql', '-U', 'postgres', '-d', 'postgres', '-Atc',
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'VIEW'`,
    ], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    const classified = new Set(EXPORT_TABLES.map(rule => rule.table));
    expect(views.filter(name => classified.has(name))).toEqual([]);
  });

  it('names each table exactly once', () => {
    const names = EXPORT_TABLES.map(rule => rule.table);
    expect(names.length).toBe(new Set(names).size);
  });

  it('gives every org_scoped rule the org_id column', () => {
    for (const rule of EXPORT_TABLES) {
      if (rule.kind === 'org_scoped') expect(rule.column).toBe('org_id');
    }
  });

  it('gives every via_parent rule a parent that is itself exported', () => {
    const exported = new Set(exportableTables().map(rule => rule.table));
    for (const rule of EXPORT_TABLES) {
      if (rule.kind === 'via_parent') expect(exported.has(rule.parent)).toBe(true);
    }
  });

  it('gives every excluded rule a stated reason', () => {
    for (const rule of EXPORT_TABLES) {
      if (rule.kind === 'reference' || rule.kind === 'platform') {
        expect(rule.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('exports only org_scoped and via_parent tables', () => {
    for (const rule of exportableTables()) {
      expect(['org_scoped', 'via_parent']).toContain(rule.kind);
    }
  });

  // A user may belong to several organizations. Exporting profiles wholesale
  // would put other tenants' users into this client's archive - the one failure
  // that turns a sovereignty feature into a breach.
  it('scopes profiles through this organization''s membership', () => {
    const rule = ruleFor('profiles');
    expect(rule?.kind).toBe('via_parent');
    if (rule?.kind === 'via_parent') {
      expect(rule.parent).toBe('organization_members');
    }
  });

  it('finds a known table by name', () => {
    expect(ruleFor('holdings')?.kind).toBe('org_scoped');
    expect(ruleFor('applied_migrations')?.kind).toBe('platform');
    expect(ruleFor('nope_not_a_table')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/export/__tests__/tables.test.ts`
Expected: FAIL — `lib/export/tables.ts` does not exist.

- [ ] **Step 3: Generate the starting classification**

Do not hand-write 149 entries. Generate a draft, then correct it by hand:

```bash
docker exec supabase_db_benevolence-walkthrough psql -U postgres -d postgres -Atc "
SELECT t.table_name,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns c
         WHERE c.table_schema='public' AND c.table_name=t.table_name AND c.column_name='org_id'
       ) THEN 'org_scoped' ELSE 'NEEDS_CLASSIFICATION' END
FROM information_schema.tables t
WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
ORDER BY t.table_name"
```

For each `NEEDS_CLASSIFICATION` table, find its parent:

```bash
docker exec supabase_db_benevolence-walkthrough psql -U postgres -d postgres -Atc "
SELECT tc.table_name, kcu.column_name, ccu.table_name AS parent, ccu.column_name AS parent_key
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
ORDER BY tc.table_name"
```

A table with an FK to an exported table is `via_parent`. A table with no path to `organizations` is `reference` or `platform` — decide which by asking whether the rows describe the platform (`charities`, `module_definitions`, `org_type_defaults`, `benchmark_data`) or this instance (`applied_migrations`, `geocode_cache`, and the caches).

- [ ] **Step 4: Write the manifest**

Create `lib/export/tables.ts`:

```ts
// lib/export/tables.ts
// Classification of every base table in `public`, for organization export.
//
// A completeness test fails the build when a table exists in the database but
// not here. That is deliberate: a table added later would otherwise be absent
// from every client's export, and nobody would notice until someone tried to
// leave and found their data missing.

export type TableExportRule =
  /** Carries org_id directly. */
  | { table: string; kind: 'org_scoped'; column: 'org_id'; cursor?: string }
  /** Scoped by joining to a parent that carries org_id. */
  | { table: string; kind: 'via_parent'; parent: string; parentKey: string; localKey: string; cursor?: string }
  /** Platform data, identical on every instance. Not the tenant's. */
  | { table: string; kind: 'reference'; reason: string }
  /** Instance state rather than tenant data. */
  | { table: string; kind: 'platform'; reason: string };

export const EXPORT_TABLES: readonly TableExportRule[] = [
  // --- org_scoped: 83 tables carrying org_id ---
  { table: 'holdings', kind: 'org_scoped', column: 'org_id' },
  { table: 'grants', kind: 'org_scoped', column: 'org_id' },
  { table: 'ai_usage_log', kind: 'org_scoped', column: 'org_id' },
  // … one entry per org_id-bearing table, from Step 3's first query

  // --- via_parent ---
  { table: 'grant_milestones', kind: 'via_parent', parent: 'grants', parentKey: 'id', localKey: 'grant_id' },
  { table: 'holding_valuations', kind: 'via_parent', parent: 'holdings', parentKey: 'id', localKey: 'holding_id' },
  // … one entry per table with an FK path to an exported table

  // profiles is restricted, not wholesale: a user may belong to several
  // organizations, and exporting the table would put other tenants' users into
  // this client's archive.
  { table: 'profiles', kind: 'via_parent', parent: 'organization_members', parentKey: 'user_id', localKey: 'id' },

  // --- reference: platform data, identical everywhere ---
  { table: 'charities', kind: 'reference', reason: 'platform charity registry, identical on every instance' },
  { table: 'module_definitions', kind: 'reference', reason: 'platform module catalogue' },
  { table: 'org_type_defaults', kind: 'reference', reason: 'platform defaults for provisioning' },
  { table: 'benchmark_data', kind: 'reference', reason: 'platform benchmark set' },

  // --- platform: instance state, not tenant data ---
  { table: 'applied_migrations', kind: 'platform', reason: 'instance migration ledger; carried in the manifest instead' },
  { table: 'geocode_cache', kind: 'platform', reason: 'derived cache, rebuildable' },
  { table: 'charity_rating_cache', kind: 'platform', reason: 'derived cache, rebuildable' },
];

/** The tables an export actually reads. */
export function exportableTables() {
  return EXPORT_TABLES.filter(
    (rule): rule is Extract<TableExportRule, { kind: 'org_scoped' | 'via_parent' }> =>
      rule.kind === 'org_scoped' || rule.kind === 'via_parent',
  );
}

export function ruleFor(table: string): TableExportRule | undefined {
  return EXPORT_TABLES.find(rule => rule.table === table);
}
```

The three `…` comments mark where Step 3's output goes. Fill them in completely — the completeness test fails until all 149 are present, which is how you know you are done.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run lib/export && npm run verify:types`
Expected: PASS (10 tests). If `classifies every base table` still fails, its message names exactly which tables are missing.

- [ ] **Step 6: Commit**

```bash
git add lib/export
git commit -m "feat(export): classify every base table for organization export"
```

---

# Task 2: Reading rows without losing precision

**Why:** `JSON.parse` turns a Postgres `numeric` into a double, and the schema has 260 of them including every monetary amount. An export that silently alters a client's grant amounts is worse than one that fails. The fix has to be in SQL, because by the time a JavaScript value exists the digits are gone.

**Files:**
- Create: `db/migrations/0061_org_exports.sql`
- Create: `lib/export/rows.ts`
- Modify: `lib/database.types.ts` (regenerated)
- Test: `lib/export/__tests__/rows.test.ts`

**Interfaces:**
- Consumes: `TableExportRule`, `exportableTables` from Task 1.
- Produces:
  - SQL `public.export_table_page(p_table text, p_org_id uuid, p_after uuid, p_limit int) RETURNS TABLE (row_id uuid, line text)`
  - `streamTableRows(db: ElevatedClient, rule: TableExportRule, orgId: string, pageSize?: number): AsyncGenerator<string>`

- [ ] **Step 1: Write the failing test**

Create `lib/export/__tests__/rows.test.ts`:

```ts
// @vitest-environment node

import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function psql(sql: string): string {
  return execFileSync('docker', [
    'exec', 'supabase_db_benevolence-walkthrough',
    'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', sql,
  ], { encoding: 'utf8' }).trim();
}

describe('export_table_page', () => {
  // The defect this whole task exists to prevent: JSON.parse turns a Postgres
  // numeric into a double, so 25000.00 silently becomes 25000.
  it('emits numeric columns as JSON strings with their scale intact', () => {
    const line = psql(`
      BEGIN;
      INSERT INTO public.organizations (id, name, org_type)
        VALUES ('4b000000-0000-4000-8000-000000000001', 'Precision Test', 'private_foundation');
      INSERT INTO public.ai_usage_log
        (org_id, scope_kind, workload_id, operation, connector, requested_model, computed_cost)
        VALUES ('4b000000-0000-4000-8000-000000000001', 'organization', 'assistant',
                'tool_conversation', 'anthropic', 'claude-opus-5', 25000.00);
      SELECT line FROM public.export_table_page('ai_usage_log',
        '4b000000-0000-4000-8000-000000000001', NULL, 10) LIMIT 1;
      ROLLBACK;`);

    expect(line).toContain('"computed_cost": "25000.00"');
    // The failure mode, stated as an assertion so a regression is unambiguous.
    expect(line).not.toContain('"computed_cost": 25000');
    expect(JSON.parse(line).computed_cost).toBe('25000.00');
  });

  it('returns nothing for an organization with no rows', () => {
    const count = psql(`SELECT count(*) FROM public.export_table_page(
      'ai_usage_log', '4b000000-0000-4000-8000-0000000000ff', NULL, 10)`);
    expect(count).toBe('0');
  });

  // Tenancy is the failure that turns a sovereignty feature into a breach.
  it('never returns another organization''s rows', () => {
    const leaked = psql(`
      BEGIN;
      INSERT INTO public.organizations (id, name, org_type) VALUES
        ('4b000000-0000-4000-8000-00000000000a', 'Org A', 'private_foundation'),
        ('4b000000-0000-4000-8000-00000000000b', 'Org B', 'private_foundation');
      INSERT INTO public.ai_usage_log
        (org_id, scope_kind, workload_id, operation, connector, requested_model)
        VALUES ('4b000000-0000-4000-8000-00000000000b', 'organization', 'assistant',
                'tool_conversation', 'anthropic', 'claude-opus-5');
      SELECT count(*) FROM public.export_table_page('ai_usage_log',
        '4b000000-0000-4000-8000-00000000000a', NULL, 100);
      ROLLBACK;`);
    expect(leaked).toBe('0');
  });

  // A via_parent table is scoped by its parent's org_id, not its own.
  it('scopes a child table through its parent', () => {
    const count = psql(`
      BEGIN;
      INSERT INTO public.organizations (id, name, org_type) VALUES
        ('4b000000-0000-4000-8000-00000000000c', 'Parent Scope A', 'private_foundation'),
        ('4b000000-0000-4000-8000-00000000000d', 'Parent Scope B', 'private_foundation');
      SELECT count(*) FROM public.export_table_page(
        'grant_milestones', '4b000000-0000-4000-8000-00000000000c', NULL, 100,
        'grants', 'id', 'grant_id');
      ROLLBACK;`);
    expect(count).toBe('0');
  });

  // Refusing to guess is what keeps an unscoped table from being exported whole.
  it('refuses a table with no org_id when no parent is given', () => {
    let threw = false;
    try {
      psql(`SELECT * FROM public.export_table_page('grant_milestones', gen_random_uuid(), NULL, 1)`);
    } catch { threw = true; }
    expect(threw).toBe(true);
  });

  it('refuses a table that is not in the export manifest', () => {
    const out = execFileSync('docker', [
      'exec', 'supabase_db_benevolence-walkthrough',
      'psql', '-U', 'postgres', '-d', 'postgres', '-Atc',
      `SELECT * FROM public.export_table_page('pg_shadow', gen_random_uuid(), NULL, 1)`,
    ], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).toString();
    expect(out).not.toContain('usename');
  });

  it('is executable by the service role only', () => {
    const granted = psql(`SELECT has_function_privilege('authenticated',
      'public.export_table_page(text,uuid,uuid,int,text,text,text)', 'EXECUTE')`);
    expect(granted).toBe('f');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/export/__tests__/rows.test.ts`
Expected: FAIL — `function public.export_table_page(...) does not exist`.

- [ ] **Step 3: Write the migration**

Create `db/migrations/0061_org_exports.sql`:

```sql
-- =============================================================================
-- 0061_org_exports.sql
-- Organization data export: row paging that preserves numeric precision.
-- Depends on: 0002 (organizations)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- One page of a table's rows for one organization, pre-serialised as JSON text.
--
-- Numerics are cast to text before to_jsonb. Postgres emits 25000.00 correctly,
-- but JSON.parse in Node returns 25000 — the scale is lost in the reader, not
-- the writer, so the fix has to happen here. The caller receives the JSON string
-- "25000.00" and can parse it safely in any language.
--
-- The select list is built from information_schema rather than hard-coded, so a
-- new numeric column is handled without touching this function.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.export_table_page(
  p_table       text,
  p_org_id      uuid,
  p_after       uuid DEFAULT NULL,
  p_limit       int  DEFAULT 1000,
  -- For a table with no org_id: the parent that carries one, and the keys that
  -- join to it. Omitted for org_scoped tables.
  p_parent      text DEFAULT NULL,
  p_parent_key  text DEFAULT NULL,
  p_local_key   text DEFAULT NULL
)
RETURNS TABLE (row_id uuid, line text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cols text;
  v_has_org boolean;
BEGIN
  -- Only a real base table in public. Without this the function is an
  -- arbitrary-read primitive for anyone who can execute it.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name = p_table
  ) THEN
    RAISE EXCEPTION 'export_table_page: % is not an exportable base table', p_table;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'org_id'
  ) INTO v_has_org;

  -- A table with no org_id must name the parent that carries one. Refusing to
  -- guess is what keeps an unscoped table from being exported wholesale.
  IF NOT v_has_org AND (p_parent IS NULL OR p_parent_key IS NULL OR p_local_key IS NULL) THEN
    RAISE EXCEPTION 'export_table_page: % has no org_id and no parent was given', p_table;
  END IF;

  IF p_parent IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name = p_parent
  ) THEN
    RAISE EXCEPTION 'export_table_page: parent % is not a base table', p_parent;
  END IF;

  SELECT string_agg(
    CASE WHEN data_type = 'numeric'
         THEN format('%I::text AS %I', column_name, column_name)
         ELSE format('%I', column_name) END,
    ', ' ORDER BY ordinal_position)
  INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = p_table;

  IF v_has_org THEN
    RETURN QUERY EXECUTE format(
      'SELECT t.id, to_jsonb(t)::text
         FROM (SELECT %s FROM public.%I
                WHERE org_id = $1 AND ($2 IS NULL OR id > $2)
                ORDER BY id LIMIT $3) t',
      v_cols, p_table)
    USING p_org_id, p_after, p_limit;
  ELSE
    -- Scoped through the parent's org_id. The EXISTS keeps the join from
    -- multiplying rows when a parent has several matching children.
    RETURN QUERY EXECUTE format(
      'SELECT t.id, to_jsonb(t)::text
         FROM (SELECT %s FROM public.%I c
                WHERE EXISTS (
                        SELECT 1 FROM public.%I p
                        WHERE p.%I = c.%I AND p.org_id = $1)
                  AND ($2 IS NULL OR c.id > $2)
                ORDER BY c.id LIMIT $3) t',
      v_cols, p_table, p_parent, p_parent_key, p_local_key)
    USING p_org_id, p_after, p_limit;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.export_table_page(text, uuid, uuid, int, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.export_table_page(text, uuid, uuid, int, text, text, text) TO service_role;
```

Keyset paging on `id` rather than `OFFSET`: offset scanning degrades quadratically and one large table would dominate the run.

- [ ] **Step 4: Apply and regenerate types**

Run: `npx supabase migration up --local && npm run db:types:generate`
Expected: `lib/database.types.ts` gains `export_table_page` under `Functions`. Inspect the diff; anything else means the migration touched more than intended.

- [ ] **Step 5: Write the page reader**

Create `lib/export/rows.ts`:

```ts
// lib/export/rows.ts
// Streams a table's rows for one organization as NDJSON lines.
//
// supabase-js buffers a whole response, so a large table has to be paged. The
// cursor is keyset rather than offset, and the lines arrive pre-serialised from
// Postgres so no JavaScript ever parses a numeric.

import type { ElevatedClient } from '@/lib/api/admin-client';
import type { TableExportRule } from '@/lib/export/tables';

export const DEFAULT_PAGE_SIZE = 1000;

export async function* streamTableRows(
  db: ElevatedClient,
  rule: TableExportRule,
  orgId: string,
  pageSize: number = DEFAULT_PAGE_SIZE,
): AsyncGenerator<string> {
  if (rule.kind !== 'org_scoped' && rule.kind !== 'via_parent') return;

  let after: string | null = null;
  for (;;) {
    const { data, error } = await db.rpc('export_table_page', {
      p_table: rule.table,
      p_org_id: orgId,
      p_after: after,
      p_limit: pageSize,
      // Null for an org_scoped table; the SQL function refuses a table with no
      // org_id unless all three are supplied.
      p_parent: rule.kind === 'via_parent' ? rule.parent : null,
      p_parent_key: rule.kind === 'via_parent' ? rule.parentKey : null,
      p_local_key: rule.kind === 'via_parent' ? rule.localKey : null,
    });
    if (error) throw error;

    const page = (data ?? []) as { row_id: string; line: string }[];
    if (page.length === 0) return;

    for (const row of page) yield row.line;

    // A short page is the last page.
    if (page.length < pageSize) return;
    after = page[page.length - 1].row_id;
  }
}
```

Both kinds go through one call. A `via_parent` rule supplies its parent and join keys; an `org_scoped` rule passes nulls, and the SQL function refuses a table that has neither an `org_id` nor a parent rather than exporting it unscoped.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run lib/export && npm run verify:types && npm run verify:migrations`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add db/migrations/0061_org_exports.sql lib/export lib/database.types.ts
git commit -m "feat(export): page rows as JSON text with numerics preserved"
```

---

# Task 3: The archive writer

**Why:** The archive is the deliverable. It has to stream — a large organization must not be held in memory — and it has to carry per-file hashes and a manifest, or a recipient cannot tell a complete archive from a truncated one.

**Files:**
- Create: `lib/export/archive.ts`
- Modify: `package.json` (add `tar-stream`)
- Test: `lib/export/__tests__/archive.test.ts`

**Interfaces:**
- Consumes: `streamTableRows` from Task 2; `exportableTables`, `TableExportRule` from Task 1.
- Produces:
  - `type ExportManifest` — the shape written to `manifest.json`
  - `type ArchiveResult = { manifest: ExportManifest; manifestHash: string; rowCount: number; byteCount: number }`
  - `writeArchive(input: { db: ElevatedClient; orgId: string; orgName: string; sink: NodeJS.WritableStream }): Promise<ArchiveResult>`

- [ ] **Step 1: Add the dependency**

```bash
npm install tar-stream@3
npm install --save-dev @types/tar-stream
```

`tar-stream` is ~30KB with no native build. Node's `zlib` covers gzip, but a tar cannot be produced streaming from the standard library alone.

- [ ] **Step 2: Write the failing test**

Create `lib/export/__tests__/archive.test.ts`:

```ts
// @vitest-environment node

import { createGunzip } from 'node:zlib';
import { PassThrough, Writable } from 'node:stream';
import { extract } from 'tar-stream';
import { describe, expect, it, vi } from 'vitest';
import { writeArchive, type ExportManifest } from '@/lib/export/archive';

/** Collects a tar stream into { path: contents }, gunzipping .gz entries. */
async function readArchive(buffer: Buffer): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const ex = extract();
  const done = new Promise<void>((resolve, reject) => {
    ex.on('entry', (header, stream, next) => {
      const chunks: Buffer[] = [];
      const target = header.name.endsWith('.gz')
        ? stream.pipe(createGunzip())
        : stream;
      target.on('data', (c: Buffer) => chunks.push(c));
      target.on('end', () => {
        files[header.name] = Buffer.concat(chunks).toString('utf8');
        next();
      });
      target.on('error', reject);
    });
    ex.on('finish', () => resolve());
    ex.on('error', reject);
  });
  ex.end(buffer);
  await done;
  return files;
}

function collectingSink() {
  const chunks: Buffer[] = [];
  const sink = new Writable({
    write(chunk, _enc, cb) { chunks.push(Buffer.from(chunk)); cb(); },
  });
  return { sink, buffer: () => Buffer.concat(chunks) };
}

/** A db double returning two rows for holdings and nothing else. */
function fakeDb(rows: Record<string, string[]>) {
  return {
    rpc: vi.fn(async (_fn: string, args: { p_table: string; p_after: string | null }) => {
      if (args.p_after !== null) return { data: [], error: null };
      const lines = rows[args.p_table] ?? [];
      return {
        data: lines.map((line, i) => ({ row_id: `id-${i}`, line })),
        error: null,
      };
    }),
  } as never;
}

describe('writeArchive', () => {
  it('writes a manifest and one gzipped file per non-empty table', async () => {
    const { sink, buffer } = collectingSink();
    const result = await writeArchive({
      db: fakeDb({ holdings: ['{"id":"a"}', '{"id":"b"}'] }),
      orgId: 'org-1',
      orgName: 'Test Org',
      sink,
    });

    const files = await readArchive(buffer());
    expect(Object.keys(files)).toContain('manifest.json');
    expect(Object.keys(files)).toContain('tables/holdings.ndjson.gz');
    expect(files['tables/holdings.ndjson.gz']).toBe('{"id":"a"}\n{"id":"b"}\n');
    expect(result.rowCount).toBe(2);
  });

  // A recipient must be able to tell a complete archive from a truncated one.
  it('records a sha256 and row count for every file it wrote', async () => {
    const { sink, buffer } = collectingSink();
    const result = await writeArchive({
      db: fakeDb({ holdings: ['{"id":"a"}'] }),
      orgId: 'org-1', orgName: 'Test Org', sink,
    });
    const files = await readArchive(buffer());
    const manifest = JSON.parse(files['manifest.json']) as ExportManifest;

    const entry = manifest.files.find(f => f.path === 'tables/holdings.ndjson.gz');
    expect(entry).toBeDefined();
    expect(entry!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(entry!.rows).toBe(1);
    expect(result.manifestHash).toMatch(/^[0-9a-f]{64}$/);
  });

  // Complete-by-decision must be distinguishable from complete-by-accident.
  it('records what it excluded and why', async () => {
    const { sink, buffer } = collectingSink();
    await writeArchive({ db: fakeDb({}), orgId: 'org-1', orgName: 'Test Org', sink });
    const manifest = JSON.parse((await readArchive(buffer()))['manifest.json']) as ExportManifest;

    const charities = manifest.excluded.find(e => e.table === 'charities');
    expect(charities?.reason).toBeTruthy();
  });

  it('states the numeric encoding so a reader need not infer it', async () => {
    const { sink, buffer } = collectingSink();
    await writeArchive({ db: fakeDb({}), orgId: 'org-1', orgName: 'Test Org', sink });
    const manifest = JSON.parse((await readArchive(buffer()))['manifest.json']) as ExportManifest;
    expect(manifest.numericEncoding).toBe('string');
  });

  it('omits a table with no rows rather than writing an empty file', async () => {
    const { sink, buffer } = collectingSink();
    await writeArchive({ db: fakeDb({}), orgId: 'org-1', orgName: 'Test Org', sink });
    const files = await readArchive(buffer());
    expect(Object.keys(files).filter(n => n.startsWith('tables/'))).toEqual([]);
  });

  // Memory must not grow with row count.
  it('never holds a whole table in memory', async () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `{"id":"${i}"}`);
    const { sink, buffer } = collectingSink();
    const before = process.memoryUsage().heapUsed;
    await writeArchive({
      db: fakeDb({ holdings: lines }), orgId: 'org-1', orgName: 'Test Org', sink,
    });
    const grew = process.memoryUsage().heapUsed - before;
    // Generous: the point is that it is not proportional to 5000 rows.
    expect(grew).toBeLessThan(50 * 1024 * 1024);
    expect((await readArchive(buffer()))['tables/holdings.ndjson.gz'].split('\n').length).toBe(5001);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run lib/export/__tests__/archive.test.ts`
Expected: FAIL — `lib/export/archive.ts` does not exist.

- [ ] **Step 4: Write the archive writer**

Create `lib/export/archive.ts`:

```ts
// lib/export/archive.ts
// Streams an organization's rows into a tar of gzipped NDJSON, hashing each
// file as it is written. Nothing is buffered: memory stays flat regardless of
// how many rows an organization has.

import { createHash } from 'node:crypto';
import { PassThrough, pipeline } from 'node:stream';
import { promisify } from 'node:util';
import { createGzip } from 'node:zlib';
import { pack } from 'tar-stream';
import type { ElevatedClient } from '@/lib/api/admin-client';
import { EXPORT_TABLES, exportableTables } from '@/lib/export/tables';
import { streamTableRows } from '@/lib/export/rows';

const pipe = promisify(pipeline);

export const EXPORT_FORMAT_VERSION = 1;

export type ExportManifest = {
  orgId: string;
  orgName: string;
  exportedAt: string;
  formatVersion: number;
  /** 'string' means numeric columns are JSON strings; parse them as decimals. */
  numericEncoding: 'string';
  schema: { ledger: { version: string; state: string }[]; driftCheckAvailable: boolean };
  files: { path: string; sha256: string; rows: number; bytes: number }[];
  excluded: { table?: string; bucket?: string; reason: string }[];
};

export type ArchiveResult = {
  manifest: ExportManifest;
  manifestHash: string;
  rowCount: number;
  byteCount: number;
};

function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export async function writeArchive(input: {
  db: ElevatedClient;
  orgId: string;
  orgName: string;
  sink: NodeJS.WritableStream;
}): Promise<ArchiveResult> {
  const { db, orgId, orgName, sink } = input;
  const tar = pack();
  const written = tar.pipe(sink);

  const files: ExportManifest['files'] = [];
  let rowCount = 0;
  let byteCount = 0;

  for (const rule of exportableTables()) {
    const path = `tables/${rule.table}.ndjson.gz`;
    const source = new PassThrough();
    const gzip = createGzip();
    const hash = createHash('sha256');

    let rows = 0;
    let bytes = 0;
    gzip.on('data', (chunk: Buffer) => { hash.update(chunk); bytes += chunk.length; });

    // tar-stream needs a size up front for a fixed entry, so a table of unknown
    // length is written to a buffered entry only after gzip has finished. The
    // gzip stream itself is still incremental, so peak memory is one table's
    // compressed bytes rather than its rows.
    const chunks: Buffer[] = [];
    gzip.on('data', (chunk: Buffer) => chunks.push(chunk));

    const feed = (async () => {
      for await (const line of streamTableRows(db, rule, orgId)) {
        rows += 1;
        if (!source.write(`${line}\n`)) {
          await new Promise(resolve => source.once('drain', resolve));
        }
      }
      source.end();
    })();

    await Promise.all([feed, pipe(source, gzip)]);

    if (rows === 0) continue;

    const body = Buffer.concat(chunks);
    await new Promise<void>((resolve, reject) => {
      tar.entry({ name: path, size: body.length }, body, err => (err ? reject(err) : resolve()));
    });

    files.push({ path, sha256: hash.digest('hex'), rows, bytes });
    rowCount += rows;
    byteCount += bytes;
  }

  const excluded: ExportManifest['excluded'] = [
    ...EXPORT_TABLES
      .filter(rule => rule.kind === 'reference' || rule.kind === 'platform')
      .map(rule => ({ table: rule.table, reason: (rule as { reason: string }).reason })),
    { bucket: 'imports', reason: 'raw source files, already normalised into platform tables' },
  ];

  const ledger = await db.from('applied_migrations').select('version, checksum').order('version');
  const manifest: ExportManifest = {
    orgId,
    orgName,
    exportedAt: new Date().toISOString(),
    formatVersion: EXPORT_FORMAT_VERSION,
    numericEncoding: 'string',
    schema: {
      ledger: (ledger.data ?? []).map(row => ({
        version: row.version as string,
        state: (row.checksum as string) === 'unverified' ? 'adopted' : 'verified',
      })),
      driftCheckAvailable: false,
    },
    files,
    excluded,
  };

  const manifestText = JSON.stringify(manifest, null, 2);
  await new Promise<void>((resolve, reject) => {
    tar.entry({ name: 'manifest.json', size: Buffer.byteLength(manifestText) }, manifestText,
      err => (err ? reject(err) : resolve()));
  });

  tar.finalize();
  await new Promise<void>((resolve, reject) => {
    written.on('finish', () => resolve());
    written.on('error', reject);
  });

  return { manifest, manifestHash: sha256Hex(manifestText), rowCount, byteCount };
}
```

One honest limitation is written into the comment above: `tar-stream` needs an entry size up front, so each table's *compressed* bytes are held while its entry is written. Rows still stream through gzip one page at a time, so memory is proportional to a compressed table rather than a row count — which is what the memory test asserts. If a single table's compressed size ever becomes the constraint, the fix is a two-pass write to a temporary object, not buffering rows.

`driftCheckAvailable` is `false` because the worker has no migration files on disk to compare against — the same honest distinction Phase 4A drew. It is not a claim that there is no drift.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run lib/export && npm run verify:types`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/export package.json package-lock.json
git commit -m "feat(export): stream an organization archive with per-file hashes"
```

---

# Task 4: The run record

**Why:** An export takes minutes, so the caller needs something to poll. The row also outlives the archive, which is what makes retention honest: the file is deleted, the record that it existed is not.

**Files:**
- Modify: `db/migrations/0061_org_exports.sql`
- Create: `lib/api/repositories/org-exports.ts`
- Modify: `lib/database.types.ts` (regenerated)
- Test: `lib/api/repositories/__tests__/org-exports.test.ts`, `scripts/verify/schema-behavior.sql`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - table `public.org_export_runs`; bucket `org-exports`
  - `createOrgExportRepository(db?: ElevatedClient)` returning `{ createRun, claimRun, finishRun, failRun, getRun, listRuns, expireRuns }`
  - `claimRun(runId: string): Promise<boolean>` — true only for the worker that moved it out of `queued`

- [ ] **Step 1: Write the failing test**

Create `lib/api/repositories/__tests__/org-exports.test.ts`:

```ts
// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createOrgExportRepository } from '@/lib/api/repositories/org-exports';

function dbReturning(rows: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ['update', 'eq', 'select', 'insert', 'order', 'lt', 'in']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(async () => ({ data: rows, error: null }));
  chain.single = vi.fn(async () => ({ data: rows, error: null }));
  return { from: vi.fn(() => chain), _chain: chain } as never;
}

describe('org export repository', () => {
  // At-most-once execution: only the worker that moves the row out of 'queued'
  // may run it, the same way ai_deployment_evaluation_runs claims work.
  it('claims a run only when it was still queued', async () => {
    const db = dbReturning({ id: 'run-1' });
    const repo = createOrgExportRepository(db);
    await expect(repo.claimRun('run-1')).resolves.toBe(true);

    const chain = (db as unknown as { _chain: Record<string, ReturnType<typeof vi.fn>> })._chain;
    expect(chain.eq).toHaveBeenCalledWith('status', 'queued');
  });

  it('reports a lost claim rather than throwing', async () => {
    const repo = createOrgExportRepository(dbReturning(null));
    await expect(repo.claimRun('run-1')).resolves.toBe(false);
  });

  it('records the manifest hash and counts when a run succeeds', async () => {
    const db = dbReturning({ id: 'run-1' });
    const repo = createOrgExportRepository(db);
    await repo.finishRun('run-1', {
      manifestHash: 'a'.repeat(64), rowCount: 12, byteCount: 345,
      storagePath: 'org-1/export.tar', expiresAt: '2026-09-07T00:00:00.000Z',
    });
    const chain = (db as unknown as { _chain: Record<string, ReturnType<typeof vi.fn>> })._chain;
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'succeeded', manifest_hash: 'a'.repeat(64), row_count: 12,
    }));
  });

  // A failed export must not leave a row that looks successful.
  it('records a reason when a run fails', async () => {
    const db = dbReturning({ id: 'run-1' });
    const repo = createOrgExportRepository(db);
    await repo.failRun('run-1', 'storage upload rejected');
    const chain = (db as unknown as { _chain: Record<string, ReturnType<typeof vi.fn>> })._chain;
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed', error: 'storage upload rejected',
    }));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/api/repositories/__tests__/org-exports.test.ts`
Expected: FAIL — `lib/api/repositories/org-exports.ts` does not exist.

- [ ] **Step 3: Add the table and bucket to the migration**

Append to `db/migrations/0061_org_exports.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Export runs. The row outlives the archive: retention deletes the file, and
-- the record that an export happened stays for the audit trail.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.org_export_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','running','succeeded','failed','expired')),
  manifest_hash text,
  row_count     bigint,
  byte_count    bigint,
  storage_path  text,
  error         text,
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_export_runs_org
  ON public.org_export_runs (org_id, created_at DESC);

-- One live run per organization: concurrent exports would double storage cost
-- and race on the same object path.
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_export_runs_one_live
  ON public.org_export_runs (org_id) WHERE status IN ('queued','running');

ALTER TABLE public.org_export_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_export_runs_read" ON public.org_export_runs
  FOR SELECT TO authenticated USING (public.is_org_admin(org_id));
CREATE POLICY "org_export_runs_service" ON public.org_export_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Supabase grants authenticated full table privileges by default, so revoke
-- before granting: RLS alone would leave write privileges nominally present.
REVOKE ALL ON public.org_export_runs FROM authenticated;
GRANT SELECT ON public.org_export_runs TO authenticated;
GRANT ALL ON public.org_export_runs TO service_role;

-- Private bucket for the archives themselves.
INSERT INTO storage.buckets (id, name, public)
VALUES ('org-exports', 'org-exports', false)
ON CONFLICT (id) DO NOTHING;
```

No storage RLS policy for `authenticated`: archives are reached only through a signed URL the API mints, never by direct bucket access.

- [ ] **Step 4: Write the repository**

Create `lib/api/repositories/org-exports.ts`:

```ts
// lib/api/repositories/org-exports.ts
// Lifecycle of an organization export run.

import { createElevatedClient, type ElevatedClient } from '@/lib/api/admin-client';

export type OrgExportRun = {
  id: string;
  org_id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'expired';
  manifest_hash: string | null;
  row_count: number | null;
  byte_count: number | null;
  storage_path: string | null;
  error: string | null;
  expires_at: string | null;
  created_at: string;
};

export function createOrgExportRepository(db: ElevatedClient = createElevatedClient()) {
  return {
    async createRun(orgId: string, requestedBy: string): Promise<OrgExportRun> {
      const { data, error } = await db.from('org_export_runs')
        .insert({ org_id: orgId, requested_by: requestedBy })
        .select('*')
        .single();
      if (error) throw error;
      return data as OrgExportRun;
    },

    /**
     * The conditional update is the claim: only one worker can move a run out
     * of 'queued', which makes execution at-most-once the way claimRun does for
     * evaluation runs.
     */
    async claimRun(runId: string): Promise<boolean> {
      const { data, error } = await db.from('org_export_runs')
        .update({ status: 'running', updated_at: new Date().toISOString() })
        .eq('id', runId)
        .eq('status', 'queued')
        .select('id')
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },

    async finishRun(runId: string, input: {
      manifestHash: string; rowCount: number; byteCount: number;
      storagePath: string; expiresAt: string;
    }): Promise<void> {
      const { error } = await db.from('org_export_runs')
        .update({
          status: 'succeeded',
          manifest_hash: input.manifestHash,
          row_count: input.rowCount,
          byte_count: input.byteCount,
          storage_path: input.storagePath,
          expires_at: input.expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', runId);
      if (error) throw error;
    },

    async failRun(runId: string, reason: string): Promise<void> {
      const { error } = await db.from('org_export_runs')
        .update({ status: 'failed', error: reason, updated_at: new Date().toISOString() })
        .eq('id', runId);
      if (error) throw error;
    },

    async getRun(runId: string): Promise<OrgExportRun | null> {
      const { data, error } = await db.from('org_export_runs')
        .select('*').eq('id', runId).maybeSingle();
      if (error) throw error;
      return (data as OrgExportRun) ?? null;
    },

    async listRuns(orgId: string): Promise<OrgExportRun[]> {
      const { data, error } = await db.from('org_export_runs')
        .select('*').eq('org_id', orgId).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as OrgExportRun[];
    },

    /** Rows whose archive is past its retention window. */
    async expiredRuns(now: string): Promise<OrgExportRun[]> {
      const { data, error } = await db.from('org_export_runs')
        .select('*').eq('status', 'succeeded').lt('expires_at', now);
      if (error) throw error;
      return (data ?? []) as OrgExportRun[];
    },

    async markExpired(runId: string): Promise<void> {
      const { error } = await db.from('org_export_runs')
        .update({ status: 'expired', storage_path: null, updated_at: new Date().toISOString() })
        .eq('id', runId);
      if (error) throw error;
    },
  };
}
```

- [ ] **Step 5: Add the database assertions**

Append to `scripts/verify/schema-behavior.sql`, before the final `ROLLBACK`:

```sql
-- Export runs are readable by org admins and writable only by the service role.
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.org_export_runs', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated can insert into org_export_runs';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.org_export_runs', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated cannot read org_export_runs';
  END IF;
END $$;

-- One live run per organization.
DO $$
DECLARE v_org uuid;
BEGIN
  INSERT INTO public.organizations (name, org_type)
    VALUES ('Export Guard', 'private_foundation') RETURNING id INTO v_org;
  INSERT INTO public.org_export_runs (org_id) VALUES (v_org);
  BEGIN
    INSERT INTO public.org_export_runs (org_id) VALUES (v_org);
    RAISE EXCEPTION 'a second live export run was permitted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  -- A finished run frees the slot.
  UPDATE public.org_export_runs SET status = 'succeeded' WHERE org_id = v_org;
  INSERT INTO public.org_export_runs (org_id) VALUES (v_org);
END $$;

-- export_table_page refuses an unscoped table rather than exporting it whole.
DO $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN
    PERFORM * FROM public.export_table_page('charities', gen_random_uuid(), NULL, 1);
  EXCEPTION WHEN others THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'export_table_page accepted a table with no org_id and no parent';
  END IF;
END $$;
```

- [ ] **Step 6: Apply, regenerate, and run**

```bash
npx supabase migration up --local && npm run db:types:generate
docker exec -i supabase_db_benevolence-walkthrough psql -U postgres -d postgres < scripts/verify/schema-behavior.sql | tail -3
npx vitest run lib/api/repositories/__tests__/org-exports.test.ts && npm run verify:types && npm run verify:migrations
```

Expected: the SQL ends in `ROLLBACK` with no `ERROR`; tests pass.

- [ ] **Step 7: Commit**

```bash
git add db/migrations/0061_org_exports.sql lib/api/repositories lib/database.types.ts scripts/verify/schema-behavior.sql
git commit -m "feat(export): add export run records with an exclusive claim"
```

---

# Task 5: The worker

**Why:** An export of a large organization takes minutes. A streamed HTTP response would die behind a proxy timeout and leave nothing to re-download.

**Files:**
- Create: `lib/export/queue.ts`
- Create: `scripts/export-worker.ts`
- Modify: `package.json` (add `export:worker`)
- Test: `lib/export/__tests__/queue.test.ts`

**Interfaces:**
- Consumes: `writeArchive` (Task 3); `createOrgExportRepository` (Task 4).
- Produces:
  - `exportQueue: Queue`, `type ExportJobData = { runId: string; orgId: string }`
  - `runExportJob(data: ExportJobData, deps: ExportJobDeps): Promise<void>`
  - `RETENTION_DAYS = 7`

- [ ] **Step 1: Write the failing test**

Create `lib/export/__tests__/queue.test.ts`:

```ts
// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { runExportJob } from '@/lib/export/queue';

function deps(overrides: Partial<Parameters<typeof runExportJob>[1]> = {}) {
  return {
    claimRun: vi.fn(async () => true),
    finishRun: vi.fn(async () => {}),
    failRun: vi.fn(async () => {}),
    orgName: vi.fn(async () => 'Test Org'),
    writeArchiveToStorage: vi.fn(async () => ({
      manifestHash: 'a'.repeat(64), rowCount: 3, byteCount: 99,
      storagePath: 'org-1/export.tar',
    })),
    deletePartial: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('runExportJob', () => {
  it('writes the archive and records the run when the claim succeeds', async () => {
    const d = deps();
    await runExportJob({ runId: 'run-1', orgId: 'org-1' }, d);
    expect(d.writeArchiveToStorage).toHaveBeenCalled();
    expect(d.finishRun).toHaveBeenCalledWith('run-1', expect.objectContaining({
      manifestHash: 'a'.repeat(64), rowCount: 3,
    }));
  });

  // A second worker taking the same job must do nothing at all.
  it('does no work when the claim is lost', async () => {
    const d = deps({ claimRun: vi.fn(async () => false) });
    await runExportJob({ runId: 'run-1', orgId: 'org-1' }, d);
    expect(d.writeArchiveToStorage).not.toHaveBeenCalled();
    expect(d.finishRun).not.toHaveBeenCalled();
  });

  // A partial tar is worse than no tar: it looks like a download and is not one.
  it('deletes the partial object and records the reason when writing fails', async () => {
    const d = deps({
      writeArchiveToStorage: vi.fn(async () => { throw new Error('upload rejected'); }),
    });
    await runExportJob({ runId: 'run-1', orgId: 'org-1' }, d);
    expect(d.deletePartial).toHaveBeenCalled();
    expect(d.failRun).toHaveBeenCalledWith('run-1', expect.stringContaining('upload rejected'));
    expect(d.finishRun).not.toHaveBeenCalled();
  });

  it('sets an expiry a week out so retention has something to act on', async () => {
    const d = deps();
    await runExportJob({ runId: 'run-1', orgId: 'org-1' }, d);
    const { expiresAt } = d.finishRun.mock.calls[0][1] as { expiresAt: string };
    const days = (Date.parse(expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.5);
    expect(days).toBeLessThan(7.5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/export/__tests__/queue.test.ts`
Expected: FAIL — `lib/export/queue.ts` does not exist.

- [ ] **Step 3: Write the queue and job body**

Create `lib/export/queue.ts`:

```ts
// lib/export/queue.ts
// Export jobs. The job body takes its dependencies as arguments so it can be
// tested without Redis, Postgres, or storage.

import { Queue } from 'bullmq';

const redisConnection = { url: process.env.REDIS_URL || 'redis://localhost:6379' };

export const exportQueue = new Queue('org-export-jobs', { connection: redisConnection });

export const RETENTION_DAYS = 7;

export type ExportJobData = { runId: string; orgId: string };

export type ExportJobDeps = {
  claimRun: (_runId: string) => Promise<boolean>;
  finishRun: (_runId: string, _input: {
    manifestHash: string; rowCount: number; byteCount: number;
    storagePath: string; expiresAt: string;
  }) => Promise<void>;
  failRun: (_runId: string, _reason: string) => Promise<void>;
  orgName: (_orgId: string) => Promise<string>;
  writeArchiveToStorage: (_input: { orgId: string; orgName: string; runId: string }) => Promise<{
    manifestHash: string; rowCount: number; byteCount: number; storagePath: string;
  }>;
  deletePartial: (_runId: string, _orgId: string) => Promise<void>;
};

export async function runExportJob(data: ExportJobData, deps: ExportJobDeps): Promise<void> {
  // Losing the claim means another worker already has this run. Doing nothing
  // is the correct outcome, not an error.
  const claimed = await deps.claimRun(data.runId);
  if (!claimed) return;

  try {
    const orgName = await deps.orgName(data.orgId);
    const result = await deps.writeArchiveToStorage({
      orgId: data.orgId, orgName, runId: data.runId,
    });

    const expiresAt = new Date(Date.now() + RETENTION_DAYS * 86_400_000).toISOString();
    await deps.finishRun(data.runId, { ...result, expiresAt });
  } catch (err) {
    // A partial tar looks like a download and is not one, so it never survives
    // a failure.
    await deps.deletePartial(data.runId, data.orgId).catch(() => {});
    await deps.failRun(data.runId, err instanceof Error ? err.message : String(err));
  }
}

export async function enqueueExport(data: ExportJobData) {
  return exportQueue.add('export-org', data, {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 100,
  });
}
```

`attempts: 1`: a retry would find the run already `running` and lose the claim, so BullMQ retries would be silent no-ops. Failure is recorded on the run row instead, where an admin can see it.

- [ ] **Step 4: Write the worker entry point**

Create `scripts/export-worker.ts`:

```ts
// scripts/export-worker.ts
// Runs organization export jobs. Start with `npm run export:worker`.

import { PassThrough } from 'node:stream';
import { Worker } from 'bullmq';
import { createElevatedClient } from '../lib/api/admin-client';
import { createOrgExportRepository } from '../lib/api/repositories/org-exports';
import { writeArchive } from '../lib/export/archive';
import { runExportJob, type ExportJobData } from '../lib/export/queue';

const BUCKET = 'org-exports';
const objectPath = (orgId: string, runId: string) => `${orgId}/${runId}.tar`;

const worker = new Worker<ExportJobData>(
  'org-export-jobs',
  async job => {
    const db = createElevatedClient();
    const repo = createOrgExportRepository(db);

    await runExportJob(job.data, {
      claimRun: runId => repo.claimRun(runId),
      finishRun: (runId, input) => repo.finishRun(runId, input),
      failRun: (runId, reason) => repo.failRun(runId, reason),

      orgName: async orgId => {
        const { data } = await db.from('organizations').select('name').eq('id', orgId).maybeSingle();
        return (data?.name as string) ?? 'organization';
      },

      writeArchiveToStorage: async ({ orgId, orgName, runId }) => {
        const sink = new PassThrough();
        const path = objectPath(orgId, runId);

        // The upload consumes the stream while writeArchive produces it, so
        // nothing is staged on disk or held in memory between them.
        const upload = db.storage.from(BUCKET).upload(path, sink as unknown as ReadableStream, {
          contentType: 'application/x-tar',
          upsert: true,
          duplex: 'half',
        } as never);

        const [result] = await Promise.all([
          writeArchive({ db, orgId, orgName, sink }),
          upload,
        ]);

        return {
          manifestHash: result.manifestHash,
          rowCount: result.rowCount,
          byteCount: result.byteCount,
          storagePath: path,
        };
      },

      deletePartial: async (runId, orgId) => {
        await db.storage.from(BUCKET).remove([objectPath(orgId, runId)]);
      },
    });
  },
  { connection: { url: process.env.REDIS_URL || 'redis://localhost:6379' }, concurrency: 1 },
);

worker.on('failed', (job, err) => {
  console.error(`[export-worker] job ${job?.id} failed:`, err.message);
});

console.log('[export-worker] listening on org-export-jobs');
```

`concurrency: 1`: an export is I/O-heavy and the unique index already allows only one live run per organization, so parallelism would add contention without throughput.

If `db.storage.upload` rejects a stream in this Supabase client version, the fallback is writing to a temp file and uploading that — still never buffering rows in memory, and still deleted on failure. Verify which the installed client supports before assuming.

- [ ] **Step 5: Add the npm script**

In `package.json`, beside `evals:worker`:

```json
"export:worker": "ts-node -r tsconfig-paths/register --project tsconfig.scripts.json scripts/export-worker.ts",
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run lib/export && npm run verify:types`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/export scripts/export-worker.ts package.json
git commit -m "feat(export): run exports on a background worker"
```

---

# Task 6: The routes

**Why:** The client needs a way to ask for an export, watch it, and download it — and the platform needs a record of who asked.

**Files:**
- Create: `app/api/org/[orgId]/export/route.ts`
- Create: `app/api/org/[orgId]/export/[runId]/route.ts`
- Test: `tests/integration/org-export-routes.test.ts`

**Interfaces:**
- Consumes: `createOrgExportRepository` (Task 4); `enqueueExport` (Task 5).
- Produces: `POST /api/org/[orgId]/export` → `202 { run }`; `GET /api/org/[orgId]/export` → `{ runs }`; `GET /api/org/[orgId]/export/[runId]` → `{ run, signed_url? }`.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/org-export-routes.test.ts`:

```ts
// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const COLLECTION = readFileSync(join(ROOT, 'app/api/org/[orgId]/export/route.ts'), 'utf8');
const ITEM = readFileSync(join(ROOT, 'app/api/org/[orgId]/export/[runId]/route.ts'), 'utf8');

describe('export routes', () => {
  it('guards both routes as org admin', () => {
    expect(COLLECTION).toMatch(/requireOrgAccess\(orgId, 'admin'\)/);
    expect(ITEM).toMatch(/requireOrgAccess\(orgId, 'admin'\)/);
  });

  // An archive holds tax documents and personal data, so who produced one is
  // worth keeping after the archive is gone.
  it('writes an audit row before enqueuing', () => {
    expect(COLLECTION).toMatch(/org_audit_log/);
    expect(COLLECTION).toMatch(/org\.data_exported/);
  });

  it('returns 202 rather than waiting for the export', () => {
    expect(COLLECTION).toMatch(/status:\s*202/);
  });

  // Never getPublicUrl: the bucket is private and the archive is the most
  // concentrated copy of a client's data that exists.
  it('hands back a one-hour signed URL and never a public one', () => {
    expect(ITEM).toMatch(/createSignedUrl\([^,]+,\s*3600\)/);
    expect(ITEM).not.toMatch(/getPublicUrl/);
  });

  it('offers no URL for a run that has not succeeded', () => {
    expect(ITEM).toMatch(/status === 'succeeded'/);
  });

  it('scopes a run lookup to the organization in the path', () => {
    expect(ITEM).toMatch(/run\.org_id !== orgId/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/org-export-routes.test.ts`
Expected: FAIL — neither route file exists.

- [ ] **Step 3: Write the collection route**

Create `app/api/org/[orgId]/export/route.ts`:

```ts
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createElevatedClient } from '@/lib/api/admin-client';
import { createOrgExportRepository } from '@/lib/api/repositories/org-exports';
import { enqueueExport } from '@/lib/export/queue';
import { jsonError, jsonOk } from '@/lib/api/responses';

type RouteParams = { params: Promise<{ orgId: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;

  const db = createElevatedClient();
  const repo = createOrgExportRepository(db);

  try {
    const run = await repo.createRun(orgId, access.context.principal.userId);

    // Written before the work starts: an export that fails still happened, and
    // who asked for it is the fact worth keeping.
    await db.from('org_audit_log').insert({
      org_id: orgId,
      actor_id: access.context.principal.userId,
      action: 'org.data_exported',
      target_id: run.id,
      metadata: { run_id: run.id },
    });

    await enqueueExport({ runId: run.id, orgId });
    return jsonOk({ run }, { status: 202 });
  } catch (err) {
    // The unique partial index is what rejects a second live run.
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      return jsonError('An export is already running for this organization', 409);
    }
    return jsonError('Export could not be started', 502);
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;

  try {
    const runs = await createOrgExportRepository().listRuns(orgId);
    return jsonOk({ runs });
  } catch {
    return jsonError('Export history could not be loaded', 502);
  }
}
```

Check `access.context.principal` for the actual user-id property name before writing it — read `lib/api/principals.ts` and match it rather than assuming `userId`.

- [ ] **Step 4: Write the item route**

Create `app/api/org/[orgId]/export/[runId]/route.ts`:

```ts
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createElevatedClient } from '@/lib/api/admin-client';
import { createOrgExportRepository } from '@/lib/api/repositories/org-exports';
import { jsonError, jsonOk } from '@/lib/api/responses';

type RouteParams = { params: Promise<{ orgId: string; runId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { orgId, runId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;

  const db = createElevatedClient();

  try {
    const run = await createOrgExportRepository(db).getRun(runId);
    if (!run) return jsonError('Export run not found', 404);

    // The guard proved admin access to orgId, not to this run. Without this a
    // run id from another organization would be readable by anyone who
    // administers any organization.
    if (run.org_id !== orgId) return jsonError('Export run not found', 404);

    if (run.status !== 'succeeded' || !run.storage_path) {
      return jsonOk({ run });
    }

    const { data, error } = await db.storage
      .from('org-exports')
      .createSignedUrl(run.storage_path, 3600);
    if (error) throw error;

    return jsonOk({ run, signed_url: data?.signedUrl ?? null });
  } catch {
    return jsonError('Export run could not be loaded', 502);
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/integration/org-export-routes.test.ts && npm run verify:types && npm run verify:build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/api/org tests/integration/org-export-routes.test.ts
git commit -m "feat(api): expose organization export start, status and download"
```

---

# Task 7: Retention

**Why:** `expires_at` is a claim until something acts on it. Without a sweep, "the platform does not retain a copy of your data indefinitely" is a sentence in a spec rather than a property of the system — and the archive is the most concentrated collection of a client's data that will ever exist.

**Files:**
- Create: `app/api/jobs/exports/sweep/route.ts`
- Test: `tests/integration/export-retention.test.ts`

**Interfaces:**
- Consumes: `createOrgExportRepository` (Task 4) — `expiredRuns`, `markExpired`.
- Produces: `POST /api/jobs/exports/sweep` → `{ expired: number }`.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/export-retention.test.ts`:

```ts
// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROUTE = readFileSync(
  join(__dirname, '..', '..', 'app/api/jobs/exports/sweep/route.ts'),
  'utf8',
);

describe('export retention sweep', () => {
  it('is guarded as a job rather than by a session', () => {
    expect(ROUTE).toMatch(/requireJobAccess\(req(uest)?,\s*'exports'\)/);
  });

  // Marking a row expired without deleting the object would make the retention
  // promise false while looking true.
  it('removes the object before marking the run expired', () => {
    const removeAt = ROUTE.indexOf('.remove(');
    const markAt = ROUTE.indexOf('markExpired');
    expect(removeAt).toBeGreaterThan(-1);
    expect(markAt).toBeGreaterThan(removeAt);
  });

  it('reports how many runs it expired', () => {
    expect(ROUTE).toMatch(/expired:/);
  });

  it('sweeps only succeeded runs past their expiry', () => {
    expect(ROUTE).toMatch(/expiredRuns/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/export-retention.test.ts`
Expected: FAIL — the route does not exist.

- [ ] **Step 3: Write the sweep route**

Create `app/api/jobs/exports/sweep/route.ts`:

```ts
// app/api/jobs/exports/sweep/route.ts
// Deletes export archives past their retention window.
//
// Without this, expires_at is a column rather than a promise: the platform
// would hold a complete copy of every client's data indefinitely, which is the
// opposite of what the export exists to demonstrate.

import { NextRequest } from 'next/server';
import { isAccessDenied, requireJobAccess } from '@/lib/api/access';
import { createElevatedClient } from '@/lib/api/admin-client';
import { createOrgExportRepository } from '@/lib/api/repositories/org-exports';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const access = requireJobAccess(req, 'exports');
  if (isAccessDenied(access)) return access.response;

  const db = createElevatedClient();
  const repo = createOrgExportRepository(db);

  try {
    const due = await repo.expiredRuns(new Date().toISOString());
    let expired = 0;

    for (const run of due) {
      if (run.storage_path) {
        const { error } = await db.storage.from('org-exports').remove([run.storage_path]);
        // A row is marked expired only once its object is actually gone, so a
        // storage failure leaves the run visibly unswept rather than silently
        // claiming a deletion that did not happen.
        if (error) continue;
      }
      await repo.markExpired(run.id);
      expired += 1;
    }

    return jsonOk({ expired });
  } catch {
    return jsonError('Export retention sweep failed', 502);
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/integration && npm run verify:types && npm run verify:build`
Expected: PASS

- [ ] **Step 5: Run the whole gate**

```bash
npm run verify:types && npm run verify:lint && npm run verify:unit && npm run verify:migrations && npm run verify:build
```

Expected: PASS. `verify:migrations` is a destructive `supabase db reset`, already authorised on 2026-08-24 because no client instances exist.

- [ ] **Step 6: Commit**

```bash
git add app/api/jobs tests/integration/export-retention.test.ts
git commit -m "feat(export): enforce archive retention with a sweep job"
```

---

# Task 8: Storage objects

**Why:** An archive of rows without documents is not "everything they own". Tax substantiation, compliance filings and grant records live in storage, and a client who exports and finds their receipts missing has not been given their data.

**Files:**
- Modify: `lib/export/archive.ts`
- Create: `lib/export/storage.ts`
- Test: `lib/export/__tests__/storage.test.ts`

**Interfaces:**
- Consumes: `ElevatedClient`.
- Produces:
  - `EXPORT_BUCKETS: readonly { bucket: string; included: boolean; reason?: string }[]`
  - `streamBucketObjects(db, bucket, orgId): AsyncGenerator<{ path: string; body: Buffer }>`
  - `writeArchive` gains `storage/<bucket>/<path>` entries and counts them in the manifest.

- [ ] **Step 1: Write the failing test**

Create `lib/export/__tests__/storage.test.ts`:

```ts
// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { EXPORT_BUCKETS, streamBucketObjects } from '@/lib/export/storage';

describe('export buckets', () => {
  it('names every bucket in the database', () => {
    expect(EXPORT_BUCKETS.map(b => b.bucket).sort()).toEqual([
      'builder-artifacts', 'compliance-documents', 'grant-documents',
      'holding-contact-photos', 'imports', 'org-exports', 'tax-documents',
    ]);
  });

  // Raw uploads are already normalised into platform tables, so including them
  // roughly doubles archive size to re-ship data the export already carries.
  it('excludes imports and org-exports, with a stated reason', () => {
    for (const name of ['imports', 'org-exports']) {
      const entry = EXPORT_BUCKETS.find(b => b.bucket === name);
      expect(entry?.included).toBe(false);
      expect(entry?.reason).toBeTruthy();
    }
  });

  it('includes the five buckets holding organization documents', () => {
    const included = EXPORT_BUCKETS.filter(b => b.included).map(b => b.bucket).sort();
    expect(included).toEqual([
      'builder-artifacts', 'compliance-documents', 'grant-documents',
      'holding-contact-photos', 'tax-documents',
    ]);
  });
});

describe('streamBucketObjects', () => {
  function fakeStorage(listing: { name: string }[]) {
    return {
      storage: {
        from: vi.fn(() => ({
          list: vi.fn(async (_prefix: string, opts: { offset: number }) =>
            ({ data: opts.offset === 0 ? listing : [], error: null })),
          download: vi.fn(async () => ({
            data: { arrayBuffer: async () => new TextEncoder().encode('file body').buffer },
            error: null,
          })),
        })),
      },
    } as never;
  }

  it('yields each object under the organization prefix', async () => {
    const seen: string[] = [];
    for await (const obj of streamBucketObjects(
      fakeStorage([{ name: 'receipt.pdf' }]), 'tax-documents', 'org-1',
    )) {
      seen.push(obj.path);
      expect(obj.body.toString()).toBe('file body');
    }
    expect(seen).toEqual(['org-1/receipt.pdf']);
  });

  // A document another organization owns must never reach this archive.
  it('lists only within the organization prefix', async () => {
    const db = fakeStorage([]);
    // eslint-disable-next-line no-empty
    for await (const _ of streamBucketObjects(db, 'tax-documents', 'org-1')) {}
    const from = (db as unknown as { storage: { from: ReturnType<typeof vi.fn> } }).storage.from;
    const listMock = from.mock.results[0].value.list as ReturnType<typeof vi.fn>;
    expect(listMock).toHaveBeenCalledWith('org-1', expect.anything());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/export/__tests__/storage.test.ts`
Expected: FAIL — `lib/export/storage.ts` does not exist.

- [ ] **Step 3: Write the bucket reader**

Create `lib/export/storage.ts`:

```ts
// lib/export/storage.ts
// Enumerates and reads an organization's documents for export.

import type { ElevatedClient } from '@/lib/api/admin-client';

export const EXPORT_BUCKETS: readonly { bucket: string; included: boolean; reason?: string }[] = [
  { bucket: 'tax-documents', included: true },
  { bucket: 'compliance-documents', included: true },
  { bucket: 'grant-documents', included: true },
  { bucket: 'holding-contact-photos', included: true },
  { bucket: 'builder-artifacts', included: true },
  {
    bucket: 'imports',
    included: false,
    reason: 'raw source files, already normalised into platform tables',
  },
  {
    bucket: 'org-exports',
    included: false,
    reason: 'archives of previous exports; including them would nest exports',
  },
];

const PAGE = 100;

export async function* streamBucketObjects(
  db: ElevatedClient,
  bucket: string,
  orgId: string,
): AsyncGenerator<{ path: string; body: Buffer }> {
  const store = db.storage.from(bucket);
  let offset = 0;

  for (;;) {
    // Listing is scoped to the organization's prefix. That prefix is the only
    // thing separating one tenant's documents from another's in a shared
    // bucket, so it is never omitted or widened.
    const { data, error } = await store.list(orgId, { limit: PAGE, offset });
    if (error) throw error;

    const entries = data ?? [];
    if (entries.length === 0) return;

    for (const entry of entries) {
      const path = `${orgId}/${entry.name}`;
      const file = await store.download(path);
      if (file.error) throw file.error;
      if (!file.data) continue;
      yield { path, body: Buffer.from(await file.data.arrayBuffer()) };
    }

    if (entries.length < PAGE) return;
    offset += entries.length;
  }
}
```

Objects are read one at a time and written straight into the tar, so peak memory is one document rather than a bucket.

- [ ] **Step 4: Add documents to the archive**

In `lib/export/archive.ts`, import the reader:

```ts
import { EXPORT_BUCKETS, streamBucketObjects } from '@/lib/export/storage';
```

Extend `ExportManifest` with a document count per bucket:

```ts
  files: { path: string; sha256: string; rows?: number; bytes: number }[];
  documents: { bucket: string; count: number; bytes: number }[];
```

After the table loop and before the manifest entry, add:

```ts
  const documents: ExportManifest['documents'] = [];
  for (const { bucket, included } of EXPORT_BUCKETS) {
    if (!included) continue;
    let count = 0;
    let bucketBytes = 0;

    for await (const object of streamBucketObjects(db, bucket, orgId)) {
      const path = `storage/${bucket}/${object.path}`;
      await new Promise<void>((resolve, reject) => {
        tar.entry({ name: path, size: object.body.length }, object.body,
          err => (err ? reject(err) : resolve()));
      });
      files.push({ path, sha256: sha256Hex(object.body), bytes: object.body.length });
      count += 1;
      bucketBytes += object.body.length;
      byteCount += object.body.length;
    }

    documents.push({ bucket, count, bytes: bucketBytes });
  }
```

Add `documents` to the manifest object, and extend `excluded` to use the shared list rather than a hard-coded entry:

```ts
    ...EXPORT_BUCKETS
      .filter(entry => !entry.included)
      .map(entry => ({ bucket: entry.bucket, reason: entry.reason ?? 'excluded' })),
```

replacing the single `{ bucket: 'imports', … }` line written in Task 3.

- [ ] **Step 5: Extend the archive test**

Append to `lib/export/__tests__/archive.test.ts`:

```ts
describe('writeArchive with documents', () => {
  it('writes each document into the tar and hashes it', async () => {
    const { sink, buffer } = collectingSink();
    const db = {
      ...fakeDb({}),
      storage: {
        from: vi.fn((bucket: string) => ({
          list: vi.fn(async (_p: string, o: { offset: number }) => ({
            data: bucket === 'tax-documents' && o.offset === 0 ? [{ name: 'receipt.pdf' }] : [],
            error: null,
          })),
          download: vi.fn(async () => ({
            data: { arrayBuffer: async () => new TextEncoder().encode('pdf bytes').buffer },
            error: null,
          })),
        })),
      },
    } as never;

    await writeArchive({ db, orgId: 'org-1', orgName: 'Test Org', sink });
    const files = await readArchive(buffer());

    expect(Object.keys(files)).toContain('storage/tax-documents/org-1/receipt.pdf');
    expect(files['storage/tax-documents/org-1/receipt.pdf']).toBe('pdf bytes');
  });

  it('counts documents per bucket in the manifest', async () => {
    const { sink, buffer } = collectingSink();
    await writeArchive({ db: fakeDbWithNoDocuments(), orgId: 'org-1', orgName: 'T', sink });
    const manifest = JSON.parse((await readArchive(buffer()))['manifest.json']) as ExportManifest;
    expect(manifest.documents.map(d => d.bucket)).toContain('tax-documents');
  });
});

/** A db double with storage that lists nothing. */
function fakeDbWithNoDocuments() {
  return {
    ...fakeDb({}),
    storage: {
      from: vi.fn(() => ({
        list: vi.fn(async () => ({ data: [], error: null })),
        download: vi.fn(async () => ({ data: null, error: null })),
      })),
    },
  } as never;
}
```

The existing `fakeDb` helper in that file needs a `storage` property too, or the table-only tests will fail once `writeArchive` reaches the document loop. Give it the same no-op storage double as `fakeDbWithNoDocuments`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run lib/export && npm run verify:types`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/export
git commit -m "feat(export): stream organization documents into the archive"
```

---

## Phase 4B exit criteria

- [ ] `npm run verify:types && npm run verify:lint && npm run verify:unit` all pass
- [ ] `npm run verify:migrations` passes from a clean local Supabase reset
- [ ] `npm run verify:build` passes
- [ ] The completeness guard fails when a table is added without classification — verify by creating a throwaway table, running the test, then dropping it
- [ ] A `numeric` column round-trips as a JSON string with its scale intact; `25000.00` does not become `25000`
- [ ] An export of one organization contains no row belonging to another, asserted against a two-organization fixture
- [ ] A completed export yields a downloadable tar whose manifest hashes match its files
- [ ] Manual check, needs a running worker: `npm run export:worker`, then POST an export and confirm the run reaches `succeeded` with a signed URL that downloads a readable tar
- [ ] Manual check: a failed export leaves no object in `org-exports` and a `failed` run naming the reason
- [ ] Manual check: the sweep removes an archive whose `expires_at` has passed and marks the run `expired`
- [ ] The archive contains an organization's documents from all five included buckets, and none from `imports`
- [ ] Manual check: a document belonging to another organization does not appear in the archive
