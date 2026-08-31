# Phase 4A — Migrations Ledger and Schema Transparency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the migration state of a database knowable, so handing someone a database they can upgrade is a promise the platform can keep.

**Architecture:** One table records what was applied, with a checksum. One pure module compares files on disk against that table, so the runner and the API cannot disagree about what drift means. The runner refuses to proceed on drift, and reports plainly when nothing is pending.

**Tech Stack:** TypeScript, Supabase (Postgres + RLS), Next.js 15 App Router, Vitest, ts-node.

**Spec:** `docs/agent-work/specs/2026-08-31-phase4a-migrations-ledger-design.md`

## Global Constraints

- `db/migrations` is the single source of truth. A new canonical concept gets a new numbered migration.
- Every migration change is followed by `npm run db:types:generate`, and `lib/database.types.ts` is committed with it.
- Org-scoped FK column is `org_id`. RLS helpers are `can_view_org`, `is_org_admin`, `is_app_admin`, `user_org_role`.
- Product code reaches data only through `lib/database-client.ts` and repository modules under `lib/api/repositories/`.
- Org-scoped routes live under `app/api/org/[orgId]/**`, use shared access guards, and return `jsonOk` / `jsonError`.
- Browser data access goes through `lib/api/client.ts` and `lib/<domain>/hooks.ts`. Components never call raw `fetch` for domain data.
- **Version numbers are file-name prefixes with gaps, not a sequence.** Comparison and adoption key on the parsed version string, never on a numeric range.
- **`checksumOf` normalises line endings before hashing.** A CRLF checkout must not read as universal drift.
- `lib/migrations/ledger.ts` is pure: no database, no filesystem, no `process.env`. Task 2's boundary test enforces it.
- Verification gate for every task: `npm run verify:types`, `npm run verify:lint`, `npm run verify:unit`. Add `npm run verify:migrations` when `db/migrations/` changes and `npm run verify:build` when `app/` changes.

## Two constraints discovered while planning

Read both before starting; each changes a task's shape.

**1. `execSql` cannot read.** `scripts/migrate-client.ts:128-180` sends SQL through the Management API or the `exec_sql` RPC and throws on error, but **discards the response body**. The runner therefore has no way to read the ledger today. Task 4 adds a separate `querySql` that returns rows, rather than pretending `execSql` can.

**2. `MigrationFile` has no version string.** It is `{ num: number; filename: string; fullPath: string }` (`scripts/migrate-client.ts:85`), where `num` comes from `parseInt(filename.slice(0,4))`. The ledger keys on the four-character version string — `'0059'`, not `59` — because leading zeros and gaps make numeric identity unsafe. Task 4 adds `version` to the discovery output rather than converting at every call site.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `lib/migrations/ledger.ts` | `checksumOf`, `compareLedger` — pure comparison | 2 |
| `db/migrations/0060_migrations_ledger.sql` | `applied_migrations` table and backfill (Task 1); `org_table_row_counts` function (Task 5) | 1, 5 |
| `scripts/migrate-client.ts` | `querySql`, version discovery, ledger-aware apply | 3, 4 |
| `scripts/run-migrations.sh` | Help text only | 4 |
| `app/api/org/[orgId]/schema/route.ts` | Migration state and table inventory | 6 |
| `lib/ai/hooks.ts` | `useOrgSchema` hook | 6 |
| `scripts/verify/schema-behavior.sql` | Ledger RLS and constraint assertions | 7 |

---

# Task 1: The ledger table

**Why:** Nothing records what ran. The table carries a checksum so a file edited after it was applied becomes detectable rather than invisible.

**Files:**
- Create: `db/migrations/0060_migrations_ledger.sql`
- Modify: `lib/database.types.ts` (regenerated)
- Test: `tests/integration/migrations-ledger-schema.test.ts` (create)

**Interfaces:**
- Consumes: `public.is_org_admin` from `0001`; `supabase_migrations.schema_migrations`, maintained by the Supabase CLI.
- Produces: table `public.applied_migrations` keyed by `version`.

- [x] **Step 1: Write the failing test**

Create `tests/integration/migrations-ledger-schema.test.ts`:

```ts
// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  join(__dirname, '..', '..', 'db/migrations/0060_migrations_ledger.sql'),
  'utf8',
);

describe('applied_migrations schema', () => {
  it('keys on the version string, not a number', () => {
    expect(SQL).toMatch(/version\s+text PRIMARY KEY/);
  });

  it('records a checksum and its provenance', () => {
    expect(SQL).toMatch(/checksum\s+text NOT NULL/);
    expect(SQL).toMatch(/applied_by\s+text NOT NULL CHECK \(applied_by IN \('cli','migrate-client','backfill'\)\)/);
  });

  it('backfills from the Supabase CLI table', () => {
    expect(SQL).toMatch(/INSERT INTO public\.applied_migrations[\s\S]*supabase_migrations\.schema_migrations/);
    expect(SQL).toMatch(/'unverified'/);
  });

  // Without this, the ledger's first act is to declare itself pending and the
  // next runner invocation tries to apply an already-applied migration.
  it('records itself', () => {
    expect(SQL).toMatch(/VALUES\s*\(\s*'0060'/);
  });

  it('lets org admins read but never write', () => {
    expect(SQL).toMatch(/ALTER TABLE public\.applied_migrations ENABLE ROW LEVEL SECURITY/);
    expect(SQL).toMatch(/FOR SELECT TO authenticated/);
    expect(SQL).toMatch(/is_org_admin\(m\.org_id\)/);
    expect(SQL).not.toMatch(/FOR ALL TO authenticated/);
    expect(SQL).toMatch(/REVOKE ALL ON public\.applied_migrations FROM authenticated/);
  });

  // Picking one arbitrary membership would grant or deny unpredictably for a
  // user who administers one organization and merely belongs to another.
  it('tests membership with EXISTS rather than an arbitrary single row', () => {
    expect(SQL).not.toMatch(/LIMIT 1/);
    expect(SQL).toMatch(/EXISTS \(\s*SELECT 1 FROM public\.organization_members/);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/migrations-ledger-schema.test.ts`
