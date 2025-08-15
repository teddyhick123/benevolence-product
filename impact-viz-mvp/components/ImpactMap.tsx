'use client';
import * as d3 from 'd3';
import React, { useEffect, useRef } from 'react';

type Point = { lon: number; lat: number; weight?: number; label?: string };

export default function ImpactMap({ points }: { points: Point[] }) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = d3.select(ref.current);
    const width = 700, height = 360;
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    // Simple Equirectangular projection (placeholder)
    const projection = d3.geoEquirectangular().translate([width/2, height/2]).scale(110);
    const path = d3.geoPath(projection as any);

    // Clear
    svg.selectAll('*').remove();

    // Graticule for context
    const graticule = d3.geoGraticule10();
    svg.append('path').attr('d', path(graticule) as any).attr('fill', 'none').attr('stroke', '#e5e7eb');

    // Points
    svg.selectAll('circle')
      .data(points)
      .enter()
      .append('circle')
      .attr('cx', d => projection([d.lon, d.lat])![0])
      .attr('cy', d => projection([d.lon, d.lat])![1])
      .attr('r', d => Math.max(3, Math.min(12, (d.weight || 1) ** 0.5)))
      .attr('fill', '#2563eb')
      .attr('opacity', 0.6);

  }, [points]);

  return <svg ref={ref} className="w-full h-[360px] border rounded-xl bg-white" />;
}
