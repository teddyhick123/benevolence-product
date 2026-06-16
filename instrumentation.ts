// instrumentation.ts
// Next.js instrumentation hook - runs once when server starts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.WALKTHROUGH_MODE !== '1') {
    const { startStaleJobWatchdog } = await import('./lib/import/stale-job-watchdog');
    startStaleJobWatchdog(60_000); // check every 60 seconds
  }
}
