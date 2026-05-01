'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Circle, Loader } from 'lucide-react';

interface FileStatus {
  path: string;
  status: 'pending' | 'done';
}

interface Proposal {
  phase: string;
  plan_content: { files: Array<{ path: string }> } | null;
  generated_code: { files: Array<{ path: string; content: string }> } | null;
  review_report: { score: number; findings: Array<{ severity: string; description: string }> } | null;
}

interface BuildProgressCardProps {
  orgId: string;
  proposalId: string;
  plannedFiles: Array<{ path: string }>;
  onComplete: (proposal: Proposal) => void;
}

export default function BuildProgressCard({ orgId, proposalId, plannedFiles, onComplete }: BuildProgressCardProps) {
  const [fileStatuses, setFileStatuses] = useState<FileStatus[]>(
    plannedFiles.map(f => ({ path: f.path, status: 'pending' }))
  );
  const [phase, setPhase] = useState<string>('building');

  useEffect(() => {
    let active = true;

    async function poll() {
      while (active) {
        await new Promise(r => setTimeout(r, 2000));
        if (!active) break;

        try {
          const res = await fetch(`/api/org/${orgId}/builder/proposals/${proposalId}`);
          if (!res.ok) continue;
          const { proposal } = await res.json() as { proposal: Proposal };

          const doneFiles = new Set(
            (proposal.generated_code?.files ?? []).map(f => f.path)
          );

          setFileStatuses(plannedFiles.map(f => ({
            path: f.path,
            status: doneFiles.has(f.path) ? 'done' : 'pending',
          })));

          setPhase(proposal.phase);

          if (proposal.phase === 'ready_to_apply' || proposal.phase === 'applied') {
            active = false;
            onComplete(proposal);
          }
        } catch { /* retry on next tick */ }
      }
    }

    poll();
    return () => { active = false; };
  }, [orgId, proposalId, plannedFiles, onComplete]);

  const doneCount = fileStatuses.filter(f => f.status === 'done').length;
  const isReviewing = phase === 'reviewing';

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
