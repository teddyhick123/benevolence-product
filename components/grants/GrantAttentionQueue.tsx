'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { GrantListItem } from './GrantPipelineView';

const RISK_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const RISK_STYLES: Record<string, { bar: string; badge: string; label: string }> = {
  critical: { bar: 'bg-red-500',    badge: 'bg-red-100 text-red-800',    label: 'Critical' },
  high:     { bar: 'bg-orange-400', badge: 'bg-orange-100 text-orange-700', label: 'High' },
  medium:   { bar: 'bg-yellow-400', badge: 'bg-yellow-100 text-yellow-700', label: 'Medium' },
  low:      { bar: 'bg-green-400',  badge: 'bg-green-100 text-green-700',   label: 'Low' },
};

const STAGE_ATTENTION: Record<string, string> = {
  agreement:      'Unsigned agreement',
  renewal_review: 'Renewal pending',
  closeout:       'Closeout pending',
  recommended:    'Awaiting approval',
  approved:       'Agreement not started',
};

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.round((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

function fmt(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

interface Props {
  grants: GrantListItem[];
  onNewGrant?: () => void;
}

type FilterMode = 'all' | 'overdue' | 'high_risk' | 'stage_attention';

export default function GrantAttentionQueue({ grants, onNewGrant }: Props) {
  const [mode, setMode] = useState<FilterMode>('all');

  const sorted = useMemo(() => {
    let rows = [...grants];

    // Apply mode filter
    if (mode === 'overdue') {
      rows = rows.filter(g => {
        const d = daysUntil(g.grant_period_end);
        return d !== null && d < 0;
      });
    } else if (mode === 'high_risk') {
      rows = rows.filter(g => g.risk_level === 'high' || g.risk_level === 'critical');
    } else if (mode === 'stage_attention') {
      rows = rows.filter(g => Object.keys(STAGE_ATTENTION).includes(g.lifecycle_stage));
    }

    // Sort: critical first, then by period_end (overdue first, then nearest)
    rows.sort((a, b) => {
      const ra = RISK_ORDER[a.risk_level ?? ''] ?? 4;
      const rb = RISK_ORDER[b.risk_level ?? ''] ?? 4;
      if (ra !== rb) return ra - rb;
      const da = daysUntil(a.grant_period_end) ?? 9999;
      const db = daysUntil(b.grant_period_end) ?? 9999;
      return da - db;
    });

    return rows;
  }, [grants, mode]);

  const counts = useMemo(() => ({
    all: grants.length,
    overdue: grants.filter(g => { const d = daysUntil(g.grant_period_end); return d !== null && d < 0; }).length,
    high_risk: grants.filter(g => g.risk_level === 'high' || g.risk_level === 'critical').length,
    stage_attention: grants.filter(g => Object.keys(STAGE_ATTENTION).includes(g.lifecycle_stage)).length,
  }), [grants]);

  if (grants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
          <svg className="w-7 h-7 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <p className="font-medium text-gray-900">All clear</p>
          <p className="text-sm text-gray-500 mt-1">No grants need immediate attention.</p>
        </div>
        {onNewGrant && (
          <button onClick={onNewGrant} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-azure rounded-lg hover:bg-azure/90">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Grant
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mode tabs */}
      <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        {([
          { key: 'all', label: 'All' },
          { key: 'overdue', label: 'Overdue' },
          { key: 'high_risk', label: 'High Risk' },
          { key: 'stage_attention', label: 'Needs Action' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              mode === key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
            {counts[key] > 0 && (
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${
                mode === key ? 'bg-gray-100 text-gray-600' : 'bg-gray-200 text-gray-500'
              }`}>
                {counts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-lg bg-green-50 border border-green-100 p-6 text-center">
          <p className="text-sm font-medium text-green-700">
            {mode === 'overdue' ? 'No overdue grants' :
             mode === 'high_risk' ? 'No high-risk grants' :
             'No grants need immediate action'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(g => {
            const days = daysUntil(g.grant_period_end);
            const amount = g.approved_amount ?? g.requested_amount;
            const risk = g.risk_level ?? '';
            const styles = RISK_STYLES[risk];
            const stageNote = STAGE_ATTENTION[g.lifecycle_stage];

            return (
              <div key={g.id} className="relative flex items-center gap-4 rounded-xl border border-black/5 bg-white shadow-sm p-4 hover:shadow-md transition-shadow overflow-hidden">
                {/* Risk color bar */}
                {styles && (
                  <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${styles.bar}`} />
                )}

                <div className="flex-1 min-w-0 pl-2">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Link href={`/dashboard/grants/${g.id}`} className="font-medium text-gray-900 hover:text-azure truncate">
                      {g.holdings?.name ?? 'Unnamed Grant'}
                    </Link>
                    {styles && (
                      <span className={`shrink-0 text-xs rounded-full px-2 py-0.5 font-medium ${styles.badge}`}>
                        {styles.label}
                      </span>
                    )}
                    {stageNote && (
                      <span className="shrink-0 text-xs rounded-full px-2 py-0.5 bg-amber-100 text-amber-700 font-medium">
                        {stageNote}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                    <span className="font-medium text-gray-700">{fmt(amount)}</span>
                    {days !== null && (
                      <span className={days < 0 ? 'text-red-600 font-medium' : days < 30 ? 'text-amber-600' : 'text-gray-400'}>
                        {days < 0 ? `Period ended ${Math.abs(days)}d ago` : `Period ends in ${days}d`}
                      </span>
                    )}
                    <span className="capitalize">{g.lifecycle_stage?.replace(/_/g, ' ')}</span>
                  </div>
                </div>

                <Link
                  href={`/dashboard/grants/${g.id}`}
                  className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-azure bg-azure/5 rounded-lg hover:bg-azure/10 transition-colors"
                >
                  Review
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
