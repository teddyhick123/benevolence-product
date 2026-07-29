import { NextRequest } from 'next/server';
import { requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; jobId: string }>;
}

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

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { orgId, jobId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (!access.ok) return access.response;

  const { db } = access.context;
  const { data: job, error: jobError } = await db
    .from('import_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('org_id', orgId)
    .single();

  if (jobError || !job) return jsonError('Import job not found', 404);

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
        .eq('import_job_id', jobId)
        .eq('org_id', orgId);

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
