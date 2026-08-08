'use client';

import { useAnalyticsData } from "@/lib/analytics/hooks";

import { useState } from 'react';

type HoldingOption = {
  id: string;
  name: string;
  sector: string | null;
};

type MetricBenchmark = {
  holding_value: number | null;
  portfolio_peer_count: number;
  portfolio_percentile: number | null;
  portfolio_average: number | null;
  portfolio_median: number | null;
  external_benchmark: {
    benchmark_key: string;
    percentile_25: number;
    percentile_50: number;
    percentile_75: number;
    sample_size: number;
    data_source: string;
  } | null;
  external_percentile: number | null;
};

type HoldingBenchmark = {
  holding: {
    id: string;
    name: string;
    sector: string | null;
    country: string | null;
  };
  benchmark_type: string;
  benchmark_key: string;
  metrics: Record<string, MetricBenchmark>;
};

type PortfolioBenchmark = {
  total_holdings: number;
  sector_count: number;
  by_sector: Record<string, {
    holding_count: number;
    total_allocation: number;
    avg_program_expense_ratio: number | null;
    benchmark_median: number | null;
    vs_benchmark: number | null;
  }>;
};

interface Props {
  portfolioId: string;
  initialHoldingId?: string;
}


const BENCHMARK_TYPES = [
  { value: 'sector', label: 'By Sector' },
  { value: 'geography', label: 'By Geography' },
  { value: 'size', label: 'By Size' },
];

const METRICS = [
  { code: 'PROGRAM_EXPENSE_RATIO', label: 'Program Expense Ratio', format: 'percent' },
  { code: 'ADMIN_EXPENSE_RATIO', label: 'Admin Expense Ratio', format: 'percent' },
  { code: 'FUNDS_ALLOCATED', label: 'Funds Allocated', format: 'currency' },
];

