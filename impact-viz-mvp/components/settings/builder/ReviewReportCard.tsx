'use client';

import { useState } from 'react';
import { CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';

interface Finding {
  severity: 'error' | 'warning' | 'info';
  description: string;
}

interface ReviewReportCardProps {
  score: number;
  findings: Finding[];
  proposalId: string;
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? 'text-green-700 bg-green-50 border-green-200'
    : score >= 60 ? 'text-amber-700 bg-amber-50 border-amber-200'
    : 'text-red-700 bg-red-50 border-red-200';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${color}`}>
      {score >= 80 ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
      {score}/100
    </span>
  );
}

export default function ReviewReportCard({ score, findings, proposalId }: ReviewReportCardProps) {
  const hasIssues = findings.some(f => f.severity === 'error' || f.severity === 'warning');
  const [expanded, setExpanded] = useState(hasIssues || score < 80);

  const errors = findings.filter(f => f.severity === 'error');
  const warnings = findings.filter(f => f.severity === 'warning');
  const infos = findings.filter(f => f.severity === 'info');

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm max-w-[90%]">
      <button
        className="w-full flex items-center justify-between px-4 py-3"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <span className="font-medium">Review Report</span>
          <ScoreBadge score={score} />
        </div>
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-200 space-y-2 mt-2">
          {errors.map((f, i) => (
            <div key={i} className="flex gap-2 text-xs text-red-700">
              <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{f.description}</span>
            </div>
          ))}
          {warnings.map((f, i) => (
            <div key={i} className="flex gap-2 text-xs text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{f.description}</span>
            </div>
          ))}
          {infos.map((f, i) => (
            <div key={i} className="flex gap-2 text-xs text-slate-600">
              <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
              <span>{f.description}</span>
            </div>
          ))}
          {findings.length === 0 && (
            <p className="text-xs text-green-700 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" />
              No issues found.
            </p>
          )}
          <a
            href="/admin/builder"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1"
          >
            View full diff in admin <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
}
