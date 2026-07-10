import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import type { EntityType } from '@/lib/import/types';
import { STAGING_TABLE_MAP } from '@/lib/import/types';
import { getOrgAccess, hasOrgAccess } from '@/lib/org-access';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; jobId: string }>;
}

async function requireOrgAdmin(orgId: string) {
  const supabase = await createServerClient();
  const access = await getOrgAccess(supabase, orgId);
  if (!access.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasOrgAccess(access, 'admin')) {
    return NextResponse.json({ error: 'Org admin access required' }, { status: 403 });
  }

  return null;
}

async function verifyJob(admin: ReturnType<typeof createAdminClient>, orgId: string, jobId: string) {
  const { data: job } = await admin
    .from('import_jobs')
    .select('id')
    .eq('id', jobId)
    .eq('org_id', orgId)
    .single();
  return !!job;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { orgId, jobId } = await params;
  const accessError = await requireOrgAdmin(orgId);
  if (accessError) return accessError;

  const { searchParams } = new URL(req.url);
  const entity = (searchParams.get('entity') ?? 'holdings') as EntityType;
  const severity = searchParams.get('severity');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '25', 10), 100);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);
  const stagingTable = STAGING_TABLE_MAP[entity];
  if (!stagingTable) return NextResponse.json({ error: `Unknown entity type: ${entity}` }, { status: 400 });

  const admin = createAdminClient();
  if (!(await verifyJob(admin, orgId, jobId))) {
    return NextResponse.json({ error: 'Import job not found' }, { status: 404 });
  }

  let query = admin
    .from(stagingTable)
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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    { rows: data || [], total: count ?? 0, limit, offset },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { orgId, jobId } = await params;
  const accessError = await requireOrgAdmin(orgId);
  if (accessError) return accessError;

  const body = await req.json();
  const { staging_table, row_id, field, proposed_value } = body;
  if (!staging_table || !row_id || !field || proposed_value === undefined) {
    return NextResponse.json(
      { error: 'staging_table, row_id, field, and proposed_value are required' },
      { status: 400 }
    );
  }

  const validTables = Object.values(STAGING_TABLE_MAP);
  if (!validTables.includes(staging_table)) {
    return NextResponse.json({ error: 'Invalid staging_table' }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!(await verifyJob(admin, orgId, jobId))) {
    return NextResponse.json({ error: 'Import job not found' }, { status: 404 });
  }

  const { data: row, error: fetchError } = await admin
    .from(staging_table)
    .select('transformed_data, validation_errors')
    .eq('id', row_id)
    .eq('import_job_id', jobId)
    .eq('org_id', orgId)
    .single();

  if (fetchError || !row) return NextResponse.json({ error: 'Row not found' }, { status: 404 });

  const updatedData = { ...(row.transformed_data ?? {}), [field]: proposed_value };
  const remainingErrors = (row.validation_errors ?? []).filter(
    (error: { field: string }) => error.field !== field
  );
  const newStatus = remainingErrors.length === 0
    ? 'valid'
    : remainingErrors.some((error: { severity: string }) => error.severity === 'error')
      ? 'invalid'
      : 'warning';

  const { error: updateError } = await admin
    .from(staging_table)
    .update({
      transformed_data: updatedData,
      validation_errors: remainingErrors.length > 0 ? remainingErrors : null,
      validation_status: newStatus,
    })
    .eq('id', row_id)
    .eq('import_job_id', jobId)
    .eq('org_id', orgId);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json(
    { success: true, validation_status: newStatus, remaining_errors: remainingErrors.length },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
