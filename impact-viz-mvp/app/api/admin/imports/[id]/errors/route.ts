// app/api/admin/imports/[id]/errors/route.ts
// GET: paginated list of staging rows with validation errors

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import type { EntityType } from '@/lib/import/types';
import { STAGING_TABLE_MAP } from '@/lib/import/types';

async function requireAdmin(): Promise<string | null> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: adminRow } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  return adminRow ? user.id : null;
}

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
