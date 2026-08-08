'use client';

import { useAnalyticsData } from "@/lib/analytics/hooks";

import { useState } from 'react';

type RiskSummary = {
  snapshot_date: string;
  total_holdings: number;
  total_allocation: number;
  overall_risk_score: number | null;
  overall_risk_level: string | null;
  concentration?: {
    top_3_percent: number;
    risk_level: string;
  };
  sector?: {
    largest_sector_percent: number;
    sector_count: number;
    risk_level: string;
  };
  geography?: {
    largest_geography_percent: number;
    geography_count: number;
    risk_level: string;
  };
};

type InsightSummary = {
  total_active: number;
  by_severity: Record<string, number>;
  by_category: Record<string, number>;
};

interface Props {
  portfolioId: string;
  onViewProjections?: () => void;
  onViewBenchmarks?: () => void;
  onViewRisk?: () => void;
  onViewInsights?: () => void;
}


export default function AnalyticsDashboard({
  portfolioId,
  onViewProjections,
  onViewBenchmarks,
  onViewRisk,
  onViewInsights
}: Props) {
  const { data: riskData, error: riskError } = useAnalyticsData<{ risk: RiskSummary }>(
    `/api/portfolio/${portfolioId}/analytics/risk?risk_type=all`);

  const { data: insightsData } = useAnalyticsData<{ insights: any[]; summary: InsightSummary }>(
    `/api/portfolio/${portfolioId}/analytics/insights?limit=5`);

  const risk = riskData?.risk;
  const summary = insightsData?.summary;
  const recentInsights = insightsData?.insights ?? [];

  const loading = !riskData && !riskError;

  const getRiskColor = (level: string | null | undefined) => {
    const colors: Record<string, string> = {
      critical: 'text-red-600 bg-red-50',
      high: 'text-orange-600 bg-orange-50',
      medium: 'text-yellow-600 bg-yellow-50',
      low: 'text-green-600 bg-green-50',
    };
    return colors[level ?? ''] ?? 'text-neutral-600 bg-neutral-50';
  };

  const getSeverityColor = (severity: string) => {
    const colors: Record<string, string> = {
      critical: 'bg-red-500',
      high: 'bg-orange-500',
      medium: 'bg-yellow-500',
      low: 'bg-green-500',
      info: 'bg-blue-500',
    };
    return colors[severity] ?? 'bg-neutral-500';
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (value == null) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: value >= 1000000 ? 'compact' : 'standard',
      maximumFractionDigits: value >= 1000000 ? 1 : 0,
    }).format(value);
  };

  const formatPercent = (value: number | null | undefined) => {
    if (value == null) return '-';
    return `${value.toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-neutral-200 rounded-2xl"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-neutral-200 rounded-2xl"></div>
          <div className="h-64 bg-neutral-200 rounded-2xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Portfolio Value */}
        <div className="bg-white rounded-2xl border border-black/5 p-6 shadow-soft">
          <span className="text-sm font-medium text-neutral-500">Total Allocation</span>
          <p className="text-2xl font-bold text-ink mt-1">
            {formatCurrency(risk?.total_allocation)}
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            {risk?.total_holdings ?? 0} holdings
          </p>
        </div>

        {/* Overall Risk */}
        <div className="bg-white rounded-2xl border border-black/5 p-6 shadow-soft">
          <span className="text-sm font-medium text-neutral-500">Overall Risk</span>
          <div className="flex items-baseline gap-2 mt-1">
            {risk?.overall_risk_score != null ? (
              <p className="text-2xl font-bold text-ink">{risk.overall_risk_score}</p>
            ) : (
              <p className="text-2xl font-bold text-neutral-400">-</p>
            )}
            {risk?.overall_risk_level && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${getRiskColor(risk.overall_risk_level)}`}>
                {risk.overall_risk_level}
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Score out of 100
          </p>
        </div>

        {/* Active Insights */}
        <div className="bg-white rounded-2xl border border-black/5 p-6 shadow-soft">
          <span className="text-sm font-medium text-neutral-500">Active Insights</span>
          <p className="text-2xl font-bold text-ink mt-1">{summary?.total_active ?? 0}</p>
          <div className="flex items-center gap-1 mt-1">
            {summary?.by_severity && Object.entries(summary.by_severity)
              .filter(([, count]) => count > 0)
              .slice(0, 3)
              .map(([severity, count]) => (
                <span
                  key={severity}
                  className={`px-1.5 py-0.5 rounded-full text-xs text-white ${getSeverityColor(severity)}`}
                >
                  {count}
                </span>
              ))}
          </div>
        </div>

        {/* Concentration */}
        <div className="bg-white rounded-2xl border border-black/5 p-6 shadow-soft">
          <span className="text-sm font-medium text-neutral-500">Top 3 Concentration</span>
          <p className="text-2xl font-bold text-ink mt-1">
            {formatPercent(risk?.concentration?.top_3_percent)}
          </p>
          {risk?.concentration?.risk_level && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${getRiskColor(risk.concentration.risk_level)}`}>
              {risk.concentration.risk_level} risk
            </span>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap items-center gap-3">
        {onViewProjections && (
          <button
            onClick={onViewProjections}
            className="rounded-2xl bg-azure px-4 py-2 text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-azure/90"
          >
            View Projections
          </button>
        )}
        {onViewBenchmarks && (
          <button
            onClick={onViewBenchmarks}
            className="rounded-2xl border border-black/10 bg-white px-4 py-2 text-neutral-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-neutral-50"
          >
            Compare Benchmarks
          </button>
        )}
        {onViewRisk && (
          <button
            onClick={onViewRisk}
            className="rounded-2xl border border-black/10 bg-white px-4 py-2 text-neutral-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-neutral-50"
          >
            Risk Details
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Overview */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-soft overflow-hidden">
          <div className="px-6 py-4 border-b border-black/5 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-ink">Risk Overview</h2>
            {onViewRisk && (
              <button onClick={onViewRisk} className="text-sm text-azure hover:underline">
                Details
              </button>
            )}
          </div>
          <div className="p-6 space-y-4">
            {/* Concentration Risk */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">Concentration Risk</p>
                <p className="text-xs text-neutral-500">Top 3 holdings allocation</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{formatPercent(risk?.concentration?.top_3_percent)}</p>
                <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${getRiskColor(risk?.concentration?.risk_level)}`}>
                  {risk?.concentration?.risk_level ?? 'N/A'}
                </span>
              </div>
            </div>

            {/* Sector Risk */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">Sector Risk</p>
                <p className="text-xs text-neutral-500">{risk?.sector?.sector_count ?? 0} sectors</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{formatPercent(risk?.sector?.largest_sector_percent)}</p>
                <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${getRiskColor(risk?.sector?.risk_level)}`}>
                  {risk?.sector?.risk_level ?? 'N/A'}
                </span>
              </div>
            </div>

            {/* Geography Risk */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">Geographic Risk</p>
                <p className="text-xs text-neutral-500">{risk?.geography?.geography_count ?? 0} regions</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{formatPercent(risk?.geography?.largest_geography_percent)}</p>
                <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${getRiskColor(risk?.geography?.risk_level)}`}>
                  {risk?.geography?.risk_level ?? 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Insights */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-soft overflow-hidden">
          <div className="px-6 py-4 border-b border-black/5 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-ink">Recent Insights</h2>
            {onViewInsights && (
              <button onClick={onViewInsights} className="text-sm text-azure hover:underline">
                View all
              </button>
            )}
          </div>
          {recentInsights.length === 0 ? (
            <div className="p-6 text-center text-neutral-500">
              <p>No insights yet.</p>
              <p className="text-xs mt-1">Analytics insights will appear here as they&apos;re generated.</p>
            </div>
          ) : (
            <ul className="divide-y divide-black/5">
              {recentInsights.slice(0, 4).map((insight) => (
                <li key={insight.id} className="px-6 py-4 hover:bg-neutral-50">
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${getSeverityColor(insight.severity)}`}></span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{insight.title}</p>
                      <p className="text-xs text-neutral-500 truncate">{insight.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-neutral-400">{insight.category}</span>
                        {insight.holding_name && (
                          <span className="text-xs text-azure">{insight.holding_name}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Categories Breakdown */}
      {summary?.by_category && Object.keys(summary.by_category).length > 0 && (
        <div className="bg-white rounded-2xl border border-black/5 p-6 shadow-soft">
          <h3 className="text-sm font-medium text-ink mb-4">Insights by Category</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary.by_category).map(([category, count]) => (
              <span
                key={category}
                className="px-3 py-1 bg-neutral-100 text-neutral-700 rounded-full text-sm"
              >
                {category}: {count}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
