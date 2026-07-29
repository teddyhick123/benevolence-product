import { createElevatedClient } from '@/lib/api/admin-client';
import type { AppAdminAccessContext } from '@/lib/api/principals';
import { parseDocument, parseDocumentChunked } from '@/lib/document-parser';
import {
  extractFactsFromText,
  getUniqueMetricCodes,
  type ExtractedFact,
  type ExtractionResult,
} from '@/lib/ai/document-extractor';

type AppAdminUploadScope = Pick<AppAdminAccessContext, 'isAppAdmin'> & {
  actorId: string;
};

type OrgUploadScope = {
  orgId: string;
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

export class AdminUploadHoldingMismatchError extends Error {
  constructor() {
    super('Holding does not belong to the selected portfolio');
    this.name = 'AdminUploadHoldingMismatchError';
  }
}

type UploadRecord = {
  id: string;
  org_id: string;
  portfolio_id: string;
  holding_id: string;
  bucket: string;
  storage_path: string;
  file_name: string | null;
  filename: string;
  ai_mode: boolean;
  selected_metrics: string[] | null;
};

type ProcessedUpload = {
  uploadId: string;
  portfolioId: string;
  holdingId: string;
  factsExtracted: number;
  locationsExtracted: number;
  locationsUpserted: number;
  chunksProcessed: number;
  metrics: string[];
  message?: string;
  documentMetadata?: Record<string, unknown>;
};

function safeFileName(name: string): string {
  return name.replace(/[\0/\\]/g, '_').replace(/\.{2,}/g, '_') || 'upload';
}

function deduplicateFacts(facts: ExtractedFact[]): ExtractedFact[] {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = `${fact.metric_code}|${fact.period_end || ''}|${fact.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function assertUploadStoragePath(upload: UploadRecord): void {
  const expectedPrefix = `org/${upload.org_id}/uploads/`;
  if (
    !upload.bucket
    || !upload.storage_path.startsWith(expectedPrefix)
    || upload.storage_path.includes('..')
    || upload.storage_path.includes('\\')
  ) {
    throw new Error('Invalid storage path for upload');
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

function createScopedUploadIngestionRepository(scope: {
  actorId: string;
  orgId?: string;
  successStatus?: 'done' | 'completed';
  failureStatus?: 'error' | 'failed';
}) {
  const db = createElevatedClient();
  const successStatus = scope.successStatus ?? 'done';
  const failureStatus = scope.failureStatus ?? 'error';

  async function markStatus(
    uploadId: string,
    status: 'processing' | 'done' | 'error' | 'completed' | 'failed'
  ) {
    const { error } = await db
      .from('uploads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', uploadId);
    if (error) throw error;
  }

  async function requireHolding(portfolioId: string, holdingId: string) {
    let query = db
      .from('holdings')
      .select('id, org_id, portfolio_id')
      .eq('id', holdingId)
      .eq('portfolio_id', portfolioId)
      .is('deleted_at', null);
    if (scope.orgId) query = query.eq('org_id', scope.orgId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) throw new AdminUploadHoldingMismatchError();
    return data as { id: string; org_id: string; portfolio_id: string };
  }

  async function requireOrgHolding(holdingId: string) {
    if (!scope.orgId) throw new Error('Organization scope required');
    const { data, error } = await db
      .from('holdings')
      .select('id, org_id, portfolio_id')
      .eq('id', holdingId)
      .eq('org_id', scope.orgId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new AdminUploadHoldingMismatchError();
    return data as { id: string; org_id: string; portfolio_id: string };
  }

  async function requireUpload(uploadId: string): Promise<UploadRecord> {
    const { data, error } = await db
      .from('uploads')
      .select('id, org_id, portfolio_id, holding_id, bucket, storage_path, file_name, filename, ai_mode, selected_metrics')
      .eq('id', uploadId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new AdminUploadNotFoundError();

    const holding = await requireHolding(data.portfolio_id, data.holding_id);
    if (!data.org_id || data.org_id !== holding.org_id) {
      throw new AdminUploadHoldingMismatchError();
    }
    return data as UploadRecord;
  }

  async function persistExtraction(
    upload: UploadRecord,
    extraction: ExtractionResult,
    chunksProcessed: number,
    documentMetadata?: Record<string, unknown>
  ): Promise<ProcessedUpload> {
    const facts = deduplicateFacts(extraction.facts);
    const metricCodes = getUniqueMetricCodes(facts);
    if (metricCodes.length > 0) {
      const { error } = await db.from('metrics').upsert(
        metricCodes.map((code) => ({ code, name: code, unit: null })),
        { onConflict: 'code', ignoreDuplicates: true }
      );
      if (error) throw error;
    }

    if (facts.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await db.from('staging_metric_facts').insert(
        facts.map((fact) => ({
          upload_id: upload.id,
          holding_id: upload.holding_id,
          metric_code: fact.metric_code,
          period_start: fact.period_start || null,
          period_end: fact.period_end || today,
          value: fact.value,
          source: fact.source || 'AI Extraction',
          verification_level: fact.verification_level || 'Unverified',
          data_quality_score: fact.data_quality_score ?? 0.6,
          unit: fact.unit || null,
          submitted_by_org_id: upload.org_id,
          approved: false,
          raw: {
            holding_name: fact.holding_name,
            sector: fact.sector,
            country: fact.country,
            original_extraction: fact,
          },
        }))
      );
      if (error) throw new Error(`Failed to insert staging facts: ${error.message}`);
    }

    let locationsUpserted = 0;
    const locations = extraction.locations ?? [];
    for (const location of locations.filter((item) => item.lon != null && item.lat != null)) {
      const { data: existing, error: findError } = await db
        .from('holding_locations')
        .select('id')
        .eq('portfolio_id', upload.portfolio_id)
        .eq('holding_id', upload.holding_id)
        .eq('name', location.name)
        .maybeSingle();
      if (findError) throw findError;

      const values = {
        tags: location.tags || [],
        status: location.status || 'Active',
        lon: location.lon as number,
        lat: location.lat as number,
      };
      const operation = existing
        ? db.from('holding_locations').update(values).eq('id', existing.id)
        : db.from('holding_locations').insert({
            portfolio_id: upload.portfolio_id,
            holding_id: upload.holding_id,
            name: location.name,
            ...values,
          });
      const { error } = await operation;
      if (error) throw error;
      locationsUpserted += 1;
    }

    await markStatus(upload.id, successStatus);
    return {
      uploadId: upload.id,
      portfolioId: upload.portfolio_id,
      holdingId: upload.holding_id,
      factsExtracted: facts.length,
      locationsExtracted: locations.length,
      locationsUpserted,
      chunksProcessed,
      metrics: metricCodes,
      documentMetadata,
      message: facts.length === 0 ? 'No facts extracted from document' : undefined,
    };
  }

  async function processBuffer(
    upload: UploadRecord,
    buffer: Buffer,
    mode: 'chunked' | 'single'
  ): Promise<ProcessedUpload> {
    const fileName = upload.file_name || upload.filename || 'document';
    if (mode === 'single') {
      const parsed = await parseDocument(buffer, fileName);
      if (!parsed.text.trim()) throw new Error('No text content extracted from document');
      const extraction = await extractFactsFromText(parsed.text, {
        restrictedMetrics: upload.ai_mode ? undefined : upload.selected_metrics ?? undefined,
        holdingId: upload.holding_id,
      });
      return persistExtraction(upload, extraction, 1, parsed.metadata);
    }

    const chunks = await parseDocumentChunked(buffer, fileName);
    if (chunks.length === 0 || chunks.every((chunk) => !chunk.text.trim())) {
      await markStatus(upload.id, successStatus);
      return {
        uploadId: upload.id,
        portfolioId: upload.portfolio_id,
        holdingId: upload.holding_id,
        factsExtracted: 0,
        locationsExtracted: 0,
        locationsUpserted: 0,
        chunksProcessed: chunks.length,
        metrics: [],
        message: 'No text content extracted from document',
      };
    }

    const facts: ExtractedFact[] = [];
    const locations: NonNullable<ExtractionResult['locations']> = [];
    for (const chunk of chunks) {
      if (!chunk.text.trim()) continue;
      try {
        const extraction = await extractFactsFromText(chunk.text, {
          restrictedMetrics: upload.ai_mode ? undefined : upload.selected_metrics ?? undefined,
          holdingId: upload.holding_id,
        });
        facts.push(...extraction.facts);
        locations.push(...(extraction.locations ?? []));
      } catch (error) {
        console.error(`[Upload ${upload.id}] Chunk extraction failed`, error);
      }
    }
    return persistExtraction(upload, { facts, locations }, chunks.length);
  }

  return {
    async createAndIngest(params: {
      fileName: string;
      mimeType: string | null;
      buffer: Buffer;
      portfolioId: string;
      holdingId: string;
      aiMode: boolean;
      selectedMetrics: string[];
    }) {
      const holding = await requireHolding(params.portfolioId, params.holdingId);
      const uploadId = crypto.randomUUID();
      const fileName = safeFileName(params.fileName);
      const storagePath = `org/${holding.org_id}/uploads/${uploadId}-${fileName}`;
      const extension = fileName.includes('.') ? fileName.split('.').pop() || '' : '';

      const { error: storageError } = await db.storage
        .from('uploads')
        .upload(storagePath, params.buffer, {
          contentType: params.mimeType || undefined,
          upsert: false,
        });
      if (storageError) throw storageError;

      const upload: UploadRecord = {
        id: uploadId,
        org_id: holding.org_id,
        portfolio_id: holding.portfolio_id,
        holding_id: holding.id,
        bucket: 'uploads',
        storage_path: storagePath,
        file_name: fileName,
        filename: fileName,
        ai_mode: params.aiMode,
        selected_metrics: params.aiMode ? null : params.selectedMetrics,
      };
      const { error: insertError } = await db.from('uploads').insert({
        ...upload,
        uploaded_by: scope.actorId,
        original_name: params.fileName,
        mime_type: params.mimeType,
        size_bytes: params.buffer.byteLength,
        file_ext: extension,
        status: 'processing',
      });
      if (insertError) {
        await db.storage.from('uploads').remove([storagePath]);
        throw insertError;
      }

      try {
        return await processBuffer(upload, params.buffer, 'chunked');
      } catch (error) {
        await markStatus(uploadId, failureStatus);
        throw error;
      }
    },

    async ingestExisting(uploadId: string) {
      const upload = await requireUpload(uploadId);
      assertUploadStoragePath(upload);
      await markStatus(upload.id, 'processing');

      try {
        const { data, error } = await db.storage
          .from(upload.bucket)
          .download(upload.storage_path);
        if (error || !data) throw new Error(`Failed to download file: ${error?.message || 'not found'}`);
        const buffer = Buffer.from(await data.arrayBuffer());
        return await processBuffer(upload, buffer, 'single');
      } catch (error) {
        await markStatus(upload.id, failureStatus);
        throw error;
      }
    },

    async createAndIngestForOrg(params: {
      fileName: string;
      mimeType: string | null;
      buffer: Buffer;
      holdingId: string;
      aiMode: boolean;
    }) {
      const holding = await requireOrgHolding(params.holdingId);
      const uploadId = crypto.randomUUID();
      const fileName = safeFileName(params.fileName);
      const storagePath = `org/${holding.org_id}/uploads/${uploadId}-${fileName}`;
      const extension = fileName.includes('.') ? fileName.split('.').pop() || '' : '';

      const { error: storageError } = await db.storage
        .from('uploads')
        .upload(storagePath, params.buffer, {
          contentType: params.mimeType || undefined,
          upsert: false,
        });
      if (storageError) throw storageError;

      const upload: UploadRecord = {
        id: uploadId,
        org_id: holding.org_id,
        portfolio_id: holding.portfolio_id,
        holding_id: holding.id,
        bucket: 'uploads',
        storage_path: storagePath,
        file_name: fileName,
        filename: fileName,
        ai_mode: params.aiMode,
        selected_metrics: null,
      };
      const { error: insertError } = await db.from('uploads').insert({
        ...upload,
        uploaded_by: scope.actorId,
        original_name: params.fileName,
        mime_type: params.mimeType,
        size_bytes: params.buffer.byteLength,
        file_ext: extension,
        status: 'processing',
      });
      if (insertError) {
        await db.storage.from('uploads').remove([storagePath]);
        throw insertError;
      }

      if (!params.aiMode) {
        await markStatus(upload.id, successStatus);
        return {
          uploadId: upload.id,
          portfolioId: upload.portfolio_id,
          holdingId: upload.holding_id,
          factsExtracted: 0,
          locationsExtracted: 0,
          locationsUpserted: 0,
          chunksProcessed: 0,
          metrics: [],
          message: 'File uploaded. AI extraction was disabled.',
        } satisfies ProcessedUpload;
      }

      try {
        return await processBuffer(upload, params.buffer, 'chunked');
      } catch (error) {
        await markStatus(upload.id, failureStatus);
        throw error;
      }
    },
  };
}

/** Elevated upload ingestion constrained to app-admin callers and verified upload ownership. */
export function createAppAdminUploadIngestionRepository(scope: AppAdminUploadScope) {
  if (!scope.isAppAdmin) throw new Error('App admin access required');
  const repository = createScopedUploadIngestionRepository({ actorId: scope.actorId });
  return {
    createAndIngest: repository.createAndIngest,
    ingestExisting: repository.ingestExisting,
  };
}

/** Elevated upload ingestion constrained to one already-authorized organization. */
export function createOrgUploadIngestionRepository(scope: OrgUploadScope) {
  if (!scope.orgId) throw new Error('Organization scope required');
  const repository = createScopedUploadIngestionRepository({
    ...scope,
    successStatus: 'completed',
    failureStatus: 'failed',
  });
  return {
    createAndIngest: repository.createAndIngestForOrg,
  };
}
