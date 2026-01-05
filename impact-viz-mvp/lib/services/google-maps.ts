/**
 * Google Maps Geocoding API Client
 *
 * Converts location text (city, state, country) to lat/lon coordinates
 *
 * Features:
 * - Database caching (90-day TTL) to reduce API costs
 * - Rate limiting (50 QPS default)
 * - Batch geocoding support with staggered requests
 * - Robust error handling with retries
 * - Cost optimization through intelligent caching
 *
 * @see https://developers.google.com/maps/documentation/geocoding
 */

import { createClient } from '@supabase/supabase-js';
import type { GeocodeRequest, GeocodeResult, GeocodeCacheEntry } from '@/lib/types/map';
import { generateLocationKey } from '@/lib/schemas/geocoding';

// ============================================================================
// CONFIGURATION
// ============================================================================

const GEOCODE_CONFIG = {
  API_ENDPOINT: 'https://maps.googleapis.com/maps/api/geocode/json',
  CACHE_DURATION_MS: 90 * 24 * 60 * 60 * 1000, // 90 days
  RATE_LIMIT_QPS: parseInt(process.env.GEOCODING_RATE_LIMIT_QPS || '50', 10),
  BATCH_DELAY_MS: 20, // Delay between batch requests (50 QPS = 20ms spacing)
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000,
  RETRY_BACKOFF_MULTIPLIER: 2,
};

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Simple token bucket rate limiter for API requests
 */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per millisecond

  constructor(maxTokens: number, refillPerSecond: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
    this.refillRate = refillPerSecond / 1000;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Wait until a token is available
    const waitTime = (1 - this.tokens) / this.refillRate;
    await new Promise(resolve => setTimeout(resolve, waitTime));
    this.tokens = 0;
  }
}

const rateLimiter = new RateLimiter(GEOCODE_CONFIG.RATE_LIMIT_QPS, GEOCODE_CONFIG.RATE_LIMIT_QPS);

// ============================================================================
// SUPABASE CLIENT (for caching)
// ============================================================================

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables for geocoding cache');
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Get cached geocoding result from database
 */
export async function getCachedGeocode(locationKey: string): Promise<GeocodeCacheEntry | null> {
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('geocode_cache')
      .select('*')
      .eq('location_key', locationKey)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      console.error('Error fetching geocode cache:', error);
      return null;
    }

    return {
      id: data.id,
      locationKey: data.location_key,
      result: data.result as GeocodeResult | null,
      error: data.error,
      cachedAt: data.cached_at,
      expiresAt: data.expires_at,
    };
  } catch (err) {
    console.error('Exception in getCachedGeocode:', err);
    return null;
  }
}

/**
 * Store geocoding result in cache
 */
export async function setCachedGeocode(
  locationKey: string,
  result: GeocodeResult | null,
  error?: string
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + GEOCODE_CONFIG.CACHE_DURATION_MS);

    const { error: upsertError } = await supabase
      .from('geocode_cache')
      .upsert({
        location_key: locationKey,
        result: result || null,
        error: error || null,
        cached_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      }, {
        onConflict: 'location_key',
      });

    if (upsertError) {
      console.error('Error caching geocode result:', upsertError);
    }
  } catch (err) {
    console.error('Exception in setCachedGeocode:', err);
  }
}

// ============================================================================
// GOOGLE MAPS API INTEGRATION
// ============================================================================

/**
 * Call Google Maps Geocoding API directly (no caching)
 */
async function callGoogleMapsAPI(request: GeocodeRequest): Promise<GeocodeResult | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.warn('GOOGLE_MAPS_API_KEY not set - geocoding disabled');
    return null;
  }

  // Build address string
  let address: string;
  if (request.fullAddress) {
    address = request.fullAddress;
  } else {
    const parts = [request.city, request.state, request.country].filter(Boolean);
    if (parts.length === 0) return null;
    address = parts.join(', ');
  }

  // Build API URL
  const params = new URLSearchParams({
    address,
    key: apiKey,
  });
  const url = `${GEOCODE_CONFIG.API_ENDPOINT}?${params.toString()}`;

  // Make request with rate limiting
  await rateLimiter.acquire();

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Google Maps API HTTP error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Handle API response
  if (data.status !== 'OK') {
    if (data.status === 'ZERO_RESULTS') {
      // Not an error - just no results found
      return null;
    }

    if (data.status === 'OVER_QUERY_LIMIT') {
      throw new Error('Google Maps API quota exceeded');
    }

    throw new Error(`Google Maps API error: ${data.status} - ${data.error_message || 'Unknown error'}`);
  }

  // Parse first result
  const firstResult = data.results[0];
  if (!firstResult) return null;

  const { lat, lng } = firstResult.geometry.location;
  const locationType = firstResult.geometry.location_type || 'APPROXIMATE';

  // Parse address components
  const addressComponents = firstResult.address_components || [];
  const parsedComponents: GeocodeResult['addressComponents'] = {};

  for (const component of addressComponents) {
    const types = component.types || [];

    if (types.includes('locality')) {
      parsedComponents.city = component.long_name;
    } else if (types.includes('administrative_area_level_1')) {
      parsedComponents.state = component.long_name;
    } else if (types.includes('country')) {
      parsedComponents.country = component.long_name;
      parsedComponents.countryCode = component.short_name;
    } else if (types.includes('postal_code')) {
      parsedComponents.postalCode = component.long_name;
    }
  }

  // Build result
  const result: GeocodeResult = {
    latitude: lat,
    longitude: lng,
    formattedAddress: firstResult.formatted_address,
    accuracy: locationType as GeocodeResult['accuracy'],
    placeId: firstResult.place_id,
    addressComponents: parsedComponents,
    provider: 'google_maps',
    geocodedAt: new Date().toISOString(),
    metadata: {
      viewport: firstResult.geometry.viewport,
      partialMatch: firstResult.partial_match || false,
      types: firstResult.types || [],
    },
  };

  return result;
}

