// @vitest-environment node

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createElevatedClient } from '@/lib/api/admin-client';
import { writeArchive } from '@/lib/export/archive';
import { withTransaction } from '@/lib/org-import/connection';
import { readArchive } from '@/lib/org-import/reader';
import { restoreAccounts } from '@/lib/org-import/identity';
import { readForeignKeys, planLoadOrder } from '@/lib/org-import/order';
import { loadTables } from '@/lib/org-import/loader';

const LOCAL_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const LOCAL_API = 'http://127.0.0.1:54321';

/**
 * Binds this suite to the local Supabase stack, explicitly and only.
 *
 * It must never read .env.local: that file points at a real remote project,
 * and this suite deletes an organization. Pointing the export at a remote
 * database while the import writes locally would be both incoherent and
 * destructive. The key is read from `supabase status` at run time rather than
 * committed here.
 */
function bindToLocalStack(): void {
  const status = execFileSync('npx', ['supabase', 'status'], {
    encoding: 'utf8',
    cwd: join(__dirname, '..', '..', '..'),
  });
  const secret = /\bsb_secret_[A-Za-z0-9_-]+/.exec(status)?.[0];
  if (!secret) {
    throw new Error(
      'Could not read the local Supabase secret key from `supabase status`. ' +
      'Start the local stack before running the round-trip suite.',
    );
  }

  process.env.SUPABASE_DB_URL = LOCAL_DB;
  process.env.NEXT_PUBLIC_SUPABASE_URL = LOCAL_API;
  process.env.SUPABASE_SERVICE_ROLE = secret;
  process.env.SUPABASE_SERVICE_ROLE_KEY = secret;
}

beforeAll(() => { bindToLocalStack(); }, 60_000);

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

/**
 * Removes the seed, so a second run of this suite starts where the first did.
 *
 * Child rows go first: ai_usage_log.org_id is ON DELETE SET NULL while a CHECK
 * requires it non-null unless scope_kind is 'platform', so deleting the
 * organization outright raises a constraint violation. That conflict predates
 * this phase and has nothing to do with import.
 */
async function removeSeed(): Promise<void> {
  await withTransaction(async tx => {
    await tx.query('DELETE FROM public.ai_usage_log WHERE org_id = $1', [SOURCE_ORG]);
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

    // The archive must actually carry the seeded data, or every assertion
    // below passes vacuously.
    expect(first.tables.get('organizations')).toHaveLength(1);
    expect(first.tables.get('ai_usage_log')).toHaveLength(1);

    // Import into a transaction that rolls back, so the suite stays repeatable
    // while still exercising the whole load against the real schema.
    const marker = 'intentional-rollback';
    await withTransaction(async tx => {
      // ai_usage_log.org_id is ON DELETE SET NULL while a CHECK requires it
      // non-null unless scope_kind is 'platform', so deleting the organization
      // outright is impossible - a pre-existing schema conflict, unrelated to
      // import. The child rows go first.
      await tx.query('DELETE FROM public.ai_usage_log WHERE org_id = $1', [SOURCE_ORG]);
      await tx.query('DELETE FROM public.organizations WHERE id = $1', [SOURCE_ORG]);
      await restoreAccounts(tx, first.tables.get('profiles') ?? []);

      const fks = await readForeignKeys(tx);
      const plan = planLoadOrder([...first.tables.keys()], fks);
      const report = await loadTables(tx, first, plan);

      // Every table the archive carried landed with the count it promised.
      for (const entry of report) {
        expect(entry.inserted).toBe(entry.expected);
      }
      expect(report.length).toBeGreaterThan(0);

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
          'SELECT count(*)::text AS n FROM public.organization_members WHERE org_id = $1',
          [SOURCE_ORG]);
        expect(restored[0].n).toBe(String(members.length));
      }

      throw new Error(marker);
    }).catch((err: Error) => { if (err.message !== marker) throw err; });
  }, 120_000);

  // Re-importing the same archive must not duplicate anything. With a strict
  // count check the loader refuses rather than silently succeeding, which is
  // correct here: assertOrgAbsent refuses the same case earlier and better.
  it('does not duplicate rows when the same archive is loaded twice', async () => {
    await seedOrg();
    const archivePath = await exportToFile(SOURCE_ORG);
    const contents = await readArchive(archivePath);

    const marker = 'intentional-rollback';
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

      throw new Error(marker);
    }).catch((err: Error) => { if (err.message !== marker) throw err; });
  }, 120_000);
});