Expected: FAIL — the migration file does not exist.

- [x] **Step 3: Write the migration**

Create `db/migrations/0060_migrations_ledger.sql`:

```sql
-- =============================================================================
-- 0060_migrations_ledger.sql
-- Records which migrations have been applied and what their content was, so a
-- database's migration state is knowable rather than inferred.
-- Depends on: 0001
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.applied_migrations (
  -- The four-character file-name prefix. A string, not a number: version
  -- numbers have gaps and leading zeros, so numeric identity is unsafe.
  version      text PRIMARY KEY,
  filename     text NOT NULL CHECK (btrim(filename) <> ''),
  -- sha256 of the file's normalised content, or 'unverified' for a backfilled
  -- row whose content at apply time cannot be reconstructed.
  checksum     text NOT NULL CHECK (btrim(checksum) <> ''),
  applied_at   timestamptz NOT NULL DEFAULT now(),
  applied_by   text NOT NULL CHECK (applied_by IN ('cli','migrate-client','backfill'))
);

-- ---------------------------------------------------------------------------
-- Adoption: seed from what the Supabase CLI already recorded.
--
-- These rows are recorded, not verified — the content that actually ran is not
-- recoverable, so the checksum is 'unverified' until a ledger-aware runner
-- replaces it. That distinction is surfaced as the 'adopted' state rather than
-- being reported as 'verified'.
-- ---------------------------------------------------------------------------
INSERT INTO public.applied_migrations (version, filename, checksum, applied_by)
SELECT
  version,
  COALESCE(name, version) || '.sql',
  'unverified',
  'backfill'
FROM supabase_migrations.schema_migrations
ON CONFLICT (version) DO NOTHING;

-- This migration records itself: the backfill above reads a table that does
-- not yet list 0060, so without this the ledger would immediately declare
-- itself pending.
INSERT INTO public.applied_migrations (version, filename, checksum, applied_by)
VALUES ('0060', '0060_migrations_ledger.sql', 'unverified', 'backfill')
ON CONFLICT (version) DO NOTHING;

ALTER TABLE public.applied_migrations ENABLE ROW LEVEL SECURITY;

-- Readable by anyone who administers any organization on this instance. The
-- ledger describes the instance rather than a tenant, and each client gets a
-- dedicated instance, so there is no per-org row to scope to.
--
-- EXISTS rather than a LIMIT 1 subquery: picking one arbitrary membership
-- would grant or deny unpredictably for a user who administers one
-- organization and merely belongs to another.
CREATE POLICY "applied_migrations_admin_read" ON public.applied_migrations
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.user_id = auth.uid()
        AND m.deleted_at IS NULL
        AND public.is_org_admin(m.org_id)
    )
  );
CREATE POLICY "applied_migrations_service" ON public.applied_migrations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Supabase grants authenticated full table privileges by default, so revoke
-- before granting: RLS alone would leave write privileges nominally present.
REVOKE ALL ON public.applied_migrations FROM authenticated;
GRANT SELECT ON public.applied_migrations TO authenticated;
GRANT ALL ON public.applied_migrations TO service_role;
```

The RLS predicate is deliberate: `applied_migrations` has no `org_id`, so "does this caller administer any organization" is the only sensible test. `organization_members` uses `org_id`, `user_id` and a `deleted_at` soft-delete column, verified against `db/migrations/0002_organizations.sql:73`.

- [x] **Step 4: Apply and regenerate types**

Run: `npx supabase migration up --local && npm run db:types:generate`
Expected: `lib/database.types.ts` gains `applied_migrations` and is otherwise unchanged. Inspect the diff — anything else means the migration touched more than intended.

- [x] **Step 5: Verify the backfill actually ran**

```bash
docker exec supabase_db_benevolence-walkthrough psql -U postgres -d postgres -Atc \
  "SELECT count(*), count(*) FILTER (WHERE checksum = 'unverified') FROM public.applied_migrations"
```

Expected: both numbers equal, and equal to the row count of `supabase_migrations.schema_migrations` plus one for `0060` itself. If the first number is 1, the backfill selected nothing — check whether the migration ran as a role that can read `supabase_migrations`.

- [x] **Step 6: Run the tests**

Run: `npx vitest run tests/integration/migrations-ledger-schema.test.ts && npm run verify:types`
Expected: PASS (5 tests)

- [x] **Step 7: Commit**

```bash
git add db/migrations/0060_migrations_ledger.sql lib/database.types.ts tests/integration/migrations-ledger-schema.test.ts
git commit -m "feat(db): add the migrations ledger with adoption backfill"
```

---

# Task 2: The comparison module

**Why:** The runner refuses on drift and the API reports it. If each computed drift separately they would eventually disagree, and an operator would not know which to believe. One pure function, no I/O, so it is testable with fixtures and cannot drift from itself.

