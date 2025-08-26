// components/vis/SectorEmissionsBar.tsx
'use client';
import * as d3 from 'd3';
import { useEffect, useRef, useState } from 'react';

type Row = { sector: string; value: number };

export default function SectorEmissionsBar({ portfolioId }: { portfolioId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Use v_portfolio_latest; filter FEMISS metric
        const r = await fetch(`/api/portfolio/${encodeURIComponent(portfolioId)}/overview`, { cache: 'no-store' });
        const j = await r.json();
        const latest: any[] = j?.latest || [];
        const femiss = latest.filter(r => r.metric_name === 'FEMISS');
        const bySector: Record<string, number> = {};
        femiss.forEach(r => {
          const s = r.sector || 'Other';
          const v = Number(r.metric_value ?? 0);
          bySector[s] = (bySector[s] ?? 0) + (isFinite(v) ? v : 0);
        });
        const arr = Object.entries(bySector).map(([sector, value]) => ({ sector, value })).sort((a, b) => b.value - a.value);
        if (mounted) setRows(arr);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [portfolioId]);

  useEffect(() => {
    const svg = d3.select(ref.current);
    if (!svg.node()) return;
    svg.selectAll('*').remove();
    const w = 700, h = Math.max(240, rows.length * 28);
    svg.attr('viewBox', `0 0 ${w} ${h}`);

    if (!rows.length) return;

    const margin = { top: 10, right: 10, bottom: 10, left: 140 };
    const innerW = w - margin.left - margin.right;
    const innerH = h - margin.top - margin.bottom;

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const y = d3.scaleBand().domain(rows.map(d => d.sector)).range([0, innerH]).padding(0.15);
    const x = d3.scaleLinear().domain([0, d3.max(rows, d => d.value)!]).nice().range([0, innerW]);

    g.append('g').call(d3.axisLeft(y) as any).selectAll('text').attr('font-size', 11);

    g.selectAll('rect')
      .data(rows)
      .enter()
      .append('rect')
      .attr('x', 0)
      .attr('y', d => y(d.sector)!)
      .attr('width', d => x(d.value))
      .attr('height', y.bandwidth())
      .attr('fill', '#5186a6')
      .attr('opacity', 0.8);

    g.selectAll('text.value')
      .data(rows)
      .enter()
      .append('text')
      .attr('x', d => x(d.value) + 6)
      .attr('y', d => (y(d.sector)! + y.bandwidth() / 2) + 4)
      .attr('font-size', 11)
      .text(d => d.value.toLocaleString());
  }, [rows]);

  return (
    <div className="card p-4">
      <div className="text-sm text-neutral-600 mb-2">Emissions by sector (latest FEMISS)</div>
      {loading ? (
        <div className="h-[220px] bg-neutral-100 rounded animate-pulse" />
      ) : (
        <svg ref={ref} className="w-full" />
      )}
    </div>
  );
}