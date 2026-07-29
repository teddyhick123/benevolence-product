// app/api/admin/imports/[id]/reconciliation/route.ts
// GET: return stored reconciliation report (or generate if missing)
// POST: force-regenerate reconciliation report

import { NextRequest } from 'next/server';
import { requireAppAdmin } from '@/lib/api/access';
import { createImportOrchestrationRepository } from '@/lib/api/repositories/imports';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { analyzeReconciliation } from '@/lib/import/ai/reconcile';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireAppAdmin();
  if (!access.ok) return access.response;

  const { id } = await params;
  const { db } = access.context;

  const { data: job, error: jobError } = await db
    .from('import_jobs')
    .select('id, org_id, reconciliation_data')
    .eq('id', id)
    .maybeSingle();

  if (jobError || !job) {
    return jsonError('Import job not found', 404);
  }

  // Return stored report if present
  if (job.reconciliation_data) {
    return jsonOk({ report: job.reconciliation_data });
  }

  // Generate on-demand
  const repository = createImportOrchestrationRepository({
    orgId: job.org_id,
    actorId: access.context.user.id,
  });
  const report = await repository.generateReconciliation(id);
  const { error: cacheErr } = await db
    .from('import_jobs')
    .update({ reconciliation_data: report as unknown as Record<string, unknown> })
    .eq('id', id)
    .eq('org_id', job.org_id);
  if (cacheErr) {
    console.error('[reconciliation GET] Failed to cache report:', cacheErr);
  }

  return jsonOk({ report });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireAppAdmin();
  if (!access.ok) return access.response;

  const { id } = await params;
  const { db } = access.context;

  const { data: job, error: jobError } = await db
    .from('import_jobs')
    .select('id, org_id')
    .eq('id', id)
    .maybeSingle();

  if (jobError || !job) {
    return jsonError('Import job not found', 404);
  }

  const repository = createImportOrchestrationRepository({
    orgId: job.org_id,
    actorId: access.context.user.id,
  });
  const report = await repository.generateReconciliation(id);

  // Run AI analysis when there are discrepancies
  let reconciliationData: Record<string, unknown> = report as unknown as Record<string, unknown>;
  const hasDiscrepancies = !report.overallSuccess || report.entities.some((e) => (e.amountDelta ?? 0) > 0);

  if (hasDiscrepancies) {
    try {
      const { data: stagingMismatches } = await db
        .from('staging_import_contributions')
        .select('id, transformed_data, final_contribution_id')
        .eq('import_job_id', id)
        .in('validation_status', ['valid', 'warning'])
        .is('final_contribution_id', null)
        .neq('action_taken', 'skip')
        .limit(5);

      const sampleMismatches = (stagingMismatches ?? []).map((row: {
        id: string;
        transformed_data: Record<string, unknown> | null;
        final_contribution_id: string | null;
      }) => ({
        staging: { id: row.id, ...(row.transformed_data ?? {}) },
        production: { note: 'No matching record found in contributions_received' },
      }));

      const aiAnalysis = await analyzeReconciliation(report, sampleMismatches);
      reconciliationData = { ...reconciliationData, ai_analysis: aiAnalysis };
    } catch (aiErr) {
      console.error('[reconciliation] AI analysis failed:', aiErr);
    }
  }

  const { error: updateErr } = await db
    .from('import_jobs')
    .update({ reconciliation_data: reconciliationData })
    .eq('id', id)
    .eq('org_id', job.org_id);

  if (updateErr) {
    console.error('[reconciliation POST] Failed to cache reconciliation data:', updateErr);
  }

  return jsonOk({ report: reconciliationData });
}
