// @vitest-environment node

import { readFileSync } from 'node:fs';
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
