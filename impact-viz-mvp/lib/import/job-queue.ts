// lib/import/job-queue.ts
// BullMQ job queue for import processing

import { Queue, Worker, type Job } from 'bullmq';
import { createAdminClient } from '@/lib/supabase';
import { extractCSVToStaging } from './csv-extractor';
import type { EntityType } from './types';

const redisConnection = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
};

export const importQueue = new Queue('import-jobs', {
  connection: redisConnection,
});

export interface ImportJobData {
  importJobId: string;
  portfolioId?: string;
  sourceType: 'csv_export' | 'blackbaud_api' | 'direct_db';
  storagePaths?: Partial<Record<EntityType, string>>;
  mappingProfileId?: string;
}

export async function enqueueImportJob(data: ImportJobData): Promise<string> {
  const job = await importQueue.add('process-import', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  });
  return job.id ?? '';
}

export function createImportWorker(): Worker {
  const worker = new Worker(
    'import-jobs',
    async (job: Job<ImportJobData>) => {
      const { importJobId, storagePaths, mappingProfileId } = job.data;
      const supabase = createAdminClient();

      // 1. Mark job as running
      await supabase
        .from('import_jobs')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', importJobId);

      try {
        const entityTypes: EntityType[] = Object.keys(storagePaths ?? {}) as EntityType[];

        if (entityTypes.length === 0) {
          throw new Error('No storage paths provided for import');
        }

        // 2. Extract all CSVs in parallel
        const extractResults = await Promise.allSettled(
          entityTypes.map((entityType) => {
            const path = storagePaths![entityType]!;
            return extractCSVToStaging(supabase, importJobId, path, entityType);
          })
        );

        const extractErrors: string[] = [];
        for (const result of extractResults) {
          if (result.status === 'rejected') {
            extractErrors.push(String(result.reason));
          } else if (result.value.errors.length > 0) {
            extractErrors.push(...result.value.errors);
          }
        }

        if (extractErrors.length > 0) {
          // Log errors but continue if some rows were extracted
          console.error(`[import-worker] Extraction errors for job ${importJobId}:`, extractErrors);
        }

        // 3. Run transform + validate
        if (mappingProfileId) {
          const { data: profile } = await supabase
            .from('import_mapping_profiles')
            .select('*')
            .eq('id', mappingProfileId)
            .single();

          if (profile) {
            const { runTransformValidate } = await import('./etl-runner');
            await runTransformValidate(supabase, importJobId, profile);
          }
        }

        // 4. Pause for user review after extraction + validation
        await supabase
          .from('import_jobs')
          .update({
            status: 'paused',
            pause_reason: 'Extraction and validation complete. Review errors before loading.',
          })
          .eq('id', importJobId);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`[import-worker] Fatal error for job ${importJobId}:`, errorMessage);

        await supabase
          .from('import_jobs')
          .update({
            status: 'failed',
            notes: `Worker error: ${errorMessage}`,
            completed_at: new Date().toISOString(),
          })
          .eq('id', importJobId);

        throw err;
      }
    },
    {
      connection: redisConnection,
      concurrency: 2,
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[import-worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    console.log(`[import-worker] Job ${job.id} completed`);
  });

  return worker;
}
