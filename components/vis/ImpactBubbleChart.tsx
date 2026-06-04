'use client';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import * as d3 from 'd3';
import { useWidgetDimensions } from '@/hooks/useWidgetDimensions';
import { ASSET_TYPE_COLORS } from '@/lib/schemas/portfolio';

interface BubbleData {
  holdingId: string;
  holdingName: string;
  sector: string | null;
  assetType?: string | null;
  xValue: number;
  yValue: number;
  sizeValue: number;
  colorValue?: number;
  xMetric: string;
  yMetric: string;
  sizeMetric: string;
  colorMetric?: string;
}

interface Props {
  portfolioId: string;
  title?: string | null;
  config?: {
    xMetric: string; // Metric code for X-axis
    yMetric: string; // Metric code for Y-axis
    sizeMetric: string; // Metric code for bubble size
    colorMetric?: string; // Optional metric code for bubble color
    colorMode?: 'metric' | 'sector' | 'asset_type'; // Color by metric value, sector, or asset type
    minBubbleSize?: number;
    maxBubbleSize?: number;
    showLabels?: boolean; // Show holding names on bubbles
    xLabel?: string;
    yLabel?: string;
    minHoldings?: number;
  };
}

export default function ImpactBubbleChart({ portfolioId, title, config }: Props) {
  const router = useRouter();
  const [data, setData] = useState<BubbleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const xMetric = config?.xMetric || '';
  const yMetric = config?.yMetric || '';
  const sizeMetric = config?.sizeMetric || '';
  const colorMetric = config?.colorMetric;
  const colorMode = config?.colorMode || 'sector';
  const minHoldings = config?.minHoldings || 2;

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!xMetric || !yMetric || !sizeMetric) {
        setError('X-axis, Y-axis, and size metrics are required');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          xMetric,
          yMetric,
          sizeMetric
        });
        if (colorMetric) params.set('colorMetric', colorMetric);

        const res = await fetch(
          `/api/portfolio/${encodeURIComponent(portfolioId)}/bubble-chart?${params.toString()}`,
          { cache: 'no-store' }
        );

        if (!res.ok) {
          throw new Error(`Failed to fetch bubble chart data: ${res.status}`);
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
  }, [portfolioId, xMetric, yMetric, sizeMetric, colorMetric]);

  if (loading) {
    return (
      <div className="w-full p-8 text-center text-neutral-500">
        <div className="inline-block w-6 h-6 border-2 border-neutral-300 border-t-azure rounded-full animate-spin mb-2"></div>
        <p className="text-sm">Loading bubble chart...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full p-6 rounded-2xl border border-red-200 bg-red-50 text-red-700">
        <p className="font-medium text-sm">Error loading bubble chart</p>
        <p className="text-xs mt-1">{error}</p>
      </div>
    );
  }

  if (data.length < minHoldings) {
    return (
      <div className="w-full p-6 rounded-2xl border border-neutral-200 bg-neutral-50 text-neutral-600">
        <p className="text-sm">
          Need at least {minHoldings} holdings with data to show bubble chart.
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

      <div className="flex-1 min-h-0">
        <BubbleChartD3
          data={data}
          colorMode={colorMode}
          showLabels={config?.showLabels ?? false}
          minBubbleSize={config?.minBubbleSize || 10}
          maxBubbleSize={config?.maxBubbleSize || 50}
          xLabel={config?.xLabel || xMetric}
          yLabel={config?.yLabel || yMetric}
          onBubbleClick={(bubble) => router.push(`/dashboard/holdings/${bubble.holdingId}`)}
        />
      </div>

      <div className="text-xs text-neutral-500 text-center shrink-0 mt-4">
        Bubble size represents {sizeMetric}. Click any bubble to view holding details.
      </div>
    </div>
  );
}

