'use client';

import React from 'react';
import { PortfolioGrantSummary } from '@/lib/schemas/grant';
import { formatCurrency } from '@/lib/schemas/investment';
import MetricItem from '@/components/ui/MetricItem';

type Props = {
  summary: PortfolioGrantSummary;
  loading?: boolean;
  onViewAll?: () => void;
};

export default function PortfolioGrantSummaryCard({ summary, loading = false, onViewAll }: Props) {
  if (loading) {
    return (
      <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-6 animate-pulse">
        <div className="h-7 w-64 bg-neutral-200 rounded mb-5" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="h-20 bg-neutral-100 rounded" />
          <div className="h-20 bg-neutral-100 rounded" />
          <div className="h-20 bg-neutral-100 rounded" />
          <div className="h-20 bg-neutral-100 rounded" />
          <div className="h-20 bg-neutral-100 rounded" />
          <div className="h-20 bg-neutral-100 rounded" />
        </div>
      </div>
    );
  }

  const milestoneProgressPct = summary.avg_milestone_completion_pct || 0;
  const hasOverdueItems = summary.total_milestones_overdue > 0 || summary.total_reports_overdue > 0;

  return (
    <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5 pb-4 border-b border-black/5">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900">Grant Portfolio</h3>
          <div className="flex items-center gap-3 mt-1.5 text-sm text-neutral-600">
            <span>{summary.total_grants} total</span>
            <span className="text-green-600">• {summary.active_grants} active</span>
            {hasOverdueItems && (
              <span className="text-red-600 font-medium">• Action needed</span>
            )}
          </div>
        </div>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="text-sm px-4 py-2 rounded-2xl border border-black/10 bg-white/90 text-neutral-900 shadow-sm hover:shadow transition-all"
          >
            View All
          </button>
        )}
      </div>

      {/* Grant Type Breakdown */}
      <div className="mb-5 p-3 bg-neutral-50 rounded-xl">
        <div className="text-xs font-medium text-neutral-600 mb-2">Grant Types</div>
        <div className="flex flex-wrap gap-3 text-xs">
          {summary.foundation_grant_count > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-purple-500" />
              <span className="text-neutral-700">Foundation: {summary.foundation_grant_count}</span>
            </div>
          )}
          {summary.daf_grant_count > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-indigo-500" />
              <span className="text-neutral-700">DAF: {summary.daf_grant_count}</span>
            </div>
          )}
          {summary.general_operating_count > 0 && (
            <span className="text-neutral-600">• {summary.general_operating_count} operating</span>
          )}
          {summary.project_count > 0 && (
            <span className="text-neutral-600">• {summary.project_count} project</span>
          )}
          {summary.multi_year_count > 0 && (
            <span className="text-neutral-600">• {summary.multi_year_count} multi-year</span>
          )}
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
        {/* Total Allocated */}
        <MetricItem
          label="Total Allocated"
          value={formatCurrency(summary.total_funds_allocated)}
          helpText={`${formatCurrency(summary.avg_grant_size)} avg`}
        />

        {/* Active Grants */}
        <MetricItem
          label="Active Grants"
          value={summary.active_grants.toString()}
          helpText={
            summary.renewal_eligible_count > 0
              ? `${summary.renewal_eligible_count} renewable`
              : undefined
          }
        />

        {/* Milestones */}
        <MetricItem
          label="Milestones"
          value={`${summary.total_milestones_completed}/${summary.total_milestones}`}
          helpText={`${Math.round(milestoneProgressPct)}% complete`}
          badge={summary.total_milestones_overdue > 0 ? `${summary.total_milestones_overdue} overdue` : undefined}
          badgeColor="red"
        />

        {/* Reports */}
        <MetricItem
          label="Reports"
          value={`${summary.total_reports_submitted}/${summary.total_reports}`}
          helpText="submitted"
          badge={summary.total_reports_overdue > 0 ? `${summary.total_reports_overdue} overdue` : undefined}
          badgeColor="red"
        />

        {/* Next Report Due */}
        {summary.next_report_due && (
          <MetricItem
            label="Next Report"
            value={formatDate(summary.next_report_due)}
            helpText="due date"
          />
        )}

        {/* Next Renewal */}
        {summary.next_renewal_date && (
          <MetricItem
            label="Next Renewal"
            value={formatDate(summary.next_renewal_date)}
            helpText="opportunity"
          />
        )}
      </div>

      {/* Milestone Progress Bar */}
      {summary.total_milestones > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-neutral-600">Overall Milestone Progress</span>
            <span className="text-xs font-medium text-neutral-900 tabular-nums">
              {Math.round(milestoneProgressPct)}%
            </span>
          </div>
          <div className="relative h-2 bg-neutral-100 rounded-full overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full bg-green-500 transition-all duration-300"
              style={{ width: `${milestoneProgressPct}%` }}
            />
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs">
            {summary.total_milestones_pending > 0 && (
              <span className="text-neutral-600">
                {summary.total_milestones_pending} pending
              </span>
            )}
            {summary.total_milestones_overdue > 0 && (
              <span className="text-red-600 font-medium">
                {summary.total_milestones_overdue} overdue
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  } catch {
    return dateString;
  }
}
