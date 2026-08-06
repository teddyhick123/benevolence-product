'use client';

import React from 'react';
import { PortfolioDonationSummary } from '@/lib/schemas/donation';
import { formatCurrency } from '@/lib/schemas/investment';
import MetricItem from '@/components/ui/MetricItem';

type Props = {
  summary: PortfolioDonationSummary;
  loading?: boolean;
  onViewAll?: () => void;
};

export default function PortfolioDonationSummaryCard({ summary, loading = false, onViewAll }: Props) {
  if (loading) {
    return (
      <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-6 animate-pulse">
        <div className="h-7 w-64 bg-neutral-200 rounded mb-5" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="h-20 bg-neutral-100 rounded" />
          <div className="h-20 bg-neutral-100 rounded" />
          <div className="h-20 bg-neutral-100 rounded" />
          <div className="h-20 bg-neutral-100 rounded" />
        </div>
      </div>
    );
  }

  const taxLinkageRate = summary.total_donations > 0
    ? (summary.linked_tax_contributions / summary.total_donations) * 100
    : 0;

  return (
    <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5 pb-4 border-b border-black/5">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900">Donation Portfolio</h3>
          <div className="flex items-center gap-3 mt-1.5 text-sm text-neutral-600">
            <span>{summary.total_donations} total donations</span>
            {summary.active_donations > 0 && (
              <span className="text-green-600">• {summary.active_donations} active</span>
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

      {/* Tax Benefits Banner */}
      {summary.total_appreciated_asset_gain > 0 && (
        <div className="mb-5 p-3 bg-green-50 border border-green-200 rounded-xl">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs font-medium text-green-900">Tax Optimization</span>
          </div>
          <div className="text-sm text-green-800">
            {formatCurrency(summary.total_appreciated_asset_gain)} in appreciated assets donated without sale
          </div>
        </div>
      )}

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
        {/* Total Donations */}
        <MetricItem
          label="Total Donations"
          value={formatCurrency(summary.total_donation_amount)}
          helpText={
            summary.avg_donation_amount > 0
              ? `${formatCurrency(summary.avg_donation_amount)} avg`
              : undefined
          }
        />

        {/* Tax Deductible */}
        <MetricItem
          label="Tax Deductible"
          value={formatCurrency(summary.total_tax_deductible_amount)}
          helpText={`${summary.linked_tax_contributions} contributions`}
        />

        {/* Largest Donation */}
        {summary.largest_donation > 0 && (
          <MetricItem
            label="Largest Donation"
            value={formatCurrency(summary.largest_donation)}
          />
        )}

        {/* Carryforward Available */}
        {summary.total_carryforward_available > 0 && (
          <MetricItem
            label="Carryforward"
            value={formatCurrency(summary.total_carryforward_available)}
            helpText="available for future years"
            badge="Unused"
            badgeColor="blue"
          />
        )}

        {/* Capital Gains Avoided */}
        {summary.total_appreciated_asset_gain > 0 && (
          <MetricItem
            label="Appreciated Assets"
            value={formatCurrency(summary.total_appreciated_asset_gain)}
            helpText="gain donated without sale"
          />
        )}

        {/* Tax Linkage Rate */}
        <MetricItem
          label="Tax Linked"
          value={`${Math.round(taxLinkageRate)}%`}
          helpText={`${summary.linked_tax_contributions} of ${summary.total_donations}`}
          badge={taxLinkageRate < 100 ? 'Incomplete' : 'Complete'}
          badgeColor={taxLinkageRate < 100 ? 'amber' : 'green'}
        />
      </div>

      {/* Tax Linkage Progress */}
      {taxLinkageRate < 100 && summary.total_donations > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <div className="text-xs font-medium text-amber-900 mb-1">
                {summary.total_donations - summary.linked_tax_contributions} donation{summary.total_donations - summary.linked_tax_contributions !== 1 ? 's' : ''} not linked to tax records
              </div>
              <div className="text-xs text-amber-700">
                Link donations to tax contributions to track deductions and carryforwards
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
