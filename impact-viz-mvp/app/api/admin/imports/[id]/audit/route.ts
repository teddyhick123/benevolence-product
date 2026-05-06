// app/api/admin/imports/[id]/audit/route.ts
// GET: paginated audit log entries for an import job

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAdmin();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = req.nextUrl;
  const tableName = searchParams.get('table_name');
  const operation = searchParams.get('operation');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  const supabase = createAdminClient();

  let query = supabase
    .from('import_audit_log')
    .select('*', { count: 'exact' })
    .eq('import_job_id', id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (tableName) query = query.eq('table_name', tableName);
  if (operation) query = query.eq('operation', operation);

  const { data: entries, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { entries: entries ?? [], total: count ?? 0 },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
