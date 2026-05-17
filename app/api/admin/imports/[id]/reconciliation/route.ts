// app/api/admin/imports/[id]/reconciliation/route.ts
// GET: return stored reconciliation report (or generate if missing)
// POST: force-regenerate reconciliation report

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { generateReconciliationReport } from '@/lib/import/reconciler';
import { analyzeReconciliation } from '@/lib/import/ai/reconcile';
import { requireAdmin } from '@/lib/admin-auth';

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
  const { error: cacheErr } = await supabase
    .from('import_jobs')
    .update({ reconciliation_data: report as unknown as Record<string, unknown> })
    .eq('id', id);
  if (cacheErr) {
    console.error('[reconciliation GET] Failed to cache report:', cacheErr);
  }

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

  // Run AI analysis when there are discrepancies
  let reconciliationData: Record<string, unknown> = report as unknown as Record<string, unknown>;
  const hasDiscrepancies = !report.overallSuccess || report.entities.some((e) => (e.amountDelta ?? 0) > 0);

  if (hasDiscrepancies) {
    try {
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

      const aiAnalysis = await analyzeReconciliation(report, sampleMismatches);
      reconciliationData = { ...reconciliationData, ai_analysis: aiAnalysis };
    } catch (aiErr) {
      console.error('[reconciliation] AI analysis failed:', aiErr);
    }
  }

  const { error: updateErr } = await supabase
    .from('import_jobs')
    .update({ reconciliation_data: reconciliationData })
    .eq('id', id);

  if (updateErr) {
    console.error('[reconciliation POST] Failed to cache reconciliation data:', updateErr);
  }

  return NextResponse.json({ report: reconciliationData }, { headers: { 'Cache-Control': 'no-store' } });
}
