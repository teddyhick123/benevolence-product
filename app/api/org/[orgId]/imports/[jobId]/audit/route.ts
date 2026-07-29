import { NextRequest } from 'next/server';
import { requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; jobId: string }>;
}

function positiveInteger(value: string | null, fallback: number, maximum?: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return maximum === undefined ? parsed : Math.min(parsed, maximum);
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { orgId, jobId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (!access.ok) return access.response;

  const { searchParams } = req.nextUrl;
  const tableName = searchParams.get('table_name');
  const operation = searchParams.get('operation');
  const limit = Math.max(1, positiveInteger(searchParams.get('limit'), 50, 200));
  const offset = positiveInteger(searchParams.get('offset'), 0);
  const { db } = access.context;

  const { data: job } = await db
    .from('import_jobs')
    .select('id')
    .eq('id', jobId)
    .eq('org_id', orgId)
    .single();
  if (!job) return jsonError('Import job not found', 404);

  // The audit table is protected through its parent import job, verified above.
  let query = db
    .from('import_audit_log')
    .select('*', { count: 'exact' })
    .eq('import_job_id', jobId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (tableName) query = query.eq('table_name', tableName);
  if (operation) query = query.eq('operation', operation);

  const { data: entries, count, error } = await query;
  if (error) return jsonError(error.message, 500);

  return jsonOk({ entries: entries ?? [], total: count ?? 0 });
}
