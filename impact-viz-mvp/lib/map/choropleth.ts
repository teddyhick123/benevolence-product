/**
 * Choropleth Map Visualization
 *
 * Aggregates holdings by country and colors countries based on metrics.
 * Useful for understanding geographic distribution at a glance.
 */

import * as d3 from 'd3';

export type ChoroplethPoint = {
  lon: number;
  lat: number;
  country?: string;
  amountUSD?: number | null;
  [key: string]: any;
};

export type CountryAggregate = {
  country: string;
  count: number;
  totalAmount: number;
  points: ChoroplethPoint[];
};

/**
 * Aggregate points by country
 *
 * @param points - Array of points with country information
 * @returns Map of country code to aggregate data
 */
export function aggregateByCountry(
  points: ChoroplethPoint[]
): Map<string, CountryAggregate> {
  const aggregates = new Map<string, CountryAggregate>();

  for (const point of points) {
    // Try to determine country from the point data
    const country = determineCountry(point);
    if (!country) continue;

    const existing = aggregates.get(country);
    if (existing) {
      existing.count++;
      existing.totalAmount += point.amountUSD || 0;
      existing.points.push(point);
    } else {
      aggregates.set(country, {
        country,
        count: 1,
        totalAmount: point.amountUSD || 0,
        points: [point],
      });
    }
  }

  return aggregates;
}

/**
 * Determine country from point data
 * Uses multiple strategies to identify the country
 */
function determineCountry(point: ChoroplethPoint): string | null {
  // Strategy 1: Explicit country field
  if (point.country) {
    return normalizeCountryCode(point.country);
  }

  // Strategy 2: Reverse geocoding approximation
  // Map lat/lon to rough country boundaries
  const country = approximateCountryFromCoords(point.lon, point.lat);
  return country;
}

/**
 * Normalize country codes and names to ISO 3166-1 alpha-3
 */
function normalizeCountryCode(country: string): string {
  const normalized = country.trim().toUpperCase();

  // Common mappings
  const countryMap: Record<string, string> = {
    'USA': 'USA',
    'US': 'USA',
    'UNITED STATES': 'USA',
    'UNITED STATES OF AMERICA': 'USA',
    'UK': 'GBR',
    'UNITED KINGDOM': 'GBR',
    'GREAT BRITAIN': 'GBR',
    'ENGLAND': 'GBR',
    'CANADA': 'CAN',
    'CA': 'CAN',
    'MEXICO': 'MEX',
    'MX': 'MEX',
    'CHINA': 'CHN',
    'CN': 'CHN',
    'INDIA': 'IND',
    'IN': 'IND',
    'BRAZIL': 'BRA',
    'BR': 'BRA',
    'AUSTRALIA': 'AUS',
    'AU': 'AUS',
    'JAPAN': 'JPN',
    'JP': 'JPN',
    'GERMANY': 'DEU',
    'DE': 'DEU',
    'FRANCE': 'FRA',
    'FR': 'FRA',
    'ITALY': 'ITA',
    'IT': 'ITA',
    'SPAIN': 'ESP',
    'ES': 'ESP',
    'SOUTH KOREA': 'KOR',
    'KOREA': 'KOR',
    'KR': 'KOR',
  };

  return countryMap[normalized] || normalized;
}

/**
 * Approximate country from coordinates using simple bounding boxes
 * This is a rough approximation - a real implementation would use a geocoding service
 */
function approximateCountryFromCoords(lon: number, lat: number): string | null {
  // North America
  if (lon >= -170 && lon <= -50 && lat >= 15 && lat <= 75) {
    if (lon >= -130 && lon <= -65) return 'USA';
    if (lon >= -141 && lon <= -52 && lat >= 42) return 'CAN';
    if (lon >= -118 && lon <= -86 && lat >= 14 && lat <= 33) return 'MEX';
  }

  // Europe
  if (lon >= -10 && lon <= 40 && lat >= 35 && lat <= 70) {
    if (lon >= -10 && lon <= 2 && lat >= 49 && lat <= 60) return 'GBR';
    if (lon >= -5 && lon <= 10 && lat >= 42 && lat <= 51) return 'FRA';
    if (lon >= 5 && lon <= 15 && lat >= 47 && lat <= 55) return 'DEU';
  }

  // Asia
  if (lon >= 60 && lon <= 180 && lat >= -10 && lat <= 55) {
    if (lon >= 73 && lon <= 97 && lat >= 8 && lat <= 35) return 'IND';
    if (lon >= 73 && lon <= 135 && lat >= 18 && lat <= 54) return 'CHN';
    if (lon >= 129 && lon <= 146 && lat >= 30 && lat <= 46) return 'JPN';
  }

  // South America
  if (lon >= -82 && lon <= -34 && lat >= -56 && lat <= 12) {
    if (lon >= -74 && lon <= -34 && lat >= -34 && lat <= 5) return 'BRA';
  }

  // Africa (simplified)
  if (lon >= -18 && lon <= 52 && lat >= -35 && lat <= 38) {
    return 'AFR'; // Generic Africa
  }

  // Oceania
  if (lon >= 110 && lon <= 180 && lat >= -45 && lat <= -10) {
    return 'AUS';
  }

  return null;
}

/**
 * Get color for a country based on aggregate value
 *
 * @param value - Aggregate value for the country
 * @param maxValue - Maximum value across all countries
 * @param colorScheme - Color interpolator (default: Blues)
 * @returns Hex color string
 */
export function getCountryFillColor(
  value: number,
  maxValue: number,
  colorScheme: d3.ScaleSequential<string, never> = d3.scaleSequential(d3.interpolateBlues)
): string {
  if (maxValue === 0) return '#f0f0f0';

  const normalized = value / maxValue;
  return colorScheme(normalized * 0.8 + 0.2); // Scale to 0.2-1.0 range for better visibility
}

/**
 * Create a choropleth color scale
 */
export function createChoroplethScale(
  domain: [number, number],
  scheme: 'sequential' | 'diverging' = 'sequential'
): d3.ScaleSequential<string, never> {
  const scale = d3.scaleSequential()
    .domain(domain);

  if (scheme === 'diverging') {
    return scale.interpolator(d3.interpolateRdYlGn);
  }

  // Sequential (default)
  return scale.interpolator(d3.interpolateBlues);
}

/**
 * Get summary statistics for choropleth legend
 */
export function getChoroplethStats(aggregates: Map<string, CountryAggregate>) {
  const values = Array.from(aggregates.values()).map(a => a.totalAmount);

  return {
    min: Math.min(...values),
    max: Math.max(...values),
    mean: d3.mean(values) || 0,
    median: d3.median(values) || 0,
    total: d3.sum(values),
  };
}
