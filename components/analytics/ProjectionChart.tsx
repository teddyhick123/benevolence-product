'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';

type ProjectionPoint = {
  period_offset: number;
  period: string;
  projected_value: number;
  confidence_low: number;
  confidence_high: number;
};

type Projection = {
  metric_code: string;
  method: string;
  holding_id?: string | null;
  historical_data_points: number;
  historical_range?: {
    start: string;
    end: string;
  };
  slope?: number;
  intercept?: number;
  r_squared?: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  projections: ProjectionPoint[];
  from_cache?: boolean;
};

interface Props {
  portfolioId: string;
  metricCode?: string;
  holdingId?: string;
  method?: 'linear' | 'moving_average';
  periodsAhead?: number;
  timeRange?: string;
  showControls?: boolean;
  height?: number;
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

const METRIC_OPTIONS = [
  { code: 'TOTAL_IMPACT', label: 'Total Impact' },
  { code: 'PROGRAM_EXPENSE_RATIO', label: 'Program Expense Ratio' },
  { code: 'ADMIN_EXPENSE_RATIO', label: 'Admin Expense Ratio' },
  { code: 'FUNDS_ALLOCATED', label: 'Funds Allocated' },
  { code: 'BENEFICIARIES_SERVED', label: 'Beneficiaries Served' },
];

export default function ProjectionChart({
  portfolioId,
  metricCode: initialMetricCode = 'TOTAL_IMPACT',
  holdingId,
  method: initialMethod = 'linear',
  periodsAhead: initialPeriodsAhead = 4,
  timeRange: initialTimeRange = 'all',
  showControls = true,
  height = 300,
}: Props) {
  const [metricCode, setMetricCode] = useState(initialMetricCode);
  const [method, setMethod] = useState(initialMethod);
  const [periodsAhead, setPeriodsAhead] = useState(initialPeriodsAhead);
  const [timeRange, setTimeRange] = useState(initialTimeRange);

  const queryParams = new URLSearchParams({
    metric_code: metricCode,
    method,
    periods_ahead: periodsAhead.toString(),
    time_range: timeRange,
  });
  if (holdingId) queryParams.set('holding_id', holdingId);

  const { data, error, isLoading } = useSWR<{ projection: Projection } | { error: string }>(
    `/api/portfolio/${portfolioId}/analytics/projections?${queryParams}`,
    fetcher
  );

  const hasError = error || (data && 'error' in data);
  const projection = data && 'projection' in data ? data.projection : null;

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing': return '↑';
      case 'decreasing': return '↓';
      default: return '→';
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'increasing': return 'text-green-600';
      case 'decreasing': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const formatValue = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toFixed(1);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };

  // Calculate chart dimensions
  const chartWidth = 100;
  const points = projection?.projections ?? [];
  const allValues = points.flatMap(p => [p.projected_value, p.confidence_low, p.confidence_high]);
  const maxValue = Math.max(...allValues, 1);
  const minValue = Math.min(...allValues, 0);
  const range = maxValue - minValue || 1;

  const getY = (value: number) => {
    return height - 40 - ((value - minValue) / range) * (height - 60);
  };

