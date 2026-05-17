// app/api/admin/imports/[id]/commit/route.ts
// POST: load staging data into production tables for an approved job.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { loadStagingToProduction } from '@/lib/import/loader';
import type { ImportJob } from '@/lib/import/types';
import { requireAdmin } from '@/lib/admin-auth';
import { completeGeneratedTasks } from '@/lib/tasks/automation/task-writer';

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

  if (job.status !== 'approved') {
    return NextResponse.json(
      {
        error: `Cannot commit a job with status '${job.status}'. Job must be approved first.`,
      },
      { status: 422 }
    );
  }

  await supabase
    .from('import_jobs')
    .update({ status: 'committing' })
    .eq('id', id);

  let loadResults;
  try {
    loadResults = await loadStagingToProduction(supabase, id, { upsertMode: 'upsert' });
  } catch (loadErr: any) {
    await supabase
      .from('import_jobs')
      .update({
        status: 'failed',
        error_message: loadErr.message,
        error_details: {
          previous_status: job.status,
          failed_at: new Date().toISOString(),
        },
      })
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
      reviewed_by: userId,
      error_message: null,
      error_details: {
        load_summary: {
          total_inserted: totalInserted,
          total_failed: totalFailed,
          phases: loadResults,
        },
      },
    })
    .eq('id', id)
    .select('*')
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  completeGeneratedTasks(supabase, job.org_id, `import_job:${id}:approval`, 'Import job committed successfully').catch(() => {});

  supabase.rpc('cleanup_staging_pii', { retention_days: 30 }).then(() => {}, () => {});

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
