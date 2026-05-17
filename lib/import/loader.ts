// lib/import/loader.ts
// Loads validated staging data into production tables in FK dependency order

import type { SupabaseClient } from '@supabase/supabase-js';
import { ImportProgressEmitter } from './progress-emitter';
import { ImportAuditor } from './auditor';

export type LoadPhase = 'donors' | 'investees' | 'holdings' | 'contributions' | 'metrics';

// Dependency order — MUST load in this sequence to satisfy FKs
export const LOAD_ORDER: LoadPhase[] = ['investees', 'donors', 'holdings', 'contributions', 'metrics'];

export interface LoadResult {
  phase: LoadPhase;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ rowId: string; message: string }>;
}

export interface LoadOptions {
  batchSize?: number;
  upsertMode?: 'insert_only' | 'upsert';
  dryRun?: boolean;
}

// Staging row shape (minimal fields needed for loading)
interface StagingRow {
  id: string;
  import_job_id: string;
  transformed_data: Record<string, unknown> | null;
  validation_status: string;
  action_taken: string;
  final_id?: string | null;
}

interface StagingInvesteeRow extends StagingRow {
  matched_charity_id?: string | null;
}

export async function loadStagingToProduction(
  supabase: SupabaseClient,
  importJobId: string,
  options?: LoadOptions
): Promise<LoadResult[]> {
  const batchSize = options?.batchSize ?? 500;
  const dryRun = options?.dryRun ?? false;

  const auditor = new ImportAuditor(supabase, importJobId);
  const results: LoadResult[] = [];
  const loadingStartMs = Date.now();
  const phaseTimings: Record<string, number> = {};

  try {
    for (const phase of LOAD_ORDER) {
      const phaseStart = Date.now();
      const result = await loadPhase(supabase, importJobId, phase, batchSize, dryRun, auditor);
      phaseTimings[phase] = Date.now() - phaseStart;
      results.push(result);

      const phaseMs = phaseTimings[phase] ?? 0;
      console.log(`[loader] ${phase}: ${result.inserted} inserted, ${result.updated} updated, ${result.failed} failed in ${phaseMs}ms`);

      // Emit phase-complete progress
      ImportProgressEmitter.emit(importJobId, {
        type: 'loading',
        entity: phase,
        processed: result.inserted + result.updated + result.skipped + result.failed,
        message: `Loaded ${phase}: ${result.inserted} inserted, ${result.updated} updated, ${result.failed} failed`,
      });
    }
  } finally {
    await auditor.close();
  }

  // Store performance metrics in reconciliation_data
  const totalMs = Date.now() - loadingStartMs;
  const totalLoaded = results.reduce((sum, r) => sum + r.inserted + r.updated, 0);
  const rowsPerSecond = totalMs > 0 ? Math.round((totalLoaded / totalMs) * 1000) : 0;

  try {
    const { data: currentJob } = await supabase
      .from('import_jobs')
      .select('reconciliation_data')
      .eq('id', importJobId)
      .single();

    const existingRecon = (currentJob?.reconciliation_data as Record<string, unknown>) ?? {};
    await supabase
      .from('import_jobs')
      .update({
        reconciliation_data: {
          ...existingRecon,
          performance: {
            loading_ms: totalMs,
            phase_timings_ms: phaseTimings,
            rows_per_second: rowsPerSecond,
            total_loaded: totalLoaded,
          },
        },
      })
      .eq('id', importJobId);
  } catch {
    // non-critical
  }

  return results;
}

