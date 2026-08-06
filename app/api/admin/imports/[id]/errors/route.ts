// app/api/admin/imports/[id]/errors/route.ts
// GET: paginated list of staging rows with validation errors
// PATCH: accept an AI suggestion — writes proposed_value into transformed_data for one field

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAppAdmin } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import type { EntityType } from '@/lib/import/types';
import { STAGING_TABLE_MAP } from '@/lib/import/types';
import { fromImportStagingRelation } from '@/lib/import/database';

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

// GET /api/admin/imports/:id/errors
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireAppAdmin();
  if (!access.ok) return access.response;

  const { id } = await params;
  const { searchParams } = req.nextUrl;

  const entity = (searchParams.get('entity') ?? 'holdings') as EntityType;
  const severity = searchParams.get('severity');
  const limit = Math.max(1, positiveInteger(searchParams.get('limit'), 100, 500));
  const offset = positiveInteger(searchParams.get('offset'), 0);

  const stagingTable = STAGING_TABLE_MAP[entity];
  if (!stagingTable) {
    return jsonError(`Unknown entity type: ${entity}`, 400);
  }

  let query = fromImportStagingRelation(access.context.db, stagingTable)
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
    return jsonError(error.message, 500);
  }

  return jsonOk({ rows: data, total: count ?? 0, limit, offset });
}

// PATCH /api/admin/imports/:id/errors
// Body: { staging_table, row_id, field, proposed_value }
// Writes the accepted AI suggestion into transformed_data for that field.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireAppAdmin();
  if (!access.ok) return access.response;

  const { id: importJobId } = await params;
  const parsed = correctionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('Validation failed', 400, { details: parsed.error.format() });
  const { staging_table, row_id, field, proposed_value } = parsed.data;
  const { db } = access.context;

  // Fetch current transformed_data for this row
  const { data: row, error: fetchErr } = await fromImportStagingRelation(db, staging_table)
    .select('transformed_data, validation_errors')
    .eq('id', row_id)
    .eq('import_job_id', importJobId)
    .single();

  if (fetchErr || !row) {
    return jsonError('Row not found', 404);
  }

  const updatedData = { ...(row.transformed_data ?? {}), [field]: proposed_value };

  // Remove the resolved field's error from validation_errors
  const remainingErrors = (row.validation_errors ?? []).filter(
    (e: { field: string }) => e.field !== field
  );
  const newStatus = remainingErrors.length === 0 ? 'valid' :
    remainingErrors.some((e: { severity: string }) => e.severity === 'error') ? 'invalid' : 'warning';

  const { error: updateErr } = await fromImportStagingRelation(db, staging_table)
    .update({
      transformed_data: updatedData,
      validation_errors: remainingErrors.length > 0 ? remainingErrors : null,
      validation_status: newStatus,
    })
    .eq('id', row_id)
    .eq('import_job_id', importJobId);

  if (updateErr) {
    return jsonError(updateErr.message, 500);
  }

  return jsonOk({
    success: true,
    validation_status: newStatus,
    remaining_errors: remainingErrors.length,
  });
}
