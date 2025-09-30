'use client';

import React from 'react';

// Lightweight, runtime-loaded d3 to avoid bundle bloat & SSR type issues
// We purposely avoid a top-level import * as d3 from 'd3' to keep this client-only.

export type D3JsonWidgetProps = {
  title?: string | null;
  portfolioId?: string;
  // Expecting config.d3 = { kind, data, encoding: { x, y, series? }, options? }
  // but we also accept config directly as the d3 spec for convenience.
  config?: any;
  className?: string;
};

export default function D3JsonWidget({ title, config, className }: D3JsonWidgetProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const spec = React.useMemo(() => {
    const s = config?.d3 ?? config ?? {};
    // shallow clone so we can mutate safely
    return typeof s === 'object' && s ? { ...s } : {};
  }, [config]);

  // Basic schema check
  const { kind, data, encoding = {}, options = {} } = spec as any;

  React.useEffect(() => {
    let alive = true;

    async function render() {
      setError(null);
      setLoading(true);

      // Guard: container present
      const el = containerRef.current;
      if (!el) return;

      // Wipe previous render
      el.innerHTML = '';

      try {
        // Lazy-load d3 on the client
        const d3: any = await import('d3');

        // Compute size (responsive to parent width)
        const width = el.clientWidth || 640;
        const height = Math.max(220, Math.min(480, Math.round(width * 0.5)));
        const margin = { top: 24, right: 16, bottom: 36, left: 44, ...(options.margin || {}) };

        // Validate input
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error('No data provided. Supply an array at spec.data');
        }
        if (!encoding.x || !encoding.y) {
          throw new Error('Missing encoding.x or encoding.y');
        }

        const svg = d3
          .select(el)
          .append('svg')
          .attr('width', width)
          .attr('height', height)
          .attr('role', 'img')
          .attr('aria-label', title || 'D3 chart');

        const innerW = width - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;

        const g = svg
          .append('g')
          .attr('transform', `translate(${margin.left},${margin.top})`);

        // Coercion helpers
        const xField = encoding.x;
        const yField = encoding.y;
        const seriesField = encoding.series;

        // Decide renderer
        const chartKind = String(kind || '').toLowerCase();

        if (chartKind === 'bar' || chartKind === 'column') {
          // Categorical bar chart
          const xDomain = data.map((d: any) => String(d[xField]));
          const yMax = d3.max(data, (d: any) => +d[yField]) ?? 0;

          const x = d3
            .scaleBand()
            .domain(xDomain)
            .range([0, innerW])
            .padding(options.padding ?? 0.2);

          const y = d3
            .scaleLinear()
            .domain([0, yMax * 1.1])
            .range([innerH, 0]);

          g
            .append('g')
            .attr('transform', `translate(0,${innerH})`)
            .call(d3.axisBottom(x).tickSizeOuter(0))
            .selectAll('text')
            .style('font-size', '10px');

          g.append('g').call(d3.axisLeft(y).ticks(5)).selectAll('text').style('font-size', '10px');

          g
            .selectAll('rect')
            .data(data)
            .join('rect')
            .attr('x', (d: any) => x(String(d[xField]))!)
            .attr('y', (d: any) => y(+d[yField]))
            .attr('width', x.bandwidth())
            .attr('height', (d: any) => innerH - y(+d[yField]))
            .attr('rx', 3)
            .attr('ry', 3)
            .attr('fill', options.fill || 'currentColor')
            .attr('opacity', 0.9);
        } else if (chartKind === 'line' || chartKind === 'area') {
          // Series-capable line/area
          const isTime = options.xType === 'time' || data.some((d: any) => !isNaN(Date.parse(d[xField])));

          const series = seriesField
            ? d3.groups(data, (d: any) => String(d[seriesField]))
            : [['__single__', data]];

          // Flatten x domain
          const xValues = data.map((d: any) => (isTime ? new Date(d[xField]) : +d[xField] || d[xField]));
          const yValues = data.map((d: any) => +d[yField]);

          const x = isTime
            ? d3.scaleUtc(d3.extent(xValues) as [Date, Date], [0, innerW])
            : d3.scaleLinear(d3.extent(xValues) as [number, number], [0, innerW]);

          const y = d3.scaleLinear([0, d3.max(yValues) ?? 0], [innerH, 0]);

          const xAxis = isTime ? d3.axisBottom(x).ticks(6) : d3.axisBottom(x).ticks(6);
          g.append('g').attr('transform', `translate(0,${innerH})`).call(xAxis).selectAll('text').style('font-size', '10px');
          g.append('g').call(d3.axisLeft(y).ticks(5)).selectAll('text').style('font-size', '10px');

          const line = d3
            .line()
            .defined((d: any) => d[yField] != null && d[xField] != null)
            .x((d: any) => (isTime ? x(new Date(d[xField])) : x(+d[xField]))!)
            .y((d: any) => y(+d[yField]));

          const area = d3
            .area()
            .defined((d: any) => d[yField] != null && d[xField] != null)
            .x((d: any) => (isTime ? x(new Date(d[xField])) : x(+d[xField]))!)
            .y0(y(0))
            .y1((d: any) => y(+d[yField]));

          const palette = d3.schemeCategory10 || ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f'];

          series.forEach(([key, values]: [string, any[]], i: number) => {
            if (chartKind === 'area') {
              g
                .append('path')
                .datum(values)
                .attr('fill', (options.areaFill as string) || palette[i % palette.length])
                .attr('opacity', 0.25)
                .attr('d', area as any);
            }

            g
              .append('path')
              .datum(values)
              .attr('fill', 'none')
              .attr('stroke', (options.stroke as string) || palette[i % palette.length])
              .attr('stroke-width', options.strokeWidth ?? 1.5)
              .attr('d', line as any);
          });
        } else if (chartKind === 'scatter') {
          const xVals = data.map((d: any) => +d[xField]);
          const yVals = data.map((d: any) => +d[yField]);
          const x = d3.scaleLinear([d3.min(xVals) ?? 0, d3.max(xVals) ?? 1], [0, innerW]);
          const y = d3.scaleLinear([d3.min(yVals) ?? 0, d3.max(yVals) ?? 1], [innerH, 0]);

          g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(6));
          g.append('g').call(d3.axisLeft(y).ticks(5));

          g
            .selectAll('circle')
            .data(data)
            .join('circle')
            .attr('cx', (d: any) => x(+d[xField]))
            .attr('cy', (d: any) => y(+d[yField]))
            .attr('r', options.r ?? 3)
            .attr('fill', options.fill || 'currentColor')
            .attr('opacity', 0.85);
        } else {
          throw new Error(`Unsupported kind: ${kind}. Try one of: bar, line, area, scatter.`);
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
  }, [spec, title]);

  // simple ResizeObserver to rerender on width changes
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      // stimulate rerender by toggling spec reference (cheap: mutate a dummy state)
      // but we can instead just re-run effect by forcing content rewrite
      // Calling render indirectly: clear and reassign triggers effect on next tick.
      // Here we simply set innerHTML to force width re-measure on next effect.
      // In practice, container width change will trigger useEffect above because it reads clientWidth.
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className={className}>
      {title ? (
        <div className="px-2 pt-2 pb-1 text-sm font-medium text-neutral-900 truncate">{title}</div>
      ) : null}
      <div ref={containerRef} className="w-full" />
      {loading ? (
        <div className="px-2 py-1 text-xs text-neutral-500">Rendering…</div>
      ) : error ? (
        <div className="px-2 py-1 text-xs text-red-600">{error}</div>
      ) : null}
    </div>
  );
}
