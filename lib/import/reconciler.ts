// lib/import/reconciler.ts
// Compares staging source data vs loaded production data to detect discrepancies

import type { DynamicImportClient as SupabaseClient } from '@/lib/database-client';
import { fromImportRelation } from './database';

export interface EntityReconciliation {
  entity: string;
  sourceCount: number;
  loadedCount: number;
  skippedCount: number;
  failedCount: number;
  matchRate: number;
  sourceTotalAmount?: number;
  loadedTotalAmount?: number;
  amountDelta?: number;
  amountDeltaPercent?: number;
  missingIds: string[];
  duplicateWarnings: string[];
  withinTolerance: boolean;
}

export interface ReconciliationReport {
  importJobId: string;
  generatedAt: string;
  overallSuccess: boolean;
  entities: EntityReconciliation[];
  summary: string;
  actionItems: string[];
}

export async function generateReconciliationReport(
  supabase: SupabaseClient,
  importJobId: string,
  tolerancePercent: number = 1
): Promise<ReconciliationReport> {
  const entities: EntityReconciliation[] = [];

  const [donors, investees, holdings, contributions, metrics] = await Promise.all([
    reconcileDonors(supabase, importJobId, tolerancePercent),
    reconcileInvestees(supabase, importJobId, tolerancePercent),
    reconcileHoldings(supabase, importJobId, tolerancePercent),
    reconcileContributions(supabase, importJobId, tolerancePercent),
    reconcileMetrics(supabase, importJobId, tolerancePercent),
  ]);

  entities.push(donors, investees, holdings, contributions, metrics);

  const overallSuccess = entities.every((e) => e.withinTolerance);
  const actionItems: string[] = [];

  for (const entity of entities) {
    if (!entity.withinTolerance) {
      actionItems.push(
        `${entity.entity}: match rate ${(entity.matchRate * 100).toFixed(1)}% is below threshold (${100 - tolerancePercent}%). ${entity.failedCount} rows failed.`
      );
    }
    if (entity.amountDelta && entity.amountDelta > 0) {
      actionItems.push(
        `${entity.entity}: amount delta of $${entity.amountDelta.toFixed(2)} detected (${entity.amountDeltaPercent?.toFixed(2)}% variance).`
      );
    }
    if (entity.missingIds.length > 0) {
      actionItems.push(
        `${entity.entity}: ${entity.missingIds.length} staging rows have no final_id. Sample: ${entity.missingIds.slice(0, 3).join(', ')}`
      );
    }
  }

  const totalSource = entities.reduce((s, e) => s + e.sourceCount, 0);
  const totalLoaded = entities.reduce((s, e) => s + e.loadedCount, 0);
  const summary = overallSuccess
    ? `All ${entities.length} entity types reconciled successfully. ${totalLoaded} of ${totalSource} eligible rows loaded.`
    : `Reconciliation found discrepancies in ${entities.filter((e) => !e.withinTolerance).length} entity type(s). ${totalLoaded} of ${totalSource} rows loaded. Review action items.`;

  return {
    importJobId,
    generatedAt: new Date().toISOString(),
    overallSuccess,
    entities,
    summary,
    actionItems,
  };
}

// ─── Entity reconcilers ───────────────────────────────────────────────────────

async function reconcileDonors(
  supabase: SupabaseClient,
  importJobId: string,
  tolerancePercent: number
): Promise<EntityReconciliation> {
  return reconcileSimpleEntity(supabase, importJobId, 'donors', 'staging_import_donors', 'final_id', tolerancePercent);
}

async function reconcileInvestees(
  supabase: SupabaseClient,
  importJobId: string,
  tolerancePercent: number
): Promise<EntityReconciliation> {
  return reconcileSimpleEntity(supabase, importJobId, 'investees', 'staging_import_investees', 'final_id', tolerancePercent);
}

async function reconcileHoldings(
  supabase: SupabaseClient,
  importJobId: string,
  tolerancePercent: number
): Promise<EntityReconciliation> {
  return reconcileSimpleEntity(supabase, importJobId, 'holdings', 'staging_import_holdings', 'final_id', tolerancePercent);
}

async function reconcileMetrics(
  supabase: SupabaseClient,
  importJobId: string,
  tolerancePercent: number
): Promise<EntityReconciliation> {
  return reconcileSimpleEntity(supabase, importJobId, 'metrics', 'staging_import_metrics', 'final_id', tolerancePercent);
}