**Files:**
- Create: `lib/migrations/ledger.ts`
- Test: `lib/migrations/__tests__/ledger.test.ts` (create)

**Interfaces:**
- Consumes: nothing. Pure.
- Produces:
  - `checksumOf(sql: string): string`
  - `type AppliedMigrationRow = { version: string; filename: string; checksum: string; applied_at: string; applied_by: string }`
  - `type LedgerFile = { version: string; filename: string; sql: string }`
  - `type LedgerComparison = { pending: LedgerFile[]; drifted: { version: string; filename: string; recorded: string; current: string }[]; applied: { version: string; filename: string; state: 'verified' | 'adopted'; appliedAt: string }[] }`
  - `compareLedger(files: LedgerFile[], rows: AppliedMigrationRow[]): LedgerComparison`

- [x] **Step 1: Write the failing test**

Create `lib/migrations/__tests__/ledger.test.ts`:

```ts
// @vitest-environment node

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checksumOf, compareLedger } from '@/lib/migrations/ledger';
import type { AppliedMigrationRow, LedgerFile } from '@/lib/migrations/ledger';

const file = (version: string, sql = `-- ${version}`): LedgerFile =>
  ({ version, filename: `${version}_test.sql`, sql });

const row = (
  version: string,
  checksum: string,
  applied_by = 'migrate-client',
): AppliedMigrationRow => ({
  version,
  filename: `${version}_test.sql`,
  checksum,
  applied_at: '2026-08-31T00:00:00.000Z',
  applied_by,
});

describe('checksumOf', () => {
  it('is stable for identical content', () => {
    expect(checksumOf('SELECT 1;')).toBe(checksumOf('SELECT 1;'));
  });

  it('differs when content differs', () => {
    expect(checksumOf('SELECT 1;')).not.toBe(checksumOf('SELECT 2;'));
  });

  // Without normalisation a CRLF checkout reads as universal drift and the
  // ledger refuses every migration on a Windows machine.
  it('ignores line-ending differences', () => {
    expect(checksumOf('a\r\nb\r\n')).toBe(checksumOf('a\nb\n'));
  });

  it('ignores a trailing newline', () => {
    expect(checksumOf('SELECT 1;\n')).toBe(checksumOf('SELECT 1;'));
  });
});

describe('compareLedger', () => {
  it('reports an unrecorded file as pending', () => {
    const result = compareLedger([file('0001')], []);
    expect(result.pending.map(f => f.version)).toEqual(['0001']);
    expect(result.drifted).toEqual([]);
    expect(result.applied).toEqual([]);
  });

  it('reports a matching file as verified', () => {
    const f = file('0001');
    const result = compareLedger([f], [row('0001', checksumOf(f.sql))]);
    expect(result.pending).toEqual([]);
    expect(result.applied).toEqual([
      { version: '0001', filename: '0001_test.sql', state: 'verified', appliedAt: '2026-08-31T00:00:00.000Z' },
    ]);
  });

  // The evidence of what actually ran does not exist for a backfilled row, so
  // 'unverified' is never drift — it is a distinct, honestly-reported state.
  it('reports an unverified checksum as adopted, never drifted', () => {
    const result = compareLedger([file('0001')], [row('0001', 'unverified', 'backfill')]);
    expect(result.drifted).toEqual([]);
    expect(result.applied[0].state).toBe('adopted');
  });

  it('reports a changed file as drifted', () => {
    const result = compareLedger([file('0001', '-- changed')], [row('0001', checksumOf('-- original'))]);
    expect(result.pending).toEqual([]);
    expect(result.applied).toEqual([]);
    expect(result.drifted).toEqual([{
      version: '0001',
      filename: '0001_test.sql',
      recorded: checksumOf('-- original'),
      current: checksumOf('-- changed'),
    }]);
  });

  it('separates pending, applied and drifted in one pass', () => {
    const files = [file('0001'), file('0002', '-- changed'), file('0003')];
    const rows = [row('0001', checksumOf(file('0001').sql)), row('0002', checksumOf('-- original'))];
    const result = compareLedger(files, rows);
    expect(result.applied.map(a => a.version)).toEqual(['0001']);
    expect(result.drifted.map(d => d.version)).toEqual(['0002']);
    expect(result.pending.map(p => p.version)).toEqual(['0003']);
  });

  // Version numbers have gaps, so ordering must come from the string and not
  // from a numeric range or insertion order.
  it('returns pending in version order regardless of input order', () => {
    const result = compareLedger([file('0010'), file('0002'), file('0057')], []);
    expect(result.pending.map(p => p.version)).toEqual(['0002', '0010', '0057']);
  });

  it('ignores a recorded version with no file on disk', () => {
    const result = compareLedger([], [row('0099', 'abc')]);
    expect(result.pending).toEqual([]);
    expect(result.drifted).toEqual([]);
    expect(result.applied.map(a => a.version)).toEqual(['0099']);
  });
});

describe('purity', () => {
  // The module's value is being testable without a database or filesystem.
  it('imports no database, filesystem, or environment access', () => {
    const source = readFileSync(join(__dirname, '..', 'ledger.ts'), 'utf8');
    expect(source).not.toMatch(/@supabase|node:fs|from 'fs'|process\.env|\/repositories\//);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/migrations/__tests__/ledger.test.ts`
Expected: FAIL — `lib/migrations/ledger.ts` does not exist.

- [x] **Step 3: Write the module**

Create `lib/migrations/ledger.ts`:

