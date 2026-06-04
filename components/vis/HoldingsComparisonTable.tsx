'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';

interface MetricValue {
  metric_code: string;
  metric_name: string;
  value: number;
  unit: string | null;
  directionality?: 'higher_is_better' | 'lower_is_better' | null;
}

interface HoldingRow {
  holdingId: string;
  holdingName: string;
  sector: string | null;
  metrics: MetricValue[];
}

interface Props {
  portfolioId: string;
  title?: string | null;
  config?: {
    metrics?: string[]; // Array of metric codes to display
    sortBy?: string; // Default sort column (metric_code or 'name')
    sortDirection?: 'asc' | 'desc';
    highlightBest?: boolean; // Highlight best performing holding for each metric
    showSector?: boolean;
    minHoldings?: number;
  };
}

export default function HoldingsComparisonTable({ portfolioId, title, config }: Props) {
  const router = useRouter();
  const [data, setData] = useState<HoldingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState(config?.sortBy || 'name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(config?.sortDirection || 'asc');

  const metrics = config?.metrics || [];
  const highlightBest = config?.highlightBest ?? true;
  const showSector = config?.showSector ?? true;
  const minHoldings = config?.minHoldings || 2;

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (metrics.length === 0) {
        setError('No metrics specified');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          metrics: metrics.join(',')
        });

        const res = await fetch(
          `/api/portfolio/${encodeURIComponent(portfolioId)}/comparison-table?${params.toString()}`,
          { cache: 'no-store' }
        );

        if (!res.ok) {
          throw new Error(`Failed to fetch comparison data: ${res.status}`);
        }

        const json = await res.json();

        if (mounted) {
          setData(json.data || []);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || 'Failed to load data');
          setData([]);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [portfolioId, metrics]);

  // Sort data
  const sortedData = useMemo(() => {
    if (data.length === 0) return [];

    const sorted = [...data].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      if (sortColumn === 'name') {
        aVal = a.holdingName.toLowerCase();
        bVal = b.holdingName.toLowerCase();
      } else if (sortColumn === 'sector') {
        aVal = (a.sector || '').toLowerCase();
        bVal = (b.sector || '').toLowerCase();
      } else {
        // Sort by metric
        const aMetric = a.metrics.find(m => m.metric_code === sortColumn);
        const bMetric = b.metrics.find(m => m.metric_code === sortColumn);
        aVal = aMetric?.value ?? -Infinity;
        bVal = bMetric?.value ?? -Infinity;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [data, sortColumn, sortDirection]);

  // Find best value for each metric (for highlighting)
  const bestValues = useMemo(() => {
    if (!highlightBest || data.length === 0) return new Map<string, number>();

    const map = new Map<string, number>();

    for (const metricCode of metrics) {
      const values: { holdingId: string; value: number; directionality?: string | null }[] = [];

      for (const row of data) {
        const metric = row.metrics.find(m => m.metric_code === metricCode);
        if (metric && isFinite(metric.value)) {
          values.push({
            holdingId: row.holdingId,
            value: metric.value,
            directionality: metric.directionality
          });
        }
      }

      if (values.length > 0) {
        const firstDirectionality = values[0].directionality;
        if (firstDirectionality === 'higher_is_better') {
          const max = Math.max(...values.map(v => v.value));
          map.set(metricCode, max);
        } else if (firstDirectionality === 'lower_is_better') {
          const min = Math.min(...values.map(v => v.value));
          map.set(metricCode, min);
        }
      }
    }

    return map;
  }, [data, metrics, highlightBest]);

  function handleSort(column: string) {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }

  function formatValue(value: number, unit: string | null): string {
    const formatted = value.toLocaleString(undefined, {
      maximumFractionDigits: value >= 100 ? 0 : value >= 10 ? 1 : 2
    });

    if (unit) {
      return `${formatted} ${unit}`;
    }
    return formatted;
  }

  if (loading) {
    return (
      <div className="w-full p-8 text-center text-neutral-500">
        <div className="inline-block w-6 h-6 border-2 border-neutral-300 border-t-azure rounded-full animate-spin mb-2"></div>
        <p className="text-sm">Loading comparison table...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full p-6 rounded-2xl border border-red-200 bg-red-50 text-red-700">
        <p className="font-medium text-sm">Error loading comparison table</p>
        <p className="text-xs mt-1">{error}</p>
      </div>
    );
  }

  if (sortedData.length < minHoldings) {
    return (
      <div className="w-full p-6 rounded-2xl border border-neutral-200 bg-neutral-50 text-neutral-600">
        <p className="text-sm">
          Need at least {minHoldings} holdings with data to show comparison table.
        </p>
        <p className="text-xs mt-1 text-neutral-500">
          Currently have {sortedData.length} holding(s) with data.
        </p>
      </div>
    );
  }

  // Get unique metric info from first row
  const metricInfo = metrics.map(code => {
    for (const row of sortedData) {
      const metric = row.metrics.find(m => m.metric_code === code);
      if (metric) {
        return {
          code,
          name: metric.metric_name,
          unit: metric.unit,
          directionality: metric.directionality
        };
      }
    }
    return { code, name: code, unit: null, directionality: null };
  });

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {title && (
        <h3 className="text-lg font-semibold text-neutral-900 shrink-0 mb-4">{title}</h3>
      )}

      {/* Desktop Table View */}
      <div className="hidden md:block w-full flex-1 min-h-0 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-neutral-200">
              <th
                className="text-left p-3 font-semibold text-neutral-700 cursor-pointer hover:bg-neutral-50 transition-colors"
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center gap-1">
                  Holding
                  {sortColumn === 'name' && (
                    <span className="text-azure">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
              {showSector && (
                <th
                  className="text-left p-3 font-semibold text-neutral-700 cursor-pointer hover:bg-neutral-50 transition-colors"
                  onClick={() => handleSort('sector')}
                >
                  <div className="flex items-center gap-1">
                    Sector
                    {sortColumn === 'sector' && (
                      <span className="text-azure">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
              )}
              {metricInfo.map(metric => (
                <th
                  key={metric.code}
                  className="text-right p-3 font-semibold text-neutral-700 cursor-pointer hover:bg-neutral-50 transition-colors"
                  onClick={() => handleSort(metric.code)}
                >
                  <div className="flex items-center justify-end gap-1">
                    <div>
                      <div>{metric.name}</div>
                      {metric.unit && <div className="text-xs font-normal text-neutral-500">({metric.unit})</div>}
                    </div>
                    {sortColumn === metric.code && (
                      <span className="text-azure">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, idx) => (
              <tr
                key={row.holdingId}
                className="border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer transition-colors"
                onClick={() => router.push(`/dashboard/holdings/${row.holdingId}`)}
              >
                <td className="p-3 font-medium text-neutral-900">{row.holdingName}</td>
                {showSector && (
                  <td className="p-3 text-neutral-600">{row.sector || '—'}</td>
                )}
                {metricInfo.map(metric => {
                  const metricValue = row.metrics.find(m => m.metric_code === metric.code);
                  const value = metricValue?.value;
                  const isBest = value !== undefined && value === bestValues.get(metric.code);

                  return (
                    <td
                      key={metric.code}
                      className={`p-3 text-right font-medium ${
                        isBest
                          ? 'text-green-700 bg-green-50'
                          : value !== undefined
                          ? 'text-neutral-900'
                          : 'text-neutral-400'
                      }`}
                    >
                      {value !== undefined ? formatValue(value, metric.unit) : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden flex-1 min-h-0 overflow-auto space-y-3">
        {sortedData.map(row => (
          <div
            key={row.holdingId}
            className="rounded-2xl border border-neutral-200 bg-white p-4 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => router.push(`/dashboard/holdings/${row.holdingId}`)}
          >
            <div className="mb-3 pb-3 border-b border-neutral-100">
              <h4 className="font-semibold text-neutral-900">{row.holdingName}</h4>
              {showSector && row.sector && (
                <p className="text-xs text-neutral-500 mt-1">{row.sector}</p>
              )}
            </div>
            <div className="space-y-2">
              {metricInfo.map(metric => {
                const metricValue = row.metrics.find(m => m.metric_code === metric.code);
                const value = metricValue?.value;
                const isBest = value !== undefined && value === bestValues.get(metric.code);

                return (
                  <div key={metric.code} className="flex items-center justify-between text-sm">
                    <span className="text-neutral-600">{metric.name}</span>
                    <span
                      className={`font-semibold ${
                        isBest
                          ? 'text-green-700'
                          : value !== undefined
                          ? 'text-neutral-900'
                          : 'text-neutral-400'
                      }`}
                    >
                      {value !== undefined ? formatValue(value, metric.unit) : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="text-xs text-neutral-500 text-center shrink-0 mt-4">
        {highlightBest && (
          <span className="inline-block px-2 py-1 rounded bg-green-50 text-green-700 mr-2">
            Best values highlighted
          </span>
        )}
        Click any row to view holding details
      </div>
    </div>
  );
}
