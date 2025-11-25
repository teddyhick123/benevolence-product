'use client';
import { useEffect, useState, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { useWidgetDimensions } from '@/hooks/useWidgetDimensions';

interface WaterfallItem {
  label: string;
  value: number;
  isTotal?: boolean; // If true, bar starts from zero (for start/end totals)
  type?: 'start' | 'increase' | 'decrease' | 'total';
}

interface Props {
  portfolioId: string;
  title?: string | null;
  config?: {
    mode?: 'funding' | 'impact' | 'metric'; // Type of waterfall
    metric_code?: string; // For metric mode
    holdingId?: string; // Optional: filter to specific holding
    showValues?: boolean; // Show value labels on bars
    showConnectors?: boolean; // Show connecting lines between bars
    increaseColor?: string;
    decreaseColor?: string;
    totalColor?: string;
  };
}

export default function WaterfallChart({ portfolioId, title, config }: Props) {
  const [data, setData] = useState<WaterfallItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mode = config?.mode || 'funding';
  const metricCode = config?.metric_code;
  const holdingId = config?.holdingId;

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (mode === 'metric' && !metricCode) {
        setError('Metric mode requires metric_code');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({ mode });
        if (metricCode) params.set('metric', metricCode);
        if (holdingId) params.set('holdingId', holdingId);

        const res = await fetch(
          `/api/portfolio/${encodeURIComponent(portfolioId)}/waterfall?${params.toString()}`,
          { cache: 'no-store' }
        );

        if (!res.ok) {
          throw new Error(`Failed to fetch waterfall data: ${res.status}`);
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
  }, [portfolioId, mode, metricCode, holdingId]);

  if (loading) {
    return (
      <div className="w-full p-8 text-center text-neutral-500">
        <div className="inline-block w-6 h-6 border-2 border-neutral-300 border-t-azure rounded-full animate-spin mb-2"></div>
        <p className="text-sm">Loading waterfall chart...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full p-6 rounded-lg border border-red-200 bg-red-50 text-red-700">
        <p className="font-medium text-sm">Error loading waterfall chart</p>
        <p className="text-xs mt-1">{error}</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="w-full p-6 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-600">
        <p className="text-sm">No data available for waterfall chart.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {title && (
        <h3 className="text-lg font-semibold text-neutral-900 shrink-0 mb-4">{title}</h3>
      )}

      <div className="flex-1 min-h-0">
        <WaterfallD3Chart
          data={data}
          showValues={config?.showValues ?? true}
          showConnectors={config?.showConnectors ?? true}
          increaseColor={config?.increaseColor || '#059669'}
          decreaseColor={config?.decreaseColor || '#dc2626'}
          totalColor={config?.totalColor || '#3b82f6'}
        />
      </div>

      <div className="flex items-center justify-center gap-4 text-xs text-neutral-600 shrink-0 mt-4">
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: config?.increaseColor || '#059669' }}></div>
          <span>Increase</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: config?.decreaseColor || '#dc2626' }}></div>
          <span>Decrease</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: config?.totalColor || '#3b82f6' }}></div>
          <span>Total</span>
        </div>
      </div>
    </div>
  );
}

interface WaterfallD3ChartProps {
  data: WaterfallItem[];
  showValues: boolean;
  showConnectors: boolean;
  increaseColor: string;
  decreaseColor: string;
  totalColor: string;
}