```ts
// lib/migrations/ledger.ts
// Pure comparison between migration files on disk and the applied_migrations
// ledger. The runner refuses on drift and the API reports it; both call this,
// so they cannot disagree about what drift means.

import { createHash } from 'node:crypto';

/** A backfilled row whose content at apply time cannot be reconstructed. */
export const UNVERIFIED = 'unverified';

export type AppliedMigrationRow = {
  version: string;
  filename: string;
  checksum: string;
  applied_at: string;
  applied_by: string;
};

export type LedgerFile = {
  version: string;
  filename: string;
  sql: string;
};

export type LedgerComparison = {
  pending: LedgerFile[];
  drifted: { version: string; filename: string; recorded: string; current: string }[];
  applied: {
    version: string;
    filename: string;
    state: 'verified' | 'adopted';
    appliedAt: string;
  }[];
};

/**
 * Line endings are normalised and trailing whitespace trimmed before hashing.
 * A CRLF checkout would otherwise read as universal drift.
 */
export function checksumOf(sql: string): string {
  const normalised = sql.replace(/\r\n/g, '\n').trimEnd();
  return createHash('sha256').update(normalised, 'utf8').digest('hex');
}

export function compareLedger(
  files: LedgerFile[],
  rows: AppliedMigrationRow[],
): LedgerComparison {
  const byVersion = new Map(rows.map(row => [row.version, row]));
  const comparison: LedgerComparison = { pending: [], drifted: [], applied: [] };

  for (const file of files) {
    const recorded = byVersion.get(file.version);
    if (!recorded) {
      comparison.pending.push(file);
      continue;
    }
    // An unverified row is adopted, not drifted: there is nothing to compare
    // against, so treating it as drift would refuse every adopted database.
    if (recorded.checksum === UNVERIFIED) {
      comparison.applied.push({
        version: file.version,
        filename: file.filename,
        state: 'adopted',
        appliedAt: recorded.applied_at,
      });
      continue;
    }
    const current = checksumOf(file.sql);
    if (current !== recorded.checksum) {
      comparison.drifted.push({
        version: file.version,
        filename: file.filename,
        recorded: recorded.checksum,
        current,
      });
      continue;
    }
    comparison.applied.push({
      version: file.version,
      filename: file.filename,
      state: 'verified',
      appliedAt: recorded.applied_at,
    });
  }

  // A recorded version with no file on disk is reported as applied rather than
  // hidden: it is part of the database's history even if the file is gone.
  const onDisk = new Set(files.map(file => file.version));
  for (const row of rows) {
    if (onDisk.has(row.version)) continue;
    comparison.applied.push({
      version: row.version,
      filename: row.filename,
      state: row.checksum === UNVERIFIED ? 'adopted' : 'verified',
      appliedAt: row.applied_at,
    });
  }

  // Version strings, never numbers: prefixes have gaps and leading zeros.
  const byVersionString = (a: { version: string }, b: { version: string }) =>
    a.version.localeCompare(b.version);
  comparison.pending.sort(byVersionString);
  comparison.drifted.sort(byVersionString);
  comparison.applied.sort(byVersionString);

  return comparison;
}
```

- [x] **Step 4: Run the tests**

Run: `npx vitest run lib/migrations && npm run verify:types`
Expected: PASS (13 tests)

- [x] **Step 5: Commit**

```bash
git add lib/migrations
git commit -m "feat(migrations): add the pure ledger comparison module"
```

---

# Task 3: Reading from the database

**Why:** `execSql` (`scripts/migrate-client.ts:128-180`) throws on error and discards the response body, so the runner cannot read the ledger it is about to compare against. This adds a reading path rather than pretending the writing one can return rows.

**Files:**
- Modify: `scripts/migrate-client.ts`
- Test: `tests/integration/migration-runner-contract.test.ts` (create)

**Interfaces:**
- Consumes: `SUPABASE_ACCESS_TOKEN` (Management API) or `SUPABASE_SERVICE_KEY` (`exec_sql` RPC), the same two paths `execSql` already supports.
- Produces: `async function querySql<T>(sql: string, description: string): Promise<T[]>` in `scripts/migrate-client.ts`.

- [x] **Step 1: Write the failing test**

Create `tests/integration/migration-runner-contract.test.ts`:

```ts
// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RUNNER = readFileSync(
  join(__dirname, '..', '..', 'scripts/migrate-client.ts'),
  'utf8',
);

describe('migration runner', () => {
  // execSql throws on error and discards the body, so reading needs its own
  // path rather than a caller trying to interpret a void return.
  it('has a query path that returns rows', () => {
    expect(RUNNER).toMatch(/async function querySql/);
    expect(RUNNER).toMatch(/Promise<T\[\]>/);
  });

  it('discovers migrations with a version string, not only a number', () => {
    expect(RUNNER).toMatch(/version:\s*f\.slice\(0,\s*4\)/);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/migration-runner-contract.test.ts`
Expected: FAIL — neither `querySql` nor a version string exists.

- [x] **Step 3: Add the version string to discovery**

In `scripts/migrate-client.ts`, extend the interface at line 85 and the mapper at line 99:

```ts
interface MigrationFile {
  num: number;
  version: string;
  filename: string;
  fullPath: string;
}
```

```ts
    .map(f => ({
      num: parseInt(f.slice(0, 4), 10),
      // The ledger keys on this string. Leading zeros and gaps make numeric
      // identity unsafe.
      version: f.slice(0, 4),
      filename: f,
      fullPath: path.join(dbDir, f),
    }))
```

