/**
 * Flow Animations for Map
 *
 * Creates animated curved paths showing flow of contributions from
 * portfolio headquarters to holdings locations.
 */

import * as d3 from 'd3';

export type FlowPoint = {
  lon: number;
  lat: number;
  name: string;
};

export type Flow = {
  id: string;
  source: FlowPoint; // Portfolio HQ or donor location
  target: FlowPoint; // Holding location
  amount: number;
  date?: Date;
};

/**
 * Generate curved path between two geographic points
 *
 * @param source - Starting point
 * @param target - Ending point
 * @param projection - D3 geo projection
 * @param curvature - How much to curve the path (0 = straight, 1 = very curved)
 * @returns SVG path string
 */
export function generateFlowPath(
  source: FlowPoint,
  target: FlowPoint,
  projection: d3.GeoProjection,
  curvature: number = 0.5
): string {
  const sourceCoords = projection([source.lon, source.lat]);
  const targetCoords = projection([target.lon, target.lat]);

  if (!sourceCoords || !targetCoords) return '';

  const [x1, y1] = sourceCoords;
  const [x2, y2] = targetCoords;

  // Calculate control points for quadratic Bezier curve
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Control point offset perpendicular to the line
  const offsetX = -dy * curvature * 0.3;
  const offsetY = dx * curvature * 0.3;

  // Midpoint
  const mx = (x1 + x2) / 2 + offsetX;
  const my = (y1 + y2) / 2 + offsetY;

  // Create smooth curved path
  return `M ${x1},${y1} Q ${mx},${my} ${x2},${y2}`;
}

/**
 * Render flow paths on the map
 *
 * @param svg - D3 selection of the SVG group
 * @param flows - Array of flows to render
 * @param projection - D3 geo projection
 * @param options - Animation options
 */
export function renderFlowPaths(
  svg: d3.Selection<SVGGElement, unknown, null, undefined>,
  flows: Flow[],
  projection: d3.GeoProjection,
  options: {
    strokeColor?: string;
    strokeWidth?: (flow: Flow) => number;
    opacity?: number;
    animate?: boolean;
    animationDuration?: number;
  } = {}
) {
  const {
    strokeColor = '#5186a6',
    strokeWidth = (flow: Flow) => Math.min(5, Math.max(1, flow.amount / 100000)),
    opacity = 0.6,
    animate = true,
    animationDuration = 2000,
  } = options;

  // Create flow paths
  const paths = svg
    .selectAll('path.flow')
    .data(flows, (d: any) => d.id)
    .join('path')
    .attr('class', 'flow')
    .attr('d', d => generateFlowPath(d.source, d.target, projection))
    .attr('fill', 'none')
    .attr('stroke', strokeColor)
    .attr('stroke-width', strokeWidth)
    .attr('opacity', opacity)
    .attr('stroke-linecap', 'round');

  if (animate) {
    // Animate stroke-dashoffset for flow effect
    paths
      .each(function() {
        const path = d3.select(this as SVGPathElement);
        const totalLength = (this as SVGPathElement).getTotalLength();

        path
          .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
          .attr('stroke-dashoffset', totalLength)
          .transition()
          .duration(animationDuration)
          .ease(d3.easeLinear)
          .attr('stroke-dashoffset', 0)
          .on('end', function repeat() {
            // Loop the animation
            path
              .attr('stroke-dashoffset', totalLength)
              .transition()
              .duration(animationDuration)
              .ease(d3.easeLinear)
              .attr('stroke-dashoffset', 0)
              .on('end', repeat);
          });
      });
  }

  return paths;
}

/**
 * Create pulsing circles at flow endpoints
 */
export function renderFlowPulses(
  svg: d3.Selection<SVGGElement, unknown, null, undefined>,
  flows: Flow[],
  projection: d3.GeoProjection,
  options: {
    fillColor?: string;
    maxRadius?: number;
    pulseDuration?: number;
  } = {}
) {
  const {
    fillColor = '#e85d04',
    maxRadius = 8,
    pulseDuration = 1500,
  } = options;

  // Extract unique target points
  const targets = flows.map(f => ({
    id: `${f.target.lon},${f.target.lat}`,
    ...f.target,
  }));

  // Create pulsing circles
  const pulses = svg
    .selectAll('circle.pulse')
    .data(targets, (d: any) => d.id)
    .join('circle')
    .attr('class', 'pulse')
    .attr('cx', d => {
      const coords = projection([d.lon, d.lat]);
      return coords ? coords[0] : 0;
    })
    .attr('cy', d => {
      const coords = projection([d.lon, d.lat]);
      return coords ? coords[1] : 0;
    })
    .attr('r', 0)
    .attr('fill', fillColor)
    .attr('opacity', 0);

  // Animate pulses
  pulses.each(function() {
    const element = this;
    function pulse() {
      d3.select(element)
        .attr('r', 0)
        .attr('opacity', 0.8)
        .transition()
        .duration(pulseDuration)
        .ease(d3.easeCircleOut)
        .attr('r', maxRadius)
        .attr('opacity', 0)
        .on('end', pulse);
    }
    pulse();
  });

  return pulses;
}

/**
 * Calculate flow statistics for visualization
 */
export function calculateFlowStats(flows: Flow[]) {
  const amounts = flows.map(f => f.amount);

  return {
    totalAmount: d3.sum(amounts),
    avgAmount: d3.mean(amounts) || 0,
    maxAmount: d3.max(amounts) || 0,
    minAmount: d3.min(amounts) || 0,
    flowCount: flows.length,
  };
}

/**
 * Group flows by time period for temporal animation
 */
export function groupFlowsByPeriod(
  flows: Flow[],
  periodType: 'day' | 'week' | 'month' | 'quarter' | 'year' = 'month'
): Map<string, Flow[]> {
  const grouped = new Map<string, Flow[]>();

  for (const flow of flows) {
    if (!flow.date) continue;

    const date = flow.date;
    let key: string;

    switch (periodType) {
      case 'day':
        key = date.toISOString().split('T')[0];
        break;
      case 'week':
        const weekNum = getWeekNumber(date);
        key = `${date.getFullYear()}-W${weekNum}`;
        break;
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
      case 'quarter':
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        key = `${date.getFullYear()}-Q${quarter}`;
        break;
      case 'year':
        key = `${date.getFullYear()}`;
        break;
    }

    const existing = grouped.get(key) || [];
    existing.push(flow);
    grouped.set(key, existing);
  }

  return grouped;
}

/**
 * Get ISO week number
 */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
