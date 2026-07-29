import { NextRequest } from 'next/server';
import { requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import type { ImportJob } from '@/lib/import/types';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; jobId: string }>;
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { orgId, jobId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (!access.ok) return access.response;

  const { db } = access.context;
  const { data: job } = await db
    .from('import_jobs')
    .select('id, status')
    .eq('id', jobId)
    .eq('org_id', orgId)
    .single();

  if (!job) return jsonError('Import job not found', 404);
  if (job.status !== 'needs_review') {
    return jsonError(
      `Cannot resume a job with status '${job.status}'. Job must be in needs_review.`,
      422
    );
  }

  const { data: updated, error } = await db
    .from('import_jobs')
    .update({ status: 'processing', error_message: null })
    .eq('id', jobId)
    .eq('org_id', orgId)
    .select('*')
    .single();

  if (error) return jsonError(error.message, 500);
  return jsonOk({ job: updated as ImportJob });
}
