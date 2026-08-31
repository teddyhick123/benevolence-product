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
