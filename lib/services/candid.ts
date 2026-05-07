/**
 * Candid (GuideStar) API Client
 *
 * API for nonprofit transparency seals and profile data
 * API Docs: https://www.guidestar.org/products-services/developer-tools
 *
 * Requires API key: Apply at https://www.guidestar.org/products-services/developer-tools
 * Rate Limit: 1,000 requests/day
 */

import { createAdminClient } from '@/lib/supabase';

const CANDID_API_KEY = process.env.CANDID_API_KEY;
const CANDID_BASE_URL = 'https://apidata.guidestar.org';

export interface CandidSeal {
  ein: string;
  organization_name: string;
  seal_level?: 'platinum' | 'gold' | 'silver' | 'bronze' | 'none';
  transparency_level?: 'high' | 'medium' | 'low';
  profile_level?: number;
  mission?: string;
  website?: string;
  city?: string;
  state?: string;
  zip?: string;
}

/**
 * Get Candid seal and transparency data for a charity by EIN
 */
export async function getCandidSeal(ein: string): Promise<CandidSeal | null> {
  if (!CANDID_API_KEY) {
    console.warn('Candid API key not configured');
    return null;
  }

  try {
    // Check cache first (30-day TTL)
    const cached = await getCachedRating('candid', ein);
    if (cached) {
      console.log(`[Candid] Cache hit for ${ein}`);
      return cached;
    }

    console.log(`[Candid] Fetching seal for ${ein}`);

    // Fetch from API
    // Note: Candid API endpoint format may vary - check docs for exact format
    const response = await fetch(
      `${CANDID_BASE_URL}/v2/organizations/${ein}`,
      {
        headers: {
          'Authorization': `Bearer ${CANDID_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.status === 404) {
      console.log(`[Candid] Organization ${ein} not found`);
      return null;
    }

    if (!response.ok) {
      throw new Error(`Candid API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Cache the result (30-day TTL)
    await cacheRating('candid', ein, data);

    return data;
  } catch (error) {
    console.error(`Error fetching Candid seal for ${ein}:`, error);
    return null;
  }
}

/**
 * Transform Candid data to our rating format
 */
export function transformCandidSeal(data: CandidSeal) {
  return {
    seal_level: data.seal_level,
    transparency_level: data.transparency_level,
    profile_level: data.profile_level,
  };
}

/**
 * Get cached rating
 */
async function getCachedRating(provider: string, ein: string): Promise<any | null> {
  const adminClient = createAdminClient();

  // First find the charity by EIN
  const { data: charity } = await adminClient
    .from('charities')
    .select('id')
    .eq('ein', ein)
    .maybeSingle();

  if (!charity) return null;

  const { data: cache } = await adminClient
    .from('charity_rating_cache')
    .select('rating_data, expires_at')
    .eq('charity_id', charity.id)
    .eq('provider', provider)
    .maybeSingle();

  if (!cache) return null;

  // Check if expired
  if (new Date(cache.expires_at) < new Date()) {
    console.log(`[${provider}] Cache expired for ${ein}`);
    return null;
  }

  return cache.rating_data;
}

/**
 * Cache rating data
 */
async function cacheRating(provider: string, ein: string, ratingData: any): Promise<void> {
  const adminClient = createAdminClient();

  // First find the charity by EIN
  const { data: charity } = await adminClient
    .from('charities')
    .select('id')
    .eq('ein', ein)
    .maybeSingle();

  if (!charity) {
    console.warn(`Cannot cache rating for ${ein}: charity not found in database`);
    return;
  }

  // Calculate expiration (30 days from now)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  // Upsert cache entry
  await adminClient
    .from('charity_rating_cache')
    .upsert({
      charity_id: charity.id,
      provider,
      rating_data: ratingData,
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'charity_id,provider',
    });

  console.log(`[${provider}] Cached rating for ${ein} until ${expiresAt.toISOString()}`);
}
