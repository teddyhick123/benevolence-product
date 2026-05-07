'use client';
import * as d3 from 'd3';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useWidgetDimensions } from '@/hooks/useWidgetDimensions';

type SeriesPoint = { date: string; value: number };

type KpiRing = {
  metric_code?: string;
  value?: number;
  target: number;
  min?: number;
  label?: string;
  display_name?: string;
  unit?: string;
  color?: string;
};

type Props = {
  portfolioId: string;
  holdingId?: string;
  title?: string | null;
  config?: {
    metric_code?: string;
    value?: number;
    target?: number;
    min?: number;
    label?: string;
    unit?: string;
    rings?: KpiRing[];
  };
};

export default function RadialProgress({ portfolioId, holdingId, title, config }: Props) {
  const [ringData, setRingData] = useState<Record<string, { value: number; display_name: string }>>({});
  const [loading, setLoading] = useState(true);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [containerRef, dimensions] = useWidgetDimensions(280, 280);

  const gradId = useMemo(() => `rp-grad-${Math.random().toString(36).slice(2, 9)}`, []);
  const glowId = useMemo(() => `rp-glow-${Math.random().toString(36).slice(2, 9)}`, []);

  // Sunset color palette
  const sunsetColors = ['#5186a6', '#e07a5f', '#f4a261'];

  // Convert single KPI config to rings format
  const rings: KpiRing[] = useMemo(() => {
    if (config?.rings && config.rings.length > 0) {
      return config.rings.slice(0, 3);
    }
    if (config?.metric_code || config?.value != null) {
      return [{
        metric_code: config.metric_code,
        value: config.value,
        target: config.target ?? 100,
        min: config.min ?? 0,
        label: config.label,
        unit: config.unit,
      }];
    }
    return [];
  }, [config]);

  // Fetch data for rings with metric_code
  useEffect(() => {
    let mounted = true;
    (async () => {
      const newData: Record<string, { value: number; display_name: string }> = {};
      const promises = rings
        .filter(r => r.metric_code)
        .map(async (ring) => {
          try {
            const params = new URLSearchParams({ metric: ring.metric_code! });
            const baseUrl = holdingId
              ? `/api/holdings/${encodeURIComponent(holdingId)}/kpi-series`
              : `/api/portfolio/${encodeURIComponent(portfolioId)}/kpi-series`;
            const url = `${baseUrl}?${params.toString()}`;
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) return;
            const json = await res.json();
            const series = (json.series || []) as SeriesPoint[];
            if (series.length) {
              const sorted = [...series].sort((a, b) => +new Date(a.date) - +new Date(b.date));
              newData[ring.metric_code!] = {
                value: Number(sorted.at(-1)!.value),
                display_name: json.display_name || ring.metric_code!
              };
            }
          } catch {
            // swallow per-ring fetch errors
          }
        });

      await Promise.all(promises);
      if (mounted) {
        setRingData(newData);
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [portfolioId, holdingId, rings]);

  // Format numbers
  const fmt = (n: number) =>
    Math.abs(n) >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M' :
    Math.abs(n) >= 1_000 ? (n / 1_000).toFixed(1) + 'k' :
    new Intl.NumberFormat().format(Math.round(n));

  // Render SVG
  useEffect(() => {
    const svgNode = svgRef.current;
    if (!svgNode || rings.length === 0) return;

    const svg = d3.select(svgNode);
    svg.selectAll('*').remove();

    // Use the smaller of width/height to maintain aspect ratio
    const SIZE = Math.min(dimensions.width, dimensions.height, 320);
    const maxRings = Math.min(rings.length, 3);
    const ringWidth = maxRings === 1 ? 28 : maxRings === 2 ? 24 : 20;
    const spacing = 8;
    const outerRadius = (SIZE / 2) - ringWidth - 10;

    svg
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${SIZE} ${SIZE}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('display', 'block');

    const defs = svg.append('defs');

    // Glow filter
    const glow = defs.append('filter')
      .attr('id', glowId)
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');

    glow.append('feGaussianBlur')
      .attr('stdDeviation', 3)
      .attr('result', 'coloredBlur');

    const feMerge = glow.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    const g = svg.append('g')
      .attr('transform', `translate(${SIZE / 2}, ${SIZE / 2})`);

    // Draw rings
    rings.forEach((ring, i) => {
      const valueRaw = ring.value ?? ringData[ring.metric_code || '']?.value ?? 0;
      const min = ring.min ?? 0;
      const target = ring.target;
      const clampedValue = Math.max(min, Math.min(target, valueRaw));
      const progress = (clampedValue - min) / (target - min);

      const radius = outerRadius - i * (ringWidth + spacing);
      const color = ring.color || sunsetColors[i % sunsetColors.length];

      // Gradient
      const ringGradId = `${gradId}-${i}`;
      const grad = defs.append('linearGradient')
        .attr('id', ringGradId)
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '100%')
        .attr('y2', '100%');

      grad.append('stop').attr('offset', '0%').attr('stop-color', color).attr('stop-opacity', 1);
      grad.append('stop').attr('offset', '100%').attr('stop-color', color).attr('stop-opacity', 0.6);

      // Arc generator
      const startAngle = -Math.PI * 0.75;
      const endAngle = Math.PI * 0.75;
      const progressAngle = startAngle + (endAngle - startAngle) * progress;

      const arc = d3.arc<{ startAngle: number; endAngle: number }>()
        .innerRadius(radius - ringWidth / 2)
        .outerRadius(radius + ringWidth / 2)
        .startAngle(d => d.startAngle)
        .endAngle(d => d.endAngle)
        .cornerRadius(ringWidth / 2);

      // Background track
      g.append('path')
        .datum({ startAngle, endAngle })
        .attr('d', arc as any)
        .attr('fill', '#f1f5f9')
        .attr('opacity', 0.4);

      // Progress arc
      const progressPath = g.append('path')
        .datum({ startAngle, endAngle: startAngle })
        .attr('fill', `url(#${ringGradId})`)
        .attr('filter', `url(#${glowId})`);

      progressPath
        .transition()
        .duration(1200)
        .delay(i * 150)
        .ease(d3.easeCubicOut)
        .attrTween('d', () => {
          const interpolate = d3.interpolate(startAngle, progressAngle);
          return (t: number) => {
            return arc({ startAngle, endAngle: interpolate(t) }) as string;
          };
        });
    });

    // Center text
    if (rings.length === 1) {
      const ring = rings[0];
      const valueRaw = ring.value ?? ringData[ring.metric_code || '']?.value ?? 0;
      const min = ring.min ?? 0;
      const target = ring.target;
      const clampedValue = Math.max(min, Math.min(target, valueRaw));
      const pct = ((clampedValue - min) / (target - min)) * 100;

      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '-0.2em')
        .style('font-size', '48px')
        .style('font-weight', '700')
        .style('fill', '#0f172a')
        .text(`${pct.toFixed(0)}%`);

      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '1.3em')
        .style('font-size', '14px')
        .style('font-weight', '500')
        .style('fill', '#64748b')
        .text(`${fmt(clampedValue)} / ${fmt(target)}${ring.unit ? ' ' + ring.unit : ''}`);
    } else {
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '-0.2em')
        .style('font-size', '42px')
        .style('font-weight', '700')
        .style('fill', '#0f172a')
        .text(rings.length);

      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '1.2em')
        .style('font-size', '14px')
        .style('font-weight', '500')
        .style('fill', '#64748b')
        .text('KPIs');
    }

  }, [rings, ringData, gradId, glowId, dimensions]);

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-soft w-full h-full flex flex-col">
      <div className="text-sm font-medium text-neutral-700 mb-2">
        {title || 'Progress'}
      </div>
      {loading && rings.some(r => r.metric_code) ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-azure/30 border-t-azure rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div ref={containerRef} className="flex-1 flex items-center justify-center min-h-0">
            <svg ref={svgRef} />
          </div>

          {rings.length > 1 && (
            <div className="mt-3 space-y-2 border-t border-neutral-200 pt-3">
              {rings.map((ring, i) => {
                const valueRaw = ring.value ?? ringData[ring.metric_code || '']?.value ?? 0;
                const displayName = ringData[ring.metric_code || '']?.display_name || ring.label || ring.metric_code || `KPI ${i + 1}`;
                const min = ring.min ?? 0;
                const target = ring.target;
                const clampedValue = Math.max(min, Math.min(target, valueRaw));
                const pct = ((clampedValue - min) / (target - min)) * 100;
                const color = ring.color || sunsetColors[i % sunsetColors.length];

                return (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-neutral-700 truncate font-medium">
                        {displayName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-neutral-900 font-semibold">
                        {pct.toFixed(0)}%
                      </span>
                      <span className="text-neutral-500">
                        ({fmt(clampedValue)}/{fmt(target)})
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