interface BubbleChartD3Props {
  data: BubbleData[];
  colorMode: 'metric' | 'sector' | 'asset_type';
  showLabels: boolean;
  minBubbleSize: number;
  maxBubbleSize: number;
  xLabel: string;
  yLabel: string;
  onBubbleClick: (bubble: BubbleData) => void;
}

function BubbleChartD3({
  data,
  colorMode,
  showLabels,
  minBubbleSize,
  maxBubbleSize,
  xLabel,
  yLabel,
  onBubbleClick
}: BubbleChartD3Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [containerRef, dimensions] = useWidgetDimensions(600, 400);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 20, right: 40, bottom: 60, left: 70 };
    const width = Math.max(dimensions.width - margin.left - margin.right, 300);
    const height = Math.max(dimensions.height - margin.top - margin.bottom, 250);

    svg
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom);

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xExtent = d3.extent(data, d => d.xValue) as [number, number];
    const yExtent = d3.extent(data, d => d.yValue) as [number, number];
    const sizeExtent = d3.extent(data, d => d.sizeValue) as [number, number];

    const xScale = d3
      .scaleLinear()
      .domain([Math.min(0, xExtent[0]), xExtent[1]])
      .range([0, width])
      .nice();

    const yScale = d3
      .scaleLinear()
      .domain([Math.min(0, yExtent[0]), yExtent[1]])
      .range([height, 0])
      .nice();

    const sizeScale = d3
      .scaleSqrt()
      .domain(sizeExtent)
      .range([minBubbleSize, maxBubbleSize]);

    // Color scale
    let colorScale: d3.ScaleOrdinal<string, string> | d3.ScaleSequential<string>;
    if (colorMode === 'sector') {
      const sectors = Array.from(new Set(data.map(d => d.sector || 'Unknown')));
      colorScale = d3.scaleOrdinal<string>()
        .domain(sectors)
        .range(d3.schemeCategory10);
    } else if (colorMode === 'asset_type') {
      // Use standard asset type color palette from schema
      const assetTypes = Array.from(new Set(data.map(d => d.assetType || 'other')));
      colorScale = d3.scaleOrdinal<string>()
        .domain(assetTypes)
        .range(assetTypes.map(t => ASSET_TYPE_COLORS[t as keyof typeof ASSET_TYPE_COLORS] || ASSET_TYPE_COLORS.other));
    } else {
      const colorExtent = d3.extent(data, d => d.colorValue ?? 0) as [number, number];
      colorScale = d3.scaleSequential<string>()
        .domain(colorExtent)
        .interpolator(d3.interpolateViridis);
    }

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

    g.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${height})`)
      .call(
        d3.axisBottom(xScale)
          .ticks(8)
          .tickSize(-height)
          .tickFormat(() => '')
      )
      .selectAll('line')
      .attr('stroke', '#e5e7eb')
      .attr('stroke-dasharray', '2,2');

    // X Axis
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale).ticks(8))
      .selectAll('text')
      .attr('font-size', '11px');

    // Y Axis
    g.append('g')
      .call(d3.axisLeft(yScale).ticks(8))
      .selectAll('text')
      .attr('font-size', '11px');

    // X Axis Label
    g.append('text')
      .attr('x', width / 2)
      .attr('y', height + 45)
      .attr('text-anchor', 'middle')
      .attr('font-size', '13px')
      .attr('font-weight', 600)
      .attr('fill', '#374151')
      .text(xLabel);

    // Y Axis Label
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -height / 2)
      .attr('y', -50)
      .attr('text-anchor', 'middle')
      .attr('font-size', '13px')
      .attr('font-weight', 600)
      .attr('fill', '#374151')
      .text(yLabel);

    // Tooltip
    const tooltip = d3.select(tooltipRef.current);

    // Draw bubbles
    const bubbles = g.selectAll('.bubble')
      .data(data)
      .join('g')
      .attr('class', 'bubble')
      .attr('transform', d => `translate(${xScale(d.xValue)},${yScale(d.yValue)})`)
      .style('cursor', 'pointer');

    bubbles
      .append('circle')
      .attr('r', d => sizeScale(d.sizeValue))
      .attr('fill', d => {
        if (colorMode === 'sector') {
          return (colorScale as d3.ScaleOrdinal<string, string>)(d.sector || 'Unknown');
        } else if (colorMode === 'asset_type') {
          return (colorScale as d3.ScaleOrdinal<string, string>)(d.assetType || 'other');
        } else {
          return (colorScale as d3.ScaleSequential<string>)(d.colorValue ?? 0);
        }
      })
      .attr('fill-opacity', 0.7)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .on('mouseover', function(event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('fill-opacity', 1)
          .attr('stroke-width', 3);

        const containerEl = (containerRef as { current: HTMLDivElement | null }).current;
        const rect = containerEl?.getBoundingClientRect() ?? { left: 0, top: 0 };

        tooltip
          .style('opacity', 1)
          .html(`
            <div class="font-semibold mb-1">${d.holdingName}</div>
            ${d.sector ? `<div class="text-xs text-neutral-500 mb-2">${d.sector}</div>` : ''}
            <div class="text-sm space-y-1">
              <div><span class="text-neutral-500">${d.xMetric}:</span> ${d.xValue.toLocaleString()}</div>
              <div><span class="text-neutral-500">${d.yMetric}:</span> ${d.yValue.toLocaleString()}</div>
              <div><span class="text-neutral-500">${d.sizeMetric}:</span> ${d.sizeValue.toLocaleString()}</div>
              ${d.colorValue !== undefined && d.colorMetric ? `<div><span class="text-neutral-500">${d.colorMetric}:</span> ${d.colorValue.toLocaleString()}</div>` : ''}
            </div>
          `)
          .style('left', (event.clientX - rect.left + 10) + 'px')
          .style('top', (event.clientY - rect.top - 10) + 'px');
      })
      .on('mouseout', function() {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('fill-opacity', 0.7)
          .attr('stroke-width', 2);

        tooltip.style('opacity', 0);
      })
      .on('click', (event, d) => {
        event.stopPropagation();
        onBubbleClick(d);
      });

    // Labels
    if (showLabels) {
      bubbles
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '10px')
        .attr('font-weight', 600)
        .attr('fill', '#374151')
        .attr('pointer-events', 'none')
        .text(d => d.holdingName.length > 15 ? d.holdingName.substring(0, 12) + '...' : d.holdingName);
    }

    // Legend
    if (colorMode === 'sector' || colorMode === 'asset_type') {
      const legendData = colorMode === 'sector'
        ? Array.from(new Set(data.map(d => d.sector || 'Unknown')))
        : Array.from(new Set(data.map(d => d.assetType || 'other')));

      const legend = svg
        .append('g')
        .attr('transform', `translate(${margin.left + width - 120}, ${margin.top})`);

      legend
        .selectAll('.legend-item')
        .data(legendData)
        .join('g')
        .attr('class', 'legend-item')
        .attr('transform', (d, i) => `translate(0, ${i * 20})`)
        .each(function(d) {
          const item = d3.select(this);
          item
            .append('circle')
            .attr('r', 5)
            .attr('fill', (colorScale as d3.ScaleOrdinal<string, string>)(d));
          item
            .append('text')
            .attr('x', 10)
            .attr('y', 4)
            .attr('font-size', '11px')
            .attr('fill', '#374151')
            .text(d.length > 15 ? d.substring(0, 15) + '...' : d);
        });
    }

  }, [data, colorMode, showLabels, minBubbleSize, maxBubbleSize, xLabel, yLabel, onBubbleClick, dimensions]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <svg ref={svgRef} className="w-full h-full" role="img" aria-label="Impact bubble chart" />
      <div
        ref={tooltipRef}
        className="absolute pointer-events-none opacity-0 bg-white rounded-2xl shadow-lg border border-neutral-200 p-3 text-sm transition-opacity"
        style={{ maxWidth: '250px' }}
      />
    </div>
  );
}
