// lib/import/job-queue.ts
// BullMQ job queue for import processing

import { Queue, Worker, type Job } from 'bullmq';
import { createImportWorkerRepository } from '@/lib/api/repositories/import-worker';
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
      const repository = createImportWorkerRepository({
        principal: { kind: 'job', job: 'import' },
        importJobId,
      });
      const { extractionErrors } = await repository.process({ storagePaths, mappingProfileId });
      if (extractionErrors.length > 0) {
        console.error(`[import-worker] Extraction errors for job ${importJobId}:`, extractionErrors);
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
