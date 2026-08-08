'use client';

import { apiRequest, readJson } from "@/lib/api/client";
import * as d3 from 'd3';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getAssetTypeColor } from '@/lib/schemas/portfolio';
import MapPopover from '@/components/map/MapPopover';
import { MapMode } from '@/components/map/MapModeSelector';
import {
  clusterPoints,
  isCluster,
  getClusterRadius,
  getClusterLabel,
  getOptimalClusterDistance,
  type ClusterablePoint
} from '@/lib/map/clustering';
import {
  generateHeatmapContours,
  getHeatmapColorScale,
  getOptimalBandwidth
} from '@/lib/map/heatmap';

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
  assetType?: string | null; // For color encoding
  topKpis?: Array<{
    metricCode: string;
    displayName: string;
    value: number;
    unit: string | null;
    periodEnd: string;
  }>;
  totalContributions?: number;
  locationCount?: number; // Number of locations for this holding
  isPrimaryLocation?: boolean; // Whether this is the primary location
  locationName?: string; // Name of the location (for additional locations)
};

type Props = {
  points: ImpactMapPoint[];
  mode?: MapMode; // Visualization mode: 'points' | 'heatmap'
  onPointClick?: (p: ImpactMapPoint) => void; // parent can open modal/focus row
  onPointHover?: (holdingId: string | null) => void; // two-way highlighting with table
  highlightedId?: string | null; // external highlight state (e.g., from table hover)
  height?: number;
};

const AZURE = '#5186a6';            // theme accent
const GRID = '#e5e7eb';             // subtle grid
const CARD_BG = '#ffffff';          // card background
const POINT = '#e85d04';            // orange points
const STROKE = '#ffffff';

