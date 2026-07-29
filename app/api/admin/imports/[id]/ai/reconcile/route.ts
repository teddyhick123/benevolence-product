// app/api/admin/imports/[id]/ai/reconcile/route.ts
// POST: trigger AI reconciliation analysis for an import job

import { NextRequest } from 'next/server';
import { requireAppAdmin } from '@/lib/api/access';
import { createImportOrchestrationRepository } from '@/lib/api/repositories/imports';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { analyzeReconciliation } from '@/lib/import/ai/reconcile';
import type { ReconciliationReport } from '@/lib/import/reconciler';

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
    .select('id, org_id, reconciliation_data')
    .eq('id', id)
    .maybeSingle();

  if (jobError || !job) {
    return jsonError('Import job not found', 404);
  }

  // Use stored report or generate fresh
  let report: ReconciliationReport;
  if (job.reconciliation_data && (job.reconciliation_data as Record<string, unknown>).importJobId) {
    report = job.reconciliation_data as unknown as ReconciliationReport;
  } else {
    const repository = createImportOrchestrationRepository({
      orgId: job.org_id,
      actorId: access.context.user.id,
    });
    report = await repository.generateReconciliation(id);
  }

  // Fetch sample mismatches: staging rows that failed to load
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

  const analysis = await analyzeReconciliation(report, sampleMismatches);

  // Store AI analysis in reconciliation_data
  const updatedReconciliation = {
    ...(report as unknown as Record<string, unknown>),
    ai_analysis: analysis,
  };

  await db
    .from('import_jobs')
    .update({ reconciliation_data: updatedReconciliation })
    .eq('id', id)
    .eq('org_id', job.org_id);

  return jsonOk({ analysis });
}
