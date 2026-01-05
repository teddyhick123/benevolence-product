/**
 * TypeScript types for map visualization and geocoding
 *
 * This file defines all types used for:
 * - Google Maps Geocoding API integration
 * - Map point data structures
 * - Map configuration and visualization modes
 */

import { AssetType } from '@/lib/schemas/portfolio';

// ============================================================================
// GEOCODING TYPES
// ============================================================================

/**
 * Geocoding accuracy levels from Google Maps API
 * @see https://developers.google.com/maps/documentation/geocoding/overview#Results
 */
export type GeocodeAccuracy =
  | 'ROOFTOP'              // Most accurate, exact building location
  | 'RANGE_INTERPOLATED'   // Interpolated between two precise points
  | 'GEOMETRIC_CENTER'     // Geometric center of result (road, city, etc.)
  | 'APPROXIMATE';         // Approximate location

/**
 * Status of a geocoding attempt
 */
export type GeocodeStatus = 'pending' | 'success' | 'failed' | 'skipped';

/**
 * Request parameters for geocoding a location
 */
export interface GeocodeRequest {
  city?: string;
  state?: string;
  country?: string;
  fullAddress?: string; // Override: use this exact address string instead of components
}

/**
 * Successful geocoding result from Google Maps API
 */
export interface GeocodeResult {
  latitude: number;          // -90 to 90
  longitude: number;         // -180 to 180
  formattedAddress: string;  // Human-readable address from Google
  accuracy: GeocodeAccuracy;
  placeId?: string;          // Google Place ID for reference
  addressComponents?: {      // Parsed address components
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    countryCode?: string;    // ISO 3166-1 alpha-2 code (e.g., 'US')
  };
  provider: 'google_maps';   // Geocoding service used
  geocodedAt: string;        // ISO timestamp
  metadata: Record<string, any>; // Additional metadata from API
}

/**
 * Cache entry for geocoding results (stored in geocode_cache table)
 */
export interface GeocodeCacheEntry {
  id: string;
  locationKey: string;       // Hash of city+state+country
  result: GeocodeResult | null;
  error?: string;
  cachedAt: string;          // ISO timestamp
  expiresAt: string;         // ISO timestamp (90 days from cachedAt)
}

/**
 * Response from bulk geocoding operation
 */
export interface BulkGeocodeResponse {
  processed: number;
  succeeded: number;
  failed: number;
  results: Array<{
    index: number;
    request: GeocodeRequest;
    result: GeocodeResult | null;
    error?: string;
  }>;
}

// ============================================================================
// MAP POINT TYPES
// ============================================================================

/**
 * KPI data for a single holding (displayed in map popover)
 */
export interface MapPointKPI {
  metric_code: string;
  display_name: string;
  value: number;
  unit?: string;
  period_end?: string; // ISO date
}

/**
 * Base map point (matches ImpactMapPoint from ImpactMap.tsx)
 */
export interface ImpactMapPoint {
  id: string;
  holdingId: string | null;
  name: string;
  tags: string[];
  status: string | null;
  asOf: string | null;      // ISO date
  amountUSD: number | null;
  coords: [number, number]; // [longitude, latitude]
  assetType?: AssetType;    // For color encoding
}

/**
 * Enhanced map point with KPIs and financial data (Phase 2)
 */
export interface EnhancedMapPoint extends ImpactMapPoint {
  topKpis: MapPointKPI[];
  totalContributions: number;
  latestValuation?: number;
  portfolioId?: string;
  sector?: string | null;
  country?: string | null;
}

/**
 * Cluster of nearby map points (for zoom levels < 2)
 */
export interface MapCluster {
  id: string;
  centroid: [number, number]; // [longitude, latitude]
  count: number;
  points: ImpactMapPoint[];
  totalAmount: number;         // Sum of amountUSD for all points in cluster
  bounds: {                    // Bounding box for cluster
    minLon: number;
    maxLon: number;
    minLat: number;
    maxLat: number;
  };
}

// ============================================================================
// MAP CONFIGURATION TYPES
// ============================================================================

/**
 * Visualization mode for the map
 */
export type MapMode = 'points' | 'heatmap' | 'choropleth';

/**
 * Sizing mode for map points
 */
export type SizingMode = 'funds_allocated' | 'total_contributions' | 'kpi';

/**
 * Color encoding mode for map points
 */
export type ColorMode = 'asset_type' | 'status' | 'sector';

