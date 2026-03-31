// app/api/admin/imports/[id]/reconciliation/route.ts
// GET: return stored reconciliation report (or generate if missing)
// POST: force-regenerate reconciliation report

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { generateReconciliationReport } from '@/lib/import/reconciler';

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

export async function GET(
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
    .select('reconciliation_data')
    .eq('id', id)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: 'Import job not found' }, { status: 404 });
  }

  // Return stored report if present
  if (job.reconciliation_data) {
    return NextResponse.json(
      { report: job.reconciliation_data },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // Generate on-demand
  const report = await generateReconciliationReport(supabase, id);
  await supabase
    .from('import_jobs')
    .update({ reconciliation_data: report as unknown as Record<string, unknown> })
    .eq('id', id);

  return NextResponse.json({ report }, { headers: { 'Cache-Control': 'no-store' } });
}

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
    .select('id')
    .eq('id', id)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: 'Import job not found' }, { status: 404 });
  }

  const report = await generateReconciliationReport(supabase, id);

  // Update status based on reconciliation outcome
  const newStatus = report.overallSuccess ? 'completed' : 'paused';
  const pauseReason = report.overallSuccess
    ? null
    : 'Reconciliation failed. Review discrepancies.';

  await supabase
    .from('import_jobs')
    .update({
      reconciliation_data: report as unknown as Record<string, unknown>,
      status: newStatus,
      ...(report.overallSuccess ? { completed_at: new Date().toISOString(), pause_reason: null } : { pause_reason: pauseReason }),
    })
    .eq('id', id);

  return NextResponse.json({ report }, { headers: { 'Cache-Control': 'no-store' } });
}
