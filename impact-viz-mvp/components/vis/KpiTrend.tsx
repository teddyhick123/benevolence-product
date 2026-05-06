'use client';
import * as d3 from 'd3';
import { useEffect, useMemo, useRef, useState } from 'react';

type Point = { date: string; value: number };

export default function KpiTrend({ portfolioId, title, config, metric: legacyMetric }: { portfolioId: string; title?: string | null; config?: any; metric?: string }) {
  const metric = (config?.metric_code || legacyMetric || '').toString();
  const windowParam = (config?.period?.window || '').toString();
  const smooth = Boolean(config?.style?.smooth);
  const [data, setData] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgWrapRef = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(700);
  const [h, setH] = useState(200);
  const gradId = useMemo(() => `kpiTrendGrad-${Math.random().toString(36).slice(2, 9)}`, []);
  const fmt = useMemo(() => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }), []);
  // unique clipPath id per instance to avoid collisions across multiple widgets
  const clipId = useMemo(() => `kpiTrendClip-${Math.random().toString(36).slice(2, 9)}` , []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!metric) {
        setData([]);
        setLoading(false);
        return;
      }
      try {
        const params = new URLSearchParams({ metric });
        if (windowParam) params.set('window', windowParam);
        const url = `/api/portfolio/${encodeURIComponent(portfolioId)}/kpi-series?${params.toString()}`;
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) {
          if (mounted) setData([]);
          return;
        }
        const j = await r.json();
        const series = j.series || [];
        if (mounted) {
          setData(series);
        }
      } catch (e) {
        if (mounted) setData([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [portfolioId, metric, windowParam]);

  useEffect(() => {
    const wrapEl = svgWrapRef.current;
    const contEl = containerRef.current;
    if (!wrapEl || !contEl) return;

    const update = (nw: number, nh: number) => {
      setW(Math.max(320, Math.round(nw)));
      setH(Math.max(120, Math.round(nh)));
    };

    const roWrap = new ResizeObserver(entries => {
      for (const e of entries) update(w, e.contentRect.height);
    });
    const roCont = new ResizeObserver(entries => {
      for (const e of entries) update(e.contentRect.width, h);
    });

    roWrap.observe(wrapEl);
    roCont.observe(contEl);
    return () => { roWrap.disconnect(); roCont.disconnect(); };
  }, [w, h]);

  const parsed = useMemo(() => {
    const out = data
      .map(d => ({ date: new Date(d.date), value: Number(d.value) }))
      .filter(d => isFinite(d.date.getTime()) && isFinite(d.value));
    out.sort((a, b) => a.date.getTime() - b.date.getTime());
    return out;
  }, [data]);

  const xDomain: [Date, Date] = useMemo(() => {
    if (!parsed.length) return [new Date(0), new Date(0)];
    if (parsed.length === 1) {
      const d = parsed[0].date.getTime();
      const pad = 1000 * 60 * 60 * 24 * 7; // 7 days
      return [new Date(d - pad), new Date(d + pad)];
    }
    return [parsed[0].date, parsed[parsed.length - 1].date];
  }, [parsed]);

  useEffect(() => {
    const svg = d3.select(ref.current);
    if (!svg.node()) return;
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${w} ${h}`)
       .attr('preserveAspectRatio', 'xMidYMid meet');

    if (!parsed.length) return;

    const fs = Math.max(10, Math.min(12, Math.round(h * 0.06))); // 10–12px
    const margin = {
      top: Math.max(4, Math.round(h * 0.06)),
      right: Math.max(10, Math.round(w * 0.03)),
      bottom: Math.max(20, Math.round(h * 0.14)),
      left: Math.max(36, Math.round(w * 0.08)),
    };
    const innerW = Math.max(10, w - margin.left - margin.right);
    const innerH = Math.max(10, h - margin.top - margin.bottom);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleUtc()
      .domain(xDomain)
      .range([0, innerW]);

    const extent = d3.extent(parsed, d => d.value) as [number, number];
    let [yMin, yMax] = extent;
    if (yMin > 0) yMin = 0; // include 0 if all positive
    if (yMax < 0) yMax = 0; // include 0 if all negative
    const y = d3.scaleLinear()
      .domain([yMin, yMax])
      .nice()
      .range([innerH, 0]);

    // gridlines (subtle)
    g.append('g')
      .attr('class', 'grid-x')
      .attr('transform', `translate(0,${innerH})`)
      .call((d3.axisBottom(x).ticks(Math.max(3, Math.floor(innerW / 160))).tickSize(-innerH).tickFormat(() => '') as any))
      .selectAll('line')
      .attr('stroke', '#e5e7eb')
      .attr('stroke-opacity', 0.6);

    g.append('g')
      .attr('class', 'grid-y')
      .call((d3.axisLeft(y).ticks(Math.max(3, Math.floor(innerH / 60))).tickSize(-innerW).tickFormat(() => '') as any))
      .selectAll('line')
      .attr('stroke', '#e5e7eb')
      .attr('stroke-opacity', 0.6);

    // axes
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(innerW / 160))).tickSizeOuter(0) as any)
      .call(g => g.selectAll('path, line').attr('stroke', '#94a3b8'))
      .call(g => g.selectAll('text').attr('font-size', fs).attr('fill', '#475569'));

    g.append('g')
      .call((d3.axisLeft(y).ticks(Math.max(3, Math.floor(innerH / 60))).tickSizeOuter(0).tickFormat((d: any) => fmt.format(Number(d))) as any))
      .call(g => g.selectAll('path, line').attr('stroke', '#94a3b8'))
      .call(g => g.selectAll('text').attr('font-size', fs).attr('fill', '#475569'));

    // defs: gradient + clip path
    const defs = svg.append('defs');
    const grad = defs.append('linearGradient')
      .attr('id', gradId)
      .attr('x1', '0').attr('y1', '0')
      .attr('x2', '0').attr('y2', '1');
    grad.append('stop').attr('offset', '0%').attr('stop-color', '#5186a6').attr('stop-opacity', 0.18);
    grad.append('stop').attr('offset', '100%').attr('stop-color', '#5186a6').attr('stop-opacity', 0.02);

    defs.append('clipPath')
      .attr('id', clipId)
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', innerW)
      .attr('height', innerH);

    const plot = g.append('g').attr('clip-path', `url(#${clipId})`);

    // line (optionally smoothed)
    const line = (smooth
      ? d3.line<{ date: Date; value: number }>().curve(d3.curveMonotoneX)
      : d3.line<{ date: Date; value: number }>() )
      .x(d => x(d.date))
      .y(d => y(d.value));

    // optional area for a touch of depth
    plot.append('path')
      .datum(parsed)
      .attr('fill', `url(#${gradId})`)
      .attr('d', (d3.area<{ date: Date; value: number }>()
        .x(d => x(d.date))
        .y0(innerH)
        .y1(d => y(d.value)) as any));

    plot.append('path')
      .datum(parsed)
      .attr('fill', 'none')
      .attr('stroke', '#5186a6')
      .attr('stroke-width', Math.max(1.5, Math.round(innerH * 0.012)))
      .attr('stroke-linecap', 'round')
      .attr('d', line as any);

    // Hover interaction
    const focus = plot.append('g').style('display', 'none');
    focus.append('line')
      .attr('class', 'hover-x')
      .attr('y1', 0)
      .attr('y2', innerH)
      .attr('stroke', 'var(--slate-400, #94a3b8)')
      .attr('stroke-dasharray', '2,2');
    focus.append('circle')
      .attr('r', 3)
      .attr('fill', '#5186a6');

    const label = g.append('text')
      .attr('class', 'hover-label')
      .attr('fill', '#334155')
      .attr('font-size', fs)
      .style('display', 'none');

    const bisect = d3.bisector<{ date: Date; value: number }, Date>(d => d.date).center;

    g.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', innerW)
      .attr('height', innerH)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .on('mouseenter', () => { focus.style('display', null as any); label.style('display', null as any); })
      .on('mouseleave', () => { focus.style('display', 'none'); label.style('display', 'none'); })
      .on('mousemove', (event: any) => {
        const [mx] = d3.pointer(event);
        const d0 = x.invert(mx);
        const i = bisect(parsed, d0);
        const p = parsed[Math.max(0, Math.min(parsed.length - 1, i))];
        const cx = x(p.date), cy = y(p.value);
        focus.select('line').attr('x1', cx).attr('x2', cx);
        focus.select('circle').attr('cx', cx).attr('cy', cy);
        label
          .attr('x', Math.min(innerW - 6, cx + 8))
          .attr('y', Math.max(12, cy - 8))
          .text(fmt.format(p.value));
      });
  }, [parsed, xDomain, w, h, clipId, gradId, fmt]);

  return (
    <div className="card p-4 overflow-hidden w-full h-full flex flex-col min-w-0" ref={containerRef}>
      <div className="text-sm text-neutral-600 mb-2">{title || (metric ? `${metric} trend` : 'KPI trend')}</div>
      <div ref={svgWrapRef} className="flex-1 min-h-0 min-w-0">
        {loading ? (
          <div className="w-full h-full bg-neutral-100 rounded animate-pulse" />
        ) : (
          <svg ref={ref} className="w-full h-full block" role="img" aria-label={title ? `${title} trend chart` : (metric ? `${metric} trend chart` : 'KPI trend chart')} />
        )}
      </div>
    </div>
  );
}