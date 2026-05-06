// POST /api/admin/imports/watchdog
// Manually trigger stale job check (admin only)
// Returns: { reaped: number }
import { NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/admin-auth';

export async function POST() {
  const userId = await requireAdmin();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('mark_stale_import_jobs');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reaped: data ?? 0 });
}
