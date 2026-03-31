// lib/import/loader.ts
// Loads validated staging data into production tables in FK dependency order

import type { SupabaseClient } from '@supabase/supabase-js';
import { ImportProgressEmitter } from './progress-emitter';

export type LoadPhase = 'investees' | 'holdings' | 'users' | 'contributions' | 'metrics';

// Dependency order — MUST load in this sequence to satisfy FKs
export const LOAD_ORDER: LoadPhase[] = ['investees', 'holdings', 'users', 'contributions', 'metrics'];

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

  const results: LoadResult[] = [];

  for (const phase of LOAD_ORDER) {
    const result = await loadPhase(supabase, importJobId, phase, batchSize, dryRun);
    results.push(result);

    // Emit phase-complete progress
    ImportProgressEmitter.emit(importJobId, {
      type: 'loading',
      entity: phase,
      processed: result.inserted + result.updated + result.skipped + result.failed,
      message: `Loaded ${phase}: ${result.inserted} inserted, ${result.updated} updated, ${result.failed} failed`,
    });
  }

  return results;
}

async function loadPhase(
  supabase: SupabaseClient,
  importJobId: string,
  phase: LoadPhase,
  batchSize: number,
  dryRun: boolean
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
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: rows, error: fetchError } = await supabase
      .from(stagingTable)
      .select('*')
      .eq('import_job_id', importJobId)
      .in('validation_status', ['valid', 'warning'])
      .eq('action_taken', 'pending')
      .range(offset, offset + batchSize - 1);

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
        const outcome = await processRow(supabase, phase, row as StagingInvesteeRow, dryRun, importJobId);
        if (outcome === 'insert') result.inserted++;
        else if (outcome === 'update') result.updated++;
        else result.skipped++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.failed++;
        result.errors.push({ rowId: row.id, message });
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
      processed: offset + rows.length,
      message: `Loading ${phase} batch at offset ${offset}`,
    });

    offset += batchSize;
    hasMore = rows.length === batchSize;
  }

  return result;
}

async function processRow(
  supabase: SupabaseClient,
  phase: LoadPhase,
  row: StagingInvesteeRow,
  dryRun: boolean,
  importJobId: string
): Promise<'insert' | 'update' | 'skip'> {
  const data = row.transformed_data ?? {};

  switch (phase) {
    case 'investees':
      return processInvestee(supabase, row, data, dryRun);
    case 'holdings':
      return processHolding(supabase, row, data, dryRun, importJobId);
    case 'users':
      return processUser(supabase, row, data, dryRun, importJobId);
    case 'contributions':
      return processContribution(supabase, row, data, dryRun, importJobId);
    case 'metrics':
      return processMetric(supabase, row, data, dryRun, importJobId);
  }
}

// ─── Phase: investees ───────────────────────────────────────────────────────

async function processInvestee(
  supabase: SupabaseClient,
  row: StagingInvesteeRow,
  data: Record<string, unknown>,
  dryRun: boolean
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
  // Copy other non-internal fields
  for (const [k, v] of Object.entries(data)) {
    if (!['display_name', 'country', 'ein', '_enrichment'].includes(k)) {
      investeePayload[k] = v;
    }
  }

  if (existingId) {
    await supabase.from('investees').update(investeePayload).eq('id', existingId);
    await supabase
      .from('staging_import_investees')
      .update({ action_taken: 'update', final_id: existingId })
      .eq('id', row.id);
    return 'update';
  } else {
    const { data: inserted, error } = await supabase
      .from('investees')
      .insert(investeePayload)
      .select('id')
      .single();
    if (error) throw new Error(`investee insert failed: ${error.message}`);
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
  importJobId: string
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
    await supabase.from('holdings').update(payload).eq('id', existingId);
    await supabase
      .from('staging_import_holdings')
      .update({ action_taken: 'update', final_id: existingId })
      .eq('id', row.id);
    return 'update';
  } else {
    const { data: inserted, error } = await supabase
      .from('holdings')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw new Error(`holding insert failed: ${error.message}`);
    await supabase
      .from('staging_import_holdings')
      .update({ action_taken: 'create', final_id: inserted.id })
      .eq('id', row.id);
    return 'insert';
  }
}

// ─── Phase: users ───────────────────────────────────────────────────────────

async function processUser(
  supabase: SupabaseClient,
  row: StagingRow,
  data: Record<string, unknown>,
  dryRun: boolean,
  importJobId: string
): Promise<'insert' | 'update' | 'skip'> {
  const email = data.email as string | null;
  const displayName = data.display_name as string | null;
  const portfolioId = data.portfolio_id as string | null;
  const role = (data.role as string | null) ?? 'member';

  if (!email && !displayName) return 'skip';

  // Look up existing auth.users by email
  let profileId: string | null = null;

  if (email) {
    const { data: authUsers } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    profileId = authUsers?.id ?? null;
  }

  if (dryRun) return profileId ? 'update' : 'insert';

  if (profileId) {
    // Link to existing profile — add to portfolio_members if needed
    if (portfolioId) {
      await supabase
        .from('portfolio_members')
        .upsert({ profile_id: profileId, portfolio_id: portfolioId, role }, { onConflict: 'profile_id,portfolio_id' });
    }
    await supabase
      .from('staging_import_users')
      .update({ action_taken: 'update', final_profile_id: profileId })
      .eq('id', row.id);
    return 'update';
  } else {
    // Create profile stub
    const profilePayload: Record<string, unknown> = { display_name: displayName };
    if (email) profilePayload.email = email;

    const { data: inserted, error } = await supabase
      .from('profiles')
      .insert(profilePayload)
      .select('id')
      .single();
    if (error) throw new Error(`profile insert failed: ${error.message}`);

    if (portfolioId) {
      await supabase
        .from('portfolio_members')
        .upsert({ profile_id: inserted.id, portfolio_id: portfolioId, role }, { onConflict: 'profile_id,portfolio_id' });
    }

    await supabase
      .from('staging_import_users')
      .update({ action_taken: 'create', final_profile_id: inserted.id })
      .eq('id', row.id);
    return 'insert';
  }
}

// ─── Phase: contributions ───────────────────────────────────────────────────

async function processContribution(
  supabase: SupabaseClient,
  row: StagingRow,
  data: Record<string, unknown>,
  dryRun: boolean,
  importJobId: string
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
    await supabase.from('tax_contributions').update(taxPayload).eq('id', existingTaxId);
    taxContributionId = existingTaxId;
    outcome = 'update';
  } else {
    const { data: inserted, error } = await supabase
      .from('tax_contributions')
      .insert(taxPayload)
      .select('id')
      .single();
    if (error) throw new Error(`tax_contribution insert failed: ${error.message}`);
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
  importJobId: string
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
    await supabase.from('metric_facts').update(payload).eq('id', existingId);
    await supabase
      .from('staging_import_metrics')
      .update({ action_taken: 'update', final_id: existingId })
      .eq('id', row.id);
    return 'update';
  } else {
    const { data: inserted, error } = await supabase
      .from('metric_facts')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw new Error(`metric_fact insert failed: ${error.message}`);
    await supabase
      .from('staging_import_metrics')
      .update({ action_taken: 'create', final_id: inserted.id })
      .eq('id', row.id);
    return 'insert';
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStagingTable(phase: LoadPhase): string {
  const map: Record<LoadPhase, string> = {
    investees: 'staging_import_investees',
    holdings: 'staging_import_holdings',
    users: 'staging_import_users',
    contributions: 'staging_import_contributions',
    metrics: 'staging_import_metrics',
  };
  return map[phase];
}
