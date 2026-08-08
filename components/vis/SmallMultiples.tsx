'use client';

import { apiRequest, readJson } from "@/lib/api/client";
import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import * as d3 from 'd3';
import { useWidgetDimensions } from '@/lib/hooks/useWidgetDimensions';

interface HoldingMetricData {
  holdingId: string;
  holdingName: string;
  sector: string;
  data: Array<{ date: string; value: number }>;
  latestValue: number;
  percentChange: number;
  trend: 'up' | 'down' | 'flat';
}

interface Props {
  portfolioId: string;
  title?: string | null;
  config?: {
    metric_code?: string;
    window?: string; // '3m', '6m', '12m', 'all'
    columns?: number; // grid columns
    chartHeight?: number;
    showBenchmark?: boolean;
    benchmarkValue?: number;
    minHoldings?: number; // minimum holdings to show (hide if fewer)
  };
}

export default function SmallMultiples({ portfolioId, title, config }: Props) {
  const router = useRouter();
  const [data, setData] = useState<HoldingMetricData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const metricCode = config?.metric_code || '';
  const window = config?.window || 'all';
  const columns = config?.columns || 3;
  const chartHeight = config?.chartHeight || 100;
  const showBenchmark = config?.showBenchmark ?? false;
  const benchmarkValue = config?.benchmarkValue;
  const minHoldings = config?.minHoldings || 2;

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!metricCode) {
        setError('No metric specified');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          metric: metricCode,
          window: window
        });

        const res = await apiRequest(
          `/api/portfolio/${encodeURIComponent(portfolioId)}/metric-comparison?${params.toString()}`,
          { cache: 'no-store' }
        );

        if (!res.ok) {
          throw new Error(`Failed to fetch comparison data: ${res.status}`);
        }

        const json = await readJson(res);

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
  }, [portfolioId, metricCode, window]);

  if (loading) {
    return (
      <div className="w-full p-8 text-center text-neutral-500">
        <div className="inline-block w-6 h-6 border-2 border-neutral-300 border-t-azure rounded-full animate-spin mb-2"></div>
        <p className="text-sm">Loading comparison data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full p-6 rounded-2xl border border-red-200 bg-red-50 text-red-700">
        <p className="font-medium text-sm">Error loading comparison</p>
        <p className="text-xs mt-1">{error}</p>
      </div>
    );
  }

  if (data.length < minHoldings) {
    return (
      <div className="w-full p-6 rounded-2xl border border-neutral-200 bg-neutral-50 text-neutral-600">
        <p className="text-sm">
          Need at least {minHoldings} holdings with <strong>{metricCode}</strong> data to show comparison.
        </p>
        <p className="text-xs mt-1 text-neutral-500">
          Currently have {data.length} holding(s) with data.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {title && (
        <h3 className="text-lg font-semibold text-neutral-900 shrink-0 mb-4">{title}</h3>
      )}

      <div
        className="grid gap-4 flex-1 min-h-0 overflow-auto"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        }}
      >
        {data.map((holding) => (
          <SmallChart
            key={holding.holdingId}
            holding={holding}
            height={chartHeight}
            showBenchmark={showBenchmark}
            benchmarkValue={benchmarkValue}
            onClick={() => router.push(`/dashboard/holdings/${holding.holdingId}`)}
          />
        ))}
      </div>

      <div className="text-xs text-neutral-500 text-center shrink-0 mt-4">
        Click any chart to view holding details
      </div>
    </div>
  );
}

interface SmallChartProps {
  holding: HoldingMetricData;
  height: number;
  showBenchmark: boolean;
  benchmarkValue?: number;
  onClick: () => void;
}

function SmallChart({ holding, height, showBenchmark, benchmarkValue, onClick }: SmallChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(200);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(Math.round(entry.contentRect.width) || 200);
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const parsed = useMemo(() => {
    return holding.data
      .map(d => ({
        date: new Date(d.date),
        value: Number(d.value)
      }))
      .filter(d => isFinite(d.date.getTime()) && isFinite(d.value))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [holding.data]);

  useEffect(() => {
    if (!svgRef.current || parsed.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 10, right: 10, bottom: 10, left: 10 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3
      .scaleTime()
      .domain(d3.extent(parsed, d => d.date) as [Date, Date])
      .range([0, w]);

    const yScale = d3
      .scaleLinear()
      .domain([0, d3.max(parsed, d => d.value) || 1])
      .range([h, 0])
      .nice();

    // Line
    const line = d3
      .line<{ date: Date; value: number }>()
      .x(d => xScale(d.date))
      .y(d => yScale(d.value))
      .curve(d3.curveMonotoneX);

    // Area under the line
    const area = d3
      .area<{ date: Date; value: number }>()
      .x(d => xScale(d.date))
      .y0(h)
      .y1(d => yScale(d.value))
      .curve(d3.curveMonotoneX);

    // Gradient
    const gradId = `grad-${holding.holdingId}`;
    const defs = svg.append('defs');
    const gradient = defs
      .append('linearGradient')
      .attr('id', gradId)
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    gradient.append('stop').attr('offset', '0%').attr('stop-color', 'var(--azure)').attr('stop-opacity', 0.3);
    gradient.append('stop').attr('offset', '100%').attr('stop-color', 'var(--azure)').attr('stop-opacity', 0.0);

    // Draw area
    g.append('path')
      .datum(parsed)
      .attr('fill', `url(#${gradId})`)
      .attr('d', area);

    // Draw line
    g.append('path')
      .datum(parsed)
      .attr('fill', 'none')
      .attr('stroke', 'var(--azure)')
      .attr('stroke-width', 2)
      .attr('d', line);

    // Benchmark line (optional)
    if (showBenchmark && benchmarkValue !== undefined) {
      g.append('line')
        .attr('x1', 0)
        .attr('x2', w)
        .attr('y1', yScale(benchmarkValue))
        .attr('y2', yScale(benchmarkValue))
        .attr('stroke', '#999')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '3,3');
    }

    // Dots at data points
    g.selectAll('circle')
      .data(parsed)
      .join('circle')
      .attr('cx', d => xScale(d.date))
      .attr('cy', d => yScale(d.value))
      .attr('r', 2)
      .attr('fill', 'var(--azure)');

  }, [parsed, height, showBenchmark, benchmarkValue, holding.holdingId]);

  const trendColor = holding.trend === 'up' ? 'text-green-600' : holding.trend === 'down' ? 'text-red-600' : 'text-neutral-600';
  const trendIcon = holding.trend === 'up' ? '↑' : holding.trend === 'down' ? '↓' : '→';

  return (
    <div
      className="group cursor-pointer rounded-2xl border border-neutral-200 bg-white p-4 transition-all hover:shadow-lg hover:-translate-y-1"
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-neutral-900 truncate">
            {holding.holdingName}
          </h4>
          <p className="text-xs text-neutral-500">{holding.sector}</p>
        </div>
        <div className={`text-xs font-medium ${trendColor}`}>
          {trendIcon} {Math.abs(holding.percentChange).toFixed(1)}%
        </div>
      </div>

      {/* Chart */}
      <div ref={containerRef} className="w-full">
        <svg
          ref={svgRef}
          width={width}
          height={height}
          className="w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${holding.holdingName} trend sparkline`}
        />
      </div>

      {/* Latest value */}
      <div className="mt-2 text-center">
        <span className="text-lg font-bold text-neutral-900">
          {holding.latestValue.toLocaleString(undefined, { maximumFractionDigits: 1 })}
        </span>
      </div>
    </div>
  );
}
