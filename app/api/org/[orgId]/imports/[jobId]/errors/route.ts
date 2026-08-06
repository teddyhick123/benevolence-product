import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import type { SessionClient } from '@/lib/api/server-client';
import type { EntityType } from '@/lib/import/types';
import { STAGING_TABLE_MAP } from '@/lib/import/types';
import { fromImportStagingRelation } from '@/lib/import/database';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; jobId: string }>;
}

const stagingTables = Object.values(STAGING_TABLE_MAP) as [string, ...string[]];
const correctionSchema = z.object({
  staging_table: z.enum(stagingTables),
  row_id: z.string().uuid(),
  field: z.string().trim().min(1).max(200),
  proposed_value: z.unknown(),
}).strict();

function positiveInteger(value: string | null, fallback: number, maximum?: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return maximum === undefined ? parsed : Math.min(parsed, maximum);
}

async function verifyJob(db: SessionClient, orgId: string, jobId: string) {
  const { data: job } = await db
    .from('import_jobs')
    .select('id')
    .eq('id', jobId)
    .eq('org_id', orgId)
    .single();
  return !!job;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { orgId, jobId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (!access.ok) return access.response;

  const { searchParams } = req.nextUrl;
  const entity = (searchParams.get('entity') ?? 'holdings') as EntityType;
  const severity = searchParams.get('severity');
  const limit = Math.max(1, positiveInteger(searchParams.get('limit'), 25, 100));
  const offset = positiveInteger(searchParams.get('offset'), 0);
  const stagingTable = STAGING_TABLE_MAP[entity];
  if (!stagingTable) return jsonError(`Unknown entity type: ${entity}`, 400);

  const { db } = access.context;
  if (!(await verifyJob(db, orgId, jobId))) {
    return jsonError('Import job not found', 404);
  }

  let query = fromImportStagingRelation(db, stagingTable)
    .select('id, row_number, raw_data, transformed_data, validation_errors, validation_status, action_taken', { count: 'exact' })
    .eq('import_job_id', jobId)
    .eq('org_id', orgId)
    .not('validation_errors', 'is', null)
    .order('row_number', { ascending: true })
    .range(offset, offset + limit - 1);

  if (severity === 'error') query = query.eq('validation_status', 'invalid');
  else if (severity === 'warning') query = query.eq('validation_status', 'warning');
  else query = query.in('validation_status', ['invalid', 'warning']);

  const { data, error, count } = await query;
  if (error) return jsonError(error.message, 500);

  return jsonOk({ rows: data || [], total: count ?? 0, limit, offset });
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { orgId, jobId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (!access.ok) return access.response;

  const parsed = correctionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('Validation failed', 400, { details: parsed.error.format() });
  const { staging_table, row_id, field, proposed_value } = parsed.data;

  const { db } = access.context;
  if (!(await verifyJob(db, orgId, jobId))) {
    return jsonError('Import job not found', 404);
  }

  const { data: row, error: fetchError } = await fromImportStagingRelation(db, staging_table)
    .select('transformed_data, validation_errors')
    .eq('id', row_id)
    .eq('import_job_id', jobId)
    .eq('org_id', orgId)
    .single();

  if (fetchError || !row) return jsonError('Row not found', 404);

  const updatedData = { ...(row.transformed_data ?? {}), [field]: proposed_value };
  const remainingErrors = (row.validation_errors ?? []).filter(
    (error: { field: string }) => error.field !== field
  );
  const newStatus = remainingErrors.length === 0
    ? 'valid'
    : remainingErrors.some((error: { severity: string }) => error.severity === 'error')
      ? 'invalid'
      : 'warning';

  const { error: updateError } = await fromImportStagingRelation(db, staging_table)
    .update({
      transformed_data: updatedData,
      validation_errors: remainingErrors.length > 0 ? remainingErrors : null,
      validation_status: newStatus,
    })
    .eq('id', row_id)
    .eq('import_job_id', jobId)
    .eq('org_id', orgId);

  if (updateError) return jsonError(updateError.message, 500);

  return jsonOk({
    success: true,
    validation_status: newStatus,
    remaining_errors: remainingErrors.length,
  });
}
