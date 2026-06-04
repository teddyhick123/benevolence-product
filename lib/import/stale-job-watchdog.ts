// lib/import/stale-job-watchdog.ts
// Periodically calls mark_stale_import_jobs() to reap dead workers.
// Should be started once when the server initializes.

import { createAdminClient } from '@/lib/supabase';

let watchdogInterval: ReturnType<typeof setInterval> | null = null;
const STALE_THRESHOLD_MINUTES = 30;

function isMissingStaleJobRpc(message: string): boolean {
  return message.includes('mark_stale_import_jobs') && message.includes('schema cache');
}

export function startStaleJobWatchdog(intervalMs = 60_000): void {
  if (watchdogInterval) return; // already running

  watchdogInterval = setInterval(async () => {
    try {
      const supabase = createAdminClient();
      const { data, error } = await supabase.rpc('mark_stale_import_jobs', {
        p_stale_threshold_minutes: STALE_THRESHOLD_MINUTES,
      });
      if (error) {
        if (isMissingStaleJobRpc(error.message)) {
          console.warn(
            '[watchdog] Stale import job watchdog disabled: missing public.mark_stale_import_jobs RPC. ' +
              'Apply db/migrations/0050_import_tables.sql or run scripts/run-migrations.sh.'
          );
          stopStaleJobWatchdog();
          return;
        }
        console.error('[watchdog] Error checking stale jobs:', error.message);
      } else if (data && data > 0) {
        console.warn('[watchdog] Reaped', data, 'stale import job(s)');
      }
    } catch (err) {
      console.error('[watchdog] Unexpected error:', err);
    }
  }, intervalMs);

  // Unref so this timer doesn't prevent process from exiting cleanly
  if (watchdogInterval.unref) watchdogInterval.unref();

  console.log('[watchdog] Stale job watchdog started (interval:', intervalMs, 'ms)');
}

export function stopStaleJobWatchdog(): void {
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
    console.log('[watchdog] Stale job watchdog stopped');
  }
}
