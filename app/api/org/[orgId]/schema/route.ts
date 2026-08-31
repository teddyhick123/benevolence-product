import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createElevatedClient } from '@/lib/api/admin-client';
import { compareLedger, type AppliedMigrationRow } from '@/lib/migrations/ledger';
import { jsonError, jsonOk } from '@/lib/api/responses';

type RouteParams = { params: Promise<{ orgId: string }> };

/**
 * Reads the migration files to compare against the ledger. Returns an empty
 * list when the directory is not present in the deployed bundle, in which case
 * drift cannot be computed — reported as unavailable rather than as "no drift",
 * which would claim a clean bill of health nobody checked.
 */
function migrationFilesOnDisk(): { version: string; filename: string; sql: string }[] {
  try {
    const dir = join(process.cwd(), 'db', 'migrations');
    return readdirSync(dir)
      .filter(name => name.endsWith('.sql') && /^\d{4}_/.test(name))
      .map(name => ({
        version: name.slice(0, 4),
        filename: name,
        sql: readFileSync(join(dir, name), 'utf8'),
      }));
  } catch {
    return [];
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;

  const db = createElevatedClient();
  try {
    // The ledger's backfill runs inside migration 0060, so it cannot see any
    // migration applied after it. Reconciling before reading lets the ledger
    // self-heal rather than under-reporting by one row per later migration.
    await db.rpc('reconcile_migrations_ledger');

    const [ledger, counts] = await Promise.all([
      db.from('applied_migrations').select('*').order('version'),
      db.rpc('org_table_row_counts', { p_org_id: orgId }),
    ]);
    if (ledger.error) throw ledger.error;
    if (counts.error) throw counts.error;

    const files = migrationFilesOnDisk();
    const comparison = compareLedger(files, (ledger.data ?? []) as AppliedMigrationRow[]);

    return jsonOk({
      migrations: {
        applied: comparison.applied,
        drifted: comparison.drifted,
        counts: {
          verified: comparison.applied.filter(m => m.state === 'verified').length,
          adopted: comparison.applied.filter(m => m.state === 'adopted').length,
          drifted: comparison.drifted.length,
        },
        // Without the files there is nothing to compare against, and reporting
        // zero drift would be a claim rather than a finding.
        driftCheckAvailable: files.length > 0,
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
