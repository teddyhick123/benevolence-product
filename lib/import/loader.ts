// lib/import/loader.ts
// Loads validated staging data into production tables in FK dependency order

import type { DynamicImportClient as SupabaseClient } from '@/lib/database-client';
import { ImportProgressEmitter } from './progress-emitter';
import { ImportAuditor } from './auditor';
import { fromImportStagingRelation } from './database';

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
  org_id: string;
  transformed_data: Record<string, unknown> | null;
  validation_status: string;
  action_taken: string;
  final_id?: string | null;
  matched_existing_id?: string | null;
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
    const { data: rows, error: fetchError } = await fromImportStagingRelation(supabase, stagingTable)
      .select('*')
      .eq('import_job_id', importJobId)
      .in('validation_status', ['valid', 'warning'])
      .eq('action_taken', 'pending')
      .gt('id', lastId)
      .order('id')
      .limit(batchSize);

    if (fetchError) {
      throw new Error(`Error fetching ${stagingTable}: ${fetchError.message}`);
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
          await fromImportStagingRelation(supabase, stagingTable)
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
  const donorPayload = buildDonorPayload(row.org_id, data);
  const email = donorPayload.email as string | null | undefined;
  const externalId = donorPayload.external_id as string | null | undefined;
  let existingId = row.matched_existing_id ?? null;

  if (!donorPayload.first_name && !donorPayload.last_name && !donorPayload.organization_name && !email) {
    return 'skip';
  }

  if (!existingId && externalId) {
    const { data: existing } = await supabase
      .from('donors')
      .select('id')
      .eq('org_id', row.org_id)
      .eq('external_id', externalId)
      .maybeSingle();
    existingId = existing?.id ?? null;
  }

  if (!existingId && email) {
    const { data: existing } = await supabase
      .from('donors')
      .select('id')
      .eq('org_id', row.org_id)
      .ilike('email', email)
      .maybeSingle();
    existingId = existing?.id ?? null;
  }

  if (dryRun) return existingId ? 'update' : 'insert';

  if (existingId) {
    const { data: before } = await supabase.from('donors').select('*').eq('id', existingId).single();
    const { error } = await supabase
      .from('donors')
      .update(donorPayload)
      .eq('id', existingId);
    if (error) throw new Error(`donor update failed: ${error.message}`);
    const { data: after } = await supabase.from('donors').select('*').eq('id', existingId).single();
    auditor.log({
      tableName: 'donors',
      operation: 'update',
      recordId: existingId,
      stagingTable,
      stagingRowId: row.id,
      dataBefore: before ?? undefined,
      dataAfter: after ?? undefined,
    });
    await supabase.from('staging_import_donors').update({ action_taken: 'update', final_id: existingId }).eq('id', row.id);
    return 'update';
  } else {
    const { data: inserted, error } = await supabase
      .from('donors')
      .insert(donorPayload)
      .select('*')
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
  const contributionDate = data.contribution_date as string | null;
  const amount = coerceNumber(data.amount ?? data.amount_usd);
  const donorId = await resolveContributionDonor(
    supabase,
    row.org_id,
    data,
    importJobId,
    auditor,
    stagingTable,
    row.id
  );

  if (!donorId || !contributionDate || amount == null) return 'skip';

  const { data: existing } = await supabase
    .from('contributions_received')
    .select('id')
    .eq('org_id', row.org_id)
    .eq('donor_id', donorId)
    .eq('contribution_date', contributionDate)
    .eq('amount', amount)
    .maybeSingle();
  const existingContributionId = existing?.id ?? null;

  if (dryRun) return existingContributionId ? 'update' : 'insert';

  const contributionPayload = buildContributionPayload(row.org_id, donorId, contributionDate, amount, data);
  let contributionId: string;
  let outcome: 'insert' | 'update';

  if (existingContributionId) {
    const { data: before } = await supabase.from('contributions_received').select('*').eq('id', existingContributionId).single();
    const { error } = await supabase
      .from('contributions_received')
      .update(contributionPayload)
      .eq('id', existingContributionId);
    if (error) throw new Error(`contribution update failed: ${error.message}`);
    const { data: after } = await supabase.from('contributions_received').select('*').eq('id', existingContributionId).single();
    auditor.log({
      tableName: 'contributions_received',
      operation: 'update',
      recordId: existingContributionId,
      stagingTable,
      stagingRowId: row.id,
      dataBefore: before ?? undefined,
      dataAfter: after ?? undefined,
    });
    contributionId = existingContributionId;
    outcome = 'update';
  } else {
    const { data: inserted, error } = await supabase
      .from('contributions_received')
      .insert(contributionPayload)
      .select('*')
      .single();
    if (error) throw new Error(`contribution insert failed: ${error.message}`);
    auditor.log({
      tableName: 'contributions_received',
      operation: 'insert',
      recordId: inserted.id,
      stagingTable,
      stagingRowId: row.id,
      dataAfter: inserted,
    });
    contributionId = inserted.id;
    outcome = 'insert';
  }

  await supabase
    .from('staging_import_contributions')
    .update({
      action_taken: outcome === 'insert' ? 'create' : 'update',
      final_contribution_id: contributionId,
    })
    .eq('id', row.id);

  return outcome;
}

function buildContributionPayload(
  orgId: string,
  donorId: string,
  contributionDate: string,
  amount: number,
  data: Record<string, unknown>
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    org_id: orgId,
    donor_id: donorId,
    contribution_date: contributionDate,
    amount,
    currency: (data.currency as string | null) ?? 'USD',
    gift_type: (data.gift_type ?? data.contribution_type ?? 'cash') as string,
  };

  const optionalFields = [
    'fund_designation',
    'is_restricted',
    'restriction_purpose',
    'quid_pro_quo_value',
    'acknowledged_at',
    'acknowledgment_sent',
    'external_id',
    'source_system',
    'payment_reference',
    'campaign',
    'notes',
    'receipt_url',
  ];
  for (const field of optionalFields) {
    if (data[field] !== undefined) {
      payload[field] = data[field];
    }
  }
  return payload;
}

