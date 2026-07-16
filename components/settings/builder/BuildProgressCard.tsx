'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Circle, Loader } from 'lucide-react';
import type { CodeState, FindingRow } from '@/lib/builder/proposal-state';

interface FileStatus {
  path: string;
  status: 'pending' | 'done';
}

export interface BuildProgressAttempt {
  status: string;
  policy_version: string;
  summary_score: number | null;
  decision_reason: string | null;
}

export interface BuildProgressResult {
  codeState: CodeState;
  attempt: BuildProgressAttempt | null;
  findings: FindingRow[];
  prUrl: string | null;
}

interface DetailResponse {
  proposal: { code_state: CodeState | null };
  revision: { progress: { files?: Array<{ path: string; done: boolean }> } | null } | null;
  attempts: Array<{
    status: string;
    policy_version: string;
    summary_score: number | null;
    decision_reason: string | null;
    findings: FindingRow[];
  }>;
  delivery: Array<{ pr_url: string | null }>;
}

interface BuildProgressCardProps {
  orgId: string;
  proposalId: string;
  plannedFiles: Array<{ path: string }>;
  onComplete: (result: BuildProgressResult) => void;
}

const TERMINAL_STATES: CodeState[] = ['ready_to_apply', 'needs_repair', 'failed'];

export default function BuildProgressCard({ orgId, proposalId, plannedFiles, onComplete }: BuildProgressCardProps) {
  const [fileStatuses, setFileStatuses] = useState<FileStatus[]>(
    plannedFiles.map(f => ({ path: f.path, status: 'pending' }))
  );
  const [codeState, setCodeState] = useState<CodeState | 'building'>('building');

  useEffect(() => {
    let active = true;

    async function poll() {
      while (active) {
        await new Promise(r => setTimeout(r, 2000));
        if (!active) break;

        try {
          // Poll the detail route: it carries the current revision's
          // per-file progress and the latest review attempt, which the
          // (now-summary-only) list route never returned.
          const res = await fetch(`/api/org/${orgId}/builder/proposals/${proposalId}`);
          if (!res.ok) continue;
          const data = await res.json() as DetailResponse;

          const doneFiles = new Set(
            (data.revision?.progress?.files ?? []).filter(f => f.done).map(f => f.path)
          );

          setFileStatuses(plannedFiles.map(f => ({
            path: f.path,
            status: doneFiles.has(f.path) ? 'done' : 'pending',
          })));

          const state = data.proposal.code_state;
          if (state) setCodeState(state);

          if (state && TERMINAL_STATES.includes(state)) {
            active = false;
            const latestAttempt = data.attempts[0] ?? null;
            onComplete({
              codeState: state,
              attempt: latestAttempt
                ? {
                    status: latestAttempt.status,
                    policy_version: latestAttempt.policy_version,
                    summary_score: latestAttempt.summary_score,
                    decision_reason: latestAttempt.decision_reason,
                  }
                : null,
              findings: latestAttempt?.findings ?? [],
              prUrl: data.delivery[0]?.pr_url ?? null,
            });
          }
        } catch { /* retry on next tick */ }
      }
    }

    poll();
    return () => { active = false; };
  }, [orgId, proposalId, plannedFiles, onComplete]);

  const doneCount = fileStatuses.filter(f => f.status === 'done').length;
  const isReviewing = codeState === 'verifying';

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-sm max-w-[90%] px-4 py-3">
      <p className="font-medium mb-2">
        {isReviewing ? 'Reviewing generated code…' : `Building module — ${doneCount}/${fileStatuses.length} files`}
      </p>
      <ul className="space-y-1">
        {fileStatuses.map(f => (
          <li key={f.path} className="flex items-center gap-2 text-xs font-mono">
            {f.status === 'done' ? (
              <CheckCircle className="w-3.5 h-3.5 text-green-600 shrink-0" />
            ) : isReviewing ? (
              <Loader className="w-3.5 h-3.5 text-amber-500 shrink-0 animate-spin" />
            ) : (
              <Circle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            )}
            <span className={f.status === 'done' ? 'text-green-700' : 'text-amber-700'}>{f.path}</span>
          </li>
        ))}
      </ul>
      {isReviewing && (
        <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
          <Loader className="w-3 h-3 animate-spin" />
          Running code review…
        </p>
      )}
    </div>
  );
}
