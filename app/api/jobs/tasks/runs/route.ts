// app/api/jobs/tasks/runs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get('x-job-secret');
  const hasValidSecret =
    !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET;

  const { searchParams } = new URL(req.url);
  const org_id = searchParams.get('org_id') ?? undefined;
  const producer = searchParams.get('producer') ?? undefined;
  const limitParam = searchParams.get('limit');
  const limit = Math.min(parseInt(limitParam ?? '50', 10) || 50, 200);

  // If no valid secret, require org_id + authenticated org admin session
  if (!hasValidSecret) {
    if (!org_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: isAdmin } = await supabase.rpc('is_org_admin', {
      p_org_id: org_id,
    });

    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const db = createAdminClient();

  let query = db
    .from('task_automation_runs')
    .select(
      'id, producer, org_id, dry_run, status, scanned, created_count, updated_count, completed_count, skipped_count, error_count, metadata, created_at, completed_at'
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (producer) query = (query as any).eq('producer', producer);
  if (org_id) query = (query as any).eq('org_id', org_id);

  const { data: runs, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ runs: runs ?? [] });
}
