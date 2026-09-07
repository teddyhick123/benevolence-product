# Phase 4C — Organization Data Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An archive produced by Phase 4B can be loaded into a fresh instance and produce a functionally identical organization — one whose members can regain access, whose numbers are exact, and whose relationships are intact.

**Architecture:** A CLI reads the tar, verifies every hash before writing anything, and loads the whole archive inside one Postgres transaction: accounts, the organization row, then every table in topological foreign-key order with the two known cycles broken and repaired. Row counts are compared against the manifest before commit, so a silently partial load rolls back instead of reporting success.

**Tech Stack:** TypeScript, Postgres (via `pg`), Supabase Storage, `tar-stream`, Node `zlib`, Vitest, ts-node.

**Spec:** `docs/agent-work/specs/2026-09-07-phase4c-org-data-import-design.md`

## Global Constraints

- `db/migrations` is the single source of truth. A new canonical concept gets a new numbered migration.
- Every migration change is followed by `npm run db:types:generate`, and `lib/database.types.ts` is committed with it.
- Org-scoped FK column is `org_id`. RLS helpers are `can_view_org`, `is_org_admin`, `is_app_admin`, `user_org_role`.
- Storage operations use `createElevatedClient()` / `createAdminClient()`, never a user-session client.
- **UUIDs are preserved.** No foreign key is ever rewritten. An id that already exists is a refusal, never a remap.
- **The load is one transaction.** A failure rolls back completely; a half-imported organization must not be able to exist.
- **Nothing is written before every hash is verified.** An archive that fails its own manifest is not imported at all.
- **A `REVOKE ... FROM PUBLIC` does not remove Supabase's default role grant.** Any new SECURITY DEFINER function must revoke from `authenticated` and `anon` by name, or the guard in `scripts/verify/schema-behavior.sql` will fail the build.
- Verification gate for every task: `npm run verify:types`, `npm run verify:lint`, `npm run verify:unit`. Add `npm run verify:migrations` when `db/migrations/` changes.

## Three constraints discovered while planning

Read all three before starting; each determines a task's shape.

**1. `supabase-js` cannot open a transaction.** Every call commits on its own, so the spec's all-or-nothing requirement cannot be met through it. Task 1 adds `pg` (the standard Node Postgres client) and a `SUPABASE_DB_URL` environment variable. This is a real new dependency and a real new configuration value; both are additions this phase makes deliberately, not incidental choices.

**2. The archive holds numerics as JSON strings, and that is load-bearing in both directions.** `jsonb_populate_record` accepts `"25000.00"` for a `numeric` column and preserves the scale — verified. Do not "helpfully" parse those strings into JavaScript numbers anywhere in the reader; the moment a numeric passes through `JSON.parse` as a number, the scale is gone and cannot be recovered.

**3. `jsonb_populate_record` silently drops unknown keys.** Verified: a record built from `{"id":1,"ghost":"lost"}` yields `id=1` with no error. This is why Task 4's ledger check must **refuse** an archive newer than the target schema. Without that refusal the import succeeds while discarding whatever those columns held, which is the exact silent loss this phase exists to prevent.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `lib/import/connection.ts` | `pg` pool, transaction helper | 1 |
| `lib/import/order.ts` | Topological sort, cycle detection and repair | 2 |
| `lib/import/reader.ts` | Tar reading, hash verification, manifest parsing | 3 |
| `lib/import/compatibility.ts` | Ledger comparison, org-exists refusal | 4 |
| `lib/import/identity.ts` | `auth.users` restoration from profiles | 5 |
| `lib/import/loader.ts` | Table insertion, column filtering, count check | 6 |
| `lib/import/documents.ts` | Post-commit storage upload | 7 |
| `scripts/import-org.ts` | CLI entry point wiring 1–7 | 7 |
| `lib/import/__tests__/roundtrip.test.ts` | The exit criterion | 8 |

Note: `lib/import/` already exists and holds the ETL/staging importer for spreadsheet ingest. That system is unrelated to archive import and must not be modified. If the name collision proves confusing during implementation, `lib/org-import/` is an acceptable alternative — pick one and use it consistently.

---

# Task 1: A real transaction

**Why:** The spec requires all-or-nothing, and `supabase-js` commits every call separately. Without a genuine transaction a failure leaves a half-imported organization that looks real and is not.

**Files:**
- Create: `lib/import/connection.ts`
- Modify: `package.json`, `.env.example`
- Test: `lib/import/__tests__/connection.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Tx = { query: <T = unknown>(_sql: string, _params?: unknown[]) => Promise<{ rows: T[]; rowCount: number }> }`
  - `withTransaction<T>(fn: (_tx: Tx) => Promise<T>): Promise<T>` — commits on resolve, rolls back on throw
  - `databaseUrl(): string` — reads `SUPABASE_DB_URL`, throws a named error when absent

- [ ] **Step 1: Add the dependency**

```bash
npm install pg@8
npm install --save-dev @types/pg
```

- [ ] **Step 2: Write the failing test**

Create `lib/import/__tests__/connection.test.ts`:

