import { createElevatedClient } from '@/lib/api/admin-client';
import type { AppAdminAccessContext } from '@/lib/api/principals';

type AppAdminUploadScope = Pick<AppAdminAccessContext, 'isAppAdmin'> & {
  actorId: string;
};

export class StagedMetricFactNotFoundError extends Error {
  constructor() {
    super('Staged fact not found');
    this.name = 'StagedMetricFactNotFoundError';
  }
}

export class AdminUploadNotFoundError extends Error {
  constructor() {
    super('Upload not found');
    this.name = 'AdminUploadNotFoundError';
  }
}

/** Global upload-review operations available only after the app-admin guard succeeds. */
export function createAppAdminUploadReviewRepository(scope: AppAdminUploadScope) {
  if (!scope.isAppAdmin) throw new Error('App admin access required');
  const db = createElevatedClient();

  return {
    async approveStagedFact(factId: string) {
      const { data: stagedFact, error: fetchError } = await db
        .from('staging_metric_facts')
        .select('*')
        .eq('id', factId)
        .maybeSingle();
      if (fetchError || !stagedFact) throw new StagedMetricFactNotFoundError();

      const { error: insertError } = await db.from('metric_facts').insert({
        holding_id: stagedFact.holding_id,
        metric_code: stagedFact.metric_code,
        period_start: stagedFact.period_start,
        period_end: stagedFact.period_end,
        value: stagedFact.value,
        source: stagedFact.source,
        verification_level: stagedFact.verification_level,
        data_quality_score: stagedFact.data_quality_score,
        unit: stagedFact.unit,
        submitted_by_org_id: stagedFact.submitted_by_org_id,
      });
      if (insertError) throw insertError;

      const { error: updateError } = await db
        .from('staging_metric_facts')
        .update({ approved: true, review_status: 'approved' })
        .eq('id', factId);
      if (updateError) throw updateError;
    },

    async rejectStagedFact(factId: string) {
      const { error } = await db
        .from('staging_metric_facts')
        .delete()
        .eq('id', factId);
      if (error) throw error;
    },

    async listStagedFacts(uploadId: string) {
      const { data, error } = await db
        .from('staging_metric_facts')
        .select('*')
        .eq('upload_id', uploadId)
        .eq('approved', false)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },

    async getUploadStatus(uploadId: string) {
      const { data: upload, error: uploadError } = await db
        .from('uploads')
        .select('*')
        .eq('id', uploadId)
        .maybeSingle();
      if (uploadError || !upload) throw new AdminUploadNotFoundError();

      const { count } = await db
        .from('staging_metric_facts')
        .select('*', { count: 'exact', head: true })
        .eq('upload_id', uploadId);

      return {
        uploadId: upload.id,
        status: upload.status,
        fileName: upload.file_name,
        createdAt: upload.created_at,
        updatedAt: upload.updated_at,
        portfolioId: upload.portfolio_id,
        holdingId: upload.holding_id,
        aiMode: upload.ai_mode,
        factsExtracted: count || 0,
      };
    },
  };
}
