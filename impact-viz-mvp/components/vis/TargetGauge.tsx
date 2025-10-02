'use client';
import * as d3 from 'd3';
import React, { useEffect, useMemo, useRef, useState } from 'react';

type SeriesPoint = { date: string; value: number };

type Props = {
  portfolioId: string;
  title?: string | null;
  config?: {
    metric_code?: string;   // optional: fetch latest from /kpi-series
    value?: number;         // or pass a direct value
    target: number;         // REQUIRED
    min?: number;           // default 0
    max?: number;           // default target
    unit?: string;          // e.g. clients, tCO2
  };
};

// A tidy, compact semi‑circular gauge that always fits its container.
export default function TargetGauge({ portfolioId, title, config }: Props) {
  const metric = (config?.metric_code || '').toString();
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const svgWrapRef = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(420);
  const [h, setH] = useState(200);

  const gradId = useMemo(() => `tg-grad-${Math.random().toString(36).slice(2, 9)}` , []);
  const glowId = useMemo(() => `tg-glow-${Math.random().toString(36).slice(2, 9)}` , []);

  const PAD = 14;

  // Fetch series if metric_code provided
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!metric) { setSeries([]); setLoading(false); return; }
      try {
        const params = new URLSearchParams({ metric });
        const r = await fetch(`/api/portfolio/${encodeURIComponent(portfolioId)}/kpi-series?${params.toString()}`, { cache: 'no-store' });
        const j = await r.json();
        if (mounted) setSeries((j.series || []) as SeriesPoint[]);
      } catch (_) {
        if (mounted) setSeries([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [portfolioId, metric]);

  // Responsive width and height
  useEffect(() => {
    const el = svgWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        setW(Math.max(300, Math.round(e.contentRect.width)));
        setH(Math.max(180, Math.round(e.contentRect.height)));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const latestValue = useMemo(() => {
    if (config?.value != null) return Number(config.value);
    if (!series.length) return null;
    const sorted = [...series].sort((a, b) => +new Date(a.date) - +new Date(b.date));
    return Number(sorted.at(-1)!.value);
  }, [series, config?.value]);

  const min = config?.min ?? 0;
  const max = config?.max ?? (config?.target ?? 100);
  const target = config?.target ?? max;
  const unit = config?.unit ?? (metric || '');

  // Simple number formatter
  const fmt = (n: number) =>
    Math.abs(n) >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M' :
    Math.abs(n) >= 1_000     ? (n / 1_000).toFixed(1) + 'k' :
    new Intl.NumberFormat().format(Math.round(n));

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    if (!svg.node()) return;
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${w} ${h}`).attr('preserveAspectRatio', 'xMidYMid meet');

    // subtle drop shadow for the progress arc
    const defs = svg.append('defs');
    const shadow = defs.append('filter').attr('id', 'tg-shadow');
    shadow.append('feDropShadow')
      .attr('dx', 0)
      .attr('dy', 1)
      .attr('stdDeviation', 1)
      .attr('flood-color', 'rgba(0,0,0,0.20)');

    // Geometry that always fits: anchor under external title and reserve space for labels below
    const cxPadding = PAD; // left/right padding (kept for width calc)
    const widthLimit = (w - PAD * 2) / 2;
    // Minimal bottom reserve (subtitle + delta + legend)
    const BOTTOM_SPACE = Math.max(8, Math.min(20, Math.round(h * 0.03)));

    // First pass: estimate radius and stroke to determine top headroom
    let heightLimit0 = Math.max(10, h - BOTTOM_SPACE);
    let radiusCandidate0 = Math.min(widthLimit, heightLimit0);
    let thickness0 = Math.max(14, Math.min(24, Math.round(radiusCandidate0 * 0.18)));
    const HEADROOM = Math.ceil(thickness0 / 2 + 2); // prevent clipping of round caps

    // Second pass: recompute with headroom reserved at the top
    const TOP = HEADROOM + 15;
    const heightLimit = Math.max(10, h - TOP - BOTTOM_SPACE);
    let radiusCandidate = Math.min(widthLimit, heightLimit);
    const thickness = Math.max(14, Math.min(24, Math.round(radiusCandidate * 0.18)));
    const radius = Math.max(10, radiusCandidate - thickness / 2);

    const cx = w / 2; // centered under title
    const cy = TOP + radius; // arc sits below headroom so caps are fully visible

    // Full semicircle (TOP HALF): 180° sweep from left (-90°) to right (90°)
    const start = -Math.PI / 2;  // -90° (left)
    const end = Math.PI / 2;     // +90° (right)
    // Map 0..target to the full semicircle so progress is % of target
    const scale = d3.scaleLinear().domain([0, target]).range([start, end]).clamp(true);

    const arcGen = d3.arc().innerRadius(radius - thickness).outerRadius(radius);

    const g = svg.append('g').attr('transform', `translate(${cx},${cy})`);

    // Background track
    g.append('path')
      .attr('d', (arcGen.startAngle(start).endAngle(end) as any))
      .attr('fill', 'none')
      .attr('stroke', '#f0f4f8')
      .attr('stroke-width', thickness)
      .attr('stroke-linecap', 'round');

    // Progress path with animation
    const progress = g.append('path')
      .attr('fill', 'none')
      .attr('stroke', 'var(--azure, #5186a6)')
      .attr('stroke-width', thickness)
      .attr('stroke-linecap', 'round')
      .attr('filter', 'url(#tg-shadow)');

    // Changed domainClampedValue to clamp between 0 and target
    const valueRaw = latestValue ?? min;
    const domainClampedValue = Math.max(0, Math.min(target, valueRaw));
    const valueAngle = scale(domainClampedValue);

    progress
      .transition()
      .duration(800)
      .ease(d3.easeCubicOut)
      .tween('arc', () => {
        const i = d3.interpolateNumber(start, valueAngle);
        return (t: number) => {
          const a = i(t);
          progress.attr('d', (arcGen.startAngle(start).endAngle(a) as any));
        };
      });

    const pct = ((domainClampedValue - min) / (target - min)) * 100;
    const pctSafe = isFinite(pct) ? Math.max(0, Math.min(999, pct)) : 0;

    const delta = domainClampedValue - target;

    // Central labels
    svg.append('text')
      .attr('x', cx).attr('y', cy - radius * 0.36)
      .attr('text-anchor', 'middle').attr('font-size', 32).attr('font-weight', 700).attr('fill', '#0f172a')
      .text(`${pctSafe.toFixed(0)}%`);

    svg.append('text')
      .attr('x', cx).attr('y', cy - radius * 0.36 + 18)
      .attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#475569')
      .text(`${fmt(domainClampedValue)} of ${fmt(target)}${unit ? ' ' + unit : ''}`.trim());

    // Delta pill
    const pill = svg.append('g');
    const pillText = `\u0394 ${delta >= 0 ? '+' : ''}${fmt(Math.abs(delta))}` + (unit ? ` ${unit}` : '');
    const tmp = pill.append('text').attr('x', -9999).attr('y', -9999).attr('font-size', 10).text(pillText).node() as SVGTextElement;
    const bbox = tmp.getBBox();
    tmp.remove();
    // Moved to align with restored label positions and always green styling
    const px = cx, py = cy - radius * 0.36 + 48;
    pill.append('rect').attr('x', px - (bbox.width / 2) - 7).attr('y', py - bbox.height - 3).attr('rx', 10).attr('ry', 10)
      .attr('width', bbox.width + 14).attr('height', bbox.height + 6)
      .attr('fill', '#dcfce7').attr('stroke', '#16a34a').attr('stroke-opacity', 0.4);
    pill.append('text').attr('x', px).attr('y', py - 4).attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', '#166534')
      .text(pillText);

    // Removed Min / Target labels (legend)
  }, [w, h, latestValue, min, max, target, metric, title, unit, gradId, glowId]);

  return (
    <div ref={containerRef} className="rounded-2xl border border-black/5 bg-white p-4 shadow-soft w-full h-full flex flex-col">
      <div className="text-sm text-neutral-600 mb-2">
        {title || (metric ? `Target Progress — ${metric}` : 'Target Progress')}
      </div>
      {loading && metric ? (
        <div className="w-full h-full rounded bg-neutral-100 animate-pulse" />
      ) : (
        <>
          <div ref={svgWrapRef} className="flex-1 min-h-0">
            <svg ref={svgRef} className="block w-full h-full" />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-600">
            <span>Min: {fmt(min)}</span>
            <span>Target: {fmt(target)}{unit ? ` ${unit}` : ''}</span>
          </div>
        </>
      )}
    </div>
  );
}