import { loadEnvConfig } from '@next/env';

/* eslint-disable no-console */

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');

// Load after environment resolution because the queue reads REDIS_URL at module initialization.
const { createScaffoldWorker } = require('@/lib/builder/scaffold-worker') as typeof import('@/lib/builder/scaffold-worker');
const worker = createScaffoldWorker();

function shutdown(signal: string) {
  console.log(`[builder-worker] Received ${signal}; closing worker.`);
  worker.close().finally(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

console.log('[builder-worker] Listening for scaffold-jobs.');
