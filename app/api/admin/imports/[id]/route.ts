// app/api/admin/imports/[id]/route.ts
// GET: return import job + progress summary

import { NextRequest } from 'next/server';
import { requireAppAdmin } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';

type StagingTable =
  | 'staging_import_donors'
  | 'staging_import_holdings'
  | 'staging_import_investees'
  | 'staging_import_contributions'
  | 'staging_import_metrics';

interface StagingCounts {
  total: number;
  valid: number;
  invalid: number;
  pending: number;
  warning: number;
}

// GET /api/admin/imports/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireAppAdmin();
  if (!access.ok) return access.response;

  const { id } = await params;
  const { db } = access.context;

  const { data: job, error: jobError } = await db
    .from('import_jobs')
    .select('*')
    .eq('id', id)
    .single();

  if (jobError || !job) {
    return jsonError('Import job not found', 404);
  }

  // Fetch staging counts for each entity type
  const stagingTables: Record<string, StagingTable> = {
    donors: 'staging_import_donors',
    holdings: 'staging_import_holdings',
    investees: 'staging_import_investees',
    contributions: 'staging_import_contributions',
    metrics: 'staging_import_metrics',
  };

  const stagingCounts: Record<string, StagingCounts> = {};

  await Promise.all(
    Object.entries(stagingTables).map(async ([entityType, table]) => {
      const { data: rows } = await db
        .from(table)
        .select('validation_status')
        .eq('import_job_id', id);

      const counts: StagingCounts = { total: 0, valid: 0, invalid: 0, pending: 0, warning: 0 };

      if (rows) {
        counts.total = rows.length;
        for (const row of rows) {
          const status = row.validation_status as keyof StagingCounts;
          if (status in counts) counts[status]++;
        }
      }

      stagingCounts[entityType] = counts;
    })
  );

  return jsonOk({ job, staging_counts: stagingCounts });
}