async function resolveContributionDonor(
  supabase: SupabaseClient,
  orgId: string,
  data: Record<string, unknown>,
  importJobId: string,
  auditor: ImportAuditor,
  stagingTable: string,
  stagingRowId: string
): Promise<string | null> {
  const explicitDonorId = data.donor_id as string | null;
  if (explicitDonorId) return explicitDonorId;

  const donorExternalId = (data.donor_external_id ?? data.external_donor_id) as string | null;
  if (donorExternalId) {
    const { data: donor } = await supabase
      .from('donors')
      .select('id')
      .eq('org_id', orgId)
      .eq('external_id', donorExternalId)
      .maybeSingle();
    if (donor?.id) return donor.id as string;

    const { data: stagedDonor } = await supabase
      .from('staging_import_donors')
      .select('final_id')
      .eq('import_job_id', importJobId)
      .eq('external_id', donorExternalId)
      .maybeSingle();
    if (stagedDonor?.final_id) return stagedDonor.final_id as string;
  }

  const donorEmail = (data.donor_email ?? data.email) as string | null;
  if (donorEmail) {
    const { data: donor } = await supabase
      .from('donors')
      .select('id')
      .eq('org_id', orgId)
      .ilike('email', donorEmail)
      .maybeSingle();
    if (donor?.id) return donor.id as string;
  }

  const donorName = (data.donor_name ?? data.recipient_name) as string | null;
  if (!donorEmail && !donorExternalId && !donorName) return null;

  const donorPayload = buildDonorPayload(orgId, {
    display_name: donorName,
    email: donorEmail,
    external_id: donorExternalId,
    source: data.source_system ?? data.source,
  });
  const { data: inserted, error } = await supabase
    .from('donors')
    .insert(donorPayload)
    .select('*')
    .single();
  if (error) throw new Error(`donor resolution failed: ${error.message}`);
  auditor.log({
    tableName: 'donors',
    operation: 'insert',
    recordId: inserted.id,
    stagingTable,
    stagingRowId,
    dataAfter: inserted,
  });
  return inserted.id as string;
}

function buildDonorPayload(orgId: string, data: Record<string, unknown>): Record<string, unknown> {
  const displayName = (data.display_name ?? data.donor_name ?? data.name) as string | null;
  const organizationName = data.organization_name as string | null;
  const firstName = data.first_name as string | null;
  const lastName = data.last_name as string | null;
  const isOrganization = Boolean(data.is_organization ?? organizationName);
  const payload: Record<string, unknown> = {
    org_id: orgId,
    is_organization: isOrganization,
  };

  if (organizationName) {
    payload.organization_name = organizationName;
    payload.is_organization = true;
  } else if (firstName || lastName) {
    if (firstName) payload.first_name = firstName;
    if (lastName) payload.last_name = lastName;
    if (displayName) payload.preferred_name = displayName;
  } else if (displayName) {
    const parts = displayName.trim().split(/\s+/);
    if (!isOrganization && parts.length >= 2) {
      payload.first_name = parts.slice(0, -1).join(' ');
      payload.last_name = parts[parts.length - 1];
      payload.preferred_name = displayName;
    } else {
      payload.organization_name = displayName;
      payload.is_organization = true;
    }
  }

  const optionalFields = [
    'email',
    'phone',
    'address_line1',
    'address_line2',
    'city',
    'state',
    'zip',
    'country',
    'tier',
    'recency_status',
    'relationship_manager',
    'notes',
    'tags',
    'custom_fields',
    'source',
    'external_id',
  ];
  for (const field of optionalFields) {
    if (data[field] !== undefined) {
      payload[field] = data[field];
    }
  }

  if (data.source_system !== undefined && payload.source === undefined) {
    payload.source = data.source_system;
  }

  return payload;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,\s]/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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
