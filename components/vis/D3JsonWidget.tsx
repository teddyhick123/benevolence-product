'use client';

import React from 'react';
import { useWidgetDimensions } from '@/hooks/useWidgetDimensions';

export type D3JsonWidgetProps = {
  title?: string | null;
  portfolioId?: string;
  config?: any;
  className?: string;
};

export default function D3JsonWidget({ title, config, className }: D3JsonWidgetProps) {
  const [containerRef, dimensions] = useWidgetDimensions(640, 400);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const tooltipRef = React.useRef<HTMLDivElement | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const spec = React.useMemo(() => {
    const s = config?.d3 ?? config ?? {};
    return typeof s === 'object' && s ? { ...s } : {};
  }, [config]);

  const { kind, data, encoding = {}, options = {} } = spec as any;

  React.useEffect(() => {
    let alive = true;

    async function render() {
      setError(null);
      setLoading(true);

      const svg = svgRef.current;
      const tooltip = tooltipRef.current;
      if (!svg || !tooltip) return;

      // Clear previous render
      const d3: any = await import('d3');
      d3.select(svg).selectAll('*').remove();

      try {
        const width = dimensions.width;
        const height = dimensions.height - (title ? 32 : 0) - 24; // Account for title and status
        const margin = { top: 32, right: 24, bottom: 48, left: 56, ...(options.margin || {}) };

        if (!Array.isArray(data) || data.length === 0) {
          throw new Error('No data provided. Supply an array at spec.data');
        }

        const chartKind = String(kind || '').toLowerCase();
        const isPie = chartKind === 'pie' || chartKind === 'donut';

        if (!isPie && (!encoding.x || !encoding.y)) {
          throw new Error('Missing encoding.x or encoding.y');
        }

        const svgSelection = d3
          .select(svg)
          .attr('width', width)
          .attr('height', height)
          .attr('role', 'img')
          .attr('aria-label', title || 'D3 chart');

        const innerW = width - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;

        const g = svgSelection
          .append('g')
          .attr('transform', `translate(${margin.left},${margin.top})`);

        // Tooltip helper
        const showTooltip = (event: any, content: string) => {
          tooltip.innerHTML = content;
          tooltip.style.opacity = '1';
          tooltip.style.left = `${event.offsetX + 12}px`;
          tooltip.style.top = `${event.offsetY - 12}px`;
        };

        const hideTooltip = () => {
          tooltip.style.opacity = '0';
        };

        const xField = encoding.x;
        const yField = encoding.y;
        const seriesField = encoding.series;
        const showGrid = options.showGrid !== false;
        const xAxisLabel = options.xAxisLabel || '';
        const yAxisLabel = options.yAxisLabel || '';

        // Gridline helper
        const addGridlines = (xScale: any, yScale: any, isTime = false) => {
          if (!showGrid) return;

          // Horizontal gridlines
          g.append('g')
            .attr('class', 'grid')
            .selectAll('line')
            .data(yScale.ticks(5))
            .join('line')
            .attr('x1', 0)
            .attr('x2', innerW)
            .attr('y1', (d: any) => yScale(d))
            .attr('y2', (d: any) => yScale(d))
            .attr('stroke', '#e5e7eb')
            .attr('stroke-dasharray', '2,2');
        };

        // Axis labels helper
        const addAxisLabels = () => {
          if (xAxisLabel) {
            g.append('text')
              .attr('x', innerW / 2)
              .attr('y', innerH + 40)
              .attr('text-anchor', 'middle')
              .attr('font-size', '11px')
              .attr('fill', '#6b7280')
              .text(xAxisLabel);
          }
          if (yAxisLabel) {
            g.append('text')
              .attr('transform', 'rotate(-90)')
              .attr('x', -innerH / 2)
              .attr('y', -44)
              .attr('text-anchor', 'middle')
              .attr('font-size', '11px')
              .attr('fill', '#6b7280')
              .text(yAxisLabel);
          }
        };

        const palette = options.colors || d3.schemeCategory10 || ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f'];

        if (chartKind === 'bar' || chartKind === 'column') {
          const xDomain = data.map((d: any) => String(d[xField]));
          const yMax = d3.max(data, (d: any) => +d[yField]) ?? 0;

          const x = d3.scaleBand().domain(xDomain).range([0, innerW]).padding(options.padding ?? 0.2);
          const y = d3.scaleLinear().domain([0, yMax * 1.1]).range([innerH, 0]);

          addGridlines(x, y);

          g.append('g')
            .attr('transform', `translate(0,${innerH})`)
            .call(d3.axisBottom(x).tickSizeOuter(0))
            .selectAll('text')
            .style('font-size', '10px');

          g.append('g').call(d3.axisLeft(y).ticks(5)).selectAll('text').style('font-size', '10px');

          addAxisLabels();

          g.selectAll('rect')
            .data(data)
            .join('rect')
            .attr('x', (d: any) => x(String(d[xField]))!)
            .attr('y', (d: any) => y(+d[yField]))
            .attr('width', x.bandwidth())
            .attr('height', (d: any) => innerH - y(+d[yField]))
            .attr('rx', 3)
            .attr('ry', 3)
            .attr('fill', options.fill || palette[0])
            .attr('opacity', 0.9)
            .style('cursor', 'pointer')
            .on('mousemove', (event: any, d: any) => {
              d3.select(event.currentTarget).attr('opacity', 1);
              showTooltip(event, `<strong>${d[xField]}</strong><br/>${yField}: ${(+d[yField]).toLocaleString()}`);
            })
            .on('mouseleave', (event: any) => {
              d3.select(event.currentTarget).attr('opacity', 0.9);
              hideTooltip();
            });

        } else if (chartKind === 'line' || chartKind === 'area') {
          const isTime = options.xType === 'time' || data.some((d: any) => !isNaN(Date.parse(d[xField])));

          const series = seriesField
            ? d3.groups(data, (d: any) => String(d[seriesField]))
            : [['__single__', data]];

          const xValues = data.map((d: any) => (isTime ? new Date(d[xField]) : +d[xField] || d[xField]));
          const yValues = data.map((d: any) => +d[yField]);

          const x = isTime
            ? d3.scaleUtc(d3.extent(xValues) as [Date, Date], [0, innerW])
            : d3.scaleLinear(d3.extent(xValues) as [number, number], [0, innerW]);

          const y = d3.scaleLinear([0, d3.max(yValues) ?? 0], [innerH, 0]);

          addGridlines(x, y, isTime);

          const xAxis = d3.axisBottom(x).ticks(6);
          g.append('g').attr('transform', `translate(0,${innerH})`).call(xAxis).selectAll('text').style('font-size', '10px');
          g.append('g').call(d3.axisLeft(y).ticks(5)).selectAll('text').style('font-size', '10px');

          addAxisLabels();

          const line = d3.line()
            .defined((d: any) => d[yField] != null && d[xField] != null)
            .x((d: any) => (isTime ? x(new Date(d[xField])) : x(+d[xField]))!)
            .y((d: any) => y(+d[yField]));

          const area = d3.area()
            .defined((d: any) => d[yField] != null && d[xField] != null)
            .x((d: any) => (isTime ? x(new Date(d[xField])) : x(+d[xField]))!)
            .y0(y(0))
            .y1((d: any) => y(+d[yField]));

          series.forEach(([key, values]: [string, any[]], i: number) => {
            const color = palette[i % palette.length];

            if (chartKind === 'area') {
              g.append('path')
                .datum(values)
                .attr('fill', color)
                .attr('opacity', 0.25)
                .attr('d', area as any);
            }

            g.append('path')
              .datum(values)
              .attr('fill', 'none')
              .attr('stroke', color)
              .attr('stroke-width', options.strokeWidth ?? 2)
              .attr('d', line as any);

            // Data points with tooltips
            g.selectAll(`.point-${i}`)
              .data(values)
              .join('circle')
              .attr('class', `point-${i}`)
              .attr('cx', (d: any) => (isTime ? x(new Date(d[xField])) : x(+d[xField]))!)
              .attr('cy', (d: any) => y(+d[yField]))
              .attr('r', 4)
              .attr('fill', color)
              .attr('stroke', '#fff')
              .attr('stroke-width', 2)
              .style('cursor', 'pointer')
              .on('mousemove', (event: any, d: any) => {
                d3.select(event.currentTarget).attr('r', 6);
                const seriesLabel = seriesField && key !== '__single__' ? `<br/>${seriesField}: ${key}` : '';
                showTooltip(event, `<strong>${d[xField]}</strong>${seriesLabel}<br/>${yField}: ${(+d[yField]).toLocaleString()}`);
              })
              .on('mouseleave', (event: any) => {
                d3.select(event.currentTarget).attr('r', 4);
                hideTooltip();
              });
          });

          // Legend for multi-series
          if (series.length > 1 && seriesField) {
            const legend = svgSelection.append('g')
              .attr('transform', `translate(${margin.left + 10}, 12)`);

            series.forEach(([key]: [string, any[]], i: number) => {
              const legendItem = legend.append('g')
                .attr('transform', `translate(${i * 100}, 0)`);

              legendItem.append('rect')
                .attr('width', 12)
                .attr('height', 12)
                .attr('rx', 2)
                .attr('fill', palette[i % palette.length]);

              legendItem.append('text')
                .attr('x', 16)
                .attr('y', 10)
                .attr('font-size', '10px')
                .attr('fill', '#374151')
                .text(key.length > 12 ? key.substring(0, 12) + '...' : key);
            });
          }

        } else if (chartKind === 'scatter') {
          const xVals = data.map((d: any) => +d[xField]);
          const yVals = data.map((d: any) => +d[yField]);
          const x = d3.scaleLinear([d3.min(xVals) ?? 0, d3.max(xVals) ?? 1], [0, innerW]);
          const y = d3.scaleLinear([d3.min(yVals) ?? 0, d3.max(yVals) ?? 1], [innerH, 0]);

          addGridlines(x, y);

          g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(6)).selectAll('text').style('font-size', '10px');
          g.append('g').call(d3.axisLeft(y).ticks(5)).selectAll('text').style('font-size', '10px');

          addAxisLabels();

          g.selectAll('circle')
            .data(data)
            .join('circle')
            .attr('cx', (d: any) => x(+d[xField]))
            .attr('cy', (d: any) => y(+d[yField]))
            .attr('r', options.r ?? 5)
            .attr('fill', options.fill || palette[0])
            .attr('opacity', 0.85)
            .style('cursor', 'pointer')
            .on('mousemove', (event: any, d: any) => {
              d3.select(event.currentTarget).attr('r', (options.r ?? 5) + 2);
              showTooltip(event, `<strong>${xField}:</strong> ${(+d[xField]).toLocaleString()}<br/><strong>${yField}:</strong> ${(+d[yField]).toLocaleString()}`);
            })
            .on('mouseleave', (event: any) => {
              d3.select(event.currentTarget).attr('r', options.r ?? 5);
              hideTooltip();
            });

        } else if (isPie) {
          const valueField = encoding.value || encoding.y || 'value';
          const labelField = encoding.label || encoding.x || 'label';

          const radius = Math.min(innerW, innerH) / 2;
          const innerRadius = chartKind === 'donut' ? radius * 0.5 : 0;

          const pieG = g.append('g')
            .attr('transform', `translate(${innerW / 2},${innerH / 2})`);

          const pie = d3.pie().value((d: any) => +d[valueField]).sort(null);
          const arc = d3.arc().innerRadius(innerRadius).outerRadius(radius);
          const arcHover = d3.arc().innerRadius(innerRadius).outerRadius(radius + 8);

          const total = d3.sum(data, (d: any) => +d[valueField]);

          const arcs = pieG.selectAll('path')
            .data(pie(data))
            .join('path')
            .attr('d', arc as any)
            .attr('fill', (_: any, i: number) => palette[i % palette.length])
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .style('cursor', 'pointer')
            .on('mousemove', (event: any, d: any) => {
              d3.select(event.currentTarget).attr('d', arcHover as any);
              const percent = ((d.data[valueField] / total) * 100).toFixed(1);
              showTooltip(event, `<strong>${d.data[labelField]}</strong><br/>${(+d.data[valueField]).toLocaleString()} (${percent}%)`);
            })
            .on('mouseleave', (event: any) => {
              d3.select(event.currentTarget).attr('d', arc as any);
              hideTooltip();
            });

          // Legend for pie
          const legend = svgSelection.append('g')
            .attr('transform', `translate(${margin.left + 10}, 12)`);

          data.forEach((d: any, i: number) => {
            const legendItem = legend.append('g')
              .attr('transform', `translate(${i * 90}, 0)`);

            legendItem.append('rect')
              .attr('width', 10)
              .attr('height', 10)
              .attr('rx', 2)
              .attr('fill', palette[i % palette.length]);

            legendItem.append('text')
              .attr('x', 14)
              .attr('y', 9)
              .attr('font-size', '9px')
              .attr('fill', '#374151')
              .text(String(d[labelField]).length > 10 ? String(d[labelField]).substring(0, 10) + '...' : d[labelField]);
          });

        } else {
          throw new Error(`Unsupported kind: ${kind}. Try: bar, line, area, scatter, pie, donut.`);
        }
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || 'Failed to render chart');
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    render();
    return () => {
      alive = false;
    };
  }, [spec, title, dimensions]);

  return (
    <div ref={containerRef} className={`w-full h-full flex flex-col overflow-hidden ${className || ''}`}>
      {title && (
        <div className="px-2 pt-2 pb-1 text-sm font-medium text-neutral-900 truncate shrink-0">{title}</div>
      )}
      <div className="relative flex-1 min-h-0">
        <svg ref={svgRef} className="w-full h-full" />
        <div
          ref={tooltipRef}
          className="absolute pointer-events-none bg-neutral-900 text-white text-xs px-2 py-1 rounded shadow-lg opacity-0 transition-opacity z-10"
          style={{ maxWidth: '200px' }}
        />
      </div>
      {loading ? (
        <div className="px-2 py-1 text-xs text-neutral-500 shrink-0">Rendering...</div>
      ) : error ? (
        <div className="px-2 py-1 text-xs text-red-600 shrink-0">{error}</div>
      ) : null}
    </div>
  );
}
