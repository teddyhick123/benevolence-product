'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { LIFECYCLE_STAGES, type LifecycleStage } from '@/lib/grants/lifecycle-shared';
import { GRANT_RISK_BADGE, grantStageLabel, grantStagePalette } from './grantPalette';

export interface GrantListItem {
  id: string;
  holding_id: string;
  lifecycle_stage: LifecycleStage;
  requested_amount: number | null;
  approved_amount: number | null;
  currency: string | null;
  grant_period_end: string | null;
  risk_level: string | null;
  internal_owner_id: string | null;
  holdings: { name: string } | null;
}

interface Props {
  grants: GrantListItem[];
  onNewGrant?: () => void;
}

function fmt(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.round((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

function GrantCard({ grant }: { grant: GrantListItem }) {
  const amount = grant.approved_amount ?? grant.requested_amount;
  const days = daysUntil(grant.grant_period_end);

  return (
    <Link
      href={`/dashboard/grants/${grant.id}`}
      className="block rounded-2xl border border-black/5 bg-white shadow-sm hover:shadow-md transition-shadow p-3 space-y-2"
    >
      <div className="text-sm font-medium text-ink leading-snug truncate">
        {grant.holdings?.name ?? 'Unnamed Grant'}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-500 font-semibold">{fmt(amount)}</span>
        {grant.risk_level && (
          <span className={`rounded-full px-1.5 py-0.5 text-xs ${GRANT_RISK_BADGE[grant.risk_level] ?? 'border border-neutral-200 bg-neutral-100 text-neutral-600'}`}>
            {grant.risk_level}
          </span>
        )}
      </div>

      {days !== null && (
        <div className={`text-xs ${days < 0 ? 'text-red-600' : days < 30 ? 'text-coral' : 'text-neutral-400'}`}>
          {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
        </div>
      )}
    </Link>
  );
}

// Only show stages that have grants + key active stages
const ACTIVE_STAGES = [
  'prospect', 'invited', 'application_received', 'due_diligence',
  'recommended', 'approved', 'agreement', 'active', 'renewal_review', 'closeout',
];

export default function GrantPipelineView({ grants, onNewGrant }: Props) {
  const byStage = useMemo(() => {
    const map = new Map<string, GrantListItem[]>();
    for (const s of LIFECYCLE_STAGES) map.set(s, []);
    for (const g of grants) {
      const list = map.get(g.lifecycle_stage);
      if (list) list.push(g);
    }
    return map;
  }, [grants]);

  // Show stages that have grants, plus the ACTIVE_STAGES set
  const visibleStages = LIFECYCLE_STAGES.filter(
    s => ACTIVE_STAGES.includes(s) || (byStage.get(s)?.length ?? 0) > 0
  );

  if (grants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="w-14 h-14 rounded-full bg-azure/10 flex items-center justify-center">
          <svg className="w-7 h-7 text-azure" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
          </svg>
        </div>
        <div>
          <p className="font-medium text-ink">No grants in the pipeline</p>
          <p className="text-sm text-neutral-500 mt-1">Create your first grant to start tracking the lifecycle.</p>
        </div>
        {onNewGrant && (
          <button
            onClick={onNewGrant}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-azure rounded-2xl hover:bg-azure/90"
          >
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
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-3 min-w-max">
        {visibleStages.map(stage => {
          const stageGrants = byStage.get(stage) ?? [];
          const colors = grantStagePalette(stage);
          const totalAmount = stageGrants.reduce((s, g) => s + (g.approved_amount ?? g.requested_amount ?? 0), 0);

          return (
            <div key={stage} className="flex flex-col w-52 gap-2">
              {/* Column header */}
              <div className={`flex items-center justify-between rounded-2xl border px-2.5 py-1.5 ${colors.column}`}>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                  <span className="text-xs font-semibold">{grantStageLabel(stage)}</span>
                </div>
                <span className="text-xs font-medium opacity-70">
                  {stageGrants.length}
                </span>
              </div>

              {/* Amount total */}
              {totalAmount > 0 && (
                <div className="text-xs text-neutral-400 text-center">{fmt(totalAmount)}</div>
              )}

              {/* Cards */}
              <div className="space-y-2 min-h-[80px]">
                {stageGrants.map(g => <GrantCard key={g.id} grant={g} />)}
                {stageGrants.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-black/5 h-16 flex items-center justify-center">
                    <span className="text-xs text-neutral-300">Empty</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
