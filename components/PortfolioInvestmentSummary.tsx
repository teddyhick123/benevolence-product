'use client';

import React from 'react';
import { PortfolioInvestmentSummary, formatCurrency, formatMultiple, formatPercentage, getMOICColorClass, getGainColorClass } from '@/lib/schemas/investment';
import MetricItem from '@/components/ui/MetricItem';

type Props = {
  summary: PortfolioInvestmentSummary;
  loading?: boolean;
  onViewAll?: () => void;
};

export default function PortfolioInvestmentSummaryCard({ summary, loading = false, onViewAll }: Props) {
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

  return (
    <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5 pb-4 border-b border-black/5">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900">Investment Portfolio</h3>
          <div className="flex items-center gap-3 mt-1.5 text-sm text-neutral-600">
            <span>{summary.total_investments} total</span>
            <span className="text-green-600">• {summary.active_investments} active</span>
            {summary.exited_investments > 0 && (
              <span className="text-neutral-500">• {summary.exited_investments} exited</span>
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

      {/* Asset Type Breakdown */}
      <div className="mb-5 p-3 bg-neutral-50 rounded-xl">
        <div className="text-xs font-medium text-neutral-600 mb-2">Asset Types</div>
        <div className="flex flex-wrap gap-3 text-xs">
          {summary.equity_count > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-neutral-700">Equity: {summary.equity_count}</span>
            </div>
          )}
          {summary.debt_count > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-purple-500" />
              <span className="text-neutral-700">Debt: {summary.debt_count}</span>
            </div>
          )}
          {summary.pri_count > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-neutral-700">PRI: {summary.pri_count}</span>
            </div>
          )}
          {summary.mri_count > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-neutral-700">MRI: {summary.mri_count}</span>
            </div>
          )}
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {/* Current NAV */}
        <MetricItem
          label="Current NAV"
          value={formatCurrency(summary.total_current_nav)}
          helpText="Total current value"
        />

        {/* Cost Basis */}
        <MetricItem
          label="Cost Basis"
          value={formatCurrency(summary.total_cost_basis)}
          helpText="Total invested"
        />

        {/* Distributions */}
        <MetricItem
          label="Distributions"
          value={formatCurrency(summary.total_distributions)}
          helpText="Total received"
        />

        {/* Unrealized Gain */}
        <MetricItem
          label="Unrealized Gain"
          value={formatCurrency(summary.total_unrealized_gain)}
          valueClassName={getGainColorClass(summary.total_unrealized_gain)}
          helpText={
            summary.avg_unrealized_gain_pct !== null && summary.avg_unrealized_gain_pct !== undefined
              ? formatPercentage(summary.avg_unrealized_gain_pct) + ' avg'
              : undefined
          }
        />

        {/* Total Value */}
        <MetricItem
          label="Total Value"
          value={formatCurrency(summary.total_value)}
          helpText="NAV + distributions"
        />

        {/* Portfolio MOIC */}
        <MetricItem
          label="Portfolio MOIC"
          value={formatMultiple(summary.portfolio_moic)}
          valueClassName={getMOICColorClass(summary.portfolio_moic)}
          badge={
            summary.portfolio_moic && summary.portfolio_moic >= 2.0
              ? 'Excellent'
              : summary.portfolio_moic && summary.portfolio_moic >= 1.0
              ? 'Positive'
              : undefined
          }
        />
      </div>
    </div>
  );
}

