/**
 * Point Clustering for Map Visualization
 *
 * Uses D3 quadtree for efficient spatial clustering of nearby points.
 * Prevents visual clutter when multiple holdings are in close proximity.
 */

import * as d3 from 'd3';

export type ClusterablePoint = {
  id: string;
  lon: number;
  lat: number;
  name: string;
  amountUSD?: number | null;
  assetType?: string | null;
  [key: string]: any; // Allow additional properties
};

export type Cluster = {
  id: string;
  type: 'cluster';
  lon: number; // Centroid longitude
  lat: number; // Centroid latitude
  count: number; // Number of points in cluster
  points: ClusterablePoint[]; // Original points in this cluster
  totalAmount: number; // Sum of amounts
  bounds: {
    minLon: number;
    maxLon: number;
    minLat: number;
    maxLat: number;
  };
};

export type ClusteredPoint = ClusterablePoint & {
  type: 'point';
};

export type ClusterOrPoint = Cluster | ClusteredPoint;

/**
 * Calculate distance between two geographic coordinates in pixels
 * Uses the projection to convert lat/lon to screen coordinates
 */
function pixelDistance(
  p1: { lon: number; lat: number },
  p2: { lon: number; lat: number },
  projection: d3.GeoProjection
): number {
  const [x1, y1] = projection([p1.lon, p1.lat]) || [0, 0];
  const [x2, y2] = projection([p2.lon, p2.lat]) || [0, 0];
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

/**
 * Cluster points that are within minDistance pixels of each other
 *
 * @param points - Array of points to cluster
 * @param minDistance - Minimum distance in pixels to trigger clustering
 * @param projection - D3 geo projection for coordinate conversion
 * @returns Array of clusters and individual points
 */
export function clusterPoints(
  points: ClusterablePoint[],
  minDistance: number,
  projection: d3.GeoProjection
): ClusterOrPoint[] {
  if (points.length === 0) return [];
  if (minDistance <= 0) {
    // No clustering, return all as individual points
    return points.map(p => ({ ...p, type: 'point' as const }));
  }

  // Build quadtree for efficient spatial queries
  const quadtree = d3.quadtree<ClusterablePoint>()
    .x(d => projection([d.lon, d.lat])?.[0] || 0)
    .y(d => projection([d.lon, d.lat])?.[1] || 0)
    .addAll(points);

  const clustered = new Set<string>();
  const result: ClusterOrPoint[] = [];
  let clusterId = 0;

  for (const point of points) {
    if (clustered.has(point.id)) continue;

    const [px, py] = projection([point.lon, point.lat]) || [0, 0];
    const nearby: ClusterablePoint[] = [];

    // Find all points within minDistance
    quadtree.visit((node, x1, y1, x2, y2) => {
      if (!node.length) {
        // Leaf node
        const data = node.data;
        if (data && !clustered.has(data.id)) {
          const dist = pixelDistance(point, data, projection);
          if (dist <= minDistance) {
            nearby.push(data);
          }
        }
      }
      // Continue visiting if node bounds overlap search radius
      return x1 > px + minDistance || y1 > py + minDistance ||
             x2 < px - minDistance || y2 < py - minDistance;
    });

    if (nearby.length === 1) {
      // Single point, no clustering needed
      result.push({ ...nearby[0], type: 'point' });
      clustered.add(nearby[0].id);
    } else if (nearby.length > 1) {
      // Multiple points, create cluster
      nearby.forEach(p => clustered.add(p.id));

      // Calculate centroid
      const centroidLon = d3.mean(nearby, d => d.lon) || point.lon;
      const centroidLat = d3.mean(nearby, d => d.lat) || point.lat;

      // Calculate bounds
      const lons = nearby.map(p => p.lon);
      const lats = nearby.map(p => p.lat);

      // Calculate total amount
      const totalAmount = d3.sum(nearby, d => d.amountUSD || 0);

      result.push({
        id: `cluster-${clusterId++}`,
        type: 'cluster',
        lon: centroidLon,
        lat: centroidLat,
        count: nearby.length,
        points: nearby,
        totalAmount,
        bounds: {
          minLon: Math.min(...lons),
          maxLon: Math.max(...lons),
          minLat: Math.min(...lats),
          maxLat: Math.max(...lats),
        },
      });
    }
  }

  return result;
}

/**
 * Check if a cluster/point is a cluster
 */
export function isCluster(item: ClusterOrPoint): item is Cluster {
  return item.type === 'cluster';
}

/**
 * Check if a cluster/point is an individual point
 */
export function isPoint(item: ClusterOrPoint): item is ClusteredPoint {
  return item.type === 'point';
}

/**
 * Get display radius for a cluster based on count and total amount
 */
export function getClusterRadius(cluster: Cluster, baseRadius: number = 8): number {
  // Scale radius based on count (min 12px, max 32px)
  const countScale = Math.sqrt(cluster.count);
  return Math.max(12, Math.min(32, baseRadius + countScale * 4));
}

/**
 * Get display label for a cluster
 */
export function getClusterLabel(cluster: Cluster): string {
  return cluster.count.toString();
}

/**
 * Determine optimal clustering distance based on zoom level
 * Uses smooth interpolation to avoid sudden clustering changes
 */
export function getOptimalClusterDistance(zoomScale: number): number {
  // Smooth curve: higher zoom = less clustering
  // At zoom 1x: 50px clustering distance
  // At zoom 2x: 35px
  // At zoom 4x: 20px
  // At zoom 6x: 10px
  // At zoom 8x: 0px (no clustering)

  if (zoomScale >= 8) return 0;

  // Smooth exponential decay instead of hard thresholds
  const maxDistance = 50;
  const minDistance = 0;
  const decayRate = 0.3; // Controls how quickly clustering reduces

  const distance = maxDistance * Math.exp(-decayRate * (zoomScale - 1));
  return Math.max(minDistance, Math.min(maxDistance, Math.round(distance)));
}
