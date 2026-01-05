/**
 * Zod validation schemas for geocoding API requests and responses
 *
 * These schemas ensure type safety and validation for:
 * - Geocoding requests (city, state, country)
 * - Geocoding results from Google Maps API
 * - Bulk geocoding operations
 */

import { z } from 'zod';

// ============================================================================
// GEOCODING REQUEST SCHEMAS
// ============================================================================

/**
 * Schema for geocoding a single location
 * At least one of city or fullAddress must be provided
 */
export const geocodeRequestSchema = z.object({
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  fullAddress: z.string().trim().max(500).optional(),
}).refine(
  (data) => data.city || data.fullAddress,
  {
    message: 'Either city or fullAddress is required for geocoding',
    path: ['city']
  }
);

export type GeocodeRequestInput = z.infer<typeof geocodeRequestSchema>;

/**
 * Schema for bulk geocoding requests
 */
export const bulkGeocodeRequestSchema = z.object({
  force: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(500).optional().default(100),
  holdingIds: z.array(z.string().uuid()).optional(), // Specific holdings to geocode
});

export type BulkGeocodeRequestInput = z.infer<typeof bulkGeocodeRequestSchema>;

// ============================================================================
// GEOCODING RESULT SCHEMAS
// ============================================================================

/**
 * Schema for geocoding accuracy levels
 */
export const geocodeAccuracySchema = z.enum([
  'ROOFTOP',
  'RANGE_INTERPOLATED',
  'GEOMETRIC_CENTER',
  'APPROXIMATE'
]);

/**
 * Schema for address components from Google Maps API
 */
export const addressComponentsSchema = z.object({
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  countryCode: z.string().length(2).optional(), // ISO 3166-1 alpha-2
}).optional();

/**
 * Schema for successful geocoding result
 */
export const geocodeResultSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  formattedAddress: z.string().min(1),
  accuracy: geocodeAccuracySchema,
  placeId: z.string().optional(),
  addressComponents: addressComponentsSchema,
  provider: z.literal('google_maps'),
  geocodedAt: z.string().datetime(),
  metadata: z.record(z.any()).default({}),
});

export type GeocodeResultOutput = z.infer<typeof geocodeResultSchema>;

/**
 * Schema for geocoding API response (success or failure)
 */
export const geocodeApiResponseSchema = z.object({
  success: z.boolean(),
  result: geocodeResultSchema.nullable(),
  error: z.string().optional(),
});

export type GeocodeApiResponseOutput = z.infer<typeof geocodeApiResponseSchema>;

// ============================================================================
// BULK GEOCODING RESPONSE SCHEMA
// ============================================================================

/**
 * Schema for a single item in bulk geocoding results
 */
export const bulkGeocodeItemSchema = z.object({
  index: z.number().int().min(0),
  holdingId: z.string().uuid().optional(),
  request: geocodeRequestSchema,
  result: geocodeResultSchema.nullable(),
  error: z.string().optional(),
});

/**
 * Schema for bulk geocoding response
 */
export const bulkGeocodeResponseSchema = z.object({
  success: z.boolean(),
  processed: z.number().int().min(0),
  succeeded: z.number().int().min(0),
  failed: z.number().int().min(0),
  results: z.array(bulkGeocodeItemSchema).optional(),
});

export type BulkGeocodeResponseOutput = z.infer<typeof bulkGeocodeResponseSchema>;

// ============================================================================
// GEOCODE STATUS SCHEMA
// ============================================================================

/**
 * Schema for geocoding status in database
 */
export const geocodeStatusSchema = z.enum(['pending', 'success', 'failed', 'skipped']);

export type GeocodeStatusType = z.infer<typeof geocodeStatusSchema>;

// ============================================================================
// MAP API REQUEST/RESPONSE SCHEMAS
// ============================================================================

/**
 * Schema for map API query parameters
 */
export const mapQueryParamsSchema = z.object({
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  assetTypes: z.string().optional(), // Comma-separated asset types
  statuses: z.string().optional(),   // Comma-separated statuses
  searchQuery: z.string().max(200).optional(),
});

export type MapQueryParamsInput = z.infer<typeof mapQueryParamsSchema>;

/**
 * Schema for a single KPI in map popover
 */
export const mapPointKPISchema = z.object({
  metric_code: z.string(),
  display_name: z.string(),
  value: z.number(),
  unit: z.string().optional(),
  period_end: z.string().optional(), // ISO date
});

/**
 * Schema for enhanced map point with KPIs
 */
export const enhancedMapPointSchema = z.object({
  id: z.string().uuid(),
  holdingId: z.string().uuid().nullable(),
  name: z.string(),
  tags: z.array(z.string()),
  status: z.string().nullable(),
  asOf: z.string().nullable(),
  amountUSD: z.number().nullable(),
  coords: z.tuple([z.number(), z.number()]), // [lon, lat]
  assetType: z.string().optional(),
  topKpis: z.array(mapPointKPISchema).default([]),
  totalContributions: z.number().default(0),
  latestValuation: z.number().optional(),
  sector: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
});

export type EnhancedMapPointOutput = z.infer<typeof enhancedMapPointSchema>;

/**
 * Schema for map API response
 */
export const mapApiResponseSchema = z.object({
  points: z.array(enhancedMapPointSchema),
  count: z.number().int().min(0),
  portfolio_id: z.string().uuid(),
});

export type MapApiResponseOutput = z.infer<typeof mapApiResponseSchema>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Safely parse and validate a geocoding request
 */
export function parseGeocodeRequest(data: unknown): GeocodeRequestInput {
  return geocodeRequestSchema.parse(data);
}

/**
 * Safely parse and validate a geocoding result
 */
export function parseGeocodeResult(data: unknown): GeocodeResultOutput {
  return geocodeResultSchema.parse(data);
}

/**
 * Validate if a geocoding result has high accuracy
 */
export function isHighAccuracyResult(result: GeocodeResultOutput): boolean {
  return result.accuracy === 'ROOFTOP' || result.accuracy === 'RANGE_INTERPOLATED';
}

/**
 * Generate a location key for caching (hash of city+state+country)
 */
export function generateLocationKey(request: GeocodeRequestInput): string {
  if (request.fullAddress) {
    // Normalize address: lowercase, trim, remove extra spaces
    return request.fullAddress.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  // Create key from components
  const parts = [
    request.city?.toLowerCase().trim(),
    request.state?.toLowerCase().trim(),
    request.country?.toLowerCase().trim(),
  ].filter(Boolean);

  return parts.join('|');
}

/**
 * Parse comma-separated asset types from query parameter
 */
export function parseAssetTypesParam(assetTypes?: string): string[] {
  if (!assetTypes) return [];
  return assetTypes.split(',').map(t => t.trim()).filter(Boolean);
}

/**
 * Parse comma-separated statuses from query parameter
 */
export function parseStatusesParam(statuses?: string): string[] {
  if (!statuses) return [];
  return statuses.split(',').map(s => s.trim()).filter(Boolean);
}
