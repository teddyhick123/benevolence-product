// app/api/admin/imports/[id]/errors/route.ts
// GET: paginated list of staging rows with validation errors
// PATCH: accept an AI suggestion — writes proposed_value into transformed_data for one field

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import type { EntityType } from '@/lib/import/types';
import { STAGING_TABLE_MAP } from '@/lib/import/types';
import { requireAdmin } from '@/lib/admin-auth';

// GET /api/admin/imports/:id/errors
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAdmin();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);

  const entity = (searchParams.get('entity') ?? 'holdings') as EntityType;
  const severity = searchParams.get('severity');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 500);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  const stagingTable = STAGING_TABLE_MAP[entity];
  if (!stagingTable) {
    return NextResponse.json({ error: `Unknown entity type: ${entity}` }, { status: 400 });
  }

  const supabase = createAdminClient();

  let query = supabase
    .from(stagingTable)
    .select('id, row_number, raw_data, transformed_data, validation_errors, validation_status, action_taken', { count: 'exact' })
    .eq('import_job_id', id)
    .not('validation_errors', 'is', null)
    .order('row_number', { ascending: true })
    .range(offset, offset + limit - 1);

  // Filter by severity if requested
  if (severity === 'error') {
    query = query.eq('validation_status', 'invalid');
  } else if (severity === 'warning') {
    query = query.eq('validation_status', 'warning');
  } else {
    query = query.in('validation_status', ['invalid', 'warning']);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      rows: data,
      total: count ?? 0,
      limit,
      offset,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

// PATCH /api/admin/imports/:id/errors
// Body: { staging_table, row_id, field, proposed_value }
// Writes the accepted AI suggestion into transformed_data for that field.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAdmin();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: importJobId } = await params;
  const body = await req.json();
  const { staging_table, row_id, field, proposed_value } = body;

  if (!staging_table || !row_id || !field || proposed_value === undefined) {
    return NextResponse.json(
      { error: 'staging_table, row_id, field, and proposed_value are required' },
      { status: 400 }
    );
  }

  // Verify the valid staging table names to prevent SQL injection
  const validTables = Object.values(STAGING_TABLE_MAP);
  if (!validTables.includes(staging_table)) {
    return NextResponse.json({ error: 'Invalid staging_table' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch current transformed_data for this row
  const { data: row, error: fetchErr } = await supabase
    .from(staging_table)
    .select('transformed_data, validation_errors')
    .eq('id', row_id)
    .eq('import_job_id', importJobId)
    .single();

  if (fetchErr || !row) {
    return NextResponse.json({ error: 'Row not found' }, { status: 404 });
  }

  const updatedData = { ...(row.transformed_data ?? {}), [field]: proposed_value };

  // Remove the resolved field's error from validation_errors
  const remainingErrors = (row.validation_errors ?? []).filter(
    (e: { field: string }) => e.field !== field
  );
  const newStatus = remainingErrors.length === 0 ? 'valid' :
    remainingErrors.some((e: { severity: string }) => e.severity === 'error') ? 'invalid' : 'warning';

  const { error: updateErr } = await supabase
    .from(staging_table)
    .update({
      transformed_data: updatedData,
      validation_errors: remainingErrors.length > 0 ? remainingErrors : null,
      validation_status: newStatus,
    })
    .eq('id', row_id)
    .eq('import_job_id', importJobId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json(
    { success: true, validation_status: newStatus, remaining_errors: remainingErrors.length },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
