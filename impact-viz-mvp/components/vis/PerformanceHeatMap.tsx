'use client';
import { useEffect, useState, useMemo, useRef } from 'react';
import * as d3 from 'd3';

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
          cellWidth={config?.cellWidth || 80}
          cellHeight={config?.cellHeight || 40}
          colorScheme={config?.colorScheme || 'sequential'}
          minColor={config?.minColor || '#fef3c7'}
          maxColor={config?.maxColor || '#059669'}
          midColor={config?.midColor}
          showValues={config?.showValues ?? false}
        />
      </div>

      <div className="text-xs text-neutral-500 text-center shrink-0 mt-4">
        {mode === 'temporal'
          ? `Showing ${metricCode} over time`
          : `Showing multiple metrics: ${metricsString}`}
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
  cellWidth,
  cellHeight,
  colorScheme,
  minColor,
  maxColor,
  midColor,
  showValues
}: HeatMapChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || matrix.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 80, right: 20, bottom: 20, left: 150 };
    const width = columns.length * cellWidth;
    const height = holdings.length * cellHeight;

    svg
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom);

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

    // Draw cells
    holdings.forEach((holding, i) => {
      columns.forEach((col, j) => {
        const value = matrix[i][j];

        const cell = g
          .append('g')
          .attr('transform', `translate(${j * cellWidth},${i * cellHeight})`);

        // Rectangle
        cell
          .append('rect')
          .attr('width', cellWidth - 2)
          .attr('height', cellHeight - 2)
          .attr('fill', value !== null ? colorScale(value) : '#f5f5f5')
          .attr('stroke', '#fff')
          .attr('stroke-width', 2)
          .attr('rx', 4);

        // Value text
        if (showValues && value !== null) {
          cell
            .append('text')
            .attr('x', cellWidth / 2)
            .attr('y', cellHeight / 2)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('fill', value > (minVal + maxVal) / 2 ? '#fff' : '#374151')
            .attr('font-size', '11px')
            .attr('font-weight', 600)
            .text(value.toLocaleString(undefined, { maximumFractionDigits: 0 }));
        }
      });
    });

    // Column headers
    columns.forEach((col, j) => {
      g.append('text')
        .attr('x', j * cellWidth + cellWidth / 2)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .attr('font-weight', 600)
        .attr('fill', '#374151')
        .text(col);
    });

    // Row labels
    holdings.forEach((holding, i) => {
      g.append('text')
        .attr('x', -10)
        .attr('y', i * cellHeight + cellHeight / 2)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '12px')
        .attr('fill', '#374151')
        .text(holding.length > 20 ? holding.substring(0, 20) + '...' : holding);
    });

    // Legend
    const legendWidth = 200;
    const legendHeight = 10;
    const legendX = width - legendWidth - 20;
    const legendY = -50;

    const legendScale = d3
      .scaleLinear()
      .domain([0, legendWidth])
      .range([minVal, maxVal]);

    const legendAxis = d3
      .axisBottom(d3.scaleLinear().domain([minVal, maxVal]).range([0, legendWidth]))
      .ticks(5)
      .tickSize(3);

    const legendGroup = g
      .append('g')
      .attr('transform', `translate(${legendX},${legendY})`);

    // Gradient for legend
    const defs = svg.append('defs');
    const gradientId = 'heat-map-gradient';
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

    legendGroup
      .append('rect')
      .attr('width', legendWidth)
      .attr('height', legendHeight)
      .style('fill', `url(#${gradientId})`)
      .attr('rx', 2);

    legendGroup
      .append('g')
      .attr('transform', `translate(0,${legendHeight})`)
      .call(legendAxis as any)
      .selectAll('text')
      .attr('font-size', '10px');

  }, [holdings, columns, matrix, cellWidth, cellHeight, colorScheme, minColor, maxColor, midColor, showValues]);

  return (
    <div className="w-full overflow-x-auto">
      <svg ref={svgRef} className="mx-auto" />
    </div>
  );
}
