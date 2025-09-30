'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { pie as d3pie, arc as d3arc, PieArcDatum } from 'd3-shape';
import { scaleOrdinal } from 'd3-scale';
import { schemeTableau10 } from 'd3-scale-chromatic';

export type PieDatum = { label: string; value: number };

export type HoldingsPieWidgetProps = {
  data: PieDatum[];
  size?: number;            // default 300 (square SVG)
  innerRadius?: number;     // default 40: >0 renders donut
  showLegend?: boolean;     // default true
  legendMaxHeight?: number; // px, default 220
  formatMoney?: (n: number) => string;
};

function defaultMoney(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

export default function HoldingsPieWidget({
  data,
  size = 300,
  innerRadius = 40,
  showLegend = true,
  legendMaxHeight = 220,
  formatMoney = defaultMoney,
}: HoldingsPieWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [cw, setCw] = useState<number>(size);
  const [ch, setCh] = useState<number>(size);

  const cleaned = useMemo(() => {
    const arr = Array.isArray(data) ? data : [];
    return arr
      .map((d) => ({ label: String(d.label ?? '—'), value: Number(d.value ?? 0) }))
      .filter((d) => Number.isFinite(d.value) && d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [data]);

  const total = useMemo(() => cleaned.reduce((s, d) => s + d.value, 0), [cleaned]);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setCw(Math.max(160, Math.round(e.contentRect.width)));
        setCh(Math.max(160, Math.round(e.contentRect.height)));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!cleaned.length || total <= 0) {
    return (
      <div className="rounded-2xl border border-black/5 bg-white p-4 text-sm text-neutral-600">
        No holdings to visualize yet.
      </div>
    );
  }

  const square = Math.max(160, Math.min(cw, ch));
  const radius = square / 2;
  const inner = Math.min(Math.max(0, innerRadius), Math.max(0, radius - 8));
  const pieGen = useMemo(() => d3pie<PieDatum>().value((d) => d.value).sort(null), []);
  const arcGen = useMemo(
    () => d3arc<PieArcDatum<PieDatum>>().innerRadius(inner).outerRadius(radius - 4),
    [inner, radius]
  );
  const color = useMemo(() => scaleOrdinal<string, string>(schemeTableau10 as readonly string[]), []);

  const arcs = pieGen(cleaned);

  return (
    <div ref={containerRef} className="rounded-2xl border border-black/5 bg-white p-4 shadow-soft w-full h-full flex items-stretch gap-4">
      <div ref={chartRef} className="flex-1 min-w-0 h-full">
        <svg
          viewBox={`0 0 ${square} ${square}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Holdings by allocation pie chart"
          className="w-full h-full overflow-visible block"
        >
          <g transform={`translate(${radius}, ${radius})`}>
            {arcs.map((a, i) => (
              <path
                key={i}
                d={arcGen(a) ?? undefined}
                fill={color(a.data.label)}
                stroke="white"
                strokeWidth={1}
              >
                <title>
                  {`${a.data.label}: ${formatMoney(a.data.value)} (${((a.data.value / total) * 100).toFixed(1)}%)`}
                </title>
              </path>
            ))}

            {inner > 0 ? (
              <text textAnchor="middle" dominantBaseline="middle" className="fill-neutral-700 text-sm">
                {formatMoney(total)}
              </text>
            ) : null}
          </g>
        </svg>
      </div>

      {showLegend ? (
        <div className="w-[220px] max-w-[280px] md:flex-none">
          <div className="text-sm font-medium text-neutral-800 mb-2">Holdings Allocation</div>
          <div className="space-y-1 overflow-auto pr-2" style={{ maxHeight: '100%' }}>
            {cleaned.map((d) => (
              <div key={d.label} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="inline-block h-3 w-3 rounded-sm border border-black/10"
                    style={{ background: color(d.label) }}
                    aria-hidden
                  />
                  <span className="truncate" title={d.label}>
                    {d.label}
                  </span>
                </div>
                <div className="tabular-nums text-neutral-700">
                  {((d.value / total) * 100).toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}