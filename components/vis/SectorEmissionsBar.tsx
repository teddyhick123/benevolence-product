// components/vis/SectorEmissionsBar.tsx
'use client';

import { apiRequest, readJson } from "@/lib/api/client";
import * as d3 from 'd3';
import { useEffect, useRef, useState } from 'react';
import { useWidgetDimensions } from '@/lib/hooks/useWidgetDimensions';

type Row = { sector: string; value: number };

export default function SectorEmissionsBar({ portfolioId, title, config }: { portfolioId: string; title?: string | null; config?: any }) {
  const metricCode = (config?.series?.[0]?.metric_code || config?.metric_code || 'FEMISS').toString();
  const topN = Number(config?.topN ?? 0) || 0; // 0 means show all
  const normalize = Boolean(config?.normalize); // if true, show % of total
  const barColor = (config?.style?.color as string) || '#5186a6';
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<SVGSVGElement | null>(null);
  const [containerRef, dimensions] = useWidgetDimensions(700, 300);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!metricCode) { if (mounted) setRows([]); return; }
        const r = await apiRequest(`/api/portfolio/${encodeURIComponent(portfolioId)}/metrics/sector-aggregate?metric=${metricCode}`, { cache: 'no-store' });
        const j = await readJson(r);
        const latest: any[] = j?.latest || [];
        const filtered = latest.filter(r => r.metric_name === metricCode);
        const bySector: Record<string, number> = {};
        filtered.forEach(r => {
          const s = r.sector || 'Other';
          const v = Number(r.metric_value ?? 0);
          bySector[s] = (bySector[s] ?? 0) + (isFinite(v) ? v : 0);
        });
        let arr = Object.entries(bySector).map(([sector, value]) => ({ sector, value }))
          .sort((a, b) => b.value - a.value);
        if (topN > 0 && arr.length > topN) {
          const top = arr.slice(0, topN);
          const otherSum = arr.slice(topN).reduce((s, r) => s + r.value, 0);
          if (otherSum > 0) top.push({ sector: 'Other', value: otherSum });
          arr = top;
        }
        if (mounted) setRows(arr);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [portfolioId, metricCode, topN]);

  useEffect(() => {
    const svg = d3.select(ref.current);
    if (!svg.node()) return;
    svg.selectAll('*').remove();
    const w = dimensions.width;
    const h = Math.max(200, dimensions.height - 40); // Reserve space for title
    svg.attr('viewBox', `0 0 ${w} ${h}`).attr('preserveAspectRatio', 'xMidYMid meet');

    if (!rows.length) return;

    let plotRows = rows;
    if (normalize && rows.length) {
      const total = rows.reduce((s, r) => s + (isFinite(r.value) ? r.value : 0), 0) || 1;
      plotRows = rows.map(r => ({ sector: r.sector, value: (r.value / total) * 100 }));
    }

    const margin = { top: 10, right: 10, bottom: 10, left: 140 };
    const innerW = w - margin.left - margin.right;
    const innerH = h - margin.top - margin.bottom;

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const y = d3.scaleBand().domain(plotRows.map(d => d.sector)).range([0, innerH]).padding(0.15);
    const x = d3.scaleLinear().domain([0, d3.max(plotRows, d => d.value)!]).nice().range([0, innerW]);

    g.append('g').call(d3.axisLeft(y) as any).selectAll('text').attr('font-size', 11);

    g.selectAll('rect')
      .data(plotRows)
      .enter()
      .append('rect')
      .attr('x', 0)
      .attr('y', d => y(d.sector)!)
      .attr('width', d => x(d.value))
      .attr('height', y.bandwidth())
      .attr('fill', barColor)
      .attr('opacity', 0.8);

    g.selectAll('text.value')
      .data(plotRows)
      .enter()
      .append('text')
      .attr('x', d => x(d.value) + 6)
      .attr('y', d => (y(d.sector)! + y.bandwidth() / 2) + 4)
      .attr('font-size', 11)
      .text(d => normalize ? `${d.value.toFixed(1)}%` : d.value.toLocaleString());
  }, [rows, normalize, barColor, dimensions]);

  return (
    <div ref={containerRef} className="card p-4 w-full h-full flex flex-col overflow-hidden">
      <div className="text-sm text-neutral-600 mb-2 shrink-0">{title || `Emissions by sector (latest ${metricCode || 'metric'})`}</div>
      {loading ? (
        <div className="flex-1 bg-neutral-100 rounded animate-pulse min-h-0" />
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden">
          <svg ref={ref} className="w-full h-full" />
        </div>
      )}
    </div>
  );
}