async function loadPhase(
  supabase: SupabaseClient,
  importJobId: string,
  phase: LoadPhase,
  batchSize: number,
  dryRun: boolean,
  auditor: ImportAuditor
): Promise<LoadResult> {
  const result: LoadResult = {
    phase,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const stagingTable = getStagingTable(phase);
  let lastId = '';
  let hasMore = true;

  while (hasMore) {
    const { data: rows, error: fetchError } = await supabase
      .from(stagingTable)
      .select('*')
      .eq('import_job_id', importJobId)
      .in('validation_status', ['valid', 'warning'])
      .eq('action_taken', 'pending')
      .gt('id', lastId)
      .order('id')
      .limit(batchSize);

    if (fetchError) {
      console.error(`[loader] Error fetching ${stagingTable}:`, fetchError.message);
      break;
    }

    if (!rows || rows.length === 0) {
      hasMore = false;
      break;
    }

    // Process each row in the batch
    for (const row of rows as StagingRow[]) {
      try {
        const outcome = await processRow(supabase, phase, row as StagingInvesteeRow, dryRun, importJobId, auditor);
        if (outcome === 'insert') result.inserted++;
        else if (outcome === 'update') result.updated++;
        else result.skipped++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.failed++;
        result.errors.push({ rowId: row.id, message });
        auditor.log({
          tableName: getProductionTable(phase),
          operation: 'error',
          recordId: row.id,
          stagingTable,
          stagingRowId: row.id,
          errorMessage: message,
        });
        if (!dryRun) {
          await supabase
            .from(stagingTable)
            .update({ action_taken: 'error' })
            .eq('id', row.id);
        }
      }
    }

    // Update import_jobs counters
    if (!dryRun) {
      const { data: currentJob } = await supabase
        .from('import_jobs')
        .select('records_loaded, records_failed')
        .eq('id', importJobId)
        .single();

      if (currentJob) {
        await supabase
          .from('import_jobs')
          .update({
            records_loaded: (currentJob.records_loaded ?? 0) + result.inserted + result.updated,
            records_failed: (currentJob.records_failed ?? 0) + result.failed,
          })
          .eq('id', importJobId);
      }
    }

    // Emit batch progress
    ImportProgressEmitter.emit(importJobId, {
      type: 'loading',
      entity: phase,
      processed: result.inserted + result.updated + result.skipped + result.failed,
      message: `Loading ${phase} batch after id ${lastId}`,
    });

    lastId = rows[rows.length - 1].id;
    hasMore = rows.length === batchSize;
  }

  return result;
}

async function processRow(
  supabase: SupabaseClient,
  phase: LoadPhase,
  row: StagingInvesteeRow,
  dryRun: boolean,
  importJobId: string,
  auditor: ImportAuditor
): Promise<'insert' | 'update' | 'skip'> {
  const data = row.transformed_data ?? {};
  const stagingTable = getStagingTable(phase);

  switch (phase) {
    case 'investees':
      return processInvestee(supabase, row, data, dryRun, auditor, stagingTable);
    case 'holdings':
      return processHolding(supabase, row, data, dryRun, importJobId, auditor, stagingTable);
    case 'donors':
      return processDonor(supabase, row, data, dryRun, auditor, stagingTable);
    case 'contributions':
      return processContribution(supabase, row, data, dryRun, importJobId, auditor, stagingTable);
    case 'metrics':
      return processMetric(supabase, row, data, dryRun, importJobId, auditor, stagingTable);
  }
}

// ─── Phase: investees ───────────────────────────────────────────────────────

async function processInvestee(
  supabase: SupabaseClient,
  row: StagingInvesteeRow,
  data: Record<string, unknown>,
  dryRun: boolean,
  auditor: ImportAuditor,
  stagingTable: string
): Promise<'insert' | 'update' | 'skip'> {
  const ein = data.ein as string | null;
  const displayName = data.display_name as string | null;
  const country = (data.country as string | null) ?? 'US';
  const charityId = row.matched_charity_id ?? (data._enrichment as Record<string, unknown> | null)?.charity_id as string | null;

  if (!displayName) return 'skip';

  // Find existing investee
  let existingId: string | null = null;

  if (ein) {
    const { data: existing } = await supabase
      .from('investees')
      .select('id')
      .eq('ein', ein)
      .maybeSingle();
    existingId = existing?.id ?? null;
  }

  if (!existingId && displayName) {
    const { data: existing } = await supabase
      .from('investees')
      .select('id')
      .ilike('display_name', displayName)
      .eq('country', country)
      .maybeSingle();
    existingId = existing?.id ?? null;
  }

  if (dryRun) return existingId ? 'update' : 'insert';

  const investeePayload: Record<string, unknown> = {
    display_name: displayName,
    country,
  };
  if (ein) investeePayload.ein = ein;
  if (charityId) investeePayload.charity_id = charityId;
  for (const [k, v] of Object.entries(data)) {
    if (!['display_name', 'country', 'ein', '_enrichment'].includes(k)) {
      investeePayload[k] = v;
    }
  }

  if (existingId) {
    const { data: before } = await supabase.from('investees').select('*').eq('id', existingId).single();
    await supabase.from('investees').update(investeePayload).eq('id', existingId);
    const { data: after } = await supabase.from('investees').select('*').eq('id', existingId).single();
    auditor.log({
      tableName: 'investees',
      operation: 'update',
      recordId: existingId,
      stagingTable,
      stagingRowId: row.id,
      dataBefore: before ?? undefined,
      dataAfter: after ?? undefined,
    });
    await supabase
      .from('staging_import_investees')
      .update({ action_taken: 'update', final_id: existingId })
      .eq('id', row.id);
    return 'update';
  } else {
    const { data: inserted, error } = await supabase
      .from('investees')
      .insert(investeePayload)
      .select('*')
      .single();
    if (error) throw new Error(`investee insert failed: ${error.message}`);
    auditor.log({
      tableName: 'investees',
      operation: 'insert',
      recordId: inserted.id,
      stagingTable,
      stagingRowId: row.id,
      dataAfter: inserted,
    });
    await supabase
      .from('staging_import_investees')
      .update({ action_taken: 'create', final_id: inserted.id })
      .eq('id', row.id);
    return 'insert';
  }
}

// ─── Phase: holdings ────────────────────────────────────────────────────────

async function processHolding(
  supabase: SupabaseClient,
  row: StagingRow,
  data: Record<string, unknown>,
  dryRun: boolean,
  importJobId: string,
  auditor: ImportAuditor,
  stagingTable: string
): Promise<'insert' | 'update' | 'skip'> {
  const name = data.name as string | null;
  const portfolioId = data.portfolio_id as string | null;
  const investeeDisplayName = data.investee_name as string | null;

  if (!name || !portfolioId) return 'skip';

  // Resolve investee_id from staging
  let investeeId: string | null = data.investee_id as string | null;
  if (!investeeId && investeeDisplayName) {
    const { data: stagingInvestee } = await supabase
      .from('staging_import_investees')
      .select('final_id')
      .eq('import_job_id', importJobId)
      .ilike('transformed_data->>display_name', investeeDisplayName)
      .maybeSingle();
    investeeId = stagingInvestee?.final_id ?? null;
  }

  // Find existing holding
  const { data: existing } = await supabase
    .from('holdings')
    .select('id')
    .eq('portfolio_id', portfolioId)
    .ilike('name', name)
    .maybeSingle();
  const existingId = existing?.id ?? null;

  if (dryRun) return existingId ? 'update' : 'insert';

  const payload: Record<string, unknown> = { name, portfolio_id: portfolioId };
  if (investeeId) payload.investee_id = investeeId;
  for (const [k, v] of Object.entries(data)) {
    if (!['name', 'portfolio_id', 'investee_id', 'investee_name', '_enrichment'].includes(k)) {
      payload[k] = v;
    }
  }

  if (existingId) {
    const { data: before } = await supabase.from('holdings').select('*').eq('id', existingId).single();
    await supabase.from('holdings').update(payload).eq('id', existingId);
    const { data: after } = await supabase.from('holdings').select('*').eq('id', existingId).single();
    auditor.log({ tableName: 'holdings', operation: 'update', recordId: existingId, stagingTable, stagingRowId: row.id, dataBefore: before ?? undefined, dataAfter: after ?? undefined });
    await supabase.from('staging_import_holdings').update({ action_taken: 'update', final_id: existingId }).eq('id', row.id);
    return 'update';
  } else {
    const { data: inserted, error } = await supabase.from('holdings').insert(payload).select('*').single();
    if (error) throw new Error(`holding insert failed: ${error.message}`);
    auditor.log({ tableName: 'holdings', operation: 'insert', recordId: inserted.id, stagingTable, stagingRowId: row.id, dataAfter: inserted });
    await supabase.from('staging_import_holdings').update({ action_taken: 'create', final_id: inserted.id }).eq('id', row.id);
    return 'insert';
  }
}

// ─── Phase: donors ───────────────────────────────────────────────────────────

async function processDonor(
  supabase: SupabaseClient,
  row: StagingRow,
  data: Record<string, unknown>,
  dryRun: boolean,
  auditor: ImportAuditor,
  stagingTable: string
): Promise<'insert' | 'update' | 'skip'> {
  const displayName = data.display_name as string | null;
  const email = data.email as string | null;
  const orgId = data.org_id as string | null;
  const existingId = (row as any).matched_existing_id as string | null;

  if (!displayName && !email) return 'skip';
  if (!orgId) return 'skip';

  if (dryRun) return existingId ? 'update' : 'insert';

  if (existingId) {
    const { error } = await supabase
      .from('donors')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', existingId);
    if (error) throw new Error(`donor update failed: ${error.message}`);
    auditor.log({ tableName: 'donors', operation: 'update', recordId: existingId, stagingTable, stagingRowId: row.id });
    await supabase.from('staging_import_donors').update({ action_taken: 'update', final_id: existingId }).eq('id', row.id);
    return 'update';
  } else {
    const { data: inserted, error } = await supabase
      .from('donors')
      .insert({ org_id: orgId, display_name: displayName, email, ...data })
      .select('id')
      .single();
    if (error) throw new Error(`donor insert failed: ${error.message}`);
    auditor.log({ tableName: 'donors', operation: 'insert', recordId: inserted.id, stagingTable, stagingRowId: row.id, dataAfter: inserted });
    await supabase.from('staging_import_donors').update({ action_taken: 'create', final_id: inserted.id }).eq('id', row.id);
    return 'insert';
  }
}

// ─── Phase: contributions ───────────────────────────────────────────────────

async function processContribution(
  supabase: SupabaseClient,
  row: StagingRow,
  data: Record<string, unknown>,
  dryRun: boolean,
  importJobId: string,
  auditor: ImportAuditor,
  stagingTable: string
): Promise<'insert' | 'update' | 'skip'> {
  const portfolioId = data.portfolio_id as string | null;
  const contributionDate = data.contribution_date as string | null;
  const amountUsd = data.amount_usd as number | null;
  const recipientName = data.recipient_name as string | null;
  const holdingName = data.holding_name as string | null;

  if (!portfolioId || !contributionDate || amountUsd == null) return 'skip';

  // Resolve holding_id from staging
  let holdingId: string | null = data.holding_id as string | null;
  if (!holdingId && holdingName) {
    const { data: stagingHolding } = await supabase
      .from('staging_import_holdings')
      .select('final_id')
      .eq('import_job_id', importJobId)
      .ilike('transformed_data->>name', holdingName)
      .maybeSingle();
    holdingId = stagingHolding?.final_id ?? null;
  }

  // Dedup check on tax_contributions
  const { data: existing } = await supabase
    .from('tax_contributions')
    .select('id')
    .eq('portfolio_id', portfolioId)
    .eq('contribution_date', contributionDate)
    .eq('amount_usd', amountUsd)
    .ilike('recipient_name', recipientName ?? '')
    .maybeSingle();
  const existingTaxId = existing?.id ?? null;

  if (dryRun) return existingTaxId ? 'update' : 'insert';

  const taxPayload: Record<string, unknown> = {
    portfolio_id: portfolioId,
    contribution_date: contributionDate,
    amount_usd: amountUsd,
    recipient_name: recipientName,
  };
  for (const [k, v] of Object.entries(data)) {
    if (!['portfolio_id', 'contribution_date', 'amount_usd', 'recipient_name', 'holding_id', 'holding_name', '_enrichment'].includes(k)) {
      taxPayload[k] = v;
    }
  }

  let taxContributionId: string;
  let outcome: 'insert' | 'update';

  if (existingTaxId) {
    const { data: before } = await supabase.from('tax_contributions').select('*').eq('id', existingTaxId).single();
    await supabase.from('tax_contributions').update(taxPayload).eq('id', existingTaxId);
    const { data: after } = await supabase.from('tax_contributions').select('*').eq('id', existingTaxId).single();
    auditor.log({ tableName: 'tax_contributions', operation: 'update', recordId: existingTaxId, stagingTable, stagingRowId: row.id, dataBefore: before ?? undefined, dataAfter: after ?? undefined });
    taxContributionId = existingTaxId;
    outcome = 'update';
  } else {
    const { data: inserted, error } = await supabase.from('tax_contributions').insert(taxPayload).select('*').single();
    if (error) throw new Error(`tax_contribution insert failed: ${error.message}`);
    auditor.log({ tableName: 'tax_contributions', operation: 'insert', recordId: inserted.id, stagingTable, stagingRowId: row.id, dataAfter: inserted });
    taxContributionId = inserted.id;
    outcome = 'insert';
  }

  // Also insert into holding_contributions if holding resolved
  let holdingContributionId: string | null = null;
  if (holdingId) {
    const { data: hc, error: hcError } = await supabase
      .from('holding_contributions')
      .insert({ holding_id: holdingId, tax_contribution_id: taxContributionId, amount_usd: amountUsd })
      .select('id')
      .single();
    if (!hcError && hc) holdingContributionId = hc.id;
  }

  await supabase
    .from('staging_import_contributions')
    .update({
      action_taken: outcome === 'insert' ? 'create' : 'update',
      final_tax_contribution_id: taxContributionId,
      final_holding_contribution_id: holdingContributionId,
    })
    .eq('id', row.id);

  return outcome;
}

// ─── Phase: metrics ──────────────────────────────────────────────────────────

async function processMetric(
  supabase: SupabaseClient,
  row: StagingRow,
  data: Record<string, unknown>,
  dryRun: boolean,
  importJobId: string,
  auditor: ImportAuditor,
  stagingTable: string
): Promise<'insert' | 'update' | 'skip'> {
  const metricCode = data.metric_code as string | null;
  const holdingName = data.holding_name as string | null;
  const periodStart = data.period_start as string | null;

  if (!metricCode) return 'skip';

  // Ensure metric_code exists
  const { data: metric } = await supabase
    .from('metrics')
    .select('id')
    .eq('code', metricCode)
    .maybeSingle();
  if (!metric) return 'skip'; // Unknown metric code

  // Resolve holding_id from staging
  let holdingId: string | null = data.holding_id as string | null;
  if (!holdingId && holdingName) {
    const { data: stagingHolding } = await supabase
      .from('staging_import_holdings')
      .select('final_id')
      .eq('import_job_id', importJobId)
      .ilike('transformed_data->>name', holdingName)
      .maybeSingle();
    holdingId = stagingHolding?.final_id ?? null;
  }

  if (!holdingId) return 'skip';

  // Find existing metric_fact
  const { data: existing } = await supabase
    .from('metric_facts')
    .select('id')
    .eq('holding_id', holdingId)
    .eq('metric_code', metricCode)
    .eq('period_start', periodStart ?? '')
    .maybeSingle();
  const existingId = existing?.id ?? null;

  if (dryRun) return existingId ? 'update' : 'insert';

  const payload: Record<string, unknown> = {
    holding_id: holdingId,
    metric_code: metricCode,
    period_start: periodStart,
  };
  for (const [k, v] of Object.entries(data)) {
    if (!['holding_id', 'holding_name', 'metric_code', 'period_start', '_enrichment'].includes(k)) {
      payload[k] = v;
    }
  }

  if (existingId) {
    const { data: before } = await supabase.from('metric_facts').select('*').eq('id', existingId).single();
    await supabase.from('metric_facts').update(payload).eq('id', existingId);
    const { data: after } = await supabase.from('metric_facts').select('*').eq('id', existingId).single();
    auditor.log({ tableName: 'metric_facts', operation: 'update', recordId: existingId, stagingTable, stagingRowId: row.id, dataBefore: before ?? undefined, dataAfter: after ?? undefined });
    await supabase.from('staging_import_metrics').update({ action_taken: 'update', final_id: existingId }).eq('id', row.id);
    return 'update';
  } else {
    const { data: inserted, error } = await supabase.from('metric_facts').insert(payload).select('*').single();
    if (error) throw new Error(`metric_fact insert failed: ${error.message}`);
    auditor.log({ tableName: 'metric_facts', operation: 'insert', recordId: inserted.id, stagingTable, stagingRowId: row.id, dataAfter: inserted });
    await supabase.from('staging_import_metrics').update({ action_taken: 'create', final_id: inserted.id }).eq('id', row.id);
    return 'insert';
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStagingTable(phase: LoadPhase): string {
  const map: Record<LoadPhase, string> = {
    donors: 'staging_import_donors',
    investees: 'staging_import_investees',
    holdings: 'staging_import_holdings',
    contributions: 'staging_import_contributions',
    metrics: 'staging_import_metrics',
  };
  return map[phase];
}

function getProductionTable(phase: LoadPhase): string {
  const map: Record<LoadPhase, string> = {
    donors: 'donors',
    investees: 'investees',
    holdings: 'holdings',
    contributions: 'contributions_received',
    metrics: 'metric_facts',
  };
  return map[phase];
}