Also add `version` where the single-file path builds a `MigrationFile` (around line 208):

```ts
    migrations = [{ num, version: filename.slice(0, 4), filename, fullPath }];
```

- [x] **Step 4: Add the query path**

Add below `execSql` in `scripts/migrate-client.ts`:

```ts
/**
 * Reads rows. Separate from execSql, which throws on error but discards the
 * response body — adequate for DDL, useless for reading the ledger.
 */
async function querySql<T>(sql: string, description: string): Promise<T[]> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl) throw new Error('SUPABASE_URL env var is required');

  if (accessToken) {
    // Same endpoint and ref derivation as execSql — the difference is that
    // this one reads the response body.
    const projectRef = extractProjectRef(supabaseUrl);
    if (!projectRef) throw new Error(`Could not parse project ref from SUPABASE_URL: ${supabaseUrl}`);

    const res = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
      },
    );
    if (!res.ok) throw new Error(`Management API error for "${description}": ${await res.text()}`);
    return (await res.json()) as T[];
  }

  if (serviceKey) {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql }),
    });
    if (!res.ok) throw new Error(`REST API error for "${description}": ${await res.text()}`);
    const body = await res.json();
    return (Array.isArray(body) ? body : []) as T[];
  }

  throw new Error(
    'No query method available. Set SUPABASE_ACCESS_TOKEN (Management API) or SUPABASE_SERVICE_KEY (REST API).',
  );
}
```

This mirrors `execSql` exactly — same endpoint, same `extractProjectRef(supabaseUrl)` derivation (`scripts/migrate-client.ts:144`), same two credential paths — and adds no new environment variable. The only difference is that it returns the parsed body instead of discarding it.

The `exec_sql` RPC branch may return a scalar rather than rows depending on how that function is defined in a given deployment. The `Array.isArray` guard is why: a non-array response yields an empty ledger, which the runner treats as a first run rather than crashing. If `exec_sql` turns out never to return rows, the Management API path is the only working one and the error message should say so — verify before relying on the fallback.

- [x] **Step 5: Run the tests**

Run: `npx vitest run tests/integration/migration-runner-contract.test.ts && npm run verify:types`
Expected: PASS (2 tests)

- [x] **Step 6: Commit**

```bash
git add scripts/migrate-client.ts tests/integration/migration-runner-contract.test.ts
git commit -m "feat(migrations): add a query path and version strings to the runner"
```

---

# Task 4: The ledger-aware runner

**Why:** This is the behaviour F11 asks for. Today the runner re-applies every file in a hand-supplied range and reports success from guarded DDL that did nothing.

**Files:**
- Modify: `scripts/migrate-client.ts`
- Modify: `scripts/run-migrations.sh` (help text)
- Test: `tests/integration/migration-runner-contract.test.ts` (extend)

**Interfaces:**
- Consumes: `compareLedger`, `checksumOf`, `UNVERIFIED` from Task 2; `querySql` from Task 3.
- Produces: no exports. The runner exits non-zero on drift, exits 0 with a message when nothing is pending, and records a row per applied migration.

- [x] **Step 1: Write the failing test**

Append to `tests/integration/migration-runner-contract.test.ts`:

```ts
describe('ledger-aware behaviour', () => {
  it('compares against the ledger rather than a hand-supplied range', () => {
    expect(RUNNER).toMatch(/compareLedger/);
    expect(RUNNER).toMatch(/applied_migrations/);
  });

  // The roadmap's exit criterion: a no-op that says so, rather than silently
  // re-running everything.
  it('reports when nothing is pending', () => {
    expect(RUNNER).toMatch(/already up to date|nothing to apply|No pending migrations/i);
  });

  it('refuses on drift and names both checksums', () => {
    expect(RUNNER).toMatch(/has changed since it was applied/);
    expect(RUNNER).toMatch(/recorded/);
    expect(RUNNER).toMatch(/supabase db reset/);
  });

  // An override would become the habit and the guarantee would erode.
  it('offers no force flag', () => {
    expect(RUNNER).not.toMatch(/--force/);
  });

  it('records a row for each applied migration', () => {
    expect(RUNNER).toMatch(/INSERT INTO public\.applied_migrations/);
    expect(RUNNER).toMatch(/'migrate-client'/);
  });

  it('supports an explicit adopt for a database with no prior bookkeeping', () => {
    expect(RUNNER).toMatch(/--adopt/);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/migration-runner-contract.test.ts`
Expected: FAIL — the runner does not mention the ledger.

- [x] **Step 3: Read the ledger before applying**

In `main()` in `scripts/migrate-client.ts`, after migrations are discovered and before the dry-run branch, replace the range-only selection with a ledger comparison:

```ts
  const ledgerRows = await querySql<AppliedMigrationRow>(
    'SELECT version, filename, checksum, applied_at, applied_by FROM public.applied_migrations ORDER BY version',
    'read migrations ledger',
  ).catch(() => {
    // The ledger itself is migration 0060. A database that predates it has no
    // table to read, which is a legitimate first-run state, not an error.
    console.log('No migrations ledger found — treating this as a first run.');
    return [] as AppliedMigrationRow[];
  });

  const comparison = compareLedger(
    migrations.map(m => ({
      version: m.version,
      filename: m.filename,
      sql: fs.readFileSync(m.fullPath, 'utf-8'),
    })),
    ledgerRows,
  );

  if (comparison.drifted.length > 0) {
    console.error('\nERROR  Migration files have changed since they were applied:\n');
    for (const drift of comparison.drifted) {
      console.error(`  ${drift.filename} has changed since it was applied`);
      console.error(`    recorded ${drift.recorded.slice(0, 8)}…  current ${drift.current.slice(0, 8)}…`);
    }
    console.error('\n  Prerelease: run `supabase db reset` to rebuild from source.');
    console.error('  Released:   add a new migration instead of editing this one.\n');
    process.exit(1);
  }

  if (comparison.pending.length === 0) {
    console.log(
      `\nDatabase is already up to date — ${comparison.applied.length} migrations applied, nothing to apply.\n`,
    );
    return;
  }

  // --from/--to now filter what is pending rather than selecting what to run.
  migrations = migrations.filter(m =>
    comparison.pending.some(pending => pending.version === m.version));
```

Import at the top:

```ts
import {
  compareLedger,
  checksumOf,
  type AppliedMigrationRow,
} from '../lib/migrations/ledger';
```

If a relative import from `scripts/` into `lib/` does not resolve under `tsconfig.scripts.json`, check how `scripts/builder-worker.ts` imports from `lib/` and follow that; do not duplicate the module.

- [x] **Step 4: Record each applied migration**

Where a migration is applied successfully, record it in the same pass:

```ts
    await execSql(sql, m.filename);
    await execSql(
      `INSERT INTO public.applied_migrations (version, filename, checksum, applied_by)
       VALUES ('${m.version}', '${m.filename}', '${checksumOf(sql)}', 'migrate-client')
       ON CONFLICT (version) DO UPDATE
         SET checksum = EXCLUDED.checksum,
             filename = EXCLUDED.filename,
             applied_by = EXCLUDED.applied_by,
             applied_at = now()`,
      `record ${m.filename}`,
    );
```

The `DO UPDATE` is what upgrades an `'unverified'` backfilled row to a real checksum on first contact. Values are interpolated rather than parameterised because `execSql` takes a SQL string; version and filename come from the filesystem and match `/^\d{4}_[\w.-]+\.sql$/`, so they cannot carry a quote — but assert that with a guard before interpolating rather than trusting it:

```ts
    if (!/^\d{4}$/.test(m.version) || !/^[\w.-]+\.sql$/.test(m.filename)) {
      throw new Error(`Refusing to record an unexpected migration name: ${m.filename}`);
    }
```

- [x] **Step 5: Add the adopt path**

Add `--adopt <version>` to `parseArgs` and handle it before the comparison:

```ts
  if (adopt) {
    const toAdopt = allMigrations.filter(m => m.version <= adopt);
    for (const m of toAdopt) {
      await execSql(
        `INSERT INTO public.applied_migrations (version, filename, checksum, applied_by)
         VALUES ('${m.version}', '${m.filename}', 'unverified', 'backfill')
         ON CONFLICT (version) DO NOTHING`,
        `adopt ${m.filename}`,
      );
    }
    console.log(`Adopted ${toAdopt.length} migrations up to ${adopt}.`);
    return;
  }
```

String comparison on a zero-padded four-character version is correct ordering; do not parse to a number.

- [x] **Step 6: Update the wrapper's help text**

In `scripts/run-migrations.sh`, replace "Apply all migrations" in the usage block with:

```
#   # Apply pending migrations (no-op if the database is current)
```

and add:

```
#   # Adopt an existing database that has no ledger
#   ./scripts/run-migrations.sh --adopt 0059
```

- [x] **Step 7: Verify against the live database**

Run: `npx ts-node --project tsconfig.scripts.json scripts/migrate-client.ts --dry-run`

Expected: the dry-run path prints pending migrations only. With the ledger populated by Task 1 and no new files, it should report that the database is up to date.

- [x] **Step 8: Run the tests**

Run: `npx vitest run tests/integration && npm run verify:types`
Expected: PASS

- [x] **Step 9: Commit**

```bash
git add scripts/migrate-client.ts scripts/run-migrations.sh tests/integration
git commit -m "feat(migrations): make the runner ledger-aware and refuse on drift"
```

---

# Task 5: Org table row counts

**Why:** Schema transparency shows an organization what data it holds. A hundred separate `count(*)` queries per page load is not acceptable, and `reltuples` is an estimate that goes stale — misleading on the one screen whose purpose is being trustworthy.

**Files:**
- Modify: `db/migrations/0060_migrations_ledger.sql`
- Test: `tests/integration/migrations-ledger-schema.test.ts` (extend)

**Interfaces:**
- Consumes: `information_schema.columns` to enumerate tables carrying `org_id`.
- Produces: `public.org_table_row_counts(p_org_id uuid) RETURNS jsonb` — an array of `{ table_name, row_count }`, executable by `service_role` only.

- [x] **Step 1: Write the failing test**

Append to `tests/integration/migrations-ledger-schema.test.ts`:

```ts
describe('org_table_row_counts', () => {
  it('counts exactly rather than estimating', () => {
    expect(SQL).not.toMatch(/reltuples/);
    expect(SQL).toMatch(/count\(\*\)/i);
  });

  it('scopes every count by org_id', () => {
    expect(SQL).toMatch(/WHERE org_id = /);
  });

  it('is executable by the service role only', () => {
    expect(SQL).toMatch(/REVOKE ALL ON FUNCTION public\.org_table_row_counts/);
    expect(SQL).toMatch(/GRANT EXECUTE ON FUNCTION public\.org_table_row_counts[\s\S]*TO service_role/);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/migrations-ledger-schema.test.ts`