/**
 * Geocode with retries and exponential backoff
 */
async function geocodeWithRetry(request: GeocodeRequest, attempt: number = 1): Promise<GeocodeResult | null> {
  try {
    return await callGoogleMapsAPI(request);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Don't retry on quota errors or invalid requests
    if (errorMessage.includes('quota') || errorMessage.includes('INVALID_REQUEST')) {
      console.error('Geocoding failed (no retry):', errorMessage);
      throw error;
    }

    // Retry on network errors or temporary failures
    if (attempt < GEOCODE_CONFIG.RETRY_ATTEMPTS) {
      const delay = GEOCODE_CONFIG.RETRY_DELAY_MS * Math.pow(GEOCODE_CONFIG.RETRY_BACKOFF_MULTIPLIER, attempt - 1);
      console.warn(`Geocoding attempt ${attempt} failed, retrying in ${delay}ms:`, errorMessage);

      await new Promise(resolve => setTimeout(resolve, delay));
      return geocodeWithRetry(request, attempt + 1);
    }

    // All retries exhausted
    console.error('Geocoding failed after all retries:', errorMessage);
    throw error;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Geocode a single location with caching
 *
 * @param request - Location to geocode (city, state, country)
 * @returns GeocodeResult or null if geocoding fails
 *
 * @example
 * const result = await geocodeLocation({ city: 'San Francisco', state: 'CA', country: 'USA' });
 * if (result) {
 *   console.log(`Coordinates: ${result.latitude}, ${result.longitude}`);
 * }
 */
export async function geocodeLocation(request: GeocodeRequest): Promise<GeocodeResult | null> {
  try {
    // Generate cache key
    const locationKey = generateLocationKey(request);

    // Check cache first
    const cached = await getCachedGeocode(locationKey);
    if (cached) {
      console.log(`Cache hit for location key: ${locationKey}`);
      return cached.result;
    }

    console.log(`Cache miss for location key: ${locationKey}, calling API`);

    // Call API
    let result: GeocodeResult | null = null;
    let error: string | undefined;

    try {
      result = await geocodeWithRetry(request);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    // Cache the result (even if null/error)
    await setCachedGeocode(locationKey, result, error);

    return result;
  } catch (error) {
    console.error('Error in geocodeLocation:', error);
    return null;
  }
}

/**
 * Batch geocode multiple locations with rate limiting
 *
 * @param requests - Array of locations to geocode
 * @returns Array of results (null for failures) in same order as requests
 *
 * @example
 * const results = await batchGeocode([
 *   { city: 'San Francisco', state: 'CA', country: 'USA' },
 *   { city: 'New York', state: 'NY', country: 'USA' },
 * ]);
 */
export async function batchGeocode(requests: GeocodeRequest[]): Promise<(GeocodeResult | null)[]> {
  const results: (GeocodeResult | null)[] = [];

  for (let i = 0; i < requests.length; i++) {
    const request = requests[i];

    try {
      const result = await geocodeLocation(request);
      results.push(result);

      // Log progress
      if ((i + 1) % 10 === 0 || i === requests.length - 1) {
        console.log(`Batch geocoding progress: ${i + 1}/${requests.length}`);
      }

      // Rate limiting delay between requests (unless last request)
      if (i < requests.length - 1) {
        await new Promise(resolve => setTimeout(resolve, GEOCODE_CONFIG.BATCH_DELAY_MS));
      }
    } catch (error) {
      console.error(`Error geocoding request ${i}:`, error);
      results.push(null);
    }
  }

  return results;
}

/**
 * Get geocoding statistics from cache
 *
 * @returns Statistics about cache performance
 */
export async function getGeocodeStats(): Promise<{
  totalEntries: number;
  validResults: number;
  failedResults: number;
  expiredEntries: number;
  cacheHitRate: number;
}> {
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase.rpc('get_geocode_cache_stats');

    if (error) {
      console.error('Error fetching geocode stats:', error);
      return {
        totalEntries: 0,
        validResults: 0,
        failedResults: 0,
        expiredEntries: 0,
        cacheHitRate: 0,
      };
    }

    return {
      totalEntries: parseInt(data[0]?.total_entries || '0', 10),
      validResults: parseInt(data[0]?.valid_results || '0', 10),
      failedResults: parseInt(data[0]?.failed_results || '0', 10),
      expiredEntries: parseInt(data[0]?.expired_entries || '0', 10),
      cacheHitRate: parseFloat(data[0]?.cache_hit_potential || '0'),
    };
  } catch (error) {
    console.error('Error in getGeocodeStats:', error);
    return {
      totalEntries: 0,
      validResults: 0,
      failedResults: 0,
      expiredEntries: 0,
      cacheHitRate: 0,
    };
  }
}

/**
 * Clean expired cache entries
 *
 * @returns Number of entries deleted
 */
export async function cleanExpiredCache(): Promise<number> {
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase.rpc('clean_expired_geocode_cache');

    if (error) {
      console.error('Error cleaning expired cache:', error);
      return 0;
    }

    return parseInt(data || '0', 10);
  } catch (error) {
    console.error('Error in cleanExpiredCache:', error);
    return 0;
  }
}