function WaterfallD3Chart({
  data,
  showValues,
  showConnectors,
  increaseColor,
  decreaseColor,
  totalColor
}: WaterfallD3ChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [containerRef, dimensions] = useWidgetDimensions(600, 350);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 20, right: 40, bottom: 80, left: 60 };
    const width = Math.max(dimensions.width - margin.left - margin.right, 300);
    const height = Math.max(dimensions.height - margin.top - margin.bottom, 200);

    svg
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom);

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Calculate cumulative values for positioning
    interface BarData {
      label: string;
      value: number;
      start: number;
      end: number;
      color: string;
      isTotal: boolean;
    }

    const barData: BarData[] = [];
    let cumulative = 0;

    data.forEach((item, i) => {
      if (item.isTotal || item.type === 'start' || item.type === 'total') {
        // Total bars start from zero
        barData.push({
          label: item.label,
          value: item.value,
          start: 0,
          end: item.value,
          color: totalColor,
          isTotal: true
        });
        cumulative = item.value;
      } else {
        // Intermediate bars show change
        const start = cumulative;
        const end = cumulative + item.value;
        const color = item.value >= 0 ? increaseColor : decreaseColor;

        barData.push({
          label: item.label,
          value: item.value,
          start: Math.min(start, end),
          end: Math.max(start, end),
          color,
          isTotal: false
        });

        cumulative = end;
      }
    });

    // Scales
    const xScale = d3
      .scaleBand()
      .domain(barData.map(d => d.label))
      .range([0, width])
      .padding(0.2);

    const maxValue = Math.max(...barData.map(d => Math.max(d.start, d.end)));
    const minValue = Math.min(0, ...barData.map(d => Math.min(d.start, d.end)));

    const yScale = d3
      .scaleLinear()
      .domain([minValue, maxValue])
      .range([height, 0])
      .nice();

    // X Axis
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale))
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end')
      .attr('font-size', '11px');

    // Y Axis
    g.append('g')
      .call(d3.axisLeft(yScale).ticks(8))
      .selectAll('text')
      .attr('font-size', '11px');

    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .call(
        d3.axisLeft(yScale)
          .ticks(8)
          .tickSize(-width)
          .tickFormat(() => '')
      )
      .selectAll('line')
      .attr('stroke', '#e5e7eb')
      .attr('stroke-dasharray', '2,2');

    // Zero line
    g.append('line')
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', yScale(0))
      .attr('y2', yScale(0))
      .attr('stroke', '#9ca3af')
      .attr('stroke-width', 1);

    // Draw connectors first (so they appear behind bars)
    if (showConnectors) {
      barData.forEach((d, i) => {
        if (i < barData.length - 1 && !d.isTotal && !barData[i + 1].isTotal) {
          const x1 = (xScale(d.label) || 0) + xScale.bandwidth();
          const x2 = xScale(barData[i + 1].label) || 0;
          const y = yScale(cumulative);

          // Calculate the cumulative value at the end of current bar
          let cumulativeAtEnd = 0;
          for (let j = 0; j <= i; j++) {
            if (barData[j].isTotal) {
              cumulativeAtEnd = barData[j].value;
            } else {
              cumulativeAtEnd += barData[j].value;
            }
          }

          g.append('line')
            .attr('x1', x1)
            .attr('x2', x2)
            .attr('y1', yScale(cumulativeAtEnd))
            .attr('y2', yScale(cumulativeAtEnd))
            .attr('stroke', '#9ca3af')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '3,3');
        }
      });
    }

    // Draw bars
    barData.forEach(d => {
      const barX = xScale(d.label) || 0;
      const barWidth = xScale.bandwidth();
      const barY = yScale(d.end);
      const barHeight = Math.abs(yScale(d.start) - yScale(d.end));

      // Bar
      g.append('rect')
        .attr('x', barX)
        .attr('y', barY)
        .attr('width', barWidth)
        .attr('height', barHeight)
        .attr('fill', d.color)
        .attr('stroke', '#fff')
        .attr('stroke-width', 2)
        .attr('rx', 4);

      // Value label
      if (showValues) {
        g.append('text')
          .attr('x', barX + barWidth / 2)
          .attr('y', barY - 5)
          .attr('text-anchor', 'middle')
          .attr('font-size', '12px')
          .attr('font-weight', 600)
          .attr('fill', '#374151')
          .text(d.value.toLocaleString(undefined, { maximumFractionDigits: 0 }));
      }
    });

  }, [data, showValues, showConnectors, increaseColor, decreaseColor, totalColor, dimensions]);

  return (
    <div ref={containerRef} className="w-full h-full">
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
}
