// app/api/admin/imports/[id]/load/route.ts
// POST: trigger the load phase for a validated import job

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { loadStagingToProduction } from '@/lib/import/loader';

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAdmin();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const dryRun: boolean = body.dry_run ?? false;
  const batchSize: number = body.batch_size ?? 500;

  const supabase = createAdminClient();

  const { data: job, error: jobError } = await supabase
    .from('import_jobs')
    .select('*')
    .eq('id', id)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: 'Import job not found' }, { status: 404 });
  }

  if (job.status !== 'paused') {
    return NextResponse.json(
      { error: `Job must be in 'paused' status to load. Current status: ${job.status}` },
      { status: 400 }
    );
  }

  // Set status to running
  if (!dryRun) {
    await supabase
      .from('import_jobs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', id);
  }

  try {
    const results = await loadStagingToProduction(supabase, id, { batchSize, dryRun });

    if (!dryRun) {
      // Set status to paused (pending reconciliation)
      await supabase
        .from('import_jobs')
        .update({ status: 'paused', pause_reason: 'Load complete. Run reconciliation to verify.' })
        .eq('id', id);
    }

    return NextResponse.json({ results }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!dryRun) {
      await supabase
        .from('import_jobs')
        .update({ status: 'failed', pause_reason: message })
        .eq('id', id);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
