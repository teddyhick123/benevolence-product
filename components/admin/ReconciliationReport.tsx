'use client';

import { apiRequest, readJson } from "@/lib/api/client";
// components/admin/ReconciliationReport.tsx
// Displays reconciliation report with entity match rates, delta analysis, and action items

import { useState } from 'react';
import type { ReconciliationReport, EntityReconciliation } from '@/lib/import/reconciler';
import type { ReconciliationAnalysis } from '@/lib/import/ai/reconcile';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  warning: 'bg-sunset/15 text-ink border-sunset/30',
  info: 'bg-azure/10 text-azure-deep border-azure/20',
};

interface ReconciliationReportProps {
  report: ReconciliationReport & { ai_analysis?: ReconciliationAnalysis };
  onCommit?: () => void;
  onReviewErrors?: () => void;
  importJobId?: string;
}

export function ReconciliationReportView({ report, onCommit, onReviewErrors, importJobId }: ReconciliationReportProps) {
  const [committing, setCommitting] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<ReconciliationAnalysis | undefined>(report.ai_analysis);
  const [loadingAi, setLoadingAi] = useState(false);

  const handleCommit = async () => {
    setCommitting(true);
    try {
      if (onCommit) onCommit();
    } finally {
      setCommitting(false);
    }
  };

  const handleRunAiAnalysis = async () => {
    if (!importJobId) return;
    setLoadingAi(true);
    try {
      const res = await apiRequest(`/api/admin/imports/${importJobId}/ai/reconcile`, { method: 'POST' });
      if (res.ok) {
        const data = await readJson(res) as { analysis: ReconciliationAnalysis };
        setAiAnalysis(data.analysis);
      }
    } finally {
      setLoadingAi(false);
    }
  };

  const autoFixableCount = aiAnalysis?.suggestedFixes.filter((f) => f.autoFixable).length ?? 0;

  return (
    <div className="space-y-6">
      {/* Summary card */}
      <div className={`p-4 rounded-2xl border ${report.overallSuccess ? 'bg-green-50 border-green-200' : 'bg-sunset/15 border-sunset/30'}`}>
        <div className="flex items-start gap-3">
          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${report.overallSuccess ? 'bg-green-200 text-green-900' : 'bg-sunset/20 text-ink'}`}>
            {report.overallSuccess ? 'PASS' : 'ISSUES FOUND'}
          </span>
          <p className={`text-sm ${report.overallSuccess ? 'text-green-800' : 'text-ink'}`}>
            {report.summary}
          </p>
        </div>
        <p className="text-xs text-neutral-500 mt-2">
          Generated {new Date(report.generatedAt).toLocaleString()}
        </p>
      </div>

      {/* Entity table */}
      <div>
        <h4 className="text-sm font-medium mb-3">Entity Breakdown</h4>
        <div className="border border-neutral-200 rounded-2xl overflow-hidden text-sm">
          <table className="w-full">
            <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 text-left">Entity</th>
                <th className="px-4 py-2 text-right">Source</th>
                <th className="px-4 py-2 text-right">Loaded</th>
                <th className="px-4 py-2 text-right">Failed</th>
                <th className="px-4 py-2 text-left">Match Rate</th>
                <th className="px-4 py-2 text-right">Amount Delta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {report.entities.map((entity) => (
                <EntityRow key={entity.entity} entity={entity} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action items */}
      {report.actionItems.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Action Items</h4>
          <ul className="space-y-1.5">
            {report.actionItems.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink bg-sunset/15 border border-sunset/30 rounded-2xl px-3 py-2">
                <span className="mt-0.5 text-coral">⚠</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* AI Analysis */}
      {aiAnalysis ? (
        <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">AI Analysis</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${aiAnalysis.isAcceptable ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>
              {aiAnalysis.isAcceptable ? 'Acceptable' : 'Action Required'}
            </span>
            <span className="text-xs text-neutral-400 ml-auto">
              Confidence: {(aiAnalysis.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <blockquote className="border-l-4 border-azure pl-3 text-sm text-neutral-700 italic">
            {aiAnalysis.explanation}
          </blockquote>
          {aiAnalysis.rootCauses.length > 0 && (
            <div>
              <p className="text-xs font-medium text-neutral-500 mb-1">Root Causes</p>
              <ul className="list-disc list-inside space-y-0.5 text-sm text-neutral-700">
                {aiAnalysis.rootCauses.map((cause, i) => <li key={i}>{cause}</li>)}
              </ul>
            </div>
          )}
          {aiAnalysis.suggestedFixes.length > 0 && (
            <div>
              <p className="text-xs font-medium text-neutral-500 mb-1.5">Suggested Fixes</p>
              <div className="space-y-2">
                {aiAnalysis.suggestedFixes.map((fix, i) => (
                  <div key={i} className={`flex items-start gap-2 text-sm px-3 py-2 rounded border ${SEVERITY_COLORS[fix.severity]}`}>
                    <span className="font-medium capitalize text-xs mt-0.5">{fix.severity}</span>
                    <span>{fix.description}</span>
                    {fix.autoFixable && (
                      <span className="ml-auto text-xs bg-white rounded px-1.5 py-0.5 border">Auto-fixable</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {autoFixableCount > 0 && (
            <button className="text-sm text-azure hover:underline">
              Auto-fix {autoFixableCount} issue{autoFixableCount !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      ) : (
        importJobId && (
          <button
            onClick={handleRunAiAnalysis}
            disabled={loadingAi}
            className="text-sm text-azure hover:underline disabled:opacity-50"
          >
            {loadingAi ? 'Running AI analysis…' : 'Run AI analysis'}
          </button>
        )
      )}

      {/* CTA buttons */}
      <div className="flex items-center gap-3 pt-2">
        {report.overallSuccess ? (
          <button
            onClick={handleCommit}
            disabled={committing}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded-2xl hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {committing ? 'Committing…' : 'Looks good, Commit'}
          </button>
        ) : (
          <button
            onClick={onReviewErrors}
            className="px-4 py-2 bg-sunset text-white text-sm rounded-2xl hover:bg-sunset/90 transition-colors"
          >
            Review Issues
          </button>
        )}
      </div>
    </div>
  );
}

function EntityRow({ entity }: { entity: EntityReconciliation }) {
  const pct = (entity.matchRate * 100).toFixed(1);
  const barColor = entity.withinTolerance ? 'bg-green-500' : 'bg-sunset';

  return (
    <tr className="hover:bg-neutral-50">
      <td className="px-4 py-3 font-medium capitalize">{entity.entity}</td>
      <td className="px-4 py-3 text-right tabular-nums">{entity.sourceCount.toLocaleString()}</td>
      <td className="px-4 py-3 text-right tabular-nums">{entity.loadedCount.toLocaleString()}</td>
      <td className="px-4 py-3 text-right tabular-nums">
        {entity.failedCount > 0 ? (
          <span className="text-red-600">{entity.failedCount.toLocaleString()}</span>
        ) : (
          <span className="text-neutral-400">0</span>
        )}
      </td>
      <td className="px-4 py-3 w-48">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${barColor} transition-all`}
              style={{ width: `${Math.min(100, entity.matchRate * 100)}%` }}
            />
          </div>
          <span className="text-xs tabular-nums text-neutral-600">{pct}%</span>
        </div>
      </td>
      <td className="px-4 py-3 text-right text-xs">
        {entity.amountDelta !== undefined ? (
          <span className={entity.amountDelta > 0 ? 'text-ink' : 'text-neutral-400'}>
            {entity.amountDelta > 0
              ? `$${entity.amountDelta.toFixed(2)} (${entity.amountDeltaPercent?.toFixed(2)}%)`
              : '—'}
          </span>
        ) : (
          <span className="text-neutral-400">N/A</span>
        )}
      </td>
    </tr>
  );
}
