// app/api/admin/imports/[id]/ai/reconcile/route.ts
// POST: trigger AI reconciliation analysis for an import job

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { generateReconciliationReport } from '@/lib/import/reconciler';
import { analyzeReconciliation } from '@/lib/import/ai/reconcile';
import type { ReconciliationReport } from '@/lib/import/reconciler';

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

  // Use stored report or generate fresh
  let report: ReconciliationReport;
  if (job.reconciliation_data && (job.reconciliation_data as Record<string, unknown>).importJobId) {
    report = job.reconciliation_data as unknown as ReconciliationReport;
  } else {
    report = await generateReconciliationReport(supabase, id);
  }

  // Fetch sample mismatches: staging rows that failed to load
  const { data: stagingMismatches } = await supabase
    .from('staging_import_contributions')
    .select('id, transformed_data, final_tax_contribution_id')
    .eq('import_job_id', id)
    .in('validation_status', ['valid', 'warning'])
    .is('final_tax_contribution_id', null)
    .neq('action_taken', 'skip')
    .limit(5);

  const sampleMismatches = (stagingMismatches ?? []).map((row: {
    id: string;
    transformed_data: Record<string, unknown> | null;
    final_tax_contribution_id: string | null;
  }) => ({
    staging: { id: row.id, ...(row.transformed_data ?? {}) },
    production: { note: 'No matching record found in tax_contributions' },
  }));

  const analysis = await analyzeReconciliation(report, sampleMismatches);

  // Store AI analysis in reconciliation_data
  const updatedReconciliation = {
    ...(report as unknown as Record<string, unknown>),
    ai_analysis: analysis,
  };

  await supabase
    .from('import_jobs')
    .update({ reconciliation_data: updatedReconciliation })
    .eq('id', id);

  return NextResponse.json({ analysis }, { headers: { 'Cache-Control': 'no-store' } });
}
