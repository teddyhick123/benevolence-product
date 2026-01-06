/**
 * Heat Map Visualization
 *
 * Creates density-based heat map visualization using D3 contour density.
 * Shows concentration of holdings rather than individual points.
 */

import * as d3 from 'd3';

export type HeatmapPoint = {
  lon: number;
  lat: number;
  weight?: number;
};

export type HeatmapContour = {
  type: 'Feature';
  geometry: {
    type: 'MultiPolygon' | 'Polygon';
    coordinates: any;
  };
  properties: {
    value: number;
  };
};

/**
 * Generate heat map contours from point data
 *
 * @param points - Array of points with lon/lat coordinates
 * @param projection - D3 geo projection to convert coordinates
 * @param width - Map width in pixels
 * @param height - Map height in pixels
 * @param bandwidth - Smoothing bandwidth (default: 20)
 * @returns Array of contour features for rendering
 */
export function generateHeatmapContours(
  points: HeatmapPoint[],
  projection: d3.GeoProjection,
  width: number,
  height: number,
  bandwidth: number = 20
): HeatmapContour[] {
  if (points.length === 0) return [];

  // Convert geographic coordinates to pixel coordinates
  const pixelPoints = points
    .map(p => {
      const coords = projection([p.lon, p.lat]);
      if (!coords || !isFinite(coords[0]) || !isFinite(coords[1])) return null;
      return {
        x: coords[0],
        y: coords[1],
        weight: p.weight || 1,
      };
    })
    .filter((p): p is { x: number; y: number; weight: number } => p !== null);

  if (pixelPoints.length === 0) return [];

  // Create contour density generator
  const contourDensity = d3.contourDensity<{ x: number; y: number; weight: number }>()
    .x(d => d.x)
    .y(d => d.y)
    .weight(d => d.weight)
    .size([width, height])
    .bandwidth(bandwidth)
    .thresholds(8); // Number of contour levels

  // Generate contours
  const contours = contourDensity(pixelPoints);

  return contours as unknown as HeatmapContour[];
}

/**
 * Get color scale for heat map rendering
 *
 * @param domain - [min, max] values for the color scale
 * @returns D3 color scale interpolator
 */
export function getHeatmapColorScale(domain: [number, number]) {
  return d3.scaleSequential()
    .domain(domain)
    .interpolator(d3.interpolateYlOrRd); // Yellow → Orange → Red
}

/**
 * Get optimal bandwidth based on point density and map size
 */
export function getOptimalBandwidth(
  pointCount: number,
  width: number,
  height: number
): number {
  const area = width * height;
  const density = pointCount / area;

  // Higher density → smaller bandwidth (more detail)
  // Lower density → larger bandwidth (smoother)
  if (density > 0.001) return 15;
  if (density > 0.0005) return 20;
  if (density > 0.0001) return 30;
  return 40;
}

/**
 * Convert pixel coordinates back to geographic coordinates
 * (Used for tooltip display)
 */
export function pixelToGeo(
  x: number,
  y: number,
  projection: d3.GeoProjection
): [number, number] | null {
  const coords = projection.invert?.([x, y]);
  return coords || null;
}