  const getX = (index: number) => {
    return 50 + (index / Math.max(points.length - 1, 1)) * (chartWidth - 100);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Metric Projections</h3>
          {projection?.from_cache && (
            <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">Cached</span>
          )}
        </div>
      </div>

      {showControls && (
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Metric</label>
            <select
              value={metricCode}
              onChange={(e) => setMetricCode(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm"
            >
              {METRIC_OPTIONS.map(opt => (
                <option key={opt.code} value={opt.code}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as 'linear' | 'moving_average')}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm"
            >
              <option value="linear">Linear Regression</option>
              <option value="moving_average">Moving Average</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Periods</label>
            <select
              value={periodsAhead}
              onChange={(e) => setPeriodsAhead(parseInt(e.target.value))}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm"
            >
              <option value={2}>2 quarters</option>
              <option value={4}>4 quarters</option>
              <option value={6}>6 quarters</option>
              <option value={8}>8 quarters</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">History</label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm"
            >
              <option value="all">All time</option>
              <option value="24m">24 months</option>
              <option value="12m">12 months</option>
              <option value="6m">6 months</option>
            </select>
          </div>
        </div>
      )}

      <div className="p-6">
        {isLoading ? (
          <div className="flex items-center justify-center" style={{ height }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-azure"></div>
          </div>
        ) : hasError ? (
          <div className="flex items-center justify-center text-gray-500" style={{ height }}>
            <div className="text-center">
              <p className="text-sm">Unable to generate projection</p>
              <p className="text-xs mt-1">
                {data && 'error' in data ? data.error : 'Not enough historical data'}
              </p>
            </div>
          </div>
        ) : projection ? (
          <div>
            {/* Stats Row */}
            <div className="flex items-center gap-6 mb-4">
              <div>
                <span className="text-xs text-gray-500">Trend</span>
                <p className={`text-lg font-semibold capitalize ${getTrendColor(projection.trend)}`}>
                  {getTrendIcon(projection.trend)} {projection.trend}
                </p>
              </div>
              {projection.r_squared != null && (
                <div>
                  <span className="text-xs text-gray-500">R² Confidence</span>
                  <p className="text-lg font-semibold text-gray-900">
                    {(projection.r_squared * 100).toFixed(0)}%
                  </p>
                </div>
              )}
              <div>
                <span className="text-xs text-gray-500">Data Points</span>
                <p className="text-lg font-semibold text-gray-900">
                  {projection.historical_data_points}
                </p>
              </div>
              {projection.historical_range && (
                <div>
                  <span className="text-xs text-gray-500">Range</span>
                  <p className="text-sm text-gray-700">
                    {formatDate(projection.historical_range.start)} - {formatDate(projection.historical_range.end)}
                  </p>
                </div>
              )}
            </div>

            {/* SVG Chart */}
            <svg width="100%" height={height} viewBox={`0 0 ${chartWidth} ${height}`} preserveAspectRatio="xMidYMid meet">
              {/* Confidence band */}
              {points.length > 1 && (
                <path
                  d={
                    `M ${50} ${getY(points[0].confidence_high)} ` +
                    points.map((p, i) => `L ${50 + (i / (points.length - 1)) * (chartWidth - 100)} ${getY(p.confidence_high)}`).join(' ') +
                    ` L ${50 + chartWidth - 100} ${getY(points[points.length - 1].confidence_low)} ` +
                    [...points].reverse().map((p, i) => `L ${50 + ((points.length - 1 - i) / (points.length - 1)) * (chartWidth - 100)} ${getY(p.confidence_low)}`).join(' ') +
                    ' Z'
                  }
                  fill="rgb(59, 130, 246)"
                  fillOpacity={0.1}
                />
              )}

              {/* Projection line */}
              {points.length > 1 && (
                <path
                  d={`M ${50} ${getY(points[0].projected_value)} ` + points.map((p, i) => `L ${50 + (i / (points.length - 1)) * (chartWidth - 100)} ${getY(p.projected_value)}`).join(' ')}
                  fill="none"
                  stroke="rgb(59, 130, 246)"
                  strokeWidth={2}
                  strokeDasharray="5,3"
                />
              )}

              {/* Data points */}
              {points.map((p, i) => (
                <g key={i}>
                  <circle
                    cx={50 + (i / Math.max(points.length - 1, 1)) * (chartWidth - 100)}
                    cy={getY(p.projected_value)}
                    r={4}
                    fill="white"
                    stroke="rgb(59, 130, 246)"
                    strokeWidth={2}
                  />
                  <text
                    x={50 + (i / Math.max(points.length - 1, 1)) * (chartWidth - 100)}
                    y={height - 10}
                    textAnchor="middle"
                    className="text-[8px] fill-gray-500"
                  >
                    {formatDate(p.period)}
                  </text>
                </g>
              ))}

              {/* Y-axis labels */}
              <text x={5} y={20} className="text-[8px] fill-gray-500">{formatValue(maxValue)}</text>
              <text x={5} y={height - 35} className="text-[8px] fill-gray-500">{formatValue(minValue)}</text>
            </svg>

            {/* Legend */}
            <div className="flex items-center justify-center gap-6 mt-4 text-xs text-gray-500">
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-blue-500" style={{ borderStyle: 'dashed' }}></div>
                <span>Projected</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-3 bg-blue-500/10"></div>
                <span>95% Confidence</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
