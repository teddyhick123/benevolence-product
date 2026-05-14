// app/api/admin/imports/[id]/commit/route.ts
// POST: load staging data into production tables, then mark job completed.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { loadStagingToProduction } from '@/lib/import/loader';
import type { ImportJob } from '@/lib/import/types';
import { requireAdmin } from '@/lib/admin-auth';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAdmin();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: job, error: jobError } = await supabase
    .from('import_jobs')
    .select('*')
    .eq('id', id)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: 'Import job not found' }, { status: 404 });
  }

  const committableStatuses = ['mapped', 'validated', 'paused'];
  if (!committableStatuses.includes(job.status)) {
    return NextResponse.json(
      {
        error: `Cannot commit a job with status '${job.status}'. Job must be mapped or validated first.`,
      },
      { status: 422 }
    );
  }

  await supabase
    .from('import_jobs')
    .update({ status: 'processing' })
    .eq('id', id);

  let loadResults;
  try {
    loadResults = await loadStagingToProduction(supabase, id, { upsertMode: 'upsert' });
  } catch (loadErr: any) {
    await supabase
      .from('import_jobs')
      .update({ status: job.status, pause_reason: loadErr.message })
      .eq('id', id);
    return NextResponse.json(
      { error: `Load failed: ${loadErr.message}` },
      { status: 500 }
    );
  }

  const totalInserted = loadResults.reduce((s, r) => s + r.inserted + r.updated, 0);
  const totalFailed = loadResults.reduce((s, r) => s + r.failed, 0);

  const { data: updated, error: updateError } = await supabase
    .from('import_jobs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      pause_reason: null,
      records_loaded: totalInserted,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Fire-and-forget: clean up staging PII from jobs older than 30 days
  supabase.rpc('cleanup_staging_pii', { retention_days: 30 }).then(
    () => {},
    () => {}
  );

  return NextResponse.json(
    {
      job: updated as ImportJob,
      load_summary: {
        total_inserted: totalInserted,
        total_failed: totalFailed,
        phases: loadResults,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
