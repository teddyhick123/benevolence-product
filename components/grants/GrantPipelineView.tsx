'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { LIFECYCLE_STAGES, type LifecycleStage } from '@/lib/grants/lifecycle-shared';
import { GRANT_RISK_BADGE, grantStageLabel, grantStagePalette } from './grantPalette';
import { useStageLabels } from '@/lib/hooks/use-stage-labels';
import { useEntityVocabulary } from '@/lib/hooks/use-entity-vocabulary';

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
  portfolios?: { name: string | null } | null;
}

interface Props {
  grants: GrantListItem[];
  loading?: boolean;
  onNewGrant?: () => void;
  // Selection mode
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onSelectAllInStage?: (stage: LifecycleStage, ids: string[]) => void;
  orgId?: string | null;
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

interface GrantCardProps {
  grant: GrantListItem;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  animDelay: number;
  grantLabel: string;
}

function GrantCard({ grant, selectionMode, selected, onToggleSelect, animDelay, grantLabel }: GrantCardProps) {
  const amount = grant.approved_amount ?? grant.requested_amount;
  const days = daysUntil(grant.grant_period_end);

  const cardContent = (
    <>
      {selectionMode && (
        <input
          type="checkbox"
          data-grant-id={grant.id}
          checked={selected}
          onChange={() => onToggleSelect(grant.id)}
          onClick={e => e.stopPropagation()}
          className="absolute top-2 left-2 w-4 h-4 rounded accent-azure cursor-pointer"
          style={{
            animation: `fadeIn 150ms ease-out both`,
            animationDelay: `${animDelay}ms`,
          }}
        />
      )}
      <div className={`text-sm font-medium text-ink leading-snug truncate ${selectionMode ? 'ml-6' : ''}`}>
        {grant.holdings?.name ?? `Unnamed ${grantLabel}`}
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
      {grant.portfolios?.name && (
        <div className="truncate text-xs text-neutral-400">{grant.portfolios.name}</div>
      )}
    </>
  );

  const cardClass = `relative block rounded-2xl border border-black/5 bg-white shadow-sm transition-shadow p-3 space-y-2 ${
    selectionMode
      ? selected
        ? 'ring-2 ring-azure cursor-pointer hover:shadow-md'
        : 'cursor-pointer hover:shadow-md'
      : 'hover:shadow-md'
  }`;

  if (selectionMode) {
    return (
      <div
        data-card
        className={cardClass}
        onClick={() => onToggleSelect(grant.id)}
      >
        {cardContent}
      </div>
    );
  }

  return (
    <Link href={`/dashboard/grants/${grant.id}`} className={cardClass} data-card>
      {cardContent}
    </Link>
  );
}

// Only show stages that have grants + key active stages
const ACTIVE_STAGES: LifecycleStage[] = [
  'prospect', 'invited', 'application_received', 'due_diligence',
  'recommended', 'approved', 'agreement', 'active', 'renewal_review', 'closeout',
];

export default function GrantPipelineView({
  grants,
  loading,
  onNewGrant,
  selectionMode = false,
  selectedIds = new Set(),
  onToggleSelect = () => {},
  onSelectAllInStage = () => {},
  orgId,
}: Props) {
  const { getLabel } = useStageLabels(orgId);
  const vocabulary = useEntityVocabulary(orgId);
  const grantLabel = vocabulary.grant.singular;
  const grantPlural = vocabulary.grant.plural.toLowerCase();
  const byStage = useMemo(() => {
    const map = new Map<LifecycleStage, GrantListItem[]>();
    for (const s of LIFECYCLE_STAGES) map.set(s, []);
    for (const g of grants) {
      const list = map.get(g.lifecycle_stage);
      if (list) list.push(g);
    }
    return map;
  }, [grants]);

  const visibleStages = LIFECYCLE_STAGES.filter(
    s => ACTIVE_STAGES.includes(s) || (byStage.get(s)?.length ?? 0) > 0
  );

  if (loading && grants.length === 0) {
    return (
      <div className="animate-pulse grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-32 bg-neutral-100 rounded-2xl" />)}
      </div>
    );
  }

  if (grants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="w-14 h-14 rounded-full bg-azure/10 flex items-center justify-center">
          <svg className="w-7 h-7 text-azure" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
          </svg>
        </div>
        <div>
          <p className="font-medium text-ink">No {grantPlural} in the pipeline</p>
          <p className="text-sm text-neutral-500 mt-1">Create your first {grantLabel.toLowerCase()} to start tracking the lifecycle.</p>
        </div>
        {onNewGrant && (
          <button
            onClick={onNewGrant}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-azure rounded-2xl hover:bg-azure/90"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New {grantLabel}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max">
          {visibleStages.map((stage, colIndex) => {
            const stageGrants = byStage.get(stage) ?? [];
            const colors = grantStagePalette(stage);
            const totalAmount = stageGrants.reduce((s, g) => s + (g.approved_amount ?? g.requested_amount ?? 0), 0);
            const allSelected = stageGrants.length > 0 && stageGrants.every(g => selectedIds.has(g.id));
            const stageIds = stageGrants.map(g => g.id);

            return (
              <div key={stage} className="flex flex-col w-52 gap-2">
                {/* Column header */}
                <div className={`flex items-center justify-between rounded-2xl border px-2.5 py-1.5 ${colors.column}`}>
                  <div className="flex items-center gap-1.5">
                    {selectionMode && (
                      <input
                        type="checkbox"
                        data-stage-header={stage}
                        checked={allSelected}
                        onChange={() => onSelectAllInStage(stage, stageIds)}
                        className="w-3.5 h-3.5 rounded accent-azure cursor-pointer"
                      />
                    )}
                    <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                    <span className="text-xs font-semibold">{orgId ? getLabel(stage) : grantStageLabel(stage)}</span>
                  </div>
                  <span className="text-xs font-medium opacity-70">{stageGrants.length}</span>
                </div>

                {/* Amount total */}
                {totalAmount > 0 && (
                  <div className="text-xs text-neutral-400 text-center">{fmt(totalAmount)}</div>
                )}

                {/* Cards */}
                <div className="space-y-2 min-h-[80px]">
                  {stageGrants.map((g, cardIndex) => (
                    <GrantCard
                      key={g.id}
                      grant={g}
                      selectionMode={selectionMode}
                      selected={selectedIds.has(g.id)}
                      onToggleSelect={onToggleSelect}
                      animDelay={colIndex * 20 + cardIndex * 10}
                      grantLabel={grantLabel}
                    />
                  ))}
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
