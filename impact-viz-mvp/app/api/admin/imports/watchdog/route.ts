// POST /api/admin/imports/watchdog
// Manually trigger stale job check (admin only)
// Returns: { reaped: number }
import { NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';

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
