'use client';
import { useEffect, useState, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { useWidgetDimensions } from '@/hooks/useWidgetDimensions';

interface HeatMapCell {
  holding: string;
  holdingId: string;
  period: string; // or metric name
  value: number;
}

interface Props {
  portfolioId: string;
  title?: string | null;
  config?: {
    metric_code?: string; // Single metric mode
    metrics?: string[]; // Multi-metric mode
    window?: string; // '3m', '6m', '12m', 'all'
    mode?: 'temporal' | 'metrics'; // temporal: metric over time, metrics: multiple metrics
    colorScheme?: 'sequential' | 'diverging'; // color scale type
    minColor?: string;
    maxColor?: string;
    midColor?: string; // for diverging
    cellWidth?: number;
    cellHeight?: number;
    showValues?: boolean; // show numeric values in cells
    minHoldings?: number;
  };
}

export default function PerformanceHeatMap({ portfolioId, title, config }: Props) {
  const [data, setData] = useState<HeatMapCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mode = config?.mode || 'temporal';
  const metricCode = config?.metric_code || '';
  const window = config?.window || 'all';
  const minHoldings = config?.minHoldings || 2;

  // Stabilize metrics array to prevent infinite loop
  const metricsString = useMemo(() => {
    const metrics = config?.metrics || [];
    return metrics.join(',');
  }, [config?.metrics]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const metrics = metricsString.split(',').filter(Boolean);

      if (mode === 'temporal' && !metricCode) {
        setError('No metric specified for temporal mode');
        setLoading(false);
        return;
      }
      if (mode === 'metrics' && metrics.length === 0) {
        setError('No metrics specified for metrics mode');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          mode: mode,
          window: window
        });

        if (mode === 'temporal') {
          params.set('metric', metricCode);
        } else {
          params.set('metrics', metricsString);
        }

        const res = await fetch(
          `/api/portfolio/${encodeURIComponent(portfolioId)}/heat-map?${params.toString()}`,
          { cache: 'no-store' }
        );

        if (!res.ok) {
          throw new Error(`Failed to fetch heat map data: ${res.status}`);
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
  }, [portfolioId, metricCode, metricsString, window, mode]);

  // Group data for rendering
  const { holdings, columns, matrix } = useMemo(() => {
    const holdingsSet = new Set<string>();
    const columnsSet = new Set<string>();
    const valueMap = new Map<string, number>();

    for (const cell of data) {
      holdingsSet.add(cell.holding);
      columnsSet.add(cell.period);
      valueMap.set(`${cell.holding}:${cell.period}`, cell.value);
    }

    const holdings = Array.from(holdingsSet);
    const columns = Array.from(columnsSet);

    // Create matrix
    const matrix = holdings.map(holding =>
      columns.map(col => valueMap.get(`${holding}:${col}`) ?? null)
    );

    return { holdings, columns, matrix };
  }, [data]);

  if (loading) {
    return (
      <div className="w-full p-8 text-center text-neutral-500">
        <div className="inline-block w-6 h-6 border-2 border-neutral-300 border-t-azure rounded-full animate-spin mb-2"></div>
        <p className="text-sm">Loading heat map...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full p-6 rounded-lg border border-red-200 bg-red-50 text-red-700">
        <p className="font-medium text-sm">Error loading heat map</p>
        <p className="text-xs mt-1">{error}</p>
      </div>
    );
  }

  if (holdings.length < minHoldings) {
    return (
      <div className="w-full p-6 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-600">
        <p className="text-sm">
          Need at least {minHoldings} holdings with data to show heat map.
        </p>
        <p className="text-xs mt-1 text-neutral-500">
          Currently have {holdings.length} holding(s) with data.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {title && (
        <h3 className="text-lg font-semibold text-neutral-900 shrink-0 mb-4">{title}</h3>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        <HeatMapChart
          holdings={holdings}
          columns={columns}
          matrix={matrix}
          cellWidth={config?.cellWidth || 90}
          cellHeight={config?.cellHeight || 50}
          colorScheme={config?.colorScheme || 'sequential'}
          minColor={config?.minColor || '#e0f2fe'}
          maxColor={config?.maxColor || '#5186a6'}
          midColor={config?.midColor || '#e07a5f'}
          showValues={config?.showValues ?? false}
        />
      </div>

      <div className="text-xs text-neutral-500 text-center shrink-0 mt-4 px-4">
        <div className="inline-flex items-center gap-2 bg-neutral-50 px-3 py-1.5 rounded-full">
          <div className="w-1.5 h-1.5 rounded-full bg-azure"></div>
          {mode === 'temporal'
            ? `Performance: ${metricCode} over ${window === 'all' ? 'all time' : window}`
            : `Comparing ${metricsString.split(',').length} metrics`}
        </div>
      </div>
    </div>
  );
}

interface HeatMapChartProps {
  holdings: string[];
  columns: string[];
  matrix: (number | null)[][];
  cellWidth: number;
  cellHeight: number;
  colorScheme: 'sequential' | 'diverging';
  minColor: string;
  maxColor: string;
  midColor?: string;
  showValues: boolean;
}

function HeatMapChart({
  holdings,
  columns,
  matrix,
  cellWidth: configCellWidth,
  cellHeight: configCellHeight,
  colorScheme,
  minColor,
  maxColor,
  midColor,
  showValues
}: HeatMapChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [containerRef, dimensions] = useWidgetDimensions(800, 600);

  useEffect(() => {
    if (!svgRef.current || matrix.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Increased margins for better label spacing
    const margin = { top: 100, right: 40, bottom: 40, left: 180 };

    // Calculate available space
    const availableWidth = dimensions.width - margin.left - margin.right;
    const availableHeight = dimensions.height - margin.top - margin.bottom;

    // Dynamic cell sizing - larger minimum sizes for better readability
    const cellWidth = Math.max(Math.min(configCellWidth, Math.floor(availableWidth / columns.length)), 70);
    const cellHeight = Math.max(Math.min(configCellHeight, Math.floor(availableHeight / holdings.length)), 50);

    // Actual chart dimensions
    const width = Math.max(columns.length * cellWidth, 300);
    const height = Math.max(holdings.length * cellHeight, 200);

    svg
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
      .attr('preserveAspectRatio', 'xMidYMin meet');

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Flatten matrix to get all values
    const allValues = matrix.flat().filter((v): v is number => v !== null);

    if (allValues.length === 0) return;

    const minVal = d3.min(allValues) || 0;
    const maxVal = d3.max(allValues) || 1;

    // Color scale
    let colorScale: d3.ScaleSequential<string> | d3.ScaleLinear<string, string>;
    if (colorScheme === 'diverging' && midColor) {
      const mid = (minVal + maxVal) / 2;
      colorScale = d3
        .scaleLinear<string>()
        .domain([minVal, mid, maxVal])
        .range([minColor, midColor, maxColor]);
    } else {
      colorScale = d3
        .scaleSequential<string>()
        .domain([minVal, maxVal])
        .interpolator(d3.interpolateRgb(minColor, maxColor));
    }

    // Tooltip element
    const tooltip = tooltipRef.current ? d3.select(tooltipRef.current) : null;

    // Draw cells with improved styling and hover effects
    holdings.forEach((holding, i) => {
      columns.forEach((col, j) => {
        const value = matrix[i][j];

        const cell = g
          .append('g')
          .attr('transform', `translate(${j * cellWidth},${i * cellHeight})`)
          .style('cursor', value !== null ? 'pointer' : 'default');

        // Rectangle with better styling
        const rect = cell
          .append('rect')
          .attr('width', cellWidth - 4)
          .attr('height', cellHeight - 4)
          .attr('x', 2)
          .attr('y', 2)
          .attr('fill', value !== null ? colorScale(value) : '#f9fafb')
          .attr('stroke', value !== null ? '#e5e7eb' : '#d1d5db')
          .attr('stroke-width', 1)
          .attr('rx', 6)
          .style('transition', 'all 0.2s ease');

        // Add hover effects
        if (value !== null) {
          cell
            .on('mouseenter', function(event) {
              d3.select(this).select('rect')
                .attr('stroke', '#5186a6')
                .attr('stroke-width', 2)
                .style('filter', 'brightness(1.1)');

              if (tooltip) {
                tooltip
                  .style('opacity', 1)
                  .style('left', `${event.pageX + 10}px`)
                  .style('top', `${event.pageY - 10}px`)
                  .html(`
                    <div class="font-semibold text-sm mb-1">${holding}</div>
                    <div class="text-xs text-neutral-600">${col}</div>
                    <div class="text-sm font-bold mt-1 text-azure">${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                  `);
              }
            })
            .on('mousemove', function(event) {
              if (tooltip) {
                tooltip
                  .style('left', `${event.pageX + 10}px`)
                  .style('top', `${event.pageY - 10}px`);
              }
            })
            .on('mouseleave', function() {
              d3.select(this).select('rect')
                .attr('stroke', '#e5e7eb')
                .attr('stroke-width', 1)
                .style('filter', 'none');

              if (tooltip) {
                tooltip.style('opacity', 0);
              }
            });
        }

        // Value text - only show if explicitly enabled
        if (showValues && value !== null) {
          const textColor = value > (minVal + maxVal) * 0.6 ? '#ffffff' : '#1f2937';
          cell
            .append('text')
            .attr('x', cellWidth / 2)
            .attr('y', cellHeight / 2)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('fill', textColor)
            .attr('font-size', '12px')
            .attr('font-weight', 600)
            .style('pointer-events', 'none')
            .text(value.toLocaleString(undefined, { maximumFractionDigits: 0 }));
        }
      });
    });

    // Column headers - rotated for better space usage
    columns.forEach((col, j) => {
      const headerGroup = g.append('g')
        .attr('transform', `translate(${j * cellWidth + cellWidth / 2}, -15)`);

      headerGroup.append('text')
        .attr('transform', 'rotate(-45)')
        .attr('text-anchor', 'end')
        .attr('font-size', '13px')
        .attr('font-weight', 600)
        .attr('fill', '#475569')
        .style('letter-spacing', '0.01em')
        .text(col.length > 30 ? col.substring(0, 27) + '...' : col)
        .append('title')
        .text(col);
    });

    // Row labels - better truncation with ellipsis
    holdings.forEach((holding, i) => {
      const maxChars = Math.floor(margin.left / 7); // Estimate based on available space
      const truncated = holding.length > maxChars ? holding.substring(0, maxChars - 3) + '...' : holding;

      const labelGroup = g.append('g')
        .attr('transform', `translate(-15, ${i * cellHeight + cellHeight / 2})`);

      labelGroup.append('text')
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '13px')
        .attr('font-weight', 500)
        .attr('fill', '#475569')
        .style('letter-spacing', '0.01em')
        .text(truncated)
        .append('title')
        .text(holding);
    });

    // Legend - improved styling and positioning
    const legendWidth = Math.min(250, width * 0.4);
    const legendHeight = 12;
    const legendX = width - legendWidth;
    const legendY = -60;

    const legendAxis = d3
      .axisBottom(d3.scaleLinear().domain([minVal, maxVal]).range([0, legendWidth]))
      .ticks(4)
      .tickSize(4)
      .tickFormat(d => d3.format('.2s')(d as number));

    const legendGroup = g
      .append('g')
      .attr('transform', `translate(${legendX},${legendY})`);

    // Legend title
    legendGroup
      .append('text')
      .attr('x', legendWidth / 2)
      .attr('y', -8)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('font-weight', 600)
      .attr('fill', '#64748b')
      .style('letter-spacing', '0.02em')
      .text('VALUE RANGE');

    // Gradient for legend
    const defs = svg.append('defs');
    const gradientId = 'heat-map-gradient-' + Math.random().toString(36).substr(2, 9);
    const gradient = defs
      .append('linearGradient')
      .attr('id', gradientId)
      .attr('x1', '0%')
      .attr('x2', '100%')
      .attr('y1', '0%')
      .attr('y2', '0%');

    if (colorScheme === 'diverging' && midColor) {
      gradient.append('stop').attr('offset', '0%').attr('stop-color', minColor);
      gradient.append('stop').attr('offset', '50%').attr('stop-color', midColor);
      gradient.append('stop').attr('offset', '100%').attr('stop-color', maxColor);
    } else {
      gradient.append('stop').attr('offset', '0%').attr('stop-color', minColor);
      gradient.append('stop').attr('offset', '100%').attr('stop-color', maxColor);
    }

    // Legend bar with border
    legendGroup
      .append('rect')
      .attr('width', legendWidth)
      .attr('height', legendHeight)
      .style('fill', `url(#${gradientId})`)
      .attr('stroke', '#e5e7eb')
      .attr('stroke-width', 1)
      .attr('rx', 3);

    // Legend axis
    legendGroup
      .append('g')
      .attr('transform', `translate(0,${legendHeight})`)
      .call(legendAxis as any)
      .selectAll('text')
      .attr('font-size', '10px')
      .attr('fill', '#64748b');

  }, [holdings, columns, matrix, configCellWidth, configCellHeight, colorScheme, minColor, maxColor, midColor, showValues, dimensions]);

  return (
    <div ref={containerRef} className="w-full h-full overflow-auto relative">
      <svg ref={svgRef} className="min-w-full min-h-full" />
      <div
        ref={tooltipRef}
        className="absolute pointer-events-none bg-white rounded-lg shadow-lg border border-neutral-200 px-3 py-2 text-neutral-900 transition-opacity duration-200"
        style={{ opacity: 0, zIndex: 1000 }}
      />
    </div>
  );
}
