// lib/export/queue.ts
// Export jobs. The job body takes its dependencies as arguments so it can be
// tested without Redis, Postgres, or storage.

import { Queue } from 'bullmq';

export const EXPORT_QUEUE_NAME = 'org-export-jobs';

function redisConnection() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL is required to enqueue organization exports');
  return { url };
}

let exportQueue: Queue | undefined;

function getExportQueue(): Queue {
  exportQueue ??= new Queue(EXPORT_QUEUE_NAME, { connection: redisConnection() });
  return exportQueue;
}

export const RETENTION_DAYS = 7;

export type ExportJobData = { runId: string; orgId: string };

export type ExportJobDeps = {
  claimRun: (_runId: string) => Promise<boolean>;
  finishRun: (_runId: string, _input: {
    manifestHash: string; rowCount: number; byteCount: number;
    storagePath: string; expiresAt: string;
  }) => Promise<void>;
  failRun: (_runId: string, _reason: string) => Promise<void>;
  orgName: (_orgId: string) => Promise<string>;
  writeArchiveToStorage: (_input: { orgId: string; orgName: string; runId: string }) => Promise<{
    manifestHash: string; rowCount: number; byteCount: number; storagePath: string;
  }>;
  deletePartial: (_runId: string, _orgId: string) => Promise<void>;
};

export async function runExportJob(data: ExportJobData, deps: ExportJobDeps): Promise<void> {
  // Losing the claim means another worker already has this run. Doing nothing
  // is the correct outcome, not an error.
  const claimed = await deps.claimRun(data.runId);
  if (!claimed) return;

  try {
    const orgName = await deps.orgName(data.orgId);
    const result = await deps.writeArchiveToStorage({
      orgId: data.orgId, orgName, runId: data.runId,
    });

    const expiresAt = new Date(Date.now() + RETENTION_DAYS * 86_400_000).toISOString();
    await deps.finishRun(data.runId, { ...result, expiresAt });
  } catch (err) {
    // A partial tar looks like a download and is not one, so it never survives
    // a failure. A cleanup that itself fails must not hide the original reason.
    await deps.deletePartial(data.runId, data.orgId).catch(() => {});
    await deps.failRun(data.runId, err instanceof Error ? err.message : String(err));
  }
}

export async function enqueueExport(data: ExportJobData) {
  // attempts: 1 - a retry would find the run already 'running' and lose the
  // claim, so BullMQ retries would be silent no-ops. Failure is recorded on the
  // run row instead, where an admin can see it.
  return getExportQueue().add('export-org', data, {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 100,
  });
}
