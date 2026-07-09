'use client';

import React from 'react';
import {
  GrantSummary,
  GRANT_TYPE_LABELS,
  formatGrantPeriod,
  getGrantPeriodStatusColorClass,
  daysUntilDue,
} from '@/lib/schemas/grant';
import { formatCurrency } from '@/lib/schemas/investment';
import MetricItem from '@/components/ui/MetricItem';

type Props = {
  grant: GrantSummary;
  onViewDetails?: () => void;
  loading?: boolean;
  grantLabel?: string;
};

export type Grant = GrantSummary;

export default function GrantSummaryCard({ grant, onViewDetails, loading = false, grantLabel = 'Grant' }: Props) {
  if (loading) {
    return (
      <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-5 animate-pulse">
        <div className="h-6 w-48 bg-neutral-200 rounded mb-4" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-16 bg-neutral-100 rounded" />
          <div className="h-16 bg-neutral-100 rounded" />
          <div className="h-16 bg-neutral-100 rounded" />
          <div className="h-16 bg-neutral-100 rounded" />
        </div>
      </div>
    );
  }

  const daysUntil = daysUntilDue(grant.next_report_due);
  const reportDueText =
    daysUntil !== null
      ? daysUntil > 0
        ? `${daysUntil} days`
        : daysUntil === 0
        ? 'Today'
        : `${Math.abs(daysUntil)} days overdue`
      : null;

  const milestoneProgressPct = grant.milestone_completion_pct || 0;

  return (
    <div className="group rounded-2xl bg-white border border-black/5 shadow-soft p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg will-change-transform rm:transition-none rm:transform-none">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4 pb-3 border-b border-black/5">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-neutral-900 truncate">{grant.name}</h3>
          <div className="flex items-center gap-2 mt-1 text-xs text-neutral-600">
            {grant.grant_type && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-azure/10 text-azure-deep border border-azure/20">
                {GRANT_TYPE_LABELS[grant.grant_type]}
              </span>
            )}
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full border ${getGrantPeriodStatusColorClass(
                grant.grant_period_status
              )}`}
            >
              {grant.grant_period_status}
            </span>
            {grant.sector && <span>• {grant.sector}</span>}
            {grant.country && <span>• {grant.country}</span>}
          </div>
        </div>
        {onViewDetails && (
          <button
            onClick={onViewDetails}
            className="shrink-0 text-xs rounded-2xl px-3 py-1.5 border border-black/10 bg-white/90 text-neutral-900 shadow-sm hover:shadow opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          >
            Details
          </button>
        )}
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <MetricItem label={`${grantLabel} Amount`} value={formatCurrency(grant.funds_allocated)} />

        <MetricItem
          label={`${grantLabel} Period`}
          value={formatGrantPeriod(grant.grant_period_start, grant.grant_period_end)}
        />

        {/* Reporting Frequency */}
        {grant.reporting_frequency && (
          <MetricItem label="Reporting" value={grant.reporting_frequency} />
        )}

        {/* Next Report Due */}
        {grant.next_report_due && (
          <MetricItem
            label="Next Report Due"
            value={reportDueText || '—'}
            valueClassName={daysUntil !== null && daysUntil < 0 ? 'text-red-600' : undefined}
            badge={daysUntil !== null && daysUntil < 7 && daysUntil >= 0 ? 'Due soon' : undefined}
            badgeColor="amber"
          />
        )}

        {/* Renewal Info */}
        {grant.renewal_eligible && grant.renewal_date && (
          <MetricItem
            label="Renewal Date"
            value={formatDate(grant.renewal_date)}
            badge="Eligible"
            badgeColor="amber"
          />
        )}
      </div>

      {/* Milestones Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-neutral-600">Milestone Progress</span>
          <span className="text-xs font-medium text-neutral-900 tabular-nums">
            {grant.milestones_completed} / {grant.total_milestones} completed
          </span>
        </div>

        {grant.total_milestones > 0 ? (
          <>
            <div className="relative h-2 bg-neutral-100 rounded-full overflow-hidden">
              <div
                className="absolute top-0 left-0 h-full bg-green-500 transition-all duration-300"
                style={{ width: `${milestoneProgressPct}%` }}
              />
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs">
              {grant.milestones_pending > 0 && (
                <span className="text-neutral-600">
                  {grant.milestones_pending} pending
                </span>
              )}
              {grant.milestones_overdue > 0 && (
                <span className="text-red-600 font-medium">
                  {grant.milestones_overdue} overdue
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="text-xs text-neutral-500 italic">No milestones defined</div>
        )}
      </div>

      {/* Reports Status */}
      {grant.total_reports > 0 && (
        <div className="pt-3 border-t border-black/5 flex items-center justify-between text-xs">
          <span className="text-neutral-600">Reports:</span>
          <div className="flex items-center gap-3">
            <span className="text-green-600">
              {grant.reports_submitted} submitted
            </span>
            {grant.reports_overdue > 0 && (
              <span className="text-red-600 font-medium">
                {grant.reports_overdue} overdue
              </span>
            )}
          </div>
        </div>
      )}

      {/* Deliverables (if exists) */}
      {grant.deliverables && (
        <div className="pt-3 border-t border-black/5 mt-3">
          <div className="text-xs text-neutral-600 mb-1">Deliverables</div>
          <div className="text-xs text-neutral-700 line-clamp-2">{grant.deliverables}</div>
        </div>
      )}
    </div>
  );
}


function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return dateString;
  }
}
