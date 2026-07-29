// app/api/admin/imports/[id]/audit/route.ts
// GET: paginated audit log entries for an import job

import { NextRequest } from 'next/server';
import { requireAppAdmin } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';

function positiveInteger(value: string | null, fallback: number, maximum?: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return maximum === undefined ? parsed : Math.min(parsed, maximum);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireAppAdmin();
  if (!access.ok) return access.response;

  const { id } = await params;
  const { searchParams } = req.nextUrl;
  const tableName = searchParams.get('table_name');
  const operation = searchParams.get('operation');
  const limit = Math.max(1, positiveInteger(searchParams.get('limit'), 50, 200));
  const offset = positiveInteger(searchParams.get('offset'), 0);

  let query = access.context.db
    .from('import_audit_log')
    .select('*', { count: 'exact' })
    .eq('import_job_id', id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (tableName) query = query.eq('table_name', tableName);
  if (operation) query = query.eq('operation', operation);

  const { data: entries, count, error } = await query;

  if (error) {
    return jsonError(error.message, 500);
  }

  return jsonOk({ entries: entries ?? [], total: count ?? 0 });
}
