// lib/import/rollback.ts
// Full and partial rollback of an import using the audit log

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LoadPhase } from './loader';
import { ImportAuditor } from './auditor';

export type RollbackScope = 'full' | LoadPhase;

export interface RollbackResult {
  scope: RollbackScope;
  recordsReverted: number;
  recordsSkipped: number;
  errors: Array<{ recordId: string; table: string; message: string }>;
  durationMs: number;
}

interface AuditLogRow {
  id: string;
  table_name: string;
  operation: string;
  record_id: string;
  staging_table: string | null;
  staging_row_id: string | null;
  data_snapshot: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  } | null;
  created_at: string;
}

// Maps LoadPhase → production table(s) for filtering audit log
const PHASE_TABLES: Record<LoadPhase, string[]> = {
  investees: ['investees'],
  holdings: ['holdings'],
  users: ['profiles', 'portfolio_members'],
  contributions: ['tax_contributions', 'holding_contributions'],
  metrics: ['metric_facts'],
};

const STAGING_TABLES: Record<LoadPhase, string> = {
  investees: 'staging_import_investees',
  holdings: 'staging_import_holdings',
  users: 'staging_import_users',
  contributions: 'staging_import_contributions',
  metrics: 'staging_import_metrics',
};

export async function rollbackImport(
  supabase: SupabaseClient,
  importJobId: string,
  scope: RollbackScope = 'full'
): Promise<RollbackResult> {
  const startTime = Date.now();
  const result: RollbackResult = {
    scope,
    recordsReverted: 0,
    recordsSkipped: 0,
    errors: [],
    durationMs: 0,
  };

  const auditor = new ImportAuditor(supabase, importJobId);

  try {
    // Determine which production tables to revert
    let tablesToRevert: string[];
    if (scope === 'full') {
      tablesToRevert = Object.values(PHASE_TABLES).flat();
    } else {
      tablesToRevert = PHASE_TABLES[scope];
    }

    // Fetch audit entries in reverse chronological order
    const { data: auditEntries, error: auditError } = await supabase
      .from('import_audit_log')
      .select('*')
      .eq('import_job_id', importJobId)
      .in('operation', ['insert', 'update'])
      .in('table_name', tablesToRevert)
      .order('created_at', { ascending: false });

    if (auditError) {
      throw new Error(`Failed to fetch audit log: ${auditError.message}`);
    }

    const entries = (auditEntries ?? []) as AuditLogRow[];

    // Process in reverse order (last operations undone first)
    for (const entry of entries) {
      try {
        if (entry.operation === 'insert') {
          // Delete the inserted record
          const { error } = await supabase
            .from(entry.table_name)
            .delete()
            .eq('id', entry.record_id);

          if (error) {
            throw new Error(error.message);
          }

          auditor.log({
            tableName: entry.table_name,
            operation: 'rollback',
            recordId: entry.record_id,
            stagingTable: entry.staging_table ?? undefined,
            stagingRowId: entry.staging_row_id ?? undefined,
          });
          result.recordsReverted++;
        } else if (entry.operation === 'update') {
          // Restore previous state
          const dataBefore = entry.data_snapshot?.before;
          if (!dataBefore) {
            result.recordsSkipped++;
            continue;
          }

          // Remove metadata fields that shouldn't be set directly
          const restorePayload = { ...dataBefore };
          delete restorePayload.id;
          delete restorePayload.created_at;

          const { error } = await supabase
            .from(entry.table_name)
            .update(restorePayload)
            .eq('id', entry.record_id);

          if (error) {
            throw new Error(error.message);
          }

          auditor.log({
            tableName: entry.table_name,
            operation: 'rollback',
            recordId: entry.record_id,
            stagingTable: entry.staging_table ?? undefined,
            stagingRowId: entry.staging_row_id ?? undefined,
            dataAfter: dataBefore,
          });
          result.recordsReverted++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push({ recordId: entry.record_id, table: entry.table_name, message });
        // Continue rolling back other records on error
      }
    }

    // Reset staging rows
    if (scope === 'full') {
      // Reset all staging tables
      for (const stagingTable of Object.values(STAGING_TABLES)) {
        await supabase
          .from(stagingTable)
          .update({ action_taken: 'pending', final_id: null })
          .eq('import_job_id', importJobId);
      }
      // Also reset contribution-specific final IDs
      await supabase
        .from('staging_import_contributions')
        .update({ action_taken: 'pending', final_tax_contribution_id: null, final_holding_contribution_id: null })
        .eq('import_job_id', importJobId);
      // Reset users staging table
      await supabase
        .from('staging_import_users')
        .update({ action_taken: 'pending', final_profile_id: null })
        .eq('import_job_id', importJobId);

      // Update job status
      await supabase
        .from('import_jobs')
        .update({
          status: 'rolled_back',
          records_loaded: 0,
          records_failed: 0,
          pause_reason: null,
          reconciliation_data: null,
        })
        .eq('id', importJobId);
    } else {
      // Partial rollback — reset only this phase's staging table
      const stagingTable = STAGING_TABLES[scope];
      const updateFields: Record<string, unknown> = { action_taken: 'pending' };

      if (scope === 'contributions') {
        updateFields.final_tax_contribution_id = null;
        updateFields.final_holding_contribution_id = null;
      } else if (scope === 'users') {
        updateFields.final_profile_id = null;
      } else {
        updateFields.final_id = null;
      }

      await supabase
        .from(stagingTable)
        .update(updateFields)
        .eq('import_job_id', importJobId);

      // Set job back to paused (partial rollback allows re-loading)
      await supabase
        .from('import_jobs')
        .update({ status: 'paused', pause_reason: `Partial rollback: ${scope} reverted.` })
        .eq('id', importJobId);
    }
  } finally {
    await auditor.close();
    result.durationMs = Date.now() - startTime;
  }

  return result;
}
