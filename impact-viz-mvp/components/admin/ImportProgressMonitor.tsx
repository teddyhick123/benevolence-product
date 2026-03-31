'use client';
// components/admin/ImportProgressMonitor.tsx
// Real-time progress display for an import job via SSE

import { useState, useEffect, useRef } from 'react';
import type { ImportJob } from '@/lib/import/types';
import type { ProgressEvent } from '@/lib/import/progress-emitter';
import { ImportStatusBadge } from './ImportStatusBadge';

interface EntityProgress {
  processed: number;
  total: number;
  percent: number;
}

interface ImportProgressMonitorProps {
  importJobId: string;
  initialJob: ImportJob;
}

const PHASE_LABELS: Record<string, string> = {
  extraction: 'Extracting…',
  validation: 'Validating…',
  loading: 'Loading…',
  complete: 'Complete',
  error: 'Error',
  heartbeat: '',
};

export function ImportProgressMonitor({ importJobId, initialJob }: ImportProgressMonitorProps) {
  const [job, setJob] = useState<ImportJob>(initialJob);
  const [phase, setPhase] = useState<string>('');
  const [entityProgress, setEntityProgress] = useState<Record<string, EntityProgress>>({});
  const [message, setMessage] = useState<string>('');
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll for job status as fallback
  const pollJobStatus = async () => {
    try {
      const res = await fetch(`/api/admin/imports/${importJobId}`);
      if (res.ok) {
        const data = await res.json() as { job?: ImportJob };
        if (data.job) setJob(data.job);
      }
    } catch {
      // silent
    }
  };

  useEffect(() => {
    // Try SSE first
    const eventSource = new EventSource(`/api/admin/imports/${importJobId}/progress`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setSseConnected(true);
      // Stop polling if SSE works
      if (pollRef.current) clearInterval(pollRef.current);
    };

    eventSource.onmessage = (e: MessageEvent<string>) => {
      try {
        const event = JSON.parse(e.data) as ProgressEvent;
        if (event.type === 'heartbeat') return;

        setPhase(event.type);
        if (event.message) setMessage(event.message);
        if (event.etaSeconds !== undefined) setEtaSeconds(event.etaSeconds);

        if (event.entity && event.processed !== undefined) {
          setEntityProgress((prev) => ({
            ...prev,
            [event.entity!]: {
              processed: event.processed!,
              total: event.total ?? prev[event.entity!]?.total ?? 0,
              percent: event.percent ?? 0,
            },
          }));
        }

        if (event.type === 'complete' || event.type === 'error') {
          eventSource.close();
          pollJobStatus();
        }
      } catch {
        // ignore malformed event
      }
    };

    eventSource.onerror = () => {
      setSseConnected(false);
      eventSource.close();
      // Fall back to polling every 5 seconds
      if (!pollRef.current) {
        pollRef.current = setInterval(pollJobStatus, 5_000);
      }
    };

    // Start polling as a backup initially
    pollRef.current = setInterval(pollJobStatus, 5_000);

    return () => {
      eventSource.close();
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importJobId]);

  const phaseLabel = PHASE_LABELS[phase] ?? '';
  const isRunning = job.status === 'running';
  const isPaused = job.status === 'paused';
  const isComplete = job.status === 'completed';
  const isFailed = job.status === 'failed';

  const entityTypes = ['holdings', 'investees', 'contributions', 'metrics'] as const;

  const handlePause = async () => {
    await fetch(`/api/admin/imports/${importJobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pause' }),
    });
    pollJobStatus();
  };

  const handleResume = async () => {
    await fetch(`/api/admin/imports/${importJobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resume' }),
    });
    pollJobStatus();
  };

  const handleRollback = async () => {
    if (!confirm('Roll back all changes from this import? This cannot be undone.')) return;
    await fetch(`/api/admin/imports/${importJobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rollback' }),
    });
    pollJobStatus();
  };

  return (
    <div className="space-y-4">
      {/* Status banners */}
      {isPaused && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          <strong>Ready for review.</strong>{' '}
          {job.records_failed > 0
            ? `${job.records_failed.toLocaleString()} errors found. Review before loading.`
            : 'Mapping complete. Click Resume to begin loading.'}
          {job.pause_reason && <span className="ml-1 text-yellow-700">({job.pause_reason})</span>}
        </div>
      )}

      {isComplete && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          <strong>Import complete.</strong>{' '}
          {job.records_loaded.toLocaleString()} records loaded
          {job.records_failed > 0 && `, ${job.records_failed.toLocaleString()} failed`}.
        </div>
      )}

      {isFailed && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <strong>Import failed.</strong> {job.pause_reason ?? 'An error occurred.'}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Extracted" value={job.total_records_extracted} color="text-blue-700" />
        <StatCard label="Validated" value={job.records_validated} color="text-azure" />
        <StatCard label="Loaded" value={job.records_loaded} color="text-green-700" />
        <StatCard label="Failed" value={job.records_failed} color="text-red-600" />
      </div>

      {/* Phase + ETA */}
      {(isRunning || phaseLabel) && (
        <div className="flex items-center gap-3 text-sm text-neutral-600">
          {isRunning && (
            <span className="inline-block w-2 h-2 rounded-full bg-azure animate-pulse" />
          )}
          {phaseLabel && <span>{phaseLabel}</span>}
          {message && <span className="text-neutral-500">{message}</span>}
          {etaSeconds !== null && etaSeconds > 0 && (
            <span className="text-neutral-400">
              ~{etaSeconds < 60 ? `${etaSeconds}s` : `${Math.round(etaSeconds / 60)}m`} remaining
            </span>
          )}
          {!sseConnected && isRunning && (
            <span className="text-xs text-neutral-400">(polling)</span>
          )}
        </div>
      )}

      {/* Per-entity progress bars */}
      {Object.keys(entityProgress).length > 0 && (
        <div className="space-y-2">
          {entityTypes.map((et) => {
            const ep = entityProgress[et];
            if (!ep) return null;
            return (
              <div key={et} className="space-y-1">
                <div className="flex justify-between text-xs text-neutral-500">
                  <span className="capitalize">{et}</span>
                  <span>{ep.processed.toLocaleString()} / {ep.total.toLocaleString()}</span>
                </div>
                <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-azure rounded-full transition-all duration-500"
                    style={{ width: `${ep.percent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-2">
        <ImportStatusBadge status={job.status} />

        {isRunning && (
          <button
            onClick={handlePause}
            className="px-3 py-1.5 text-xs border border-neutral-200 rounded-md hover:bg-neutral-50 transition-colors"
          >
            Pause
          </button>
        )}
        {isPaused && (
          <button
            onClick={handleResume}
            className="px-3 py-1.5 text-xs rounded-md bg-yellow-50 border border-yellow-200 text-yellow-700 hover:bg-yellow-100 transition-colors"
          >
            Resume
          </button>
        )}
        {(isComplete || isPaused) && (
          <button
            onClick={handleRollback}
            className="px-3 py-1.5 text-xs rounded-md bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100 transition-colors"
          >
            Rollback
          </button>
        )}

        {job.records_failed > 0 && (
          <a
            href={`/admin/imports/${importJobId}#errors`}
            className="ml-auto text-xs text-red-600 hover:underline"
          >
            {job.records_failed.toLocaleString()} error{job.records_failed === 1 ? '' : 's'} →
          </a>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color = 'text-neutral-900' }: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="card p-5 flex flex-col gap-1">
      <div className={`text-2xl font-bold tabular-nums ${color}`}>
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-neutral-500 uppercase tracking-wide">{label}</div>
    </div>
  );
}
