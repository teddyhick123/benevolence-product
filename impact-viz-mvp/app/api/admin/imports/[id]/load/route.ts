// app/api/admin/imports/[id]/load/route.ts
// POST: trigger the load phase for a validated import job

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { loadStagingToProduction } from '@/lib/import/loader';
import { generateReconciliationReport } from '@/lib/import/reconciler';
import { requireAdmin } from '@/lib/admin-auth';

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
      // Auto-run reconciliation after load
      const report = await generateReconciliationReport(supabase, id);

      const newStatus = report.overallSuccess ? 'completed' : 'paused';
      const pauseReason = report.overallSuccess
        ? null
        : 'Reconciliation failed. Review discrepancies.';

      await supabase
        .from('import_jobs')
        .update({
          status: newStatus,
          reconciliation_data: report as unknown as Record<string, unknown>,
          ...(report.overallSuccess
            ? { completed_at: new Date().toISOString(), pause_reason: null }
            : { pause_reason: pauseReason }),
        })
        .eq('id', id);

      return NextResponse.json({ results, reconciliation: report }, { headers: { 'Cache-Control': 'no-store' } });
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
