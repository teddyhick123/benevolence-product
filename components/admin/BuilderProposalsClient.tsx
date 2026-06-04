// components/admin/BuilderProposalsClient.tsx
'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, CheckSquare, FileCode, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';

interface Proposal {
  id: string;
  org_id: string;
  org_name: string | null;
  request_text: string;
  proposal_type: 'config' | 'code';
  status: 'pending' | 'approved' | 'rejected' | 'applied';
  generated_code: { files: Array<{ path: string; content: string; diff: string }> } | null;
  config_patch: Record<string, unknown> | null;
  reviewer_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-sunset/15 text-ink border-sunset/30',
  approved: 'bg-azure/10 text-azure-deep border-azure/20',
  rejected: 'bg-red-100 text-red-700 border-red-200',
  applied: 'bg-green-100 text-green-700 border-green-200',
};

function ProposalCard({ proposal, onUpdate }: { proposal: Proposal; onUpdate: (id: string, status: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [actError, setActError] = useState<string | null>(null);

  async function act(status: string) {
    setLoading(true);
    setActError(null);
    try {
      const res = await fetch(`/api/admin/builder/proposals/${proposal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reviewer_notes: notes || undefined }),
      });
      if (res.ok) {
        onUpdate(proposal.id, status);
      } else {
        const data = await res.json().catch(() => ({}));
        setActError(data.error || 'Action failed. Please try again.');
      }
    } catch {
      setActError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-black/10 rounded-2xl bg-white overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs border rounded px-2 py-0.5 font-medium ${STATUS_BADGE[proposal.status]}`}>
                {proposal.status}
              </span>
              {proposal.org_name && (
                <span className="text-xs font-medium text-black/70">{proposal.org_name}</span>
              )}
              <span className="text-xs text-black/40">
                {new Date(proposal.created_at).toLocaleDateString()}
              </span>
            </div>
            <p className="text-sm font-medium">{proposal.request_text}</p>
            {proposal.generated_code && (
              <p className="text-xs text-black/50 mt-1">
                {proposal.generated_code.files.length} file{proposal.generated_code.files.length !== 1 ? 's' : ''}:{' '}
                {proposal.generated_code.files.map(f => f.path).join(', ')}
              </p>
            )}
          </div>
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-black/40 hover:text-black/70 transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {proposal.status === 'pending' && (
          <div className="flex items-center gap-2 mt-3">
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional reviewer notes…"
              className="flex-1 text-xs border border-black/15 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-azure/40"
            />
            <button
              onClick={() => act('approved')}
              disabled={loading}
              className="flex items-center gap-1 text-xs bg-azure text-white rounded px-2.5 py-1.5 hover:bg-azure/90 disabled:opacity-50 transition-colors"
            >
              <CheckCircle className="w-3.5 h-3.5" /> Approve
            </button>
            <button
              onClick={() => act('rejected')}
              disabled={loading}
              className="flex items-center gap-1 text-xs bg-red-600 text-white rounded px-2.5 py-1.5 hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" /> Reject
            </button>
          </div>
        )}

        {proposal.status === 'approved' && (
          <button
            onClick={() => act('applied')}
            disabled={loading}
            className="mt-3 flex items-center gap-1 text-xs bg-green-600 text-white rounded px-2.5 py-1.5 hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <CheckSquare className="w-3.5 h-3.5" /> Mark as applied
          </button>
        )}

        {actError && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-red-700">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {actError}
          </div>
        )}
      </div>

      {expanded && proposal.generated_code && (
        <div className="border-t border-black/10 bg-neutral-50 p-4 space-y-4">
          {proposal.generated_code.files.map(file => (
            <div key={file.path}>
              <div className="flex items-center gap-2 mb-2">
                <FileCode className="w-3.5 h-3.5 text-black/40" />
                <span className="text-xs font-mono text-black/70">{file.path}</span>
              </div>
              <pre className="text-xs font-mono bg-white border border-black/10 rounded p-3 overflow-x-auto whitespace-pre-wrap max-h-64">
                {file.diff || file.content}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BuilderProposalsClient() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('pending');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch('/api/admin/builder/proposals?' + new URLSearchParams({ status: filter }), {
      signal: controller.signal,
    })
      .then(r => r.json())
      .then(d => { setProposals(d.proposals || []); setLoading(false); })
      .catch(err => { if (err.name !== 'AbortError') setLoading(false); });
    return () => controller.abort();
  }, [filter]);

  function handleUpdate(id: string, status: string) {
    setProposals(prev => prev.map(p => p.id === id ? { ...p, status: status as Proposal['status'] } : p));
  }

  return (
    <div className="min-h-screen bg-creme">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="font-serif text-3xl mb-6">Builder Proposals</h1>

        <div className="flex gap-2 mb-6">
          {['pending', 'approved', 'applied', 'rejected'].map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`text-sm px-3 py-1.5 rounded-2xl capitalize transition-colors ${
                filter === s
                  ? 'bg-azure text-white'
                  : 'bg-white border border-black/10 text-black/60 hover:text-black/80'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center text-black/40 py-12">Loading proposals…</div>
        ) : proposals.length === 0 ? (
          <div className="text-center text-black/40 py-12">No {filter} proposals.</div>
        ) : (
          <div className="space-y-4">
            {proposals.map(p => (
              <ProposalCard key={p.id} proposal={p} onUpdate={handleUpdate} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