async function reconcileSimpleEntity(
  supabase: SupabaseClient,
  importJobId: string,
  entity: string,
  stagingTable: string,
  finalIdColumn: string,
  tolerancePercent: number
): Promise<EntityReconciliation> {
  const { count: sourceCount } = await fromImportRelation(supabase, stagingTable)
    .select('*', { count: 'exact', head: true })
    .eq('import_job_id', importJobId)
    .in('validation_status', ['valid', 'warning']);

  const { count: loadedCount } = await fromImportRelation(supabase, stagingTable)
    .select('*', { count: 'exact', head: true })
    .eq('import_job_id', importJobId)
    .in('action_taken', ['create', 'update']);

  const { count: skippedCount } = await fromImportRelation(supabase, stagingTable)
    .select('*', { count: 'exact', head: true })
    .eq('import_job_id', importJobId)
    .eq('action_taken', 'skip');

  const { count: failedCount } = await fromImportRelation(supabase, stagingTable)
    .select('*', { count: 'exact', head: true })
    .eq('import_job_id', importJobId)
    .eq('action_taken', 'error');

  // Missing: rows with no final_id, not skipped
  const { data: missingRows } = await fromImportRelation(supabase, stagingTable)
    .select('id')
    .eq('import_job_id', importJobId)
    .in('validation_status', ['valid', 'warning'])
    .is(finalIdColumn, null)
    .neq('action_taken', 'skip')
    .limit(10);

  const src = sourceCount ?? 0;
  const loaded = loadedCount ?? 0;
  const matchRate = src > 0 ? loaded / src : 1;
  const threshold = 1 - tolerancePercent / 100;

  return {
    entity,
    sourceCount: src,
    loadedCount: loaded,
    skippedCount: skippedCount ?? 0,
    failedCount: failedCount ?? 0,
    matchRate,
    missingIds: (missingRows ?? []).map((r: { id: string }) => r.id),
    duplicateWarnings: [],
    withinTolerance: matchRate >= threshold,
  };
}

async function reconcileContributions(
  supabase: SupabaseClient,
  importJobId: string,
  tolerancePercent: number
): Promise<EntityReconciliation> {
  const { count: sourceCount } = await supabase
    .from('staging_import_contributions')
    .select('*', { count: 'exact', head: true })
    .eq('import_job_id', importJobId)
    .in('validation_status', ['valid', 'warning']);

  const { count: loadedCount } = await supabase
    .from('staging_import_contributions')
    .select('*', { count: 'exact', head: true })
    .eq('import_job_id', importJobId)
    .in('action_taken', ['create', 'update']);

  const { count: skippedCount } = await supabase
    .from('staging_import_contributions')
    .select('*', { count: 'exact', head: true })
    .eq('import_job_id', importJobId)
    .eq('action_taken', 'skip');

  const { count: failedCount } = await supabase
    .from('staging_import_contributions')
    .select('*', { count: 'exact', head: true })
    .eq('import_job_id', importJobId)
    .eq('action_taken', 'error');

  const sourceTotalAmount = await sumStagedContributionAmounts(supabase, importJobId);

  // Loaded amount total from contributions_received
  const { data: loadedIds } = await supabase
    .from('staging_import_contributions')
    .select('final_contribution_id')
    .eq('import_job_id', importJobId)
    .in('action_taken', ['create', 'update'])
    .not('final_contribution_id', 'is', null);

  const contributionIds = (loadedIds ?? [])
    .map((r: { final_contribution_id: string | null }) => r.final_contribution_id)
    .filter(Boolean) as string[];

  let loadedTotalAmount = 0;
  if (contributionIds.length > 0) {
    // Chunk to avoid PostgREST URL limits
    const chunkSize = 500;
    for (let i = 0; i < contributionIds.length; i += chunkSize) {
      const chunk = contributionIds.slice(i, i + chunkSize);
      const { data: contributionRows } = await supabase
        .from('contributions_received')
        .select('amount')
        .in('id', chunk);
      loadedTotalAmount += (contributionRows ?? []).reduce(
        (sum: number, r: { amount: number | null }) => sum + (r.amount ?? 0),
        0
      );
    }
  }

  const amountDelta = Math.abs(sourceTotalAmount - loadedTotalAmount);
  const amountDeltaPercent = sourceTotalAmount > 0 ? (amountDelta / sourceTotalAmount) * 100 : 0;

  // Missing IDs
  const { data: missingRows } = await supabase
    .from('staging_import_contributions')
    .select('id')
    .eq('import_job_id', importJobId)
    .in('validation_status', ['valid', 'warning'])
    .is('final_contribution_id', null)
    .neq('action_taken', 'skip')
    .limit(10);

  const src = sourceCount ?? 0;
  const loaded = loadedCount ?? 0;
  const matchRate = src > 0 ? loaded / src : 1;
  const threshold = 1 - tolerancePercent / 100;
  const amountWithinTolerance = amountDeltaPercent <= tolerancePercent;

  return {
    entity: 'contributions',
    sourceCount: src,
    loadedCount: loaded,
    skippedCount: skippedCount ?? 0,
    failedCount: failedCount ?? 0,
    matchRate,
    sourceTotalAmount,
    loadedTotalAmount,
    amountDelta,
    amountDeltaPercent,
    missingIds: (missingRows ?? []).map((r: { id: string }) => r.id),
    duplicateWarnings: [],
    withinTolerance: matchRate >= threshold && amountWithinTolerance,
  };
}

async function sumStagedContributionAmounts(
  supabase: SupabaseClient,
  importJobId: string
): Promise<number> {
  const PAGE_SIZE = 1000;
  let offset = 0;
  let total = 0;

  while (true) {
    const { data: rows, error } = await supabase
      .from('staging_import_contributions')
      .select('transformed_data')
      .eq('import_job_id', importJobId)
      .in('validation_status', ['valid', 'warning'])
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to sum staged contributions: ${error.message}`);
    }

    const page = rows ?? [];
    for (const row of page as Array<{ transformed_data: Record<string, unknown> | null }>) {
      total += coerceAmount(row.transformed_data?.amount ?? row.transformed_data?.amount_usd);
    }

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return total;
}

function coerceAmount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[$,\s]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
