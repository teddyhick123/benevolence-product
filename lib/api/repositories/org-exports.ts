// lib/api/repositories/org-exports.ts
// Lifecycle of an organization export run.

import { createElevatedClient, type ElevatedClient } from '@/lib/api/admin-client';

export type OrgExportRun = {
  id: string;
  org_id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'expired';
  manifest_hash: string | null;
  row_count: number | null;
  byte_count: number | null;
  storage_path: string | null;
  error: string | null;
  expires_at: string | null;
  created_at: string;
};

export function createOrgExportRepository(db: ElevatedClient = createElevatedClient()) {
  const table = () => db.from('org_export_runs');
  const now = () => new Date().toISOString();

  return {
    async createRun(orgId: string, requestedBy: string): Promise<OrgExportRun> {
      const { data, error } = await table()
        .insert({ org_id: orgId, requested_by: requestedBy })
        .select('*')
        .single();
      if (error) throw error;
      return data as unknown as OrgExportRun;
    },

    /**
     * The conditional update is the claim: only one worker can move a run out
     * of 'queued', which makes execution at-most-once the way evaluation runs
     * are claimed.
     */
    async claimRun(runId: string): Promise<boolean> {
      const { data, error } = await table()
        .update({ status: 'running', updated_at: now() })
        .eq('id', runId)
        .eq('status', 'queued')
        .select('id')
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },

    async finishRun(runId: string, input: {
      manifestHash: string; rowCount: number; byteCount: number;
      storagePath: string; expiresAt: string;
    }): Promise<void> {
      const { error } = await table()
        .update({
          status: 'succeeded',
          manifest_hash: input.manifestHash,
          row_count: input.rowCount,
          byte_count: input.byteCount,
          storage_path: input.storagePath,
          expires_at: input.expiresAt,
          updated_at: now(),
        })
        .eq('id', runId);
      if (error) throw error;
    },

    async failRun(runId: string, reason: string): Promise<void> {
      const { error } = await table()
        .update({ status: 'failed', error: reason, updated_at: now() })
        .eq('id', runId);
      if (error) throw error;
    },

    async getRun(runId: string): Promise<OrgExportRun | null> {
      const { data, error } = await table().select('*').eq('id', runId).maybeSingle();
      if (error) throw error;
      return (data as unknown as OrgExportRun) ?? null;
    },

    async listRuns(orgId: string): Promise<OrgExportRun[]> {
      const { data, error } = await table()
        .select('*').eq('org_id', orgId).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OrgExportRun[];
    },

    /** Runs whose archive is past its retention window. */
    async expiredRuns(nowIso: string): Promise<OrgExportRun[]> {
      const { data, error } = await table()
        .select('*').eq('status', 'succeeded').lt('expires_at', nowIso);
      if (error) throw error;
      return (data ?? []) as unknown as OrgExportRun[];
    },

    /**
     * The file is gone; the record that it existed is not. Clearing the path
     * keeps a signed URL from being minted for an object that no longer exists.
     */
    async markExpired(runId: string): Promise<void> {
      const { error } = await table()
        .update({ status: 'expired', storage_path: null, updated_at: now() })
        .eq('id', runId);
      if (error) throw error;
    },
  };
}
