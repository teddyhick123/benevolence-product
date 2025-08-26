// components/vis/KpiTrend.tsx
'use client';
import * as d3 from 'd3';
import { useEffect, useMemo, useRef, useState } from 'react';

type Point = { date: string; value: number };

export default function KpiTrend({ portfolioId, metric, title }: { portfolioId: string; metric: string; title?: string }) {
  const [data, setData] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(700);
  const h = Math.max(240, Math.round(w * 0.35));

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch(`/api/portfolio/${encodeURIComponent(portfolioId)}/kpi-series?metric=${encodeURIComponent(metric)}`, { cache: 'no-store' });
        const j = await r.json();
        if (mounted) setData(j.series || []);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [portfolioId, metric]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        setW(Math.max(320, Math.floor(e.contentRect.width)));
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const parsed = useMemo(() => data.map(d => ({ date: new Date(d.date), value: +d.value })), [data]);

  useEffect(() => {
    const svg = d3.select(ref.current);
    if (!svg.node()) return;
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${w} ${h}`);

    if (!parsed.length) return;

    const margin = { top: 10, right: 10, bottom: 24, left: 40 };
    const innerW = w - margin.left - margin.right;
    const innerH = h - margin.top - margin.bottom;

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleUtc()
      .domain(d3.extent(parsed, d => d.date) as [Date, Date])
      .range([0, innerW]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(parsed, d => d.value)!]).nice()
      .range([innerH, 0]);

    // axes
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(5).tickSizeOuter(0) as any)
      .selectAll('text').attr('font-size', 11);
    g.append('g')
      .call(d3.axisLeft(y).ticks(5).tickSizeOuter(0) as any)
      .selectAll('text').attr('font-size', 11);

    // line
    const line = d3.line<{ date: Date; value: number }>()
      .x(d => x(d.date))
      .y(d => y(d.value));

    g.append('path')
      .datum(parsed)
      .attr('fill', 'none')
      .attr('stroke', '#5186a6')
      .attr('stroke-width', 2)
      .attr('d', line as any);

  }, [parsed, w, h]);

  return (
    <div className="card p-4" ref={containerRef}>
      <div className="text-sm text-neutral-600 mb-2">{title || `${metric} trend`}</div>
      {loading ? (
        <div className="h-[220px] bg-neutral-100 rounded animate-pulse" />
      ) : (
        <svg ref={ref} className="w-full h-[260px]" />
      )}
    </div>
  );
}