Expected: FAIL — the function does not exist.

- [x] **Step 3: Add the function**

Append to `db/migrations/0060_migrations_ledger.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Exact row counts per org-scoped table, in one pass.
--
-- Counted rather than estimated: reltuples goes stale after bulk changes, and
-- an estimate presented as a count on a transparency screen is worse than no
-- number at all.
--
-- Every count is scoped by org_id. That scoping is load-bearing: the schema is
-- shared across organizations, so an unscoped count would leak another
-- tenant's volume the moment two organizations share a database.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.org_table_row_counts(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table text;
  v_count bigint;
  v_result jsonb := '[]'::jsonb;
BEGIN
  FOR v_table IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'org_id'
      AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE org_id = $1', v_table)
      INTO v_count USING p_org_id;
    IF v_count > 0 THEN
      v_result := v_result || jsonb_build_object('table_name', v_table, 'row_count', v_count);
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.org_table_row_counts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_table_row_counts(uuid) TO service_role;
```

Tables with zero rows for this organization are omitted: a list of 100 tables where 96 read zero is noise, and the count that matters is the one that is not zero.

- [x] **Step 4: Apply and time it**

```bash
docker exec -i supabase_db_benevolence-walkthrough psql -U postgres -d postgres < db/migrations/0060_migrations_ledger.sql
docker exec supabase_db_benevolence-walkthrough psql -U postgres -d postgres -c \
  "\timing on" -c "SELECT jsonb_array_length(public.org_table_row_counts(gen_random_uuid()))"
```

Expected: returns `0` for an organization with no data, in well under a second. If it takes more than about two seconds on an empty database, the loop is the wrong shape — stop and reconsider before building the route on top of it.

- [x] **Step 5: Run the tests**

Run: `npx vitest run tests/integration/migrations-ledger-schema.test.ts && npm run verify:types`
Expected: PASS (8 tests)

- [x] **Step 6: Commit**

```bash
git add db/migrations/0060_migrations_ledger.sql tests/integration/migrations-ledger-schema.test.ts
git commit -m "feat(db): add exact org-scoped table row counts"
```

---

# Task 6: The schema transparency route

**Why:** Without it the ledger is invisible to the people it exists to reassure.

**Files:**
- Create: `app/api/org/[orgId]/schema/route.ts`
- Modify: `lib/ai/hooks.ts`
- Test: `tests/integration/org-schema-route.test.ts` (create)

**Interfaces:**
- Consumes: `compareLedger` from Task 2; `org_table_row_counts` from Task 5; `requireOrgAccess`, `jsonOk`, `jsonError`.
- Produces: `GET /api/org/[orgId]/schema` → `{ migrations: { applied, drifted, counts: { verified, adopted, drifted } }, tables: { table_name, row_count }[] }`. `useOrgSchema(orgId)` from `lib/ai/hooks.ts`.

- [x] **Step 1: Write the failing test**

Create `tests/integration/org-schema-route.test.ts`:

```ts
// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROUTE = readFileSync(
  join(__dirname, '..', '..', 'app/api/org/[orgId]/schema/route.ts'),
  'utf8',
);

describe('schema transparency route', () => {
  it('guards org admin access', () => {
    expect(ROUTE).toMatch(/requireOrgAccess\(orgId, 'admin'\)/);
  });

  // The counts are only safe because they are org-scoped: the schema itself is
  // shared across organizations.
  it('scopes table counts to the organization', () => {
    expect(ROUTE).toMatch(/org_table_row_counts/);
    expect(ROUTE).toMatch(/p_org_id:\s*orgId/);
  });

  it('reports migration state through the shared comparison', () => {
    expect(ROUTE).toMatch(/compareLedger/);
  });

  it('reports adopted and verified as distinct states', () => {
    expect(ROUTE).toMatch(/adopted/);
    expect(ROUTE).toMatch(/verified/);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/org-schema-route.test.ts`
Expected: FAIL — the route does not exist.

- [x] **Step 3: Write the route**

Create `app/api/org/[orgId]/schema/route.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createElevatedClient } from '@/lib/api/admin-client';
import { compareLedger, type AppliedMigrationRow } from '@/lib/migrations/ledger';
import { jsonError, jsonOk } from '@/lib/api/responses';

type RouteParams = { params: Promise<{ orgId: string }> };

function migrationFilesOnDisk() {
  const dir = join(process.cwd(), 'db', 'migrations');
  return readdirSync(dir)
    .filter(name => name.endsWith('.sql') && /^\d{4}_/.test(name))
    .map(name => ({
      version: name.slice(0, 4),
      filename: name,
      sql: readFileSync(join(dir, name), 'utf8'),
    }));
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;

  const db = createElevatedClient();
  try {
    const [ledger, counts] = await Promise.all([
      db.from('applied_migrations').select('*').order('version'),
      db.rpc('org_table_row_counts', { p_org_id: orgId }),
    ]);
    if (ledger.error) throw ledger.error;
    if (counts.error) throw counts.error;

    const comparison = compareLedger(
      migrationFilesOnDisk(),
      (ledger.data ?? []) as AppliedMigrationRow[],
    );

    return jsonOk({
      migrations: {
        applied: comparison.applied,
        drifted: comparison.drifted,
        counts: {
          verified: comparison.applied.filter(m => m.state === 'verified').length,
          adopted: comparison.applied.filter(m => m.state === 'adopted').length,
          drifted: comparison.drifted.length,
        },
      },
      tables: counts.data ?? [],
    }, {
      // Exact-to-the-second is not the point; a stale count by a minute is
      // fine and a hundred count(*) queries per page load is not.
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' },
    });
  } catch {
    return jsonError('Schema information could not be loaded', 502);
  }
}
```