export default function BenchmarkComparison({ portfolioId, initialHoldingId }: Props) {
  const [selectedHoldingId, setSelectedHoldingId] = useState<string | null>(initialHoldingId || null);
  const [benchmarkType, setBenchmarkType] = useState('sector');
  const [selectedMetrics, setSelectedMetrics] = useState(['PROGRAM_EXPENSE_RATIO', 'ADMIN_EXPENSE_RATIO']);

  // Fetch holdings for dropdown
  const { data: holdingsData } = useAnalyticsData<{ data: HoldingOption[] }>(
    `/api/portfolio/${portfolioId}/holdings?select=id,name,sector`);
  const holdings = holdingsData?.data ?? [];

  // Fetch benchmark data
  const benchmarkParams = new URLSearchParams({
    benchmark_type: benchmarkType,
    metrics: selectedMetrics.join(','),
  });
  if (selectedHoldingId) benchmarkParams.set('holding_id', selectedHoldingId);

  const { data: benchmarkData, error, isLoading } = useAnalyticsData<
    { benchmark: HoldingBenchmark } | { portfolio_benchmarks: PortfolioBenchmark }
  >(
    `/api/portfolio/${portfolioId}/analytics/benchmarks?${benchmarkParams}`);

  const holdingBenchmark = benchmarkData && 'benchmark' in benchmarkData ? benchmarkData.benchmark : null;
  const portfolioBenchmark = benchmarkData && 'portfolio_benchmarks' in benchmarkData ? benchmarkData.portfolio_benchmarks : null;

  const formatValue = (value: number | null, format: string) => {
    if (value == null) return '-';
    if (format === 'percent') return `${(value * 100).toFixed(1)}%`;
    if (format === 'currency') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: value >= 1000000 ? 'compact' : 'standard',
        maximumFractionDigits: value >= 1000000 ? 1 : 0,
      }).format(value);
    }
    return value.toFixed(2);
  };

  const getPercentileColor = (percentile: number | null) => {
    if (percentile == null) return 'text-gray-400';
    if (percentile >= 75) return 'text-green-600';
    if (percentile >= 50) return 'text-blue-600';
    if (percentile >= 25) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getVsBenchmarkColor = (vs: number | null) => {
    if (vs == null) return 'text-gray-400';
    if (vs > 5) return 'text-green-600';
    if (vs > -5) return 'text-gray-600';
    return 'text-red-600';
  };

  const toggleMetric = (code: string) => {
    setSelectedMetrics(prev =>
      prev.includes(code)
        ? prev.filter(m => m !== code)
        : [...prev, code]
    );
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Benchmark Comparison</h3>
      </div>

      {/* Controls */}
      <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Compare</label>
            <select
              value={selectedHoldingId || ''}
              onChange={(e) => setSelectedHoldingId(e.target.value || null)}
              className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm"
            >
              <option value="">Entire Portfolio</option>
              {holdings.map(h => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Benchmark Type</label>
            <select
              value={benchmarkType}
              onChange={(e) => setBenchmarkType(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm"
            >
              {BENCHMARK_TYPES.map(bt => (
                <option key={bt.value} value={bt.value}>{bt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Metrics</label>
            <div className="flex gap-2">
              {METRICS.map(m => (
                <button
                  key={m.code}
                  onClick={() => toggleMetric(m.code)}
                  className={`px-2 py-1 rounded text-xs ${
                    selectedMetrics.includes(m.code)
                      ? 'bg-azure text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-azure"></div>
          </div>
        ) : error ? (
          <div className="text-center text-gray-500 py-8">
            <p>Error loading benchmark data</p>
          </div>
        ) : holdingBenchmark ? (
          /* Single Holding Benchmark */
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div>
                <h4 className="text-lg font-medium text-gray-900">{holdingBenchmark.holding.name}</h4>
                <p className="text-sm text-gray-500">
                  {holdingBenchmark.holding.sector || 'No sector'} &bull; {holdingBenchmark.benchmark_key}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Object.entries(holdingBenchmark.metrics).map(([code, metric]) => {
                const metricDef = METRICS.find(m => m.code === code);
                return (
                  <div key={code} className="border border-gray-200 rounded-lg p-4">
                    <h5 className="text-sm font-medium text-gray-900 mb-3">
                      {metricDef?.label || code}
                    </h5>

                    <div className="space-y-3">
                      {/* Holding Value */}
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500">Holding Value</span>
                        <span className="text-sm font-semibold">
                          {formatValue(metric.holding_value, metricDef?.format || 'number')}
                        </span>
                      </div>

                      {/* Portfolio Comparison */}
                      <div className="pt-2 border-t border-gray-100">
                        <p className="text-xs font-medium text-gray-400 uppercase mb-2">vs Portfolio Peers</p>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-500">Peer Count</span>
                          <span>{metric.portfolio_peer_count}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-500">Percentile</span>
                          <span className={`font-semibold ${getPercentileColor(metric.portfolio_percentile)}`}>
                            {metric.portfolio_percentile != null ? `${metric.portfolio_percentile}th` : '-'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-500">Peer Avg</span>
                          <span>{formatValue(metric.portfolio_average, metricDef?.format || 'number')}</span>
                        </div>
                      </div>

                      {/* External Benchmark */}
                      {metric.external_benchmark && (
                        <div className="pt-2 border-t border-gray-100">
                          <p className="text-xs font-medium text-gray-400 uppercase mb-2">vs External Benchmark</p>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-500">Percentile</span>
                            <span className={`font-semibold ${getPercentileColor(metric.external_percentile)}`}>
                              {metric.external_percentile != null ? `${metric.external_percentile}th` : '-'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-500">Median (50th)</span>
                            <span>{formatValue(metric.external_benchmark.percentile_50, metricDef?.format || 'number')}</span>
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            Source: {metric.external_benchmark.data_source} (n={metric.external_benchmark.sample_size})
                          </div>
                        </div>
                      )}

                      {/* Percentile Bar */}
                      {metric.portfolio_percentile != null && (
                        <div className="pt-2">
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-azure rounded-full transition-all"
                              style={{ width: `${metric.portfolio_percentile}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-gray-400 mt-1">
                            <span>0</span>
                            <span>50</span>
                            <span>100</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : portfolioBenchmark ? (
          /* Portfolio-Wide Benchmark */
          <div className="space-y-4">
            <div className="flex items-center gap-4 mb-4">
              <span className="text-sm text-gray-500">
                {portfolioBenchmark.total_holdings} holdings across {portfolioBenchmark.sector_count} sectors
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sector</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Holdings</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Allocation</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Program %</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Benchmark</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">vs Benchmark</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Object.entries(portfolioBenchmark.by_sector).map(([sector, data]) => (
                    <tr key={sector} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{sector}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-right">{data.holding_count}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-right">
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: 'USD',
                          notation: 'compact',
                        }).format(data.total_allocation)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-right">
                        {data.avg_program_expense_ratio != null
                          ? `${(data.avg_program_expense_ratio * 100).toFixed(1)}%`
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-right">
                        {data.benchmark_median != null
                          ? `${(data.benchmark_median * 100).toFixed(1)}%`
                          : '-'}
                      </td>
                      <td className={`px-4 py-3 text-sm text-right font-semibold ${getVsBenchmarkColor(data.vs_benchmark)}`}>
                        {data.vs_benchmark != null
                          ? `${data.vs_benchmark > 0 ? '+' : ''}${data.vs_benchmark.toFixed(1)}%`
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-center text-gray-500 py-8">
            <p>No benchmark data available</p>
          </div>
        )}
      </div>
    </div>
  );
}
