'use client';

import { useState } from 'react';
import useSWR from 'swr';

type RiskDistributionItem = {
  sector?: string;
  geography?: string;
  amount: number;
  count: number;
  percent: number;
};

type TopHolding = {
  name: string;
  allocation: number;
  percent: number;
};

type RiskData = {
  snapshot_date: string;
  total_holdings: number;
  total_allocation: number;
  overall_risk_score: number | null;
  overall_risk_level: string | null;
  risk_factors?: Record<string, any>;
  concentration?: {
    top_3_holdings: TopHolding[];
    top_3_percent: number;
    herfindahl_index?: number;
    risk_level: string;
  };
  sector?: {
    distribution: RiskDistributionItem[];
    sector_count: number;
    largest_sector?: string;
    largest_sector_percent: number;
    risk_level: string;
  };
  geography?: {
    distribution: RiskDistributionItem[];
    geography_count: number;
    largest_geography?: string;
    largest_geography_percent: number;
    risk_level: string;
  };
  history?: Array<{
    snapshot_date: string;
    overall_risk_score: number;
    overall_risk_level: string;
    concentration_top3_percent: number;
    largest_sector_percent: number;
  }>;
};

interface Props {
  portfolioId: string;
  showHistory?: boolean;
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function RiskAnalysis({ portfolioId, showHistory = true }: Props) {
  const [riskType, setRiskType] = useState<'all' | 'concentration' | 'sector' | 'geography'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<{ risk: RiskData }>(
    `/api/portfolio/${portfolioId}/analytics/risk?risk_type=${riskType}&include_history=${showHistory}`,
    fetcher
  );

  const risk = data?.risk;

  const refreshSnapshot = async () => {
    setIsRefreshing(true);
    try {
      await fetch(`/api/portfolio/${portfolioId}/analytics/risk`, { method: 'POST' });
      mutate();
    } finally {
      setIsRefreshing(false);
    }
  };

  const getRiskColor = (level: string | null | undefined) => {
    const colors: Record<string, { bg: string; text: string; border: string }> = {
      critical: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
      high: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
      medium: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
      low: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
    };
    return colors[level ?? ''] ?? { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' };
  };

  const formatCurrency = (value: number) => {
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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-3 gap-4">
            <div className="h-32 bg-gray-200 rounded"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !risk) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-500">
        <p>Unable to load risk analysis</p>
      </div>
    );
  }

  const overallColor = getRiskColor(risk.overall_risk_level);