export default function ImpactMap({ points, mode = 'points', onPointClick, onPointHover, highlightedId, height }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomBehaviorRef = useRef<any>(null); // Store zoom behavior for programmatic control

  // responsive width and height
  const [width, setWidth] = useState<number>(700);
  const [containerHeight, setContainerHeight] = useState<number>(600);

  // Zoom state for programmatic zoom control (use ref to avoid re-render loops)
  const zoomTransformRef = useRef({ k: 1, x: 0, y: 0 });
  const [zoomLevel, setZoomLevel] = useState(1); // Only for UI display
  const isRestoringZoomRef = useRef(false); // Track if we're restoring zoom to prevent loops
  const clusterUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Debounce clustering updates

  // Quantized zoom level for clustering (only updates at meaningful thresholds)
  const [clusterZoomLevel, setClusterZoomLevel] = useState(1);

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
          apiRequest('/world-110m.json'),
          apiRequest('/land-110m.json'),
        ]);

        let topo: any | null = null;
        if (worldRes.status === 'fulfilled') topo = await readJson(worldRes.value);
        const topojson = await import('topojson-client');

        if (topo?.objects?.countries) {
          const bordersData = topojson.mesh(topo, topo.objects.countries, (a: any, b: any) => a !== b);
          setBorders(bordersData);
        }
        if (landRes.status === 'fulfilled') {
          const landTopo: any = await readJson(landRes.value);
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

    // Create main group for zoom/pan transforms
    const g = svg.append('g');

    // Setup zoom behavior with better constraints
    const zoom = d3.zoom()
      .scaleExtent([1, 8]) // Min zoom 1x, max zoom 8x
      .translateExtent([[-width * 0.5, -h * 0.5], [width * 1.5, h * 1.5]]) // Constrain panning
      .wheelDelta((event) => {
        // Smoother mouse wheel zoom (less sensitive)
        return -event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002);
      })
      .filter((event) => {
        // Disable double-click zoom, allow mouse wheel and drag
        if (event.type === 'dblclick') return false;
        return true;
      })
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        zoomTransformRef.current = { k: event.transform.k, x: event.transform.x, y: event.transform.y };

        // Skip state updates if we're restoring zoom (prevents feedback loop)
        if (isRestoringZoomRef.current) {
          return;
        }

        setZoomLevel(event.transform.k); // Update UI display only

        // Debounce cluster zoom level updates to prevent excessive re-renders
        // Only update after user stops zooming for 150ms
        if (clusterUpdateTimeoutRef.current) {
          clearTimeout(clusterUpdateTimeoutRef.current);
        }

        clusterUpdateTimeoutRef.current = setTimeout(() => {
          const k = event.transform.k;
          let quantizedZoom = 1;
          if (k >= 7) quantizedZoom = 8;
          else if (k >= 5) quantizedZoom = 6;
          else if (k >= 3) quantizedZoom = 4;
          else if (k >= 1.5) quantizedZoom = 2;
          else quantizedZoom = 1;

          setClusterZoomLevel(prev => {
            // Only update if threshold crossed to avoid unnecessary re-renders
            return prev !== quantizedZoom ? quantizedZoom : prev;
          });
        }, 150);
      });

    // Apply zoom behavior and restore previous zoom state if it exists
    svg.call(zoom as any);

    // Restore zoom transform from previous render
    if (zoomTransformRef.current.k !== 1 || zoomTransformRef.current.x !== 0 || zoomTransformRef.current.y !== 0) {
      const transform = d3.zoomIdentity
        .translate(zoomTransformRef.current.x, zoomTransformRef.current.y)
        .scale(zoomTransformRef.current.k);

      // Set flag to prevent zoom event from updating state during restoration
      isRestoringZoomRef.current = true;
      svg.call(zoom.transform as any, transform);
      // Clear flag after a brief delay to allow event to finish
      setTimeout(() => {
        isRestoringZoomRef.current = false;
      }, 0);
    }

    zoomBehaviorRef.current = zoom;

    if (land) {
      g.append('path')
        .datum(land as any)
        .attr('d', path as any)
        .attr('fill', AZURE)
        .attr('fill-opacity', 0.06)
        .attr('stroke', AZURE)
        .attr('stroke-opacity', 0.85)
        .attr('stroke-width', 0.6);
    }

    if (borders) {
      g.append('path')
        .datum(borders as any)
        .attr('d', path as any)
        .attr('fill', 'none')
        .attr('stroke', AZURE)
        .attr('stroke-width', 0.6)
        .attr('opacity', 0.85);
    }

    const grat = d3.geoGraticule().step([20, 20]);
    g.append('path')
      .attr('d', path(grat()) as any)
      .attr('fill', 'none')
      .attr('stroke', GRID)
      .attr('stroke-width', 0.8)
      .attr('stroke-opacity', 0.35)
      .attr('shape-rendering', 'crispEdges');

    // Render based on visualization mode
    if (mode === 'heatmap') {
      // Heat Map Mode: Density visualization
      const bandwidth = getOptimalBandwidth(cleanPoints.length, width, h);
      const contours = generateHeatmapContours(
        cleanPoints.map(p => ({ lon: p.lon, lat: p.lat, weight: (p.amountUSD || 0) / 1000 })),
        projection as d3.GeoProjection,
        width,
        h,
        bandwidth
      );

      if (contours.length > 0) {
        const maxDensity = d3.max(contours, c => c.value) || 1;
        const colorScale = getHeatmapColorScale([0, maxDensity]);

        g.selectAll('path.contour')
          .data(contours)
          .enter()
          .append('path')
          .attr('class', 'contour')
          .attr('d', d3.geoPath(projection as any) as any)
          .attr('fill', d => colorScale(d.value))
          .attr('opacity', 0.6)
          .attr('stroke', 'none');
      }
    } else {
      // Points Mode: Render individual points or clusters
      const clusterDistance = getOptimalClusterDistance(zoomTransformRef.current.k);
      const displayPoints = clusterDistance > 0
        ? clusterPoints(cleanPoints as ClusterablePoint[], clusterDistance, projection as d3.GeoProjection)
        : cleanPoints.map(p => ({ ...p, type: 'point' as const }));

      // Size encoding: scale circles by funds allocated (amountUSD)
      const maxAmount = d3.max(cleanPoints, d => d.amountUSD || 0) || 1;
      const radiusScale = d3.scaleSqrt()
        .domain([0, maxAmount])
        .range([4, 16]); // Min 4px, max 16px for visual hierarchy

      const circles = g
        .selectAll('circle')
        .data(displayPoints, (d: any) => d.id)
      .enter()
      .append('circle')
      .attr('cx', d => (projection([d.lon!, d.lat!]) ?? [NaN, NaN])[0])
      .attr('cy', d => (projection([d.lon!, d.lat!]) ?? [NaN, NaN])[1])
      .attr('r', d => {
        if (isCluster(d as any)) {
          return getClusterRadius(d as any, 8);
        }
        return radiusScale((d as any).amountUSD || 0);
      })
      .attr('fill', d => {
        if (isCluster(d as any)) {
          return AZURE; // Clusters use azure color
        }
        return getAssetTypeColor((d as any).assetType as any) || POINT;
      })
      .attr('opacity', d => {
        if (isCluster(d as any)) {
          return 0.9; // Clusters are more opaque
        }
        // Two-way highlighting: dim non-highlighted points
        if (highlightedId && (d as any).holdingId !== highlightedId) {
          return 0.3;
        }
        return 0.85;
      })
      .attr('stroke', STROKE)
      .attr('stroke-width', d => isCluster(d as any) ? 2 : 1.5)
      .style('cursor', 'pointer')
      .on('mouseenter', function (_, d) {
        const baseRadius = radiusScale((d as any).amountUSD || 0);
        const holdingId = (d as any).holdingId;

        // Notify parent of hover for two-way highlighting
        onPointHover?.(holdingId);

        d3.select(this as SVGCircleElement)
          .transition()
          .duration(120)
          .attr('r', baseRadius + 3)
          .attr('opacity', 1);
      })
      .on('mouseleave', function (_, d) {
        const baseRadius = radiusScale((d as any).amountUSD || 0);

        // Clear hover state
        onPointHover?.(null);

        d3.select(this as SVGCircleElement)
          .transition()
          .duration(120)
          .attr('r', baseRadius)
          .attr('opacity', highlightedId && (d as any).holdingId !== highlightedId ? 0.3 : 0.85);
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

      // Add cluster count labels
      const clusterLabels = g
        .selectAll('text.cluster-label')
        .data(displayPoints.filter(d => isCluster(d as any)), (d: any) => d.id)
        .enter()
        .append('text')
        .attr('class', 'cluster-label')
        .attr('x', d => (projection([d.lon!, d.lat!]) ?? [NaN, NaN])[0])
        .attr('y', d => (projection([d.lon!, d.lat!]) ?? [NaN, NaN])[1])
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('fill', 'white')
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .attr('pointer-events', 'none') // Don't interfere with circle events
        .text(d => getClusterLabel(d as any));
    }

    // Cleanup function
    return () => {
      // Remove any pending timeouts
      isRestoringZoomRef.current = false;
      if (clusterUpdateTimeoutRef.current) {
        clearTimeout(clusterUpdateTimeoutRef.current);
      }
    };
  }, [cleanPoints, width, h, borders, land, onPointClick, onPointHover, highlightedId, points, mode, clusterZoomLevel]);

  // Zoom control handlers with smart zoom levels
  const handleZoomIn = () => {
    const svg = d3.select(svgRef.current);
    if (zoomBehaviorRef.current) {
      const currentZoom = zoomTransformRef.current.k;
      // Smart zoom levels: 1 → 2 → 4 → 8
      let targetZoom = currentZoom * 2;
      if (currentZoom < 1.5) targetZoom = 2;
      else if (currentZoom < 3) targetZoom = 4;
      else if (currentZoom < 6) targetZoom = 8;
      else targetZoom = Math.min(8, currentZoom * 1.3); // Fine increment at max

      svg.transition().duration(400).ease(d3.easeCubicOut).call(
        zoomBehaviorRef.current.scaleTo,
        targetZoom
      );
    }
  };

  const handleZoomOut = () => {
    const svg = d3.select(svgRef.current);
    if (zoomBehaviorRef.current) {
      const currentZoom = zoomTransformRef.current.k;
      // Smart zoom levels: 8 → 4 → 2 → 1
      let targetZoom = currentZoom / 2;
      if (currentZoom > 6) targetZoom = 4;
      else if (currentZoom > 3) targetZoom = 2;
      else if (currentZoom > 1.5) targetZoom = 1;
      else targetZoom = 1;

      svg.transition().duration(400).ease(d3.easeCubicOut).call(
        zoomBehaviorRef.current.scaleTo,
        targetZoom
      );
    }
  };

  const handleZoomReset = () => {
    const svg = d3.select(svgRef.current);
    if (zoomBehaviorRef.current) {
      svg.transition().duration(600).ease(d3.easeCubicInOut).call(
        zoomBehaviorRef.current.transform,
        d3.zoomIdentity
      );
    }
  };

  const handleFitToPoints = () => {
    if (!svgRef.current || cleanPoints.length === 0) return;

    const svg = d3.select(svgRef.current);
    const projection = d3.geoNaturalEarth1();
    projection.fitExtent([[8, 8], [width - 8, h - 8]], { type: 'Sphere' } as any);

    // Get bounding box of all points
    const coords = cleanPoints.map(p => [p.lon, p.lat]);
    const bounds = coords.reduce(
      (acc, [lon, lat]) => {
        return [
          [Math.min(acc[0][0], lon), Math.min(acc[0][1], lat)],
          [Math.max(acc[1][0], lon), Math.max(acc[1][1], lat)]
        ];
      },
      [[Infinity, Infinity], [-Infinity, -Infinity]]
    );

    // Project bounds to screen coordinates
    const topLeft = projection(bounds[0]) || [0, 0];
    const bottomRight = projection(bounds[1]) || [width, h];

    // Calculate zoom and pan to fit
    const dx = bottomRight[0] - topLeft[0];
    const dy = bottomRight[1] - topLeft[1];
    const x = (topLeft[0] + bottomRight[0]) / 2;
    const y = (topLeft[1] + bottomRight[1]) / 2;
    const scale = Math.min(8, 0.85 / Math.max(dx / width, dy / h));
    const translate = [width / 2 - scale * x, h / 2 - scale * y];

    if (zoomBehaviorRef.current) {
      svg.transition().duration(750).ease(d3.easeCubicInOut).call(
        zoomBehaviorRef.current.transform,
        d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
      );
    }
  };

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

      {/* Zoom Controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-1 bg-white rounded-lg border border-black/10 shadow-lg overflow-hidden">
        <button
          type="button"
          onClick={handleZoomIn}
          className="p-2 hover:bg-neutral-50 transition-colors border-b border-black/5"
          aria-label="Zoom in"
          title="Zoom in"
        >
          <svg className="w-5 h-5 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          className="p-2 hover:bg-neutral-50 transition-colors border-b border-black/5"
          aria-label="Zoom out"
          title="Zoom out"
        >
          <svg className="w-5 h-5 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <button
          type="button"
          onClick={handleFitToPoints}
          className="p-2 hover:bg-neutral-50 transition-colors border-b border-black/5"
          aria-label="Fit to holdings"
          title="Fit to holdings"
        >
          <svg className="w-5 h-5 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
        <button
          type="button"
          onClick={handleZoomReset}
          className="p-2 hover:bg-neutral-50 transition-colors"
          aria-label="Reset zoom"
          title="Reset to world view"
        >
          <svg className="w-5 h-5 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Zoom Level Indicator */}
      {zoomLevel !== 1 && (
        <div className="absolute bottom-4 left-4 z-10 bg-white rounded-md border border-black/10 shadow-md px-3 py-1.5">
          <div className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
            <span className="text-xs font-semibold text-neutral-700">
              {Math.round(zoomLevel * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* Enhanced Map Popover with KPIs */}
      {selected && (
        <MapPopover
          point={selected.p}
          position={{
            x: width < 640 ? 12 : Math.max(12, Math.min(selected.x + 12, width - 240)),
            y: width < 640 ? Math.max(12, selected.y - 120) : Math.max(12, Math.min(selected.y + 12, h - 12))
          }}
          onClose={() => setSelected(null)}
          onOpenDetails={() => onPointClick?.(selected.p)}
        />
      )}

      {!topoLoaded && (
        <div className="text-xs text-neutral-500 mt-2">Loading country outlines…</div>
      )}
    </div>
  );
}
