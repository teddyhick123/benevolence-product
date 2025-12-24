'use client';

import * as React from 'react';
import type { PortfolioTaxSummary, DonorProfile, TaxYearDetail, DonationCapacity } from '@/lib/schemas/tax';
import { calculateAge } from '@/lib/schemas/tax';

export interface TaxSummaryDashboardProps {
  portfolioId: string;
  year?: number;
}

interface TaxSummaryData {
  taxYear: number;
  donorProfile: DonorProfile | null;
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
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        {error}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { donorProfile, taxYearData, summary, contributions, carryforwards, capacity } = data;

  // Calculate donor age if DOB exists
  const donorAge = donorProfile?.date_of_birth
    ? calculateAge(donorProfile.date_of_birth)
    : null;
  const qcdEligible = donorAge !== null && donorAge >= 70.5;

  // Check if AGI is set
  const hasAGI = taxYearData?.adjusted_gross_income && taxYearData.adjusted_gross_income > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-neutral-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-neutral-900">
              Tax Summary {year}
            </h2>
            <p className="text-sm text-neutral-600 mt-1">
              AGI-based deduction limits and carryforward tracking
            </p>
          </div>
          {donorProfile && donorAge !== null && (
            <div className="text-right">
              <p className="text-sm text-neutral-600">Donor Age</p>
              <p className="text-xl font-bold text-neutral-900">{donorAge}</p>
              {qcdEligible && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 mt-1">
                  QCD Eligible
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* AGI Setup Warning */}
      {!hasAGI && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex gap-3">
            <div className="text-2xl">⚠️</div>
            <div className="flex-1">
              <p className="font-medium text-amber-900 mb-1">
                AGI Not Set for {year}
              </p>
              <p className="text-sm text-amber-800">
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
        <div className="bg-white rounded-xl border border-neutral-200 p-6">
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
              color="indigo"
            />

            {/* 30% - Appreciated Property */}
            <LimitCard
              title="Appreciated Property"
              percentage={30}
              limit={summary.agi_limit_30_pct ?? 0}
              used={summary.contributed_30_pct ?? 0}
              remaining={capacity?.remaining_30_pct ?? 0}
              color="purple"
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
        <div className="bg-white rounded-xl border border-neutral-200 p-6">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">
            Tax Impact Summary
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard
              label="Total Deductible This Year"
              value={formatCurrency(summary.total_deductible_this_year)}
              subtext="After AGI limits applied"
              icon="✅"
            />
            <MetricCard
              label="Excess Carryforward"
              value={formatCurrency(summary.total_excess_carryforward)}
              subtext="Available for next 5 years"
              icon="📅"
              highlight={(summary.total_excess_carryforward ?? 0) > 0}
            />
            <MetricCard
              label="Capital Gains Avoided"
              value={formatCurrency(summary.total_capital_gains_avoided)}
              subtext="Tax-free appreciation donated"
              icon="📈"
            />
          </div>
        </div>
      )}

      {/* QCD Summary */}
      {qcdEligible && summary && (summary.total_qcd_amount ?? 0) > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex gap-3">
            <div className="text-2xl">💰</div>
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
        <div className="bg-white rounded-xl border border-neutral-200 p-6">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">
            Carryforward Schedule
          </h3>
          <div className="space-y-3">
            {carryforwards.map((cf: any) => (
              <div
                key={cf.id}
                className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg"
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
        <div className="bg-white rounded-xl border border-neutral-200 p-6">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">
            Contributions ({contributions.length})
          </h3>
          <div className="space-y-2">
            {contributions.map((contrib: any) => (
              <div
                key={contrib.id}
                className="flex items-center justify-between p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50"
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
                    <p className="text-xs text-amber-600">
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
        <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center">
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
  color: 'indigo' | 'purple' | 'green' | 'amber';
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
    indigo: 'bg-indigo-100 text-indigo-800',
    purple: 'bg-purple-100 text-purple-800',
    green: 'bg-green-100 text-green-800',
    amber: 'bg-amber-100 text-amber-800',
  };

  const barColors = {
    indigo: 'bg-indigo-500',
    purple: 'bg-purple-500',
    green: 'bg-green-500',
    amber: 'bg-amber-500',
  };

  return (
    <div className="bg-neutral-50 rounded-lg p-4">
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
  icon: string;
  highlight?: boolean;
}

function MetricCard({ label, value, subtext, icon, highlight }: MetricCardProps) {
  return (
    <div className={`p-4 rounded-lg ${highlight ? 'bg-amber-50 border border-amber-200' : 'bg-neutral-50'}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xl">{icon}</span>
        <p className="text-sm font-medium text-neutral-700">{label}</p>
      </div>
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
