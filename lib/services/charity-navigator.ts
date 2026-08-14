/**
 * Charity Navigator API Client
 *
 * Official API for charity ratings and evaluations
 * API Docs: https://www.charitynavigator.org/index.cfm?bay=content.view&cpid=1397
 *
 * Requires API key: Apply at https://www.charitynavigator.org/index.cfm?bay=content.view&cpid=1397
 * Rate Limit: 10,000 requests/month
 */

import { createElevatedClient } from '@/lib/api/admin-client';

const CHARITY_NAVIGATOR_API_KEY = process.env.CHARITY_NAVIGATOR_API_KEY;
const CHARITY_NAVIGATOR_BASE_URL = 'https://api.data.charitynavigator.org/v2';

export interface CharityNavigatorRating {
  ein: string;
  charityName: string;
  currentRating?: {
    score: number;  // 0-100
    rating: number; // 0-4 stars
    ratingImage?: string;
    financialRating?: {
      score: number;
      rating: number;
    };
    accountabilityRating?: {
      score: number;
      rating: number;
    };
  };
  irsClassification?: {
    deductibility: string;
    subsection: string;
    nteeType: string;
  };
  mailingAddress?: {
    streetAddress1?: string;
    city?: string;
    stateOrProvince?: string;
    postalCode?: string;
  };
  websiteURL?: string;
  mission?: string;
  categoryName?: string;
}

/**
 * Get rating for a charity by EIN
 */
export async function getCharityNavigatorRating(ein: string): Promise<CharityNavigatorRating | null> {
  if (!CHARITY_NAVIGATOR_API_KEY) {
    console.warn('Charity Navigator API key not configured');
    return null;
  }

  try {
    // Check cache first (30-day TTL)
    const cached = await getCachedRating('charity_navigator', ein);
    if (cached) {
      console.log(`[Charity Navigator] Cache hit for ${ein}`);
      return cached;
    }

    console.log(`[Charity Navigator] Fetching rating for ${ein}`);

    // Fetch from API
    const response = await fetch(
      `${CHARITY_NAVIGATOR_BASE_URL}/Organizations?ein=${ein}`,
      {
        headers: {
          'Subscription-Key': CHARITY_NAVIGATOR_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.status === 404) {
      console.log(`[Charity Navigator] Organization ${ein} not found`);
      return null;
    }

    if (!response.ok) {
      throw new Error(`Charity Navigator API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Cache the result (30-day TTL)
    await cacheRating('charity_navigator', ein, data);

    return data;
  } catch (error) {
    console.error(`Error fetching Charity Navigator rating for ${ein}:`, error);
    return null;
  }
}

/**
 * Transform Charity Navigator data to our rating format
 */
export function transformCharityNavigatorRating(data: CharityNavigatorRating) {
  return {
    score: data.currentRating?.score,
    rating: convertScoreToGrade(data.currentRating?.score),
    financial_score: data.currentRating?.financialRating?.score,
    accountability_score: data.currentRating?.accountabilityRating?.score,
    stars: data.currentRating?.rating,
    category: data.categoryName,
    mission: data.mission,
  };
}

/**
 * Convert numerical score to letter grade
 */
function convertScoreToGrade(score?: number): string | undefined {
  if (!score) return undefined;
  if (score >= 90) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 80) return 'A-';
  if (score >= 75) return 'B+';
  if (score >= 70) return 'B';
  if (score >= 65) return 'B-';
  if (score >= 60) return 'C+';
  if (score >= 55) return 'C';
  if (score >= 50) return 'C-';
  return 'D';
}

/**
 * Get cached rating
 */
async function getCachedRating(provider: string, ein: string): Promise<any | null> {
  const adminClient = createElevatedClient();

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
  const adminClient = createElevatedClient();

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
