'use client';

import React from 'react';
import { InvestmentPerformance, formatCurrency, formatMultiple, formatPercentage, getMOICColorClass, getGainColorClass } from '@/lib/schemas/investment';
import MetricItem from '@/components/ui/MetricItem';

type Props = {
  investment: InvestmentPerformance;
  onViewDetails?: () => void;
  loading?: boolean;
};

export default function InvestmentPerformanceCard({ investment, onViewDetails, loading = false }: Props) {
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

  return (
    <div className="group rounded-2xl bg-white border border-black/5 shadow-soft p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg will-change-transform rm:transition-none rm:transform-none">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4 pb-3 border-b border-black/5">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-neutral-900 truncate">
            {investment.name}
          </h3>
          <div className="flex items-center gap-2 mt-1 text-xs text-neutral-600">
            {investment.asset_subtype && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-neutral-100">
                {investment.asset_subtype}
              </span>
            )}
            {investment.status && (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full ${
                  investment.status === 'Active'
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : investment.status === 'Exited'
                    ? 'bg-neutral-100 text-neutral-700'
                    : 'bg-blue-50 text-blue-700 border border-blue-200'
                }`}
              >
                {investment.status}
              </span>
            )}
            {investment.sector && <span>• {investment.sector}</span>}
            {investment.country && <span>• {investment.country}</span>}
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
        {/* Current NAV */}
        <MetricItem
          label="Current NAV"
          value={formatCurrency(investment.current_nav)}
          helpText={investment.nav_as_of_date ? `as of ${formatDate(investment.nav_as_of_date)}` : undefined}
        />

        {/* Cost Basis */}
        <MetricItem
          label="Cost Basis"
          value={formatCurrency(investment.cost_basis)}
          helpText={
            investment.investment_count
              ? `${investment.investment_count} investment${investment.investment_count > 1 ? 's' : ''}`
              : undefined
          }
        />

        {/* Total Distributions */}
        <MetricItem
          label="Distributions"
          value={formatCurrency(investment.total_distributions)}
          helpText={
            investment.distribution_count
              ? `${investment.distribution_count} distribution${investment.distribution_count > 1 ? 's' : ''}`
              : undefined
          }
        />

        {/* Unrealized Gain */}
        <MetricItem
          label="Unrealized Gain"
          value={formatCurrency(investment.unrealized_gain)}
          valueClassName={getGainColorClass(investment.unrealized_gain)}
          helpText={
            investment.unrealized_gain_pct !== null && investment.unrealized_gain_pct !== undefined
              ? formatPercentage(investment.unrealized_gain_pct)
              : undefined
          }
        />

        {/* Total Value */}
        <MetricItem
          label="Total Value"
          value={formatCurrency(investment.total_value)}
          helpText="NAV + distributions"
        />

        {/* MOIC */}
        <MetricItem
          label="MOIC"
          value={formatMultiple(investment.moic)}
          valueClassName={getMOICColorClass(investment.moic)}
          badge={
            investment.moic && investment.moic >= 2.0
              ? 'Excellent'
              : investment.moic && investment.moic >= 1.0
              ? 'Positive'
              : undefined
          }
        />
      </div>

      {/* Timeline */}
      {(investment.first_investment_date || investment.last_distribution_date) && (
        <div className="text-xs text-neutral-500 pt-3 border-t border-black/5 flex flex-wrap gap-x-4 gap-y-1">
          {investment.first_investment_date && (
            <span>
              First investment: <span className="text-neutral-700">{formatDate(investment.first_investment_date)}</span>
            </span>
          )}
          {investment.last_distribution_date && (
            <span>
              Last distribution: <span className="text-neutral-700">{formatDate(investment.last_distribution_date)}</span>
            </span>
          )}
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
