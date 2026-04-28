// lib/import/auditor.ts
// Buffered audit logger for import operations — writes before/after snapshots

import type { SupabaseClient } from '@supabase/supabase-js';

export interface AuditEntry {
  importJobId: string;
  tableName: string;
  operation: 'insert' | 'update' | 'skip' | 'error' | 'rollback';
  recordId: string;
  stagingTable?: string;
  stagingRowId?: string;
  dataBefore?: Record<string, unknown>;
  dataAfter?: Record<string, unknown>;
  errorMessage?: string;
}

export class ImportAuditor {
  private supabase: SupabaseClient;
  private importJobId: string;
  private buffer: AuditEntry[] = [];
  private flushInterval: ReturnType<typeof setInterval>;

  constructor(supabase: SupabaseClient, importJobId: string) {
    this.supabase = supabase;
    this.importJobId = importJobId;
    // Auto-flush every 5 seconds to avoid losing audit trail on crash
    this.flushInterval = setInterval(() => {
      this.flush().catch((err) =>
        console.error('[auditor] Auto-flush error:', err)
      );
    }, 5000);
  }

  log(entry: Omit<AuditEntry, 'importJobId'>): void {
    this.buffer.push({ ...entry, importJobId: this.importJobId });
    if (this.buffer.length >= 100) {
      this.flush().catch((err) =>
        console.error('[auditor] Buffer flush error:', err)
      );
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const toFlush = [...this.buffer];
    this.buffer = [];
    await this.supabase.from('import_audit_log').insert(
      toFlush.map((e) => ({
        import_job_id: e.importJobId,
        table_name: e.tableName,
        operation: e.operation,
        record_id: e.recordId,
        staging_table: e.stagingTable,
        staging_row_id: e.stagingRowId,
        data_snapshot:
          e.dataBefore || e.dataAfter
            ? { before: e.dataBefore, after: e.dataAfter }
            : null,
        error_message: e.errorMessage,
      }))
    );
  }

  async close(): Promise<void> {
    clearInterval(this.flushInterval);
    await this.flush();
  }
}
