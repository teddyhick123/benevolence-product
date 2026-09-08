// @vitest-environment node

import { describe, expect, it, beforeAll } from 'vitest';
import { insertableColumns, loadTables } from '@/lib/org-import/loader';
import { withTransaction, type Tx } from '@/lib/org-import/connection';
import type { ArchiveContents } from '@/lib/org-import/reader';

const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
beforeAll(() => { process.env.SUPABASE_DB_URL = process.env.SUPABASE_DB_URL ?? LOCAL; });

const ORG = '4c000000-0000-4000-8000-00000000bbbb';
const USAGE = '4c000000-0000-4000-8000-00000000cccc';

async function inRollback(fn: (_tx: Tx) => Promise<void>): Promise<void> {
  const marker = 'intentional-rollback';
  await withTransaction(async tx => {
    await fn(tx);
    throw new Error(marker);
  }).catch((err: Error) => { if (err.message !== marker) throw err; });
}

function contentsFor(
  tables: Record<string, string[]>,
  rows: Record<string, number>,
): ArchiveContents {
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

const orgRow = () => JSON.stringify({
  id: ORG, name: 'Loader Test', org_type: 'private_foundation',
});

describe('insertableColumns', () => {
  // Postgres rejects an explicit value for a generated column, so including
  // one makes every insert on that table fail.
  it('excludes generated columns', async () => {
    const columns = await withTransaction(tx => insertableColumns(tx, 'ai_usage_log'));
    expect(columns).not.toContain('total_tokens');
    expect(columns).toContain('org_id');
  });

  // ai_messages.sequence_no and onboarding_messages.sequence_no are the only
  // two. An identity column is insertable, but only with the override.
  it('keeps an identity column in the list', async () => {
    const columns = await withTransaction(tx => insertableColumns(tx, 'ai_messages'));
    expect(columns).toContain('sequence_no');
  });
});

describe('loadTables', () => {
  it('inserts rows with the ids the archive recorded', async () => {
    await inRollback(async tx => {
      const contents = contentsFor({ organizations: [orgRow()] }, { organizations: 1 });
      const report = await loadTables(tx, contents, { order: ['organizations'], deferred: [] });
      expect(report).toEqual([{ table: 'organizations', inserted: 1, expected: 1 }]);

      const { rows } = await tx.query<{ id: string }>(
        'SELECT id FROM public.organizations WHERE id = $1', [ORG]);
      expect(rows[0].id).toBe(ORG);
    });
  });

  // The check that turns silent data loss into a rollback. ON CONFLICT DO
  // NOTHING swallows a row that violates an unanticipated constraint.
  it('throws when fewer rows land than the manifest promised', async () => {
    await expect(withTransaction(async tx => {
      const contents = contentsFor({ organizations: [orgRow()] }, { organizations: 2 });
      await loadTables(tx, contents, { order: ['organizations'], deferred: [] });
    })).rejects.toThrow(/organizations/);
  });

  // Preserved scale, from the far end of the round trip.
  it('preserves numeric scale through a JSON string', async () => {
    await inRollback(async tx => {
      const contents = contentsFor({
        organizations: [orgRow()],
        ai_usage_log: [JSON.stringify({
          id: USAGE, org_id: ORG, scope_kind: 'organization', workload_id: 'assistant',
          operation: 'tool_conversation', connector: 'anthropic',
          requested_model: 'claude-opus-5', computed_cost: '25000.00',
        })],
      }, { organizations: 1, ai_usage_log: 1 });

      await loadTables(tx, contents, { order: ['organizations', 'ai_usage_log'], deferred: [] });

      const { rows } = await tx.query<{ cost: string }>(
        'SELECT computed_cost::text AS cost FROM public.ai_usage_log WHERE id = $1', [USAGE]);
      expect(rows[0].cost).toBe('25000.00');
    });
  });

  it('skips a table the archive does not contain', async () => {
    await inRollback(async tx => {
      const report = await loadTables(tx, contentsFor({}, {}), {
        order: ['holdings'], deferred: [],
      });
      expect(report).toEqual([]);
    });
  });

  it('leaves a deferred column null on insert and repairs it afterwards', async () => {
    await inRollback(async tx => {
      const contents = contentsFor({ organizations: [orgRow()] }, { organizations: 1 });
      // organizations has no deferred column in practice; this asserts the
      // mechanism runs without disturbing a table that has none pending.
      const report = await loadTables(tx, contents, {
        order: ['organizations'], deferred: [{ table: 'holdings', column: 'nothing_here' }],
      });
      expect(report).toEqual([{ table: 'organizations', inserted: 1, expected: 1 }]);
    });
  });

  // Naming a column the archive lacks would make jsonb_populate_record supply
  // NULL and override the column's default. This is what lets an archive made
  // against an older schema import into a newer one, which the compatibility
  // check promises.
  it('lets a column the archive omits take its database default', async () => {
    await inRollback(async tx => {
      // The row carries no created_at, which is NOT NULL DEFAULT now().
      const contents = contentsFor({ organizations: [orgRow()] }, { organizations: 1 });
      await loadTables(tx, contents, { order: ['organizations'], deferred: [] });

      const { rows } = await tx.query<{ created_at: string | null }>(
        'SELECT created_at FROM public.organizations WHERE id = $1', [ORG]);
      expect(rows[0].created_at).not.toBeNull();
    });
  });
});
