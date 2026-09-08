// lib/org-import/compatibility.ts
// Refusals that must happen before anything is written.

import type { Tx } from '@/lib/org-import/connection';

export type Compatibility =
  | { ok: true; warning?: string }
  | { ok: false; reason: string };

/**
 * Compares the archive's migration ledger against the target's.
 *
 * A target that is behind is refused. jsonb_populate_record ignores JSON keys
 * with no matching column — verified against the live database — so that
 * import would succeed while quietly discarding whatever those columns held.
 * That is the silent loss this phase exists to prevent.
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
        `${missing.join(', ')}. Importing would silently discard columns those migrations ` +
        'added. Apply the migrations first, then re-run the import.',
    };
  }

  const archive = new Set(archiveLedger.map(entry => entry.version));
  const ahead = targetVersions.filter(version => !archive.has(version)).sort();
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