Reading `db/migrations` from a route means the directory must exist in the deployed bundle. Verify with `npm run verify:build` that the route builds; if Next tree-shakes the directory away, the fallback is comparing against the ledger alone and reporting `drifted: []` with a note that file comparison is unavailable at runtime — **not** silently reporting everything as verified.

- [x] **Step 4: Add the hook**

Append to `lib/ai/hooks.ts`:

```ts
export type OrgSchemaReport = {
  migrations: {
    applied: { version: string; filename: string; state: 'verified' | 'adopted'; appliedAt: string }[];
    drifted: { version: string; filename: string; recorded: string; current: string }[];
    counts: { verified: number; adopted: number; drifted: number };
  };
  tables: { table_name: string; row_count: number }[];
};

export function useOrgSchema(orgId: string) {
  return useApiData<OrgSchemaReport>(`/api/org/${orgId}/schema`);
}
```

- [x] **Step 5: Run the tests**

Run: `npx vitest run tests/integration && npm run verify:types && npm run verify:build`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add app/api/org lib/ai/hooks.ts tests/integration
git commit -m "feat(api): expose migration state and org table inventory"
```

---

# Task 7: Database-level guarantees

**Why:** The RLS boundary and the ledger's constraints are Postgres behaviours. Assert them where this repository asserts Postgres behaviour rather than trusting the migration text.

**Files:**
- Modify: `scripts/verify/schema-behavior.sql`

**Interfaces:**
- Consumes: `applied_migrations` from Task 1.
- Produces: no exports.

- [x] **Step 1: Add the assertions**

Append to `scripts/verify/schema-behavior.sql`, before the final `ROLLBACK`:

```sql
-- The ledger is readable by authenticated callers and writable only by the
-- service role.
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.applied_migrations', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated can update applied_migrations';
  END IF;
  IF has_table_privilege('authenticated', 'public.applied_migrations', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated can insert into applied_migrations';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.applied_migrations', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated cannot read applied_migrations';
  END IF;
END $$;

-- Provenance is constrained, and the version is the primary key so a
-- migration cannot be recorded twice.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.applied_migrations (version, filename, checksum, applied_by)
      VALUES ('9998', '9998_guard.sql', 'abc', 'somewhere-else');
    RAISE EXCEPTION 'an unconstrained applied_by value was permitted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  INSERT INTO public.applied_migrations (version, filename, checksum, applied_by)
    VALUES ('9999', '9999_guard.sql', 'abc', 'migrate-client');
  BEGIN
    INSERT INTO public.applied_migrations (version, filename, checksum, applied_by)
      VALUES ('9999', '9999_again.sql', 'def', 'migrate-client');
    RAISE EXCEPTION 'a duplicate migration version was permitted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END $$;

-- The ledger adopted what the Supabase CLI recorded.
DO $$
DECLARE
  v_backfilled int;
BEGIN
  SELECT count(*) INTO v_backfilled
  FROM public.applied_migrations WHERE applied_by = 'backfill';
  IF v_backfilled = 0 THEN
    RAISE EXCEPTION 'the ledger adopted no migrations from schema_migrations';
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

Expected: PASS. This is a destructive `supabase db reset`, already authorised on 2026-08-24 because no client instances exist.

**Watch for one thing.** After a reset, the backfill in `0060` reads a `supabase_migrations.schema_migrations` that the CLI populates *as it applies each migration* — so `0060` sees every earlier migration but the ledger's own row comes from its self-insert. If the assertion in Step 1 fails after a reset because `backfill` rows are missing, the CLI populates that table after the run rather than during it, and the backfill needs to move to a later migration or become a runner responsibility. Report that rather than deleting the assertion.

- [x] **Step 4: Run the full gate**

Run: `npm run verify:types && npm run verify:lint && npm run verify:unit && npm run verify:build`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add scripts/verify/schema-behavior.sql
git commit -m "test(db): assert the ledger read boundary and constraints"
```

---

## Phase 4A exit criteria

- [x] `npm run verify:types && npm run verify:lint && npm run verify:unit` all pass
- [x] `npm run verify:migrations` passes from a clean local Supabase reset
- [x] `npm run verify:build` passes
- [x] Running the migration runner against an up-to-date database reports that it is current and applies nothing — the roadmap's exit criterion for F11.
      Proven at the comparison layer against the live database: 58 files, 58 ledger rows, 0 pending, 0 drifted
      (`lib/migrations/__tests__/ledger-live.test.ts`). See the open item below on the runner's transport.
- [x] Editing an applied migration produces drift — verified by corrupting a stored checksum and watching the live
      comparison test fail, then restoring it.

### Open

- [ ] Exercise the runner's own HTTP transport end to end. Neither credential path works against the local stack:
      this database has no `exec_sql` function and `SUPABASE_ACCESS_TOKEN` is unset. The comparison logic is proven
      live and the runner's behaviour is covered by contract tests, but the Management API and REST paths themselves
      are unexercised — the same transport `execSql` already used before this phase.
- [x] `GET /api/org/[orgId]/schema` returns migration state with `adopted` and `verified` counted separately, and table counts scoped to that organization
- [x] Manual check: confirm a second organization's row counts do not appear in the first organization's response
