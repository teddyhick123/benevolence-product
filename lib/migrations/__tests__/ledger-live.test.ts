// @vitest-environment node
//
// Exercises compareLedger against the real ledger rows and the real migration
// files, which is what proves the "already up to date" path rather than a
// fixture asserting it.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareLedger, type AppliedMigrationRow } from '@/lib/migrations/ledger';

const ROOT = join(__dirname, '..', '..', '..');

function ledgerRows(): AppliedMigrationRow[] {
  const json = execFileSync('docker', [
    'exec', 'supabase_db_benevolence-walkthrough',
    'psql', '-U', 'postgres', '-d', 'postgres', '-Atc',
    `SELECT coalesce(json_agg(row_to_json(t)), '[]')::text FROM (
       SELECT version, filename, checksum, applied_at::text, applied_by
       FROM public.applied_migrations ORDER BY version) t`,
  ], { encoding: 'utf8' }).trim();
  return JSON.parse(json) as AppliedMigrationRow[];
}

function filesOnDisk() {
  const dir = join(ROOT, 'db', 'migrations');
  return readdirSync(dir)
    .filter(name => name.endsWith('.sql') && /^\d{4}_/.test(name))
    .map(name => ({
      version: name.slice(0, 4),
      filename: name,
      sql: readFileSync(join(dir, name), 'utf8'),
    }));
}

describe('ledger against the live database', () => {
  // The roadmap's exit criterion for F11: an up-to-date database has nothing
  // pending, so the runner reports rather than silently re-running everything.
  it('reports nothing pending for a fully migrated database', () => {
    const result = compareLedger(filesOnDisk(), ledgerRows());
    expect(result.pending).toEqual([]);
  });

  it('reports no drift when no file has been edited since it was applied', () => {
    const result = compareLedger(filesOnDisk(), ledgerRows());
    expect(result.drifted).toEqual([]);
  });

  it('accounts for every file on disk', () => {
    const files = filesOnDisk();
    const result = compareLedger(files, ledgerRows());
    expect(result.applied.length + result.pending.length + result.drifted.length)
      .toBeGreaterThanOrEqual(files.length);
  });

  // Backfilled rows are recorded, not verified. Reporting them as verified
  // would claim knowledge of content that cannot be reconstructed.
  it('reports adopted rows as adopted rather than verified', () => {
    const result = compareLedger(filesOnDisk(), ledgerRows());
    const adopted = result.applied.filter(entry => entry.state === 'adopted');
    expect(adopted.length).toBeGreaterThan(0);
  });
});
