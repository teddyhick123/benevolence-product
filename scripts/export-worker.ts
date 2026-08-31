// scripts/export-worker.ts
// Runs organization export jobs. Start with `npm run export:worker`.

import { PassThrough } from 'node:stream';
import { Worker } from 'bullmq';
import { createElevatedClient } from '../lib/api/admin-client';
import { createOrgExportRepository } from '../lib/api/repositories/org-exports';
import { writeArchive } from '../lib/export/archive';
import { EXPORT_QUEUE_NAME, runExportJob, type ExportJobData } from '../lib/export/queue';

const BUCKET = 'org-exports';
const objectPath = (orgId: string, runId: string) => `${orgId}/${runId}.tar`;

const worker = new Worker<ExportJobData>(
  EXPORT_QUEUE_NAME,
  async job => {
    const db = createElevatedClient();
    const repo = createOrgExportRepository(db);

    await runExportJob(job.data, {
      claimRun: runId => repo.claimRun(runId),
      finishRun: (runId, input) => repo.finishRun(runId, input),
      failRun: (runId, reason) => repo.failRun(runId, reason),

      orgName: async orgId => {
        const { data } = await db.from('organizations').select('name').eq('id', orgId).maybeSingle();
        return (data?.name as string | undefined) ?? 'organization';
      },

      writeArchiveToStorage: async ({ orgId, orgName, runId }) => {
        const sink = new PassThrough();
        const path = objectPath(orgId, runId);

        // The upload consumes the stream while writeArchive produces it, so
        // nothing is staged on disk or held in memory between them.
        const upload = db.storage.from(BUCKET).upload(path, sink, {
          contentType: 'application/x-tar',
          upsert: true,
        });

        const [result, uploaded] = await Promise.all([
          writeArchive({ db, orgId, orgName, sink }),
          upload,
        ]);

        if (uploaded.error) throw uploaded.error;

        return {
          manifestHash: result.manifestHash,
          rowCount: result.rowCount,
          byteCount: result.byteCount,
          storagePath: path,
        };
      },

      deletePartial: async (runId, orgId) => {
        await db.storage.from(BUCKET).remove([objectPath(orgId, runId)]);
      },
    });
  },
  {
    connection: { url: process.env.REDIS_URL || 'redis://localhost:6379' },
    // An export is I/O-heavy and the unique index already allows one live run
    // per organization, so parallelism would add contention without throughput.
    concurrency: 1,
  },
);

worker.on('failed', (job, err) => {
  console.error(`[export-worker] job ${job?.id} failed:`, err.message);
});

console.log(`[export-worker] listening on ${EXPORT_QUEUE_NAME}`);
