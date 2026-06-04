// POST /api/admin/imports/watchdog
// Manually trigger stale job check (admin only)
// Returns: { reaped: number }
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/admin-auth';

const STALE_THRESHOLD_MINUTES = 30;

function isMissingStaleJobRpc(message: string): boolean {
  return message.includes('mark_stale_import_jobs') && message.includes('schema cache');
}

export async function POST() {
  const userId = await requireAdmin();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('mark_stale_import_jobs', {
    p_stale_threshold_minutes: STALE_THRESHOLD_MINUTES,
  });
  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        hint: isMissingStaleJobRpc(error.message)
          ? 'Apply db/migrations/0050_import_tables.sql or run scripts/run-migrations.sh.'
          : undefined,
      },
      { status: isMissingStaleJobRpc(error.message) ? 501 : 500 }
    );
  }
  return NextResponse.json({ reaped: data ?? 0 });
}