  return (
    <div className="space-y-6">
      {/* Header with Overall Score */}
      <div className={`rounded-lg border ${overallColor.border} ${overallColor.bg} p-6`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Portfolio Risk Analysis</h3>
            <p className="text-sm text-gray-500 mt-1">
              Snapshot: {formatDate(risk.snapshot_date)} &bull; {risk.total_holdings} holdings
            </p>
          </div>
          <div className="text-right">
            {risk.overall_risk_score != null ? (
              <>
                <div className="text-4xl font-bold text-gray-900">{risk.overall_risk_score}</div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${overallColor.text} ${overallColor.bg}`}>
                  {risk.overall_risk_level} Risk
                </span>
              </>
            ) : (
              <span className="text-gray-400">Score unavailable</span>
            )}
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={refreshSnapshot}
            disabled={isRefreshing}
            className="px-3 py-1.5 bg-white border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh Analysis'}
          </button>
          <select
            value={riskType}
            onChange={(e) => setRiskType(e.target.value as any)}
            className="px-3 py-1.5 border border-gray-300 rounded text-sm"
          >
            <option value="all">All Risk Types</option>
            <option value="concentration">Concentration Only</option>
            <option value="sector">Sector Only</option>
            <option value="geography">Geography Only</option>
          </select>
        </div>
      </div>

      {/* Risk Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Concentration Risk */}
        {risk.concentration && (
          <div className={`rounded-lg border ${getRiskColor(risk.concentration.risk_level).border} bg-white p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-gray-900">Concentration Risk</h4>
              <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${getRiskColor(risk.concentration.risk_level).text} ${getRiskColor(risk.concentration.risk_level).bg}`}>
                {risk.concentration.risk_level}
              </span>
            </div>

            <div className="mb-4">
              <div className="text-3xl font-bold text-gray-900">{formatPercent(risk.concentration.top_3_percent)}</div>
              <p className="text-sm text-gray-500">Top 3 Holdings</p>
            </div>

            {risk.concentration.herfindahl_index != null && (
              <div className="mb-4 text-sm">
                <span className="text-gray-500">HHI: </span>
                <span className="font-medium">{risk.concentration.herfindahl_index.toFixed(0)}</span>
                <span className="text-gray-400 ml-1">(0-10000)</span>
              </div>
            )}

            <div className="space-y-2">
              {risk.concentration.top_3_holdings?.map((holding, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 truncate flex-1">{holding.name}</span>
                  <span className="text-sm font-medium text-gray-900 ml-2">{formatPercent(holding.percent)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sector Risk */}
        {risk.sector && (
          <div className={`rounded-lg border ${getRiskColor(risk.sector.risk_level).border} bg-white p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-gray-900">Sector Risk</h4>
              <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${getRiskColor(risk.sector.risk_level).text} ${getRiskColor(risk.sector.risk_level).bg}`}>
                {risk.sector.risk_level}
              </span>
            </div>

            <div className="mb-4">
              <div className="text-3xl font-bold text-gray-900">{risk.sector.sector_count}</div>
              <p className="text-sm text-gray-500">Sectors</p>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-500">Largest: {risk.sector.largest_sector}</p>
              <p className="text-lg font-semibold text-gray-900">{formatPercent(risk.sector.largest_sector_percent)}</p>
            </div>

            <div className="space-y-2">
              {risk.sector.distribution?.slice(0, 4).map((item, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 truncate">{item.sector}</span>
                    <span className="text-gray-900 font-medium">{formatPercent(item.percent)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full mt-1">
                    <div
                      className="h-full bg-azure rounded-full"
                      style={{ width: `${Math.min(item.percent, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Geography Risk */}
        {risk.geography && (
          <div className={`rounded-lg border ${getRiskColor(risk.geography.risk_level).border} bg-white p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-gray-900">Geographic Risk</h4>
              <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${getRiskColor(risk.geography.risk_level).text} ${getRiskColor(risk.geography.risk_level).bg}`}>
                {risk.geography.risk_level}
              </span>
            </div>

            <div className="mb-4">
              <div className="text-3xl font-bold text-gray-900">{risk.geography.geography_count}</div>
              <p className="text-sm text-gray-500">Regions</p>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-500">Largest: {risk.geography.largest_geography}</p>
              <p className="text-lg font-semibold text-gray-900">{formatPercent(risk.geography.largest_geography_percent)}</p>
            </div>

            <div className="space-y-2">
              {risk.geography.distribution?.slice(0, 4).map((item, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 truncate">{item.geography}</span>
                    <span className="text-gray-900 font-medium">{formatPercent(item.percent)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full mt-1">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${Math.min(item.percent, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* History */}
      {showHistory && risk.history && risk.history.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h4 className="font-semibold text-gray-900">Risk History</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Score</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Level</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Top 3 %</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Largest Sector %</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {risk.history.slice(0, 10).map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900">{formatDate(row.snapshot_date)}</td>
                    <td className="px-6 py-3 whitespace-nowrap text-sm text-right font-medium">{row.overall_risk_score}</td>
                    <td className="px-6 py-3 whitespace-nowrap text-center">
                      <span className={`px-2 py-0.5 rounded text-xs capitalize ${getRiskColor(row.overall_risk_level).text} ${getRiskColor(row.overall_risk_level).bg}`}>
                        {row.overall_risk_level}
                      </span>
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-sm text-right">{formatPercent(row.concentration_top3_percent)}</td>
                    <td className="px-6 py-3 whitespace-nowrap text-sm text-right">{formatPercent(row.largest_sector_percent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
