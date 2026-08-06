// lib/import/rollback.ts
// Full and partial rollback of an import using the audit log

import type { DynamicImportClient as SupabaseClient } from '@/lib/database-client';
import type { LoadPhase } from './loader';
import { ImportAuditor } from './auditor';
import { fromImportRelation } from './database';

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
  donors: ['donors'],
  investees: ['investees'],
  holdings: ['holdings'],
  contributions: ['contributions_received'],
  metrics: ['metric_facts'],
};

const STAGING_TABLES: Record<LoadPhase, string> = {
  donors: 'staging_import_donors',
  investees: 'staging_import_investees',
  holdings: 'staging_import_holdings',
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

    // Fetch all audit entries with pagination to avoid hard row limits
    const PAGE_SIZE = 1000;
    let offset = 0;
    const entries: AuditLogRow[] = [];
    while (true) {
      const { data: batch, error: auditError } = await supabase
        .from('import_audit_log')
        .select('*')
        .eq('import_job_id', importJobId)
        .in('operation', ['insert', 'update'])
        .in('table_name', tablesToRevert)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (auditError) {
        throw new Error(`Failed to fetch audit log: ${auditError.message}`);
      }

      const page = (batch ?? []) as AuditLogRow[];
      entries.push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    // Group entries by table and operation for bulk processing
    const insertsByTable = new Map<string, AuditLogRow[]>();
    const updatesByTable = new Map<string, AuditLogRow[]>();

    for (const entry of entries) {
      if (entry.operation === 'insert') {
        if (!insertsByTable.has(entry.table_name)) insertsByTable.set(entry.table_name, []);
        insertsByTable.get(entry.table_name)!.push(entry);
      } else if (entry.operation === 'update') {
        if (!updatesByTable.has(entry.table_name)) updatesByTable.set(entry.table_name, []);
        updatesByTable.get(entry.table_name)!.push(entry);
      }
    }

    // Bulk DELETE inserted records per table
    for (const [tableName, tableEntries] of insertsByTable) {
      const ids = tableEntries.map(e => e.record_id);
      const chunkSize = 500;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        try {
          const { error } = await fromImportRelation(supabase, tableName)
            .delete()
            .in('id', chunk);
          if (error) throw new Error(error.message);
          result.recordsReverted += chunk.length;
          for (const entry of tableEntries.slice(i, i + chunkSize)) {
            auditor.log({
              tableName: entry.table_name,
              operation: 'rollback',
              recordId: entry.record_id,
              stagingTable: entry.staging_table ?? undefined,
              stagingRowId: entry.staging_row_id ?? undefined,
            });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          for (const entry of tableEntries.slice(i, i + chunkSize)) {
            result.errors.push({ recordId: entry.record_id, table: tableName, message });
          }
        }
      }
    }

    // Bulk upsert (restore) updated records per table
    for (const [tableName, tableEntries] of updatesByTable) {
      const restorePayloads: Array<Record<string, unknown>> = [];
      const skippedEntries: AuditLogRow[] = [];

      for (const entry of tableEntries) {
        const dataBefore = entry.data_snapshot?.before;
        if (!dataBefore) {
          result.recordsSkipped++;
          skippedEntries.push(entry);
          continue;
        }
        const payload: Record<string, unknown> = { ...dataBefore, id: entry.record_id };
        delete payload['created_at'];
        restorePayloads.push(payload);
      }

      const chunkSize = 500;
      for (let i = 0; i < restorePayloads.length; i += chunkSize) {
        const chunk = restorePayloads.slice(i, i + chunkSize);
        try {
          const { error } = await fromImportRelation(supabase, tableName)
            .upsert(chunk, { onConflict: 'id' });
          if (error) throw new Error(error.message);
          result.recordsReverted += chunk.length;
          for (const entry of tableEntries.slice(i, i + chunkSize)) {
            if (skippedEntries.includes(entry)) continue;
            auditor.log({
              tableName: entry.table_name,
              operation: 'rollback',
              recordId: entry.record_id,
              stagingTable: entry.staging_table ?? undefined,
              stagingRowId: entry.staging_row_id ?? undefined,
              dataAfter: entry.data_snapshot?.before,
            });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          for (const entry of tableEntries.slice(i, i + chunkSize)) {
            result.errors.push({ recordId: entry.record_id, table: tableName, message });
          }
        }
      }
    }

    // Reset staging rows
    if (scope === 'full') {
      for (const stagingTable of Object.values(STAGING_TABLES)) {
        await fromImportRelation(supabase, stagingTable)
          .update({ action_taken: 'pending', final_id: null })
          .eq('import_job_id', importJobId);
      }
      // Contributions have extra final ID columns
      await supabase
        .from('staging_import_contributions')
        .update({ action_taken: 'pending', final_contribution_id: null })
        .eq('import_job_id', importJobId);

      await supabase
        .from('import_jobs')
        .update({
          status: 'rolled_back',
          records_loaded: 0,
          records_failed: 0,
          error_message: null,
          reconciliation_data: null,
        })
        .eq('id', importJobId);
    } else {
      // Partial rollback — reset only this phase's staging table
      const stagingTable = STAGING_TABLES[scope];
      const updateFields: Record<string, unknown> = { action_taken: 'pending' };

      if (scope === 'contributions') {
        updateFields.final_contribution_id = null;
      } else {
        updateFields.final_id = null;
      }

      await fromImportRelation(supabase, stagingTable)
        .update(updateFields)
        .eq('import_job_id', importJobId);

      await supabase
        .from('import_jobs')
        .update({
          status: 'needs_review',
          error_message: `Partial rollback: ${scope} reverted. Review and re-approve affected rows.`,
        })
        .eq('id', importJobId);
    }
  } finally {
    await auditor.close();
    result.durationMs = Date.now() - startTime;
  }

  return result;
}
