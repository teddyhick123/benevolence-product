'use client';

import * as React from 'react';
import type { PortfolioTaxSummary, TaxYearDetail, DonationCapacity } from '@/lib/schemas/tax';

export interface TaxSummaryDashboardProps {
  portfolioId: string;
  year?: number;
}

interface TaxSummaryData {
  taxYear: number;
  taxYearData: TaxYearDetail | null;
  summary: PortfolioTaxSummary | null;
  contributions: any[];
  carryforwards: any[];
  capacity: DonationCapacity | null;
}

export default function TaxSummaryDashboard({
  portfolioId,
  year = new Date().getFullYear(),
}: TaxSummaryDashboardProps) {
  const [data, setData] = React.useState<TaxSummaryData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch(`/api/portfolio/${portfolioId}/tax/summary?year=${year}`);
        const json = await res.json();

        if (!res.ok) {
          throw new Error(json.error || 'Failed to fetch tax summary');
        }

        setData(json.data);
      } catch (err: any) {
        setError(err.message || 'Failed to load tax summary');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [portfolioId, year]);

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '0%';
    return `${Math.round(value)}%`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-neutral-500">Loading tax summary...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700">
        {error}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { taxYearData, summary, contributions, carryforwards, capacity } = data;

  // Check if AGI is set
  const hasAGI = taxYearData?.adjusted_gross_income && taxYearData.adjusted_gross_income > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-neutral-900">
              Tax Summary {year}
            </h2>
            <p className="text-sm text-neutral-600 mt-1">
              AGI-based deduction limits and carryforward tracking
            </p>
          </div>
        </div>
      </div>

      {/* AGI Setup Warning */}
      {!hasAGI && (
        <div className="bg-sunset/15 border border-sunset/30 rounded-2xl p-4">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-coral flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <div className="flex-1">
              <p className="font-medium text-ink mb-1">
                AGI Not Set for {year}
              </p>
              <p className="text-sm text-ink">
                Enter your Adjusted Gross Income to calculate precise deduction limits and
                remaining capacity. Without AGI, we cannot determine if contributions exceed limits
                or generate carryforward schedules.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* AGI Limits Overview */}
      {hasAGI && summary && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-6">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">
            Deduction Limits & Utilization
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 60% - Cash to Public Charity */}
            <LimitCard
              title="Cash to Public Charity"
              percentage={60}
              limit={summary.agi_limit_60_pct ?? 0}
              used={summary.contributed_60_pct ?? 0}
              remaining={capacity?.remaining_60_pct ?? 0}
              color="azure"
            />

            {/* 30% - Appreciated Property */}
            <LimitCard
              title="Appreciated Property"
              percentage={30}
              limit={summary.agi_limit_30_pct ?? 0}
              used={summary.contributed_30_pct ?? 0}
              remaining={capacity?.remaining_30_pct ?? 0}
              color="coral"
            />

            {/* 50% - Conservation Easements */}
            <LimitCard
              title="Conservation Easements"
              percentage={50}
              limit={summary.agi_limit_50_pct ?? 0}
              used={summary.contributed_50_pct ?? 0}
              remaining={capacity?.remaining_50_pct ?? 0}
              color="green"
            />

            {/* 20% - Property to Foundation */}
            <LimitCard
              title="Property to Foundation"
              percentage={20}
              limit={summary.agi_limit_20_pct ?? 0}
              used={summary.contributed_20_pct ?? 0}
              remaining={capacity?.remaining_20_pct ?? 0}
              color="amber"
            />
          </div>
        </div>
      )}

      {/* Key Metrics */}
      {hasAGI && summary && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-6">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">
            Tax Impact Summary
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard
              label="Total Deductible This Year"
              value={formatCurrency(summary.total_deductible_this_year)}
              subtext="After AGI limits applied"
            />
            <MetricCard
              label="Excess Carryforward"
              value={formatCurrency(summary.total_excess_carryforward)}
              subtext="Available for next 5 years"
              highlight={(summary.total_excess_carryforward ?? 0) > 0}
            />
            <MetricCard
              label="Capital Gains Avoided"
              value={formatCurrency(summary.total_capital_gains_avoided)}
              subtext="Tax-free appreciation donated"
            />
          </div>
        </div>
      )}

      {/* QCD Summary */}
      {summary && (summary.total_qcd_amount ?? 0) > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <div className="flex-1">
              <p className="font-medium text-green-900 mb-1">
                QCD Contributions: {formatCurrency(summary.total_qcd_amount)}
              </p>
              <p className="text-sm text-green-800">
                Qualified Charitable Distributions ({summary.qcd_count} total) are excluded from
                income and count toward your RMD. Maximum $100,000 per year.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Carryforward Schedule */}
      {carryforwards && carryforwards.length > 0 && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-6">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">
            Carryforward Schedule
          </h3>
          <div className="space-y-3">
            {carryforwards.map((cf: any) => (
              <div
                key={cf.id}
                className="flex items-center justify-between p-3 bg-neutral-50 rounded-2xl"
              >
                <div className="flex-1">
                  <p className="font-medium text-neutral-900">
                    {cf.recipient_name || 'Contribution'}
                  </p>
                  <p className="text-sm text-neutral-600">
                    Expires: {cf.expires_tax_year} ({cf.years_until_expiry} years remaining)
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-neutral-900">
                    {formatCurrency(cf.amount_remaining)}
                  </p>
                  <p className="text-xs text-neutral-500">
                    of {formatCurrency(cf.original_amount)}
                  </p>
                </div>
                <div className="ml-4">
                  <StatusBadge status={cf.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contributions List */}
      {contributions && contributions.length > 0 && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-6">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">
            Contributions ({contributions.length})
          </h3>
          <div className="space-y-2">
            {contributions.map((contrib: any) => (
              <div
                key={contrib.id}
                className="flex items-center justify-between p-3 border border-neutral-200 rounded-2xl hover:bg-neutral-50"
              >
                <div className="flex-1">
                  <p className="font-medium text-neutral-900">{contrib.recipient_name}</p>
                  <p className="text-sm text-neutral-600">
                    {new Date(contrib.contribution_date).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-neutral-900">
                    {formatCurrency(contrib.amount_usd)}
                  </p>
                  {contrib.deductible_this_year && (
                    <p className="text-sm text-neutral-600">
                      Deductible: {formatCurrency(contrib.deductible_this_year)}
                    </p>
                  )}
                  {contrib.excess_for_carryforward && contrib.excess_for_carryforward > 0 && (
                    <p className="text-xs text-coral">
                      Carryforward: {formatCurrency(contrib.excess_for_carryforward)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {contributions.length === 0 && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-12 text-center">
          <p className="text-neutral-500">
            No contributions recorded for {year}. Add contributions to see tax impact calculations.
          </p>
        </div>
      )}
    </div>
  );
}

// Helper Components

interface LimitCardProps {
  title: string;
  percentage: number;
  limit: number;
  used: number;
  remaining: number;
  color: 'azure' | 'coral' | 'green' | 'sunset';
}

function LimitCard({ title, percentage, limit, used, remaining, color }: LimitCardProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const utilizationPct = limit > 0 ? (used / limit) * 100 : 0;
  const isOverLimit = used > limit;

  const colorClasses = {
    azure: 'bg-azure/10 text-azure-deep border border-azure/20',
    coral: 'bg-coral/10 text-coral border border-coral/25',
    green: 'bg-green-100 text-green-800',
    sunset: 'bg-sunset/15 text-ink border border-sunset/30',
  };

  const barColors = {
    azure: 'bg-azure',
    coral: 'bg-coral',
    green: 'bg-green-500',
    sunset: 'bg-sunset',
  };

  return (
    <div className="bg-neutral-50 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-neutral-700">{title}</p>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorClasses[color]}`}>
          {percentage}% of AGI
        </span>
      </div>
      <p className="text-2xl font-bold text-neutral-900 mb-1">{formatCurrency(limit)}</p>
      <div className="mt-2 mb-3">
        <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${isOverLimit ? 'bg-red-500' : barColors[color]} transition-all`}
            style={{ width: `${Math.min(utilizationPct, 100)}%` }}
          />
        </div>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-neutral-600">
          Used: {formatCurrency(used)} ({Math.round(utilizationPct)}%)
        </span>
        <span className={isOverLimit ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
          {isOverLimit ? 'Over Limit' : `${formatCurrency(remaining)} left`}
        </span>
      </div>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  subtext: string;
  highlight?: boolean;
}

function MetricCard({ label, value, subtext, highlight }: MetricCardProps) {
  return (
    <div className={`p-4 rounded-2xl ${highlight ? 'bg-sunset/15 border border-sunset/30' : 'bg-neutral-50'}`}>
      <p className="text-sm font-medium text-neutral-700 mb-1">{label}</p>
      <p className="text-2xl font-bold text-neutral-900 mb-1">{value}</p>
      <p className="text-xs text-neutral-600">{subtext}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const statusConfig = {
    available: { label: 'Available', class: 'bg-green-100 text-green-800' },
    partially_used: { label: 'Partial', class: 'bg-azure/10 text-azure' },
    fully_used: { label: 'Used', class: 'bg-neutral-100 text-neutral-800' },
    expired: { label: 'Expired', class: 'bg-red-100 text-red-800' },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.available;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.class}`}>
      {config.label}
    </span>
  );
}
