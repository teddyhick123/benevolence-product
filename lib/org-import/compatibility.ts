// lib/org-import/compatibility.ts
// Refusals that must happen before anything is written.

import type { Tx } from '@/lib/org-import/connection';

export type Compatibility =
  | { ok: true; warning?: string }
  | { ok: false; reason: string };

export type SchemaLedgerEntry = {
  version: string;
  /** Absent on Phase 4B archives created before checksum export shipped. */
  checksum?: string;
};

/**
 * Compares the archive's migration ledger against the target's.
 *
 * A target that is behind is refused. jsonb_populate_record ignores JSON keys
 * with no matching column — verified against the live database — so that
 * import would succeed while quietly discarding whatever those columns held.
 * That is the silent loss this phase exists to prevent.
 */
export function checkSchemaCompatibility(
  archiveLedger: SchemaLedgerEntry[],
  targetLedger: SchemaLedgerEntry[],
): Compatibility {
  const targetByVersion = new Map(targetLedger.map(entry => [entry.version, entry]));
  // Version strings, never numbers: prefixes have gaps and leading zeros.
  const missing = archiveLedger
    .map(entry => entry.version)
    .filter(version => !targetByVersion.has(version))
    .sort();

  if (missing.length > 0) {
    return {
      ok: false,
      reason:
        `This database is missing ${missing.length} migration(s) the archive was made with: ` +
        `${missing.join(', ')}. Importing would silently discard columns those migrations ` +
        'added. Apply the migrations first, then re-run the import.',
    };
  }

  const checksumDrift = archiveLedger
    .map(entry => ({ archive: entry, target: targetByVersion.get(entry.version) }))
    .filter((entry): entry is { archive: Required<SchemaLedgerEntry>; target: Required<SchemaLedgerEntry> } =>
      Boolean(
        entry.target &&
        entry.archive.checksum &&
        entry.target.checksum &&
        entry.archive.checksum !== 'unverified' &&
        entry.target.checksum !== 'unverified' &&
        entry.archive.checksum !== entry.target.checksum,
      ))
    .map(entry => entry.archive.version)
    .sort();

  if (checksumDrift.length > 0) {
    return {
      ok: false,
      reason:
        `This database has ${checksumDrift.length} migration(s) with different verified contents: ` +
        `${checksumDrift.join(', ')}. Apply against a database built from the same canonical ` +
        'migrations; bypassing checksum drift would make portability unverifiable.',
    };
  }

  const archive = new Set(archiveLedger.map(entry => entry.version));
  const ahead = targetLedger.map(entry => entry.version).filter(version => !archive.has(version)).sort();
  if (ahead.length > 0) {
    return {
      ok: true,
      warning:
        `This database is ahead of the archive by ${ahead.length} migration(s): ` +
        `${ahead.join(', ')}. Columns those migrations added will take their defaults.`,
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
