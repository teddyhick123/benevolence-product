import { loadEnvConfig } from '@next/env';

/* eslint-disable no-console */

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');

// Load after environment resolution because the queue reads REDIS_URL at module initialization.
const { createEvaluationWorker } = require('@/lib/ai/evals/queue') as typeof import('@/lib/ai/evals/queue');
const worker = createEvaluationWorker();

function shutdown(signal: string) {
  console.log(`[evaluation-worker] Received ${signal}; closing worker.`);
  worker.close().finally(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

console.log('[evaluation-worker] Listening for ai-evaluation-jobs.');