/**
 * Map configuration state
 */
export interface MapConfig {
  mode: MapMode;
  sizingMode: SizingMode;
  colorBy: ColorMode;
  showClusters: boolean;
  clusterDistance: number;        // Minimum distance in pixels for clustering
  selectedMetricCode?: string;    // For kpi sizing mode
  showLabels: boolean;            // Show holding names on map
  showGrid: boolean;              // Show graticule grid
}

/**
 * Map filter state
 */
export interface MapFilters {
  assetTypes: AssetType[];       // Empty array = show all
  statuses: string[];            // Empty array = show all
  sectors: string[];             // Empty array = show all
  searchQuery: string;           // Filter by holding name
  dateRange?: {                  // Filter by as_of date
    start: string;               // ISO date
    end: string;                 // ISO date
  };
}

/**
 * Map interaction state
 */
export interface MapInteractionState {
  highlightedHoldingId: string | null;
  selectedHoldingId: string | null;
  zoomLevel: number;             // D3 zoom transform scale (1 = default)
  center: [number, number];      // [longitude, latitude] of map center
}

// ============================================================================
// POPOVER TYPES
// ============================================================================

/**
 * Props for the enhanced map popover component
 */
export interface MapPopoverProps {
  point: EnhancedMapPoint;
  position: {
    x: number;  // Pixel position relative to map container
    y: number;
  };
  onClose: () => void;
  onOpenDetails: () => void;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * Response from /api/portfolio/[id]/map endpoint
 */
export interface MapApiResponse {
  points: EnhancedMapPoint[];
  count: number;
  portfolio_id: string;
}

/**
 * Response from /api/portfolio/[id]/holdings/[holdingId]/geocode endpoint
 */
export interface GeocodeApiResponse {
  success: boolean;
  result: GeocodeResult | null;
  error?: string;
}

// ============================================================================
// ADVANCED VISUALIZATION TYPES (Phase 3)
// ============================================================================

/**
 * Heat map layer configuration
 */
export interface HeatmapConfig {
  radius: number;              // Radius of influence for each point (pixels)
  intensity: number;           // Base intensity value (0-1)
  gradient: {                  // Color gradient stops
    [key: number]: string;     // e.g., { 0.4: 'blue', 0.6: 'lime', 0.8: 'yellow', 1.0: 'red' }
  };
}

/**
 * Choropleth map configuration
 */
export interface ChoroplethConfig {
  aggregateBy: 'country' | 'region';
  metric: 'funds_allocated' | 'total_contributions' | 'holding_count';
  colorScale: 'sequential' | 'diverging';
  colorScheme: string;         // e.g., 'Blues', 'RdYlGn'
}

/**
 * Flow animation path
 */
export interface FlowPath {
  id: string;
  from: [number, number];      // [longitude, latitude] - typically portfolio location
  to: [number, number];        // [longitude, latitude] - holding location
  amount: number;
  date: string;                // ISO date
  type: 'contribution' | 'distribution' | 'valuation';
}

/**
 * Timeline scrubber state
 */
export interface TimelineState {
  currentDate: Date;
  dateRange: [Date, Date];
  isPlaying: boolean;
  playbackSpeed: number;       // Milliseconds per day (lower = faster)
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Geocoding configuration (from environment variables)
 */
export interface GeocodeConfig {
  apiKey: string;
  rateLimitQPS: number;        // Queries per second
  cacheDurationDays: number;
  batchSize: number;           // Max requests per batch operation
  retryAttempts: number;
  retryDelayMs: number;
}

/**
 * Map dimensions and viewport
 */
export interface MapDimensions {
  width: number;
  height: number;
  margin: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if a value is a valid GeocodeResult
 */
export function isGeocodeResult(value: any): value is GeocodeResult {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.latitude === 'number' &&
    typeof value.longitude === 'number' &&
    typeof value.formattedAddress === 'string' &&
    ['ROOFTOP', 'RANGE_INTERPOLATED', 'GEOMETRIC_CENTER', 'APPROXIMATE'].includes(value.accuracy)
  );
}

/**
 * Check if a value is a valid EnhancedMapPoint
 */
export function isEnhancedMapPoint(value: any): value is EnhancedMapPoint {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    Array.isArray(value.coords) &&
    value.coords.length === 2 &&
    Array.isArray(value.topKpis) &&
    typeof value.totalContributions === 'number'
  );
}
