'use client';
// components/admin/ReconciliationReport.tsx
// Displays reconciliation report with entity match rates, delta analysis, and action items

import { useState } from 'react';
import type { ReconciliationReport, EntityReconciliation } from '@/lib/import/reconciler';

interface ReconciliationReportProps {
  report: ReconciliationReport;
  onCommit?: () => void;
  onReviewErrors?: () => void;
}

export function ReconciliationReportView({ report, onCommit, onReviewErrors }: ReconciliationReportProps) {
  const [committing, setCommitting] = useState(false);

  const handleCommit = async () => {
    setCommitting(true);
    try {
      if (onCommit) onCommit();
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary card */}
      <div className={`p-4 rounded-lg border ${report.overallSuccess ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
        <div className="flex items-start gap-3">
          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${report.overallSuccess ? 'bg-green-200 text-green-900' : 'bg-yellow-200 text-yellow-900'}`}>
            {report.overallSuccess ? 'PASS' : 'ISSUES FOUND'}
          </span>
          <p className={`text-sm ${report.overallSuccess ? 'text-green-800' : 'text-yellow-800'}`}>
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
        <div className="border border-neutral-200 rounded-lg overflow-hidden text-sm">
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
              <li key={i} className="flex items-start gap-2 text-sm text-yellow-800 bg-yellow-50 border border-yellow-100 rounded-md px-3 py-2">
                <span className="mt-0.5 text-yellow-500">⚠</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* CTA buttons */}
      <div className="flex items-center gap-3 pt-2">
        {report.overallSuccess ? (
          <button
            onClick={handleCommit}
            disabled={committing}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {committing ? 'Committing…' : 'Looks good, Commit'}
          </button>
        ) : (
          <button
            onClick={onReviewErrors}
            className="px-4 py-2 bg-yellow-500 text-white text-sm rounded-md hover:bg-yellow-600 transition-colors"
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
  const barColor = entity.withinTolerance ? 'bg-green-500' : 'bg-yellow-500';

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
          <span className={entity.amountDelta > 0 ? 'text-yellow-700' : 'text-neutral-400'}>
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
