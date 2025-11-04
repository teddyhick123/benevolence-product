'use client';
import * as d3 from 'd3';
import React, { useEffect, useMemo, useRef, useState } from 'react';

// Matches /api/portfolio/[id]/map shape
export type ImpactMapPoint = {
  id: string;
  holdingId: string | null;
  name: string;
  tags: string[];
  status: string | null;
  asOf: string | null;
  amountUSD: number | null;
  coords: [number, number]; // [lon, lat]
};

type Props = {
  points: ImpactMapPoint[];
  onPointClick?: (p: ImpactMapPoint) => void; // parent can open modal/focus row
  height?: number;
};

const AZURE = '#5186a6';            // theme accent
const GRID = '#e5e7eb';             // subtle grid
const CARD_BG = '#ffffff';          // card background
const POINT = '#e85d04';            // orange points
const STROKE = '#ffffff';

export default function ImpactMap({ points, onPointClick, height }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // responsive width and height
  const [width, setWidth] = useState<number>(700);
  const [containerHeight, setContainerHeight] = useState<number>(600);

  // Use responsive height on mobile, fixed height on desktop
  const h = height ?? containerHeight;

  // normalize + filter
  const cleanPoints = useMemo(() => {
    return (points || [])
      .map(p => ({
        ...p,
        lon: p.coords?.[0],
        lat: p.coords?.[1],
        weight: 1, // keep size uniform unless you later add a weight
        label: p.name,
        summary: [p.status ?? undefined, p.asOf ?? undefined]
          .filter(Boolean)
          .join(' • ')
      }))
      .filter(p => Number.isFinite(p.lon as number) && Number.isFinite(p.lat as number)) as Array<ReturnType<typeof Object.assign> & { lon: number; lat: number; weight: number; label: string; summary?: string }>
  }, [points]);

  // topo layers
  const [borders, setBorders] = useState<any | null>(null);
  const [land, setLand] = useState<any | null>(null);
  const [topoLoaded, setTopoLoaded] = useState(false);

  const [selected, setSelected] = useState<{ x: number; y: number; p: ImpactMapPoint } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = Math.max(320, Math.floor(entry.contentRect.width));
        setWidth(w);

        // Responsive height: shorter on mobile, taller on desktop
        if (!height) {
          if (w < 640) {
            // Mobile: use aspect ratio of 4:3
            setContainerHeight(Math.floor(w * 0.75));
          } else if (w < 1024) {
            // Tablet: use aspect ratio of 3:2
            setContainerHeight(Math.floor(w * 0.67));
          } else {
            // Desktop: fixed height
            setContainerHeight(600);
          }
        }
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [height]);

  useEffect(() => {
    async function loadTopo() {
      try {
        const [worldRes, landRes] = await Promise.allSettled([
          fetch('/world-110m.json'),
          fetch('/land-110m.json'),
        ]);

        let topo: any | null = null;
        if (worldRes.status === 'fulfilled') topo = await worldRes.value.json();
        const topojson = await import('topojson-client');

        if (topo?.objects?.countries) {
          const bordersData = topojson.mesh(topo, topo.objects.countries, (a: any, b: any) => a !== b);
          setBorders(bordersData);
        }
        if (landRes.status === 'fulfilled') {
          const landTopo: any = await landRes.value.json();
          if (landTopo?.objects?.land) {
            const landFeature = topojson.feature(landTopo, landTopo.objects.land) as any;
            setLand(landFeature);
          }
        }
        setTopoLoaded(true);
      } catch (err) {
        // TopoJSON load failed, map will render without borders
        setTopoLoaded(true);
      }
    }
    loadTopo();
  }, []);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    if (!svg.node()) return;

    svg.selectAll('*').remove();
    svg.attr('width', width)
       .attr('height', h);
    svg.attr('viewBox', `0 0 ${width} ${h}`)
       .attr('role', 'img')
       .attr('aria-label', 'Impact map of holdings')
       .attr('preserveAspectRatio', 'xMidYMid meet');

    const projection = d3.geoNaturalEarth1();
    const path = d3.geoPath(projection as any);
    projection.fitExtent([[8, 8], [width - 8, h - 8]], { type: 'Sphere' } as any);

    // background
    svg.append('rect').attr('x', 0).attr('y', 0).attr('width', width).attr('height', h).attr('fill', CARD_BG);

    if (land) {
      svg.append('path')
        .datum(land as any)
        .attr('d', path as any)
        .attr('fill', AZURE)
        .attr('fill-opacity', 0.06)
        .attr('stroke', AZURE)
        .attr('stroke-opacity', 0.85)
        .attr('stroke-width', 0.6);
    }

    if (borders) {
      svg.append('path')
        .datum(borders as any)
        .attr('d', path as any)
        .attr('fill', 'none')
        .attr('stroke', AZURE)
        .attr('stroke-width', 0.6)
        .attr('opacity', 0.85);
    }

    const grat = d3.geoGraticule().step([20, 20]);
    svg.append('path')
      .attr('d', path(grat()) as any)
      .attr('fill', 'none')
      .attr('stroke', GRID)
      .attr('stroke-width', 0.8)
      .attr('stroke-opacity', 0.35)
      .attr('shape-rendering', 'crispEdges');

    // uniform radius for now; you can swap to scale later
    const r = 6;

    const g = svg.append('g');
    const circles = g
      .selectAll('circle')
      .data(cleanPoints, (d: any) => d.id)
      .enter()
      .append('circle')
      .attr('cx', d => (projection([d.lon!, d.lat!]) ?? [NaN, NaN])[0])
      .attr('cy', d => (projection([d.lon!, d.lat!]) ?? [NaN, NaN])[1])
      .attr('r', r)
      .attr('fill', POINT)
      .attr('opacity', 0.9)
      .attr('stroke', STROKE)
      .attr('stroke-width', 1.5)
      .style('cursor', 'pointer')
      .on('mouseenter', function () {
        d3.select(this as SVGCircleElement)
          .transition()
          .duration(120)
          .attr('r', r + 3)
          .attr('opacity', 1);
      })
      .on('mouseleave', function () {
        d3.select(this as SVGCircleElement)
          .transition()
          .duration(120)
          .attr('r', r)
          .attr('opacity', 0.9);
      })
      .on('click', function (_event: any, d: any) {
        const el = d3.select(this as SVGCircleElement);
        const cx = Number(el.attr('cx'));
        const cy = Number(el.attr('cy'));
        const original: ImpactMapPoint | undefined = points.find(p => p.name === d.label && p.coords[0] === d.lon && p.coords[1] === d.lat);
        if (original) {
          setSelected({ x: cx, y: cy, p: original }); // show popover; navigation happens via the button
        }
      });

    circles.append('title').text(d => `${d.label}`);
  }, [cleanPoints, width, h, borders, land, onPointClick, points]);

  return (
    <div
      ref={containerRef}
      style={{ height: `${h}px` }}
      className="relative"
      onClick={(e) => {
        if (e.target instanceof SVGCircleElement) return;
        setSelected(null);
      }}
    >
      <svg ref={svgRef} className="w-full" />

      {/* Built-in fallback popover (only shows if parent doesn't replace it) */}
      {selected && (
        <div
          className="absolute z-10 w-[calc(100%-24px)] sm:max-w-sm rounded-xl border border-black/10 bg-white shadow-lg p-3 text-sm"
          style={{
            left: width < 640 ? '12px' : Math.max(12, Math.min(selected.x + 12, width - 240)),
            top: width < 640 ? Math.max(12, selected.y - 120) : Math.max(12, Math.min(selected.y + 12, h - 12))
          }}
        >
          <div className="font-semibold text-neutral-900">{selected.p.name}</div>
          <div className="text-xs text-neutral-600">
            {selected.p.tags?.length ? selected.p.tags.join(' • ') : '—'}
          </div>
          <div className="text-xs text-neutral-600 mt-1">
            {selected.p.status ?? 'Status unknown'}{selected.p.asOf ? ` • ${new Date(selected.p.asOf).toLocaleDateString()}` : ''}
          </div>
          {selected.p.amountUSD != null && (
            <div className="text-xs text-neutral-900 mt-1">${selected.p.amountUSD.toLocaleString()}</div>
          )}
          <div className="mt-2 flex justify-end">
            {selected.p.holdingId ? (
              <button
                type="button"
                className="text-xs px-2 py-1 rounded-2xl border border-black/10 hover:bg-white shadow-sm hover:shadow transition-transform duration-200 hover:-translate-y-0.5"
                onClick={(e) => {
                  e.stopPropagation();
                  onPointClick?.(selected.p);
                }}
              >
                Open details
              </button>
            ) : (
              <span className="text-xs text-neutral-500">No linked holding</span>
            )}
          </div>
        </div>
      )}

      {!topoLoaded && (
        <div className="text-xs text-neutral-500 mt-2">Loading country outlines…</div>
      )}
    </div>
  );
}