```ts
// @vitest-environment node

import { describe, expect, it, beforeAll } from 'vitest';
import { withTransaction, databaseUrl } from '@/lib/import/connection';

const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

beforeAll(() => {
  process.env.SUPABASE_DB_URL = process.env.SUPABASE_DB_URL ?? LOCAL;
});

describe('withTransaction', () => {
  it('commits when the callback resolves', async () => {
    const id = await withTransaction(async tx => {
      await tx.query(`CREATE TEMP TABLE tx_probe (id int)`);
      await tx.query(`INSERT INTO tx_probe VALUES (1)`);
      const { rows } = await tx.query<{ id: number }>(`SELECT id FROM tx_probe`);
      return rows[0].id;
    });
    expect(id).toBe(1);
  });

  // The requirement this whole file exists for: a failure must leave nothing.
  it('rolls back everything when the callback throws', async () => {
    const table = `rollback_probe_${Date.now()}`;
    await expect(withTransaction(async tx => {
      await tx.query(`CREATE TABLE public.${table} (id int)`);
      throw new Error('deliberate');
    })).rejects.toThrow('deliberate');

    const survived = await withTransaction(async tx => {
      const { rows } = await tx.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM information_schema.tables
         WHERE table_schema='public' AND table_name=$1`, [table]);
      return rows[0].n;
    });
    expect(survived).toBe('0');
  });

  it('names the missing configuration rather than failing obscurely', () => {
    const saved = process.env.SUPABASE_DB_URL;
    delete process.env.SUPABASE_DB_URL;
    expect(() => databaseUrl()).toThrow(/SUPABASE_DB_URL/);
    process.env.SUPABASE_DB_URL = saved;
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run lib/import/__tests__/connection.test.ts`
Expected: FAIL — `lib/import/connection.ts` does not exist.

- [ ] **Step 4: Write the connection helper**

Create `lib/import/connection.ts`:

```ts
// lib/import/connection.ts
// A real Postgres transaction for archive import.
//
// supabase-js commits every call separately, so it cannot express the
// all-or-nothing load this phase requires. A direct pg connection can.

import { Client } from 'pg';

export type Tx = {
  query: <T = unknown>(_sql: string, _params?: unknown[]) => Promise<{ rows: T[]; rowCount: number }>;
};

export function databaseUrl(): string {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    throw new Error(
      'SUPABASE_DB_URL is required for archive import. For the local stack it is ' +
      'printed by `supabase status` as the DB URL.',
    );
  }
  return url;
}

export async function withTransaction<T>(fn: (_tx: Tx) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query('BEGIN');
    const tx: Tx = {
      query: async <R = unknown>(sql: string, params?: unknown[]) => {
        const result = await client.query(sql, params);
        return { rows: result.rows as R[], rowCount: result.rowCount ?? 0 };
      },
    };
    const value = await fn(tx);
    await client.query('COMMIT');
    return value;
  } catch (err) {
    // Rollback must not mask the original failure.
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}
```

- [ ] **Step 5: Document the variable**

Add to `.env.example`, in the Supabase section:

```
# Direct Postgres connection, required only by scripts/import-org.ts.
# Local: printed by `supabase status` as the DB URL.
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

The env-template contract test from Phase 1 scans for `process.env.X` reads and fails when one is undocumented, so this step is not optional.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run lib/import && npm run verify:types`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add lib/import package.json package-lock.json .env.example
git commit -m "feat(import): add a real Postgres transaction for archive import"
```

---

# Task 2: Insert order

**Why:** 142 tables cannot be inserted in arbitrary order without violating foreign keys, and a hand-maintained list would rot the moment a table was added.

**Files:**
- Create: `lib/import/order.ts`
- Test: `lib/import/__tests__/order.test.ts`

**Interfaces:**
- Consumes: `Tx` from Task 1.
- Produces:
  - `type ForeignKey = { child: string; parent: string; column: string; nullable: boolean }`
  - `type LoadOrder = { order: string[]; deferred: { table: string; column: string }[] }`
  - `readForeignKeys(tx: Tx): Promise<ForeignKey[]>`
  - `planLoadOrder(tables: string[], fks: ForeignKey[]): LoadOrder` — pure; throws on an unbreakable cycle

- [ ] **Step 1: Write the failing test**

Create `lib/import/__tests__/order.test.ts`:

```ts
// @vitest-environment node

import { describe, expect, it, beforeAll } from 'vitest';
import { planLoadOrder, readForeignKeys, type ForeignKey } from '@/lib/import/order';
import { withTransaction } from '@/lib/import/connection';
import { exportableTables } from '@/lib/export/tables';

const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
beforeAll(() => { process.env.SUPABASE_DB_URL = process.env.SUPABASE_DB_URL ?? LOCAL; });

const fk = (child: string, parent: string, column = 'parent_id', nullable = false): ForeignKey =>
  ({ child, parent, column, nullable });

describe('planLoadOrder', () => {
  it('places a parent before its child', () => {
    const { order } = planLoadOrder(['child', 'parent'], [fk('child', 'parent')]);
    expect(order.indexOf('parent')).toBeLessThan(order.indexOf('child'));
  });

  it('keeps tables with no relationships', () => {
    const { order } = planLoadOrder(['alone', 'parent', 'child'], [fk('child', 'parent')]);
    expect(order.sort()).toEqual(['alone', 'child', 'parent']);
  });

  it('ignores a self-reference rather than calling it a cycle', () => {
    const { order } = planLoadOrder(['t'], [fk('t', 't', 'parent_id', true)]);
    expect(order).toEqual(['t']);
  });

  // Both real cycles in this schema are broken this way.
  it('breaks a two-table cycle at its nullable edge and defers that column', () => {
    const { order, deferred } = planLoadOrder(['a', 'b'], [
      fk('b', 'a', 'a_id', false),
      fk('a', 'b', 'b_id', true),
    ]);
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(deferred).toEqual([{ table: 'a', column: 'b_id' }]);
  });

  // An unimportable schema must fail in a test, not on a client's data.
  it('throws when a cycle has no nullable edge to break', () => {
    expect(() => planLoadOrder(['a', 'b'], [
      fk('b', 'a', 'a_id', false),
      fk('a', 'b', 'b_id', false),
    ])).toThrow(/cycle/i);
  });

  it('ignores a foreign key to a table outside the load set', () => {
    const { order } = planLoadOrder(['child'], [fk('child', 'auth.users', 'user_id')]);
    expect(order).toEqual(['child']);
  });
});

describe('readForeignKeys against the real schema', () => {
  it('includes composite foreign keys', async () => {
    const fks = await withTransaction(tx => readForeignKeys(tx));
    // Phase 4B's classification walk filtered these out; the sort must not.
    const composite = fks.filter(f =>
      f.child === 'pledge_installments' && f.parent === 'contributions_received');
    expect(composite.length).toBeGreaterThan(0);
  });

  it('orders every exportable table without throwing', async () => {
    const fks = await withTransaction(tx => readForeignKeys(tx));
    const tables = exportableTables().map(rule => rule.table);
    const { order } = planLoadOrder(tables, fks);
    expect(order.sort()).toEqual([...tables].sort());
  });

  // Phase 4B's classification walk filtered composite keys out, so its
  // via_parent parents were chosen without seeing them. Re-check that every
  // declared parent is a real foreign-key target now that composites are read.
  it('confirms every via_parent parent is a real foreign-key target', async () => {
    const fks = await withTransaction(tx => readForeignKeys(tx));
    const edges = new Set(fks.map(f => `${f.child}->${f.parent}`));
    const unbacked: string[] = [];

    for (const rule of exportableTables()) {
      if (rule.kind !== 'via_parent') continue;
      if (!edges.has(`${rule.table}->${rule.parent}`)) {
        unbacked.push(`${rule.table}->${rule.parent}`);
      }
    }

    // ai_turns and ai_messages are known to declare no FK to their parent;
    // they were hand-classified in 4B for exactly that reason.
    expect(unbacked.filter(pair =>
      !pair.startsWith('ai_turns->') && !pair.startsWith('ai_messages->'))).toEqual([]);
  });

  it('finds exactly the two known cycles', async () => {
    const fks = await withTransaction(tx => readForeignKeys(tx));
    const tables = exportableTables().map(rule => rule.table);
    const { deferred } = planLoadOrder(tables, fks);
    expect(deferred.map(d => `${d.table}.${d.column}`).sort()).toEqual([
      'builder_proposals.current_revision_id',
      'contributions_received.pledge_installment_id',
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/import/__tests__/order.test.ts`
Expected: FAIL — `lib/import/order.ts` does not exist.

- [ ] **Step 3: Write the ordering module**

Create `lib/import/order.ts`:

```ts
// lib/import/order.ts
// Insert order for archive import, derived from the live schema rather than a
// hand-maintained list — which would rot the moment a table was added.

import type { Tx } from '@/lib/import/connection';

export type ForeignKey = {
  child: string;
  parent: string;
  column: string;
  nullable: boolean;
};

export type LoadOrder = {
  order: string[];
  /** Columns set to NULL during insert and repaired afterwards. */
  deferred: { table: string; column: string }[];
};

/**
 * Every single-column edge of every foreign key, composite ones included. A
 * composite key contributes one row per column; for ordering only the table
 * pair matters, and for cycle breaking only nullability does.
 */
export async function readForeignKeys(tx: Tx): Promise<ForeignKey[]> {
  const { rows } = await tx.query<{
    child: string; parent: string; column: string; nullable: boolean;
  }>(`
    SELECT c.conrelid::regclass::text            AS child,
           c.confrelid::regclass::text           AS parent,
           a.attname                             AS column,
           NOT a.attnotnull                      AS nullable
    FROM pg_constraint c
    JOIN LATERAL unnest(c.conkey) AS k(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
  `);
  // regclass renders unqualified for tables on the search path, which is what
  // the load set uses; anything else (auth.users) stays qualified and is
  // filtered out by planLoadOrder as outside the set.
  return rows;
}

export function planLoadOrder(tables: string[], fks: ForeignKey[]): LoadOrder {
  const inSet = new Set(tables);
  const edges = fks.filter(f =>
    inSet.has(f.child) && inSet.has(f.parent) && f.child !== f.parent);

  const deferred: LoadOrder['deferred'] = [];
  const active = new Set(edges.map((_, i) => i));

  // Kahn's algorithm, breaking a cycle whenever progress stalls.
  const order: string[] = [];
  const remaining = new Set(tables);

  const parentsOf = (table: string) => [...active]
    .map(i => edges[i])
    .filter(edge => edge.child === table && remaining.has(edge.parent));

  while (remaining.size > 0) {
    const ready = [...remaining].filter(table => parentsOf(table).length === 0).sort();

    if (ready.length > 0) {
      for (const table of ready) {
        order.push(table);
        remaining.delete(table);
      }
      continue;
    }

    // Stalled: every remaining table waits on another, so a cycle exists.
    // Break it at a nullable edge — the column is set NULL on insert and
    // repaired after the cycle's tables are loaded.
    const breakable = [...active]
      .map(i => ({ i, edge: edges[i] }))
      .filter(({ edge }) =>
        edge.nullable && remaining.has(edge.child) && remaining.has(edge.parent))
      .sort((a, b) =>
        `${a.edge.child}.${a.edge.column}`.localeCompare(`${b.edge.child}.${b.edge.column}`))[0];

    if (!breakable) {
      throw new Error(
        `Foreign-key cycle with no nullable edge among: ${[...remaining].sort().join(', ')}. ` +
        'This schema cannot be imported; make one edge of the cycle nullable.',
      );
    }

    active.delete(breakable.i);
    if (!deferred.some(d => d.table === breakable.edge.child && d.column === breakable.edge.column)) {
      deferred.push({ table: breakable.edge.child, column: breakable.edge.column });
    }
  }

  return { order, deferred: deferred.sort((a, b) => a.table.localeCompare(b.table)) };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/import && npm run verify:types`
Expected: PASS (12 tests)

If `finds exactly the two known cycles` reports a third, do not adjust the expectation — a new cycle is a schema change worth understanding before importing anything.

- [ ] **Step 5: Commit**

```bash
git add lib/import
git commit -m "feat(import): derive insert order from the live schema"
```

---

# Task 3: Reading the archive

**Why:** An archive that fails its own hashes must not be imported at all. Verification has to complete before any write, which means reading the whole tar first.

**Files:**
- Create: `lib/import/reader.ts`
- Test: `lib/import/__tests__/reader.test.ts`

**Interfaces:**
- Consumes: `ExportManifest` from `@/lib/export/archive`.
- Produces:
  - `type ArchiveContents = { manifest: ExportManifest; tables: Map<string, string[]>; documents: { bucket: string; path: string; body: Buffer }[] }`
  - `readArchive(path: string): Promise<ArchiveContents>` — throws on a hash mismatch, naming the file

- [ ] **Step 1: Write the failing test**

Create `lib/import/__tests__/reader.test.ts`:

```ts
// @vitest-environment node

import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGzip } from 'node:zlib';
import { pack } from 'tar-stream';
import { describe, expect, it } from 'vitest';
import { readArchive } from '@/lib/import/reader';

/** Builds a minimal archive on disk and returns its path. */
async function buildArchive(options: { corruptHash?: boolean } = {}): Promise<string> {
  const lines = '{"id":"a","amount":"25000.00"}\n';
  const gz = createGzip();
  const chunks: Buffer[] = [];
  gz.on('data', (c: Buffer) => chunks.push(c));
  await new Promise<void>(resolve => { gz.on('end', () => resolve()); gz.end(lines); });
  const body = Buffer.concat(chunks);
  const digest = createHash('sha256').update(body).digest('hex');

  const manifest = {
    orgId: 'org-1', orgName: 'Test Org', exportedAt: '2026-09-07T00:00:00.000Z',
    formatVersion: 1, numericEncoding: 'string',
    schema: { ledger: [{ version: '0061', state: 'verified' }], driftCheckAvailable: false },
    files: [{
      path: 'tables/holdings.ndjson.gz',
      sha256: options.corruptHash ? 'f'.repeat(64) : digest,
      rows: 1, bytes: body.length,
    }],
    documents: [], excluded: [],
  };
  const manifestText = JSON.stringify(manifest);

  const tar = pack();
  const out: Buffer[] = [];
  tar.on('data', (c: Buffer) => out.push(c));
  const done = new Promise<void>(resolve => tar.on('end', () => resolve()));

  tar.entry({ name: 'manifest.json', size: Buffer.byteLength(manifestText) }, manifestText);
  tar.entry({ name: 'tables/holdings.ndjson.gz', size: body.length }, body);
  tar.finalize();
  await done;

  const dir = mkdtempSync(join(tmpdir(), 'archive-'));
  const path = join(dir, 'test.tar');
  writeFileSync(path, Buffer.concat(out));
  return path;
}

describe('readArchive', () => {
  it('returns the manifest and one row list per table', async () => {
    const contents = await readArchive(await buildArchive());
    expect(contents.manifest.orgId).toBe('org-1');
    expect(contents.tables.get('holdings')).toEqual(['{"id":"a","amount":"25000.00"}']);
  });

  // The numeric stays a string all the way through. Parsing it here would
  // destroy the scale that the export format exists to preserve.
  it('leaves numerics as strings rather than parsing them', async () => {
    const contents = await readArchive(await buildArchive());
    const line = contents.tables.get('holdings')![0];
    expect(line).toContain('"amount":"25000.00"');
    expect(JSON.parse(line).amount).toBe('25000.00');
  });

  // An archive that fails its own manifest is not imported at all.
  it('refuses a file whose hash does not match, naming it', async () => {
    await expect(readArchive(await buildArchive({ corruptHash: true })))
      .rejects.toThrow(/holdings\.ndjson\.gz/);
  });

  it('refuses an archive with no manifest', async () => {
    const tar = pack();
    const out: Buffer[] = [];
    tar.on('data', (c: Buffer) => out.push(c));
    const done = new Promise<void>(resolve => tar.on('end', () => resolve()));
    tar.entry({ name: 'tables/x.ndjson.gz', size: 3 }, Buffer.from('abc'));
    tar.finalize();
    await done;

    const dir = mkdtempSync(join(tmpdir(), 'archive-'));
    const path = join(dir, 'nomanifest.tar');
    writeFileSync(path, Buffer.concat(out));

    await expect(readArchive(path)).rejects.toThrow(/manifest/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/import/__tests__/reader.test.ts`
Expected: FAIL — `lib/import/reader.ts` does not exist.

- [ ] **Step 3: Write the reader**

Create `lib/import/reader.ts`:

```ts
// lib/import/reader.ts
// Reads an export archive and verifies it against its own manifest.
//
// Verification completes before the caller writes anything: an archive that
// fails its own hashes is not imported at all.

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { extract } from 'tar-stream';
import type { ExportManifest } from '@/lib/export/archive';

export type ArchiveContents = {
  manifest: ExportManifest;
  /** table name -> NDJSON lines, numerics still strings. */
  tables: Map<string, string[]>;
  documents: { bucket: string; path: string; body: Buffer }[];
};

export async function readArchive(path: string): Promise<ArchiveContents> {
  const entries = new Map<string, Buffer>();
  const ex = extract();

  await new Promise<void>((resolve, reject) => {
    ex.on('entry', (header, stream, next) => {
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => { chunks.push(c); });
      stream.on('end', () => { entries.set(header.name, Buffer.concat(chunks)); next(); });
      stream.on('error', reject);
    });
    ex.on('finish', () => resolve());
    ex.on('error', reject);
    createReadStream(path).pipe(ex);
  });

  const manifestRaw = entries.get('manifest.json');
  if (!manifestRaw) {
    throw new Error(`Archive has no manifest.json: ${path}`);
  }
  const manifest = JSON.parse(manifestRaw.toString('utf8')) as ExportManifest;

  // Every hash, before any caller writes a row.
  for (const file of manifest.files) {
    const body = entries.get(file.path);
    if (!body) {
      throw new Error(`Archive is missing a file its manifest lists: ${file.path}`);
    }
    const actual = createHash('sha256').update(body).digest('hex');
    if (actual !== file.sha256) {
      throw new Error(
        `Archive file ${file.path} does not match its manifest hash ` +
        `(recorded ${file.sha256.slice(0, 8)}…, actual ${actual.slice(0, 8)}…). ` +
        'The archive is damaged; nothing has been imported.',
      );
    }
  }

  const tables = new Map<string, string[]>();
  const documents: ArchiveContents['documents'] = [];

  for (const [name, body] of entries) {
    if (name.startsWith('tables/') && name.endsWith('.ndjson.gz')) {
      const table = name.slice('tables/'.length, -'.ndjson.gz'.length);
      const text = gunzipSync(body).toString('utf8');
      tables.set(table, text.split('\n').filter(line => line.length > 0));
      continue;
    }
    if (name.startsWith('storage/')) {
      const rest = name.slice('storage/'.length);
      const slash = rest.indexOf('/');
      documents.push({
        bucket: rest.slice(0, slash),
        path: rest.slice(slash + 1),
        body,
      });
    }
  }

  return { manifest, tables, documents };
}
```

Lines are kept as strings and never parsed. The moment a numeric passes through `JSON.parse` as a number its scale is gone, which is the failure the string encoding exists to prevent.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/import && npm run verify:types`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/import
git commit -m "feat(import): read and verify an archive before any write"
```

---

# Task 4: Refusing what cannot be imported safely

**Why:** `jsonb_populate_record` silently drops keys with no matching column, so importing a newer archive into an older schema succeeds while discarding data. Only the manifest's ledger makes that detectable.

**Files:**
- Create: `lib/import/compatibility.ts`
- Test: `lib/import/__tests__/compatibility.test.ts`

**Interfaces:**
- Consumes: `Tx` from Task 1; `ExportManifest` from `@/lib/export/archive`.
- Produces:
  - `type Compatibility = { ok: true; warning?: string } | { ok: false; reason: string }`
  - `checkSchemaCompatibility(archiveLedger: { version: string }[], targetVersions: string[]): Compatibility` — pure
  - `assertOrgAbsent(tx: Tx, orgId: string): Promise<void>` — throws when the id exists

- [ ] **Step 1: Write the failing test**

Create `lib/import/__tests__/compatibility.test.ts`:

```ts
// @vitest-environment node

import { describe, expect, it, beforeAll } from 'vitest';
import { checkSchemaCompatibility, assertOrgAbsent } from '@/lib/import/compatibility';
import { withTransaction } from '@/lib/import/connection';

const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
beforeAll(() => { process.env.SUPABASE_DB_URL = process.env.SUPABASE_DB_URL ?? LOCAL; });

const ledger = (...versions: string[]) => versions.map(version => ({ version }));

describe('checkSchemaCompatibility', () => {
  it('accepts an identical schema', () => {
    expect(checkSchemaCompatibility(ledger('0001', '0002'), ['0001', '0002']).ok).toBe(true);
  });

  it('accepts a target that is ahead, with a warning', () => {
    const result = checkSchemaCompatibility(ledger('0001'), ['0001', '0002']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warning).toMatch(/0002/);
  });

  // The refusal that matters. jsonb_populate_record drops unknown keys, so
  // this import would succeed while silently discarding columns.
  it('refuses a target that is behind, naming what is missing', () => {
    const result = checkSchemaCompatibility(ledger('0001', '0002'), ['0001']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/0002/);
  });

  it('refuses when the target has no ledger at all', () => {
    expect(checkSchemaCompatibility(ledger('0001'), []).ok).toBe(false);
  });

  it('compares version strings rather than numbers', () => {
    // Prefixes have gaps and leading zeros; numeric comparison is unsafe.
    const result = checkSchemaCompatibility(ledger('0009', '0010'), ['0009', '0010']);
    expect(result.ok).toBe(true);
  });
});

describe('assertOrgAbsent', () => {
  it('passes for an id that does not exist', async () => {
    await withTransaction(async tx => {
      await assertOrgAbsent(tx, '4c000000-0000-4000-8000-0000000000ff');
    });
  });

  // There is no overwrite path, by design.
  it('throws for an id that already exists', async () => {
    await expect(withTransaction(async tx => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO public.organizations (name, org_type)
         VALUES ('Collision Probe', 'private_foundation') RETURNING id`);
      await assertOrgAbsent(tx, rows[0].id);
    })).rejects.toThrow(/already exists/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/import/__tests__/compatibility.test.ts`
Expected: FAIL — `lib/import/compatibility.ts` does not exist.

- [ ] **Step 3: Write the compatibility check**

Create `lib/import/compatibility.ts`:

```ts
// lib/import/compatibility.ts
// Refusals that must happen before anything is written.

import type { Tx } from '@/lib/import/connection';

export type Compatibility =
  | { ok: true; warning?: string }
  | { ok: false; reason: string };

/**
 * Compares the archive's migration ledger against the target's.
 *
 * A target that is behind is refused. jsonb_populate_record ignores JSON keys
 * with no matching column, so that import would succeed while quietly
 * discarding whatever those columns held — the silent loss this phase exists
 * to prevent.
 */
export function checkSchemaCompatibility(
  archiveLedger: { version: string }[],
  targetVersions: string[],
): Compatibility {
  const target = new Set(targetVersions);
  // Version strings, never numbers: prefixes have gaps and leading zeros.
  const missing = archiveLedger
    .map(entry => entry.version)
    .filter(version => !target.has(version))
    .sort();

  if (missing.length > 0) {
    return {
      ok: false,
      reason:
        `This database is missing ${missing.length} migration(s) the archive was made with: ` +
        `${missing.join(', ')}. Importing would silently discard columns those migrations added. ` +
        'Apply the migrations first, then re-run the import.',
    };
  }

  const archive = new Set(archiveLedger.map(entry => entry.version));
  const ahead = targetVersions.filter(version => !archive.has(version)).sort();
  if (ahead.length > 0) {
    return {
      ok: true,
      warning:
        `This database is ahead of the archive by ${ahead.length} migration(s): ${ahead.join(', ')}. ` +
        'Columns those migrations added will take their defaults.',
    };
  }

  return { ok: true };
}

export async function assertOrgAbsent(tx: Tx, orgId: string): Promise<void> {
  const { rows } = await tx.query<{ name: string }>(
    'SELECT name FROM public.organizations WHERE id = $1', [orgId]);
  if (rows.length > 0) {
    throw new Error(
      `An organization with id ${orgId} already exists ("${rows[0].name}"). ` +
      'Import never overwrites; remove it first or import into a different database.',
    );
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/import && npm run verify:types`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/import
git commit -m "feat(import): refuse an archive newer than the target schema"
```

---

# Task 5: Restoring identity

**Why:** 21 NOT NULL foreign keys point at `auth.users`, including `organization_members.user_id` and `portfolios.owner_id`. Without those accounts the import produces an organization nobody can access.

**Files:**
- Create: `lib/import/identity.ts`
- Test: `lib/import/__tests__/identity.test.ts`

**Interfaces:**
- Consumes: `Tx` from Task 1.
- Produces: `restoreAccounts(tx: Tx, profileLines: string[]): Promise<number>` — returns how many were created

- [ ] **Step 1: Write the failing test**

Create `lib/import/__tests__/identity.test.ts`:

```ts
// @vitest-environment node

import { describe, expect, it, beforeAll } from 'vitest';
import { restoreAccounts } from '@/lib/import/identity';
import { withTransaction } from '@/lib/import/connection';

const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
beforeAll(() => { process.env.SUPABASE_DB_URL = process.env.SUPABASE_DB_URL ?? LOCAL; });

const ID = '4c000000-0000-4000-8000-00000000aaaa';
const profile = (id: string, email: string) => JSON.stringify({ id, email });

describe('restoreAccounts', () => {
  it('creates an account with the id the archive recorded', async () => {
    await withTransaction(async tx => {
      const created = await restoreAccounts(tx, [profile(ID, 'restored@example.com')]);
      expect(created).toBe(1);

      const { rows } = await tx.query<{ email: string }>(
        'SELECT email FROM auth.users WHERE id = $1', [ID]);
      expect(rows[0].email).toBe('restored@example.com');
      // Deliberately not committed: the assertions above are the whole test.
      throw new Error('rollback');
    }).catch((err: Error) => { if (err.message !== 'rollback') throw err; });
  });

  // "No usable password" is a security claim and must be checked, not assumed.
  it('leaves the account with no usable password', async () => {
    await withTransaction(async tx => {
      await restoreAccounts(tx, [profile(ID, 'restored@example.com')]);
      const { rows } = await tx.query<{ pw: string | null }>(
        'SELECT encrypted_password AS pw FROM auth.users WHERE id = $1', [ID]);
      // An empty string is not a valid bcrypt hash, so no password can match it.
      expect(rows[0].pw === '' || rows[0].pw === null).toBe(true);
      throw new Error('rollback');
    }).catch((err: Error) => { if (err.message !== 'rollback') throw err; });
  });

  it('skips an account that already exists rather than failing', async () => {
    await withTransaction(async tx => {
      await restoreAccounts(tx, [profile(ID, 'restored@example.com')]);
      const again = await restoreAccounts(tx, [profile(ID, 'restored@example.com')]);
      expect(again).toBe(0);
      throw new Error('rollback');
    }).catch((err: Error) => { if (err.message !== 'rollback') throw err; });
  });

  it('skips a profile with no email rather than creating an unusable account', async () => {
    await withTransaction(async tx => {
      const created = await restoreAccounts(tx, [JSON.stringify({ id: ID, email: null })]);
      expect(created).toBe(0);
      throw new Error('rollback');
    }).catch((err: Error) => { if (err.message !== 'rollback') throw err; });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/import/__tests__/identity.test.ts`
Expected: FAIL — `lib/import/identity.ts` does not exist.

- [ ] **Step 3: Write the identity restorer**

Create `lib/import/identity.ts`:

```ts
// lib/import/identity.ts
// Recreates the accounts an archive's rows point at.
//
// Credentials are never exported, so these accounts have no usable password.
// Each person regains access through the normal password-reset flow. Without
// them the import produces an organization nobody can access: 21 NOT NULL
// foreign keys point at auth.users, including organization_members.user_id
// and portfolios.owner_id.

import type { Tx } from '@/lib/import/connection';

const SUPABASE_DEFAULT_INSTANCE = '00000000-0000-0000-0000-000000000000';

export async function restoreAccounts(tx: Tx, profileLines: string[]): Promise<number> {
  let created = 0;

  for (const line of profileLines) {
    const profile = JSON.parse(line) as { id?: string; email?: string | null };
    // A profile with no email cannot become a usable account, and an account
    // nobody can reset into is worse than an absent one.
    if (!profile.id || !profile.email) continue;

    const { rowCount } = await tx.query(
      `INSERT INTO auth.users
         (id, instance_id, aud, role, email, encrypted_password,
          email_confirmed_at, created_at, updated_at)
       VALUES ($1, $2, 'authenticated', 'authenticated', $3, '', now(), now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [profile.id, SUPABASE_DEFAULT_INSTANCE, profile.email],
    );
    created += rowCount;
  }

  return created;
}
```

The empty `encrypted_password` is deliberate: it is not a valid bcrypt hash, so no password can ever match it. `email_confirmed_at` is set so the reset flow works without a separate confirmation step.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/import && npm run verify:types`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/import
git commit -m "feat(import): restore accounts so an imported org is reachable"
```

---

# Task 6: Loading the tables

**Why:** This is the import. Everything else exists to make this step safe.

**Files:**
- Create: `lib/import/loader.ts`
- Test: `lib/import/__tests__/loader.test.ts`

**Interfaces:**
- Consumes: `Tx` (Task 1); `LoadOrder` (Task 2); `ArchiveContents` (Task 3).
- Produces:
  - `type LoadReport = { table: string; inserted: number; expected: number }[]`
  - `insertableColumns(tx: Tx, table: string): Promise<string[]>`
  - `loadTables(tx: Tx, contents: ArchiveContents, plan: LoadOrder): Promise<LoadReport>` — throws when a count differs

- [ ] **Step 1: Write the failing test**

Create `lib/import/__tests__/loader.test.ts`:

```ts
// @vitest-environment node

import { describe, expect, it, beforeAll } from 'vitest';
import { insertableColumns, loadTables } from '@/lib/import/loader';
import { withTransaction } from '@/lib/import/connection';
import type { ArchiveContents } from '@/lib/import/reader';

const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
beforeAll(() => { process.env.SUPABASE_DB_URL = process.env.SUPABASE_DB_URL ?? LOCAL; });

const ORG = '4c000000-0000-4000-8000-00000000bbbb';

function contentsFor(tables: Record<string, string[]>, rows: Record<string, number>): ArchiveContents {
  return {
    manifest: {
      orgId: ORG, orgName: 'Loader Test', exportedAt: '2026-09-07T00:00:00.000Z',
      formatVersion: 1, numericEncoding: 'string',
      schema: { ledger: [], driftCheckAvailable: false },
      files: Object.entries(rows).map(([table, count]) => ({
        path: `tables/${table}.ndjson.gz`, sha256: '0'.repeat(64), rows: count, bytes: 0,
      })),
      documents: [], excluded: [],
    },
    tables: new Map(Object.entries(tables)),
    documents: [],
  };
}

describe('insertableColumns', () => {
  // Postgres rejects an explicit value for a generated column, so including
  // one makes every insert on that table fail.
  it('excludes generated columns', async () => {
    const columns = await withTransaction(tx => insertableColumns(tx, 'ai_usage_log'));
    expect(columns).not.toContain('total_tokens');
    expect(columns).toContain('org_id');
  });
});

describe('insertableColumns for identity columns', () => {
  // ai_messages.sequence_no and onboarding_messages.sequence_no are the only
  // two. An identity column is insertable, but only with the override.
  it('keeps an identity column in the list', async () => {
    const columns = await withTransaction(tx => insertableColumns(tx, 'ai_messages'));
    expect(columns).toContain('sequence_no');
  });
});

describe('loadTables', () => {
  it('inserts rows with the ids the archive recorded', async () => {
    await withTransaction(async tx => {
      const contents = contentsFor(
        { organizations: [JSON.stringify({ id: ORG, name: 'Loader Test', org_type: 'private_foundation' })] },
        { organizations: 1 },
      );
      const report = await loadTables(tx, contents, { order: ['organizations'], deferred: [] });
      expect(report).toEqual([{ table: 'organizations', inserted: 1, expected: 1 }]);

      const { rows } = await tx.query<{ id: string }>(
        'SELECT id FROM public.organizations WHERE id = $1', [ORG]);
      expect(rows[0].id).toBe(ORG);
      throw new Error('rollback');
    }).catch((err: Error) => { if (err.message !== 'rollback') throw err; });
  });

  // The check that turns silent data loss into a rollback. ON CONFLICT DO
  // NOTHING swallows a row that violates an unanticipated constraint.
  it('throws when fewer rows land than the manifest promised', async () => {
    await expect(withTransaction(async tx => {
      const contents = contentsFor(
        { organizations: [JSON.stringify({ id: ORG, name: 'Loader Test', org_type: 'private_foundation' })] },
        { organizations: 2 },
      );
      await loadTables(tx, contents, { order: ['organizations'], deferred: [] });
    })).rejects.toThrow(/organizations.*expected 2.*inserted 1/i);
  });

  // Preserved scale, from the far end of the round trip.
  it('preserves numeric scale through a JSON string', async () => {
    await withTransaction(async tx => {
      const contents = contentsFor({
        organizations: [JSON.stringify({ id: ORG, name: 'N', org_type: 'private_foundation' })],
        ai_usage_log: [JSON.stringify({
          id: '4c000000-0000-4000-8000-00000000cccc', org_id: ORG,
          scope_kind: 'organization', workload_id: 'assistant',
          operation: 'tool_conversation', connector: 'anthropic',
          requested_model: 'claude-opus-5', computed_cost: '25000.00',
        })],
      }, { organizations: 1, ai_usage_log: 1 });

      await loadTables(tx, contents, { order: ['organizations', 'ai_usage_log'], deferred: [] });

      const { rows } = await tx.query<{ cost: string }>(
        'SELECT computed_cost::text AS cost FROM public.ai_usage_log WHERE org_id = $1', [ORG]);
      expect(rows[0].cost).toBe('25000.00');
      throw new Error('rollback');
    }).catch((err: Error) => { if (err.message !== 'rollback') throw err; });
  });

  it('skips a table the archive does not contain', async () => {
    await withTransaction(async tx => {
      const report = await loadTables(tx, contentsFor({}, {}), { order: ['holdings'], deferred: [] });
      expect(report).toEqual([]);
      throw new Error('rollback');
    }).catch((err: Error) => { if (err.message !== 'rollback') throw err; });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/import/__tests__/loader.test.ts`
Expected: FAIL — `lib/import/loader.ts` does not exist.

- [ ] **Step 3: Write the loader**

Create `lib/import/loader.ts`:

```ts
// lib/import/loader.ts
// Inserts an archive's rows, one statement per table.

import type { Tx } from '@/lib/import/connection';
import type { LoadOrder } from '@/lib/import/order';
import type { ArchiveContents } from '@/lib/import/reader';

export type LoadReport = { table: string; inserted: number; expected: number }[];

/**
 * Columns an INSERT may name. Generated columns are excluded because Postgres
 * rejects an explicit value for one, which would make every insert on that
 * table fail.
 */
export async function insertableColumns(tx: Tx, table: string): Promise<string[]> {
  const { rows } = await tx.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
       AND is_generated <> 'ALWAYS'
     ORDER BY ordinal_position`, [table]);
  return rows.map(row => row.column_name);
}

async function hasIdentityColumn(tx: Tx, table: string): Promise<boolean> {
  const { rows } = await tx.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 AND is_identity='YES'`, [table]);
  return rows[0].n !== '0';
}

export async function loadTables(
  tx: Tx,
  contents: ArchiveContents,
  plan: LoadOrder,
): Promise<LoadReport> {
  const report: LoadReport = [];
  const deferredByTable = new Map<string, string[]>();
  for (const entry of plan.deferred) {
    deferredByTable.set(entry.table, [...(deferredByTable.get(entry.table) ?? []), entry.column]);
  }

  for (const table of plan.order) {
    const lines = contents.tables.get(table);
    if (!lines || lines.length === 0) continue;

    const deferred = new Set(deferredByTable.get(table) ?? []);
    const columns = (await insertableColumns(tx, table)).filter(c => !deferred.has(c));
    const quoted = columns.map(c => `"${c}"`).join(', ');
    const selected = columns.map(c => `r."${c}"`).join(', ');

    // Identity columns need the override, or preserved ids are renumbered and
    // the foreign keys this design chose not to rewrite point at nothing.
    const overriding = (await hasIdentityColumn(tx, table)) ? 'OVERRIDING SYSTEM VALUE' : '';

    // One statement per table. Per-row inserts across tens of thousands of
    // rows would make one transaction span far more round trips than it needs.
    const { rowCount } = await tx.query(
      `INSERT INTO public."${table}" (${quoted}) ${overriding}
       SELECT ${selected}
       FROM jsonb_array_elements($1::jsonb) AS line,
            LATERAL jsonb_populate_record(NULL::public."${table}", line) AS r
       ON CONFLICT DO NOTHING`,
      [JSON.stringify(lines.map(line => JSON.parse(line)))],
    );

    const expected = contents.manifest.files
      .find(file => file.path === `tables/${table}.ndjson.gz`)?.rows ?? lines.length;

    // ON CONFLICT DO NOTHING swallows a row that violates a constraint this
    // design did not anticipate. Without this check a partial import commits
    // and reports success.
    if (rowCount !== expected) {
      throw new Error(
        `Table ${table}: expected ${expected} rows, inserted ${rowCount}. ` +
        'The archive holds rows this database rejected; nothing has been committed.',
      );
    }

    report.push({ table, inserted: rowCount, expected });
  }

  // Repair the cycle back-edges now that both ends exist.
  for (const [table, columns] of deferredByTable) {
    const lines = contents.tables.get(table);
    if (!lines || lines.length === 0) continue;
    for (const column of columns) {
      await tx.query(
        `UPDATE public."${table}" AS t
         SET "${column}" = (line->>'${column}')::uuid
         FROM jsonb_array_elements($1::jsonb) AS line
         WHERE t.id = (line->>'id')::uuid AND line->>'${column}' IS NOT NULL`,
        [JSON.stringify(lines.map(line => JSON.parse(line)))],
      );
    }
  }

  return report;
}
```

Table and column names are interpolated because they cannot be parameterised in SQL. They come from `information_schema` and the export manifest, never from user input — but the round trip through the database is what makes that safe, not the assumption.

`JSON.parse` here operates on whole lines to build a JSON array for the query parameter; the numeric values inside stay strings because they were exported as strings, and `jsonb_populate_record` casts them back with the scale intact.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/import && npm run verify:types`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/import
git commit -m "feat(import): load an archive's tables in one transaction"
```

---

# Task 7: Documents and the CLI

**Why:** An archive's rows without its documents is not a restored organization, and none of the preceding tasks is reachable by an operator until there is a command.

**Files:**
- Create: `lib/import/documents.ts`, `scripts/import-org.ts`
- Modify: `package.json`
- Test: `lib/import/__tests__/documents.test.ts`, `tests/integration/import-cli-contract.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces:
  - `uploadDocuments(db: ElevatedClient, documents: ArchiveContents['documents']): Promise<{ uploaded: number; failed: { path: string; reason: string }[] }>`
  - `npm run import:org -- --archive <path>`

- [ ] **Step 1: Write the failing tests**

Create `lib/import/__tests__/documents.test.ts`:

```ts
// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { uploadDocuments } from '@/lib/import/documents';

function fakeStorage(failOn?: string) {
  const upload = vi.fn(async (path: string) =>
    path === failOn ? { error: { message: 'denied' } } : { error: null });
  return { db: { storage: { from: vi.fn(() => ({ upload })) } } as never, upload };
}

describe('uploadDocuments', () => {
  it('uploads each document to its own bucket and path', async () => {
    const { db, upload } = fakeStorage();
    const result = await uploadDocuments(db, [
      { bucket: 'tax-documents', path: 'org-1/receipt.pdf', body: Buffer.from('pdf') },
    ]);
    expect(result.uploaded).toBe(1);
    expect(upload).toHaveBeenCalledWith('org-1/receipt.pdf', expect.anything(), expect.anything());
  });

  // Object storage has no rollback, so a failed upload must be reported rather
  // than thrown - the rows are already committed and are worth keeping.
  it('reports a failed upload instead of throwing', async () => {
    const { db } = fakeStorage('org-1/bad.pdf');
    const result = await uploadDocuments(db, [
      { bucket: 'tax-documents', path: 'org-1/ok.pdf', body: Buffer.from('a') },
      { bucket: 'tax-documents', path: 'org-1/bad.pdf', body: Buffer.from('b') },
    ]);
    expect(result.uploaded).toBe(1);
    expect(result.failed).toEqual([{ path: 'org-1/bad.pdf', reason: 'denied' }]);
  });
});
```

Create `tests/integration/import-cli-contract.test.ts`:

```ts
// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CLI = readFileSync(join(__dirname, '..', '..', 'scripts/import-org.ts'), 'utf8');

describe('import CLI', () => {
  it('verifies the archive before opening a transaction', () => {
    expect(CLI.indexOf('readArchive')).toBeLessThan(CLI.indexOf('withTransaction'));
  });

  it('refuses an incompatible schema before loading', () => {
    expect(CLI).toMatch(/checkSchemaCompatibility/);
    expect(CLI).toMatch(/assertOrgAbsent/);
  });

  // Object storage has no rollback, so documents go up only once the rows are
  // committed. The reverse order would orphan files behind a failed import.
  it('uploads documents after the transaction commits', () => {
    expect(CLI.indexOf('withTransaction')).toBeLessThan(CLI.indexOf('uploadDocuments'));
  });

  it('exits non-zero when the import fails', () => {
    expect(CLI).toMatch(/process\.exit\(1\)/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/import/__tests__/documents.test.ts tests/integration/import-cli-contract.test.ts`
Expected: FAIL — neither file exists.

- [ ] **Step 3: Write the document uploader**

Create `lib/import/documents.ts`:

```ts
// lib/import/documents.ts
// Uploads an archive's documents after the row transaction commits.
//
// Object storage has no rollback. Uploading before the commit would leave
// orphaned files behind a failed import that nobody would ever enumerate.

import type { ElevatedClient } from '@/lib/api/admin-client';
import type { ArchiveContents } from '@/lib/import/reader';

export async function uploadDocuments(
  db: ElevatedClient,
  documents: ArchiveContents['documents'],
): Promise<{ uploaded: number; failed: { path: string; reason: string }[] }> {
  let uploaded = 0;
  const failed: { path: string; reason: string }[] = [];

  for (const doc of documents) {
    const { error } = await db.storage.from(doc.bucket).upload(doc.path, doc.body, {
      upsert: true,
    });
    if (error) {
      // Reported, not thrown: the rows are committed and worth keeping.
      failed.push({ path: doc.path, reason: error.message });
      continue;
    }
    uploaded += 1;
  }

  return { uploaded, failed };
}
```

- [ ] **Step 4: Write the CLI**

Create `scripts/import-org.ts`:

```ts
// scripts/import-org.ts
// Loads an export archive into this database.
//
// Usage:
//   SUPABASE_DB_URL=... npm run import:org -- --archive ./export-acme.tar

import { createElevatedClient } from '../lib/api/admin-client';
import { withTransaction } from '../lib/import/connection';
import { readArchive } from '../lib/import/reader';
import { checkSchemaCompatibility, assertOrgAbsent } from '../lib/import/compatibility';
import { restoreAccounts } from '../lib/import/identity';
import { readForeignKeys, planLoadOrder } from '../lib/import/order';
import { loadTables } from '../lib/import/loader';
import { uploadDocuments } from '../lib/import/documents';

function parseArgs() {
  const args = process.argv.slice(2);
  const index = args.indexOf('--archive');
  return { archive: index === -1 ? undefined : args[index + 1] };
}

async function main() {
  const { archive } = parseArgs();
  if (!archive) {
    console.error('Usage: npm run import:org -- --archive <path to .tar>');
    process.exit(1);
  }

  // Verification completes before a transaction opens: an archive that fails
  // its own hashes is not imported at all.
  console.log(`Reading ${archive}…`);
  const contents = await readArchive(archive);
  console.log(
    `  ${contents.manifest.orgName} (${contents.manifest.orgId}), ` +
    `${contents.manifest.files.length} files verified`,
  );

  const report = await withTransaction(async tx => {
    const { rows } = await tx.query<{ version: string }>(
      'SELECT version FROM public.applied_migrations ORDER BY version');
    const compatibility = checkSchemaCompatibility(
      contents.manifest.schema.ledger, rows.map(row => row.version));

    if (!compatibility.ok) throw new Error(compatibility.reason);
    if (compatibility.warning) console.warn(`  warning: ${compatibility.warning}`);

    await assertOrgAbsent(tx, contents.manifest.orgId);

    const accounts = await restoreAccounts(tx, contents.tables.get('profiles') ?? []);
    console.log(`  restored ${accounts} account(s) with no credentials`);

    const fks = await readForeignKeys(tx);
    const plan = planLoadOrder([...contents.tables.keys()], fks);

    return loadTables(tx, contents, plan);
  });

  const rowTotal = report.reduce((sum, entry) => sum + entry.inserted, 0);
  console.log(`  ${report.length} tables, ${rowTotal} rows committed`);

  // After the commit, deliberately: object storage has no rollback.
  if (contents.documents.length > 0) {
    const documents = await uploadDocuments(createElevatedClient(), contents.documents);
    console.log(`  ${documents.uploaded} document(s) uploaded`);
    for (const failure of documents.failed) {
      console.error(`  document failed: ${failure.path} — ${failure.reason}`);
    }
  }

  console.log('Import complete.');
}

main().catch((err: Error) => {
  console.error(`\nImport failed: ${err.message}\n`);
  process.exit(1);
});
```

- [ ] **Step 5: Add the npm script**

In `package.json`, beside `export:worker`:

```json
"import:org": "ts-node -r tsconfig-paths/register --project tsconfig.scripts.json scripts/import-org.ts",
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run lib/import tests/integration/import-cli-contract.test.ts && npm run verify:types`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/import scripts/import-org.ts package.json tests/integration/import-cli-contract.test.ts
git commit -m "feat(import): add the archive import CLI"
```

---

# Task 8: The round trip

**Why:** This is the roadmap's exit criterion for the export/import pair. Phase 4B could show an archive was complete and faithful; only this proves it reloads.

**Files:**
- Create: `lib/import/__tests__/roundtrip.test.ts`

**Interfaces:**
- Consumes: `writeArchive` from `@/lib/export/archive`; everything from Tasks 1–7.
- Produces: no exports.

- [ ] **Step 1: Write the failing test**

Create `lib/import/__tests__/roundtrip.test.ts`:

```ts
// @vitest-environment node

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createElevatedClient } from '@/lib/api/admin-client';
import { writeArchive } from '@/lib/export/archive';
import { withTransaction } from '@/lib/import/connection';
import { readArchive } from '@/lib/import/reader';
import { restoreAccounts } from '@/lib/import/identity';
import { readForeignKeys, planLoadOrder } from '@/lib/import/order';
import { loadTables } from '@/lib/import/loader';

const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
beforeAll(() => { process.env.SUPABASE_DB_URL = process.env.SUPABASE_DB_URL ?? LOCAL; });

const SOURCE_ORG = '4c000000-0000-4000-8000-00000000d001';
const USAGE_ROW = '4c000000-0000-4000-8000-00000000d002';

/**
 * Seeds an organization with rows across several tables, including a numeric.
 * Idempotent: the export must read committed rows, so this cannot roll back,
 * which makes leaving the database as it was found this suite's own job.
 */
async function seedOrg(): Promise<void> {
  await withTransaction(async tx => {
    await tx.query(
      `INSERT INTO public.organizations (id, name, org_type)
       VALUES ($1, 'Roundtrip Source', 'private_foundation')
       ON CONFLICT (id) DO NOTHING`, [SOURCE_ORG]);
    await tx.query(
      `INSERT INTO public.ai_usage_log
         (id, org_id, scope_kind, workload_id, operation, connector,
          requested_model, computed_cost)
       VALUES ($1, $2, 'organization', 'assistant', 'tool_conversation',
               'anthropic', 'claude-opus-5', 25000.00)
       ON CONFLICT (id) DO NOTHING`, [USAGE_ROW, SOURCE_ORG]);
  });
}

/** Removes the seed, so a second run of this suite starts where the first did. */
async function removeSeed(): Promise<void> {
  await withTransaction(async tx => {
    await tx.query('DELETE FROM public.organizations WHERE id = $1', [SOURCE_ORG]);
  });
}

async function exportToFile(orgId: string): Promise<string> {
  const chunks: Buffer[] = [];
  const sink = new Writable({
    write(chunk, _enc, cb) { chunks.push(Buffer.from(chunk)); cb(); },
  });
  await writeArchive({
    db: createElevatedClient(), orgId, orgName: 'Roundtrip Source', sink,
  });
  const dir = mkdtempSync(join(tmpdir(), 'roundtrip-'));
  const path = join(dir, 'archive.tar');
  writeFileSync(path, Buffer.concat(chunks));
  return path;
}

describe('export and import round trip', () => {
  // The seed has to commit for the export to see it, so cleanup is explicit.
  afterAll(async () => { await removeSeed(); });

  it('restores an organization whose rows match the source exactly', async () => {
    await seedOrg();
    const archivePath = await exportToFile(SOURCE_ORG);
    const first = await readArchive(archivePath);

    // Import into a transaction that rolls back, so the suite stays repeatable
    // while still exercising the whole load against the real schema.
    await withTransaction(async tx => {
      await tx.query('DELETE FROM public.organizations WHERE id = $1', [SOURCE_ORG]);
      await restoreAccounts(tx, first.tables.get('profiles') ?? []);
      const fks = await readForeignKeys(tx);
      const plan = planLoadOrder([...first.tables.keys()], fks);
      const report = await loadTables(tx, first, plan);

      // Every table the archive carried landed with the count it promised.
      for (const entry of report) {
        expect(entry.inserted).toBe(entry.expected);
      }

      // The numeric survived both directions with its scale.
      const { rows } = await tx.query<{ cost: string }>(
        `SELECT computed_cost::text AS cost FROM public.ai_usage_log
         WHERE org_id = $1 AND computed_cost IS NOT NULL`, [SOURCE_ORG]);
      expect(rows[0].cost).toBe('25000.00');

      // Membership is what makes a restored organization reachable. If the
      // archive carried members, they must have landed.
      const members = first.tables.get('organization_members') ?? [];
      if (members.length > 0) {
        const { rows: restored } = await tx.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM public.organization_members WHERE org_id = $1`,
          [SOURCE_ORG]);
        expect(restored[0].n).toBe(String(members.length));
      }

      throw new Error('rollback');
    }).catch((err: Error) => { if (err.message !== 'rollback') throw err; });
  }, 120_000);

  // Re-importing the same archive must change nothing.
  it('is idempotent on a second import', async () => {
    await seedOrg();
    const archivePath = await exportToFile(SOURCE_ORG);
    const contents = await readArchive(archivePath);

    await withTransaction(async tx => {
      const fks = await readForeignKeys(tx);
      const plan = planLoadOrder([...contents.tables.keys()], fks);

      const { rows: before } = await tx.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM public.ai_usage_log WHERE org_id = $1', [SOURCE_ORG]);

      // The rows already exist, so every insert conflicts and the count check
      // sees zero inserted against a non-zero expectation.
      await expect(loadTables(tx, contents, plan)).rejects.toThrow(/expected/i);

      const { rows: after } = await tx.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM public.ai_usage_log WHERE org_id = $1', [SOURCE_ORG]);
      expect(after[0].n).toBe(before[0].n);

      throw new Error('rollback');
    }).catch((err: Error) => { if (err.message !== 'rollback') throw err; });
  }, 120_000);
});
```

The second test states something the design should confront rather than hide: with a strict count check, importing an archive whose rows already exist **fails** rather than silently succeeding. That is the correct behaviour for this design — `assertOrgAbsent` refuses the same case earlier and more clearly — but the loader's own behaviour is worth pinning down, because a future change that relaxes the count check would silently change what a repeated import means.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/import/__tests__/roundtrip.test.ts`

This task is a proof rather than a new feature: every module it exercises
already exists, so it may well pass on the first run. That is a legitimate
outcome here and not a reason to invent a failure. What it must not do is pass
*vacuously* — confirm the assertions actually ran against data:

```bash
docker exec supabase_db_benevolence-walkthrough psql -U postgres -d postgres -Atc \
  "SELECT count(*) FROM public.ai_usage_log WHERE org_id = '4c000000-0000-4000-8000-00000000d001'"
```

Expected: `1` while the suite is mid-run, `0` after it finishes. A round trip
that exports nothing and imports nothing passes every assertion and proves
none of them.

- [ ] **Step 3: Make it pass**

No new production code should be needed. If the round trip fails, the failure is in Tasks 2–6 and belongs there — fix the module, not the test. Two failures are expected and informative:

- **A table orders wrongly** — `planLoadOrder` is missing a composite foreign key. Fix `readForeignKeys`.
- **A count differs** — a table the export writes cannot be inserted. Read the error, which names the table; the cause is usually a generated column that `insertableColumns` did not exclude, or a constraint the archive violates.

- [ ] **Step 4: Confirm the suite leaves nothing behind**

```bash
npx vitest run lib/import/__tests__/roundtrip.test.ts
docker exec supabase_db_benevolence-walkthrough psql -U postgres -d postgres -Atc \
  "SELECT count(*) FROM public.organizations WHERE id = '4c000000-0000-4000-8000-00000000d001'"
```

Expected: `0`. The seed must commit for the export to read it, so the suite's
`afterAll` is what keeps the database as it was found. If this returns `1`,
the cleanup did not run and a second suite run will not start from the same
state — fix that before moving on.

- [ ] **Step 5: Run the whole gate**

```bash
npm run verify:types && npm run verify:lint && npm run verify:unit && npm run verify:migrations
```

Expected: PASS. `verify:migrations` is a destructive `supabase db reset`, already authorised on 2026-08-24 because no client instances exist.

- [ ] **Step 6: Commit**

```bash
git add lib/import
git commit -m "test(import): prove the export and import round trip"
```

---

## Phase 4C exit criteria

- [ ] `npm run verify:types && npm run verify:lint && npm run verify:unit` all pass
- [ ] `npm run verify:migrations` passes from a clean local Supabase reset
- [ ] The topological sort orders every exportable table and finds exactly the two known cycles
- [ ] A cycle with no nullable edge throws rather than producing an invalid order
- [ ] An archive whose hash does not match is refused, naming the file, with nothing written
- [ ] An archive newer than the target schema is refused, naming the missing migrations
- [ ] An organization id that already exists is refused rather than overwritten
- [ ] A restored account exists with the archive's id and cannot authenticate with an empty password
- [ ] A `numeric` value survives export and import with its scale intact
- [ ] A table whose insert falls short of the manifest count aborts the whole transaction
- [ ] Manual check: `npm run import:org -- --archive <file>` against a fresh database restores an organization, and a member can sign in after a password reset
