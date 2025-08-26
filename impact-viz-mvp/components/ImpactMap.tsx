'use client';
import * as d3 from 'd3';
import React, { useEffect, useMemo, useRef, useState } from 'react';

type Point = { lon: number | null | undefined; lat: number | null | undefined; weight?: number; label?: string };

const AZURE = '#5186a6';            // theme accent
const GRID = '#e5e7eb';             // subtle grid
const CARD_BG = '#fffff9';          // card background

export default function ImpactMap({ points }: { points: Point[] }) {
  // Container + svg refs for responsive sizing
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Track container width to render responsively (16:9-ish map)
  const [width, setWidth] = useState<number>(700);
  const height = Math.round(width * (9 / 16)) || 360;

  // Filter out invalid coordinates once
  const cleanPoints = useMemo(
    () => (points || []).filter(p => Number.isFinite(p.lon as number) && Number.isFinite(p.lat as number)) as Required<Point>[],
    [points]
  );

  // State for borders, land, and topojson loading
  const [borders, setBorders] = useState<any | null>(null);
  const [land, setLand] = useState<any | null>(null);
  const [topoLoaded, setTopoLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = Math.max(320, Math.floor(entry.contentRect.width));
        setWidth(w);
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    async function loadTopo() {
      try {
        const [worldRes, landRes] = await Promise.allSettled([
          fetch('/world-110m.json'),
          fetch('/land-110m.json'),
        ]);

        let topo: any | null = null;
        if (worldRes.status === 'fulfilled') {
          topo = await worldRes.value.json();
        }

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
        console.warn('TopoJSON load failed', err);
        setTopoLoaded(true);
      }
    }
    loadTopo();
  }, []);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    if (!svg.node()) return;

    // Setup
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('role', 'img').attr('aria-label', 'Impact map of holdings');

    // Projection & path (fit to full sphere so the whole globe is visible)
    const projection = d3.geoNaturalEarth1();
    const path = d3.geoPath(projection as any);
    projection.fitExtent([[8, 8], [width - 8, height - 8]], { type: 'Sphere' } as any);

    // Background (card color so it sits nicely on crème page)
    svg
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', height)
      .attr('fill', CARD_BG);

    // Optional land fill (very light) if available
    if (land) {
      svg.append('path')
        .datum(land as any)
        .attr('d', path as any)
        .attr('fill', '#5186a6')   // azure fill
        .attr('fill-opacity', 0.08)
        .attr('stroke', '#5186a6') // azure coastline
        .attr('stroke-opacity', 1)
        .attr('stroke-width', 0.8);
    }

    // Draw borders if available
    if (borders) {
      svg.append('path')
        .datum(borders as any)
        .attr('d', path as any)
        .attr('fill', 'none')
        .attr('stroke', '#5186a6')   // slate-800 for stronger contrast
        .attr('stroke-width', 0.8)   // thicker borders
        .attr('opacity', 1);
    }

    // Graticule for context (kept subtle)
    const graticule = d3.geoGraticule10();
    svg.append('path').attr('d', path(graticule) as any).attr('fill', 'none').attr('stroke', GRID).attr('stroke-width', 1);

    // Size scale for weights (sqrt for visual fairness)
    const weights = cleanPoints.map(d => d.weight ?? 1);
    const maxW = weights.length ? d3.max(weights)! : 1;
    const r = d3.scaleSqrt().domain([0, maxW]).range([3, 12]);

    // Points
    const g = svg.append('g');
    g.selectAll('circle')
      .data(cleanPoints)
      .enter()
      .append('circle')
      .attr('cx', d => (projection([d.lon!, d.lat!]) ?? [NaN, NaN])[0])
      .attr('cy', d => (projection([d.lon!, d.lat!]) ?? [NaN, NaN])[1])
      .attr('r', d => r(d.weight ?? 1))
      .attr('fill', AZURE)
      .attr('opacity', 0.7)
      .append('title') // native tooltip
      .text(d => `${d.label ?? 'Location'}${d.weight ? ` • Weight: ${d.weight}` : ''}`);

    // Optional: tiny size legend (top-left)
    const legendX = 14;
    const legendY = 14;
    const legend = svg.append('g').attr('transform', `translate(${legendX}, ${legendY})`);
    const legendVals = [maxW, Math.max(1, Math.round(maxW / 4)), 1].filter((v, i, a) => a.indexOf(v) === i);

    legendVals.forEach((val, i) => {
      const y = i * (r(legendVals[0]) * 2 + 8);
      legend
        .append('circle')
        .attr('cx', r(legendVals[0]))
        .attr('cy', y + r(val))
        .attr('r', r(val))
        .attr('fill', AZURE)
        .attr('opacity', 0.7);
      legend
        .append('text')
        .attr('x', r(legendVals[0]) * 2 + 8)
        .attr('y', y + r(val) + 4)
        .attr('font-size', 11)
        .attr('fill', '#374151')
        .text(`${val}`);
    });

  }, [cleanPoints, width, height, borders, land]);

  return (
    <div ref={containerRef} className="w-full">
      <svg ref={svgRef} className="w-full h-[360px] rounded-2xl border border-black/5 shadow-soft" />
      {!topoLoaded && (
        <div className="text-xs text-neutral-500 mt-2">Loading country outlines…</div>
      )}
    </div>
  );
}