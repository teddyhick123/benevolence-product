/**
 * Charity Ratings Integration Service
 *
 * Integrates with Charity Navigator and Candid (GuideStar) APIs to provide
 * real-time financial health metrics, transparency ratings, and accreditation data.
 *
 * APIs:
 * - Charity Navigator: https://developer.charitynavigator.org/
 * - Candid/GuideStar: https://developer.candid.org/
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface CharityRatingsData {
  // Data source and freshness
  source: 'charity_navigator' | 'candid' | 'combined' | 'manual';
  lastUpdated: string;
  nextRefreshAfter: string; // ISO date when data should be refreshed

  // Charity Navigator data
  charityNavigator?: {
    rating: number; // 0-100 score or 0-4 stars (we'll normalize to 0-100)
    financialRating?: number;
    accountabilityRating?: number;
    overallScore?: number;
    encompassRating?: string; // e.g., "Give with Confidence"
    cause?: string;
    irsClassification?: string;
    advisories?: string[];
    dataUrl?: string;
  };

  // Candid/GuideStar data
  candid?: {
    sealLevel?: 'platinum' | 'gold' | 'silver' | 'bronze' | 'none';
    financials?: {
      revenue?: number;
      expenses?: number;
      assets?: number;
      programExpenseRatio?: number; // Percentage
      fundraisingExpenseRatio?: number;
      administrativeExpenseRatio?: number;
      workingCapitalRatio?: number;
    };
    mission?: string;
    website?: string;
    ein?: string;
    verified?: boolean;
    complianceStatus?: 'compliant' | 'not_compliant' | 'unknown';
  };

  // Combined metrics (computed from both sources)
  summary?: {
    overallHealthScore?: number; // 0-100 combined score
    financialHealthGrade?: 'A' | 'B' | 'C' | 'D' | 'F';
    transparencyLevel?: 'high' | 'medium' | 'low';
    recommendationConfidence?: 'high' | 'medium' | 'low'; // Based on data availability
    programExpenseRatio?: number;
  };

  // Errors/warnings
  errors?: string[];
  warnings?: string[];
}

export interface CharityLookupParams {
  ein?: string;
  name?: string;
  forceRefresh?: boolean; // Skip cache
}

// ============================================================================
// Configuration
// ============================================================================

const RATINGS_CONFIG = {
  // How long to cache ratings before auto-refresh (30 days)
  CACHE_DURATION_MS: 30 * 24 * 60 * 60 * 1000,

  // API endpoints
  CHARITY_NAVIGATOR_API: 'https://api.data.charitynavigator.org/v2',
  CANDID_API: 'https://api.candid.org/v1',

  // Fallback to use when APIs are unavailable
  USE_MOCK_DATA: process.env.NODE_ENV === 'development' && !process.env.CHARITY_NAVIGATOR_API_KEY,
};

// ============================================================================
// Charity Navigator Integration
// ============================================================================

async function fetchCharityNavigatorRating(ein: string): Promise<CharityRatingsData['charityNavigator'] | null> {
  const apiKey = process.env.CHARITY_NAVIGATOR_API_KEY;

  if (!apiKey) {
    console.warn('Charity Navigator API key not configured');
    return null;
  }

  try {
    // Remove hyphen from EIN for API
    const cleanEin = ein.replace(/-/g, '');

    const response = await fetch(
      `${RATINGS_CONFIG.CHARITY_NAVIGATOR_API}/Organizations?ein=${cleanEin}`,
      {
        headers: {
          'Subscription-Key': apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`Charity Navigator: No data found for EIN ${ein}`);
        return null;
      }
      throw new Error(`Charity Navigator API error: ${response.status}`);
    }

    const data = await response.json();

    // Transform API response to our format
    // Note: Actual API structure may vary, adjust based on real API response
    return {
      rating: data.currentRating?.score || data.rating || 0,
      financialRating: data.currentRating?.financialRating?.score,
      accountabilityRating: data.currentRating?.accountabilityRating?.score,
      overallScore: data.currentRating?.overallScore,
      encompassRating: data.encompassRating,
      cause: data.cause?.causeName,
      irsClassification: data.irsClassification?.subsection,
      advisories: data.advisories?.map((a: any) => a.text),
      dataUrl: `https://www.charitynavigator.org/ein/${cleanEin}`,
    };
  } catch (error: any) {
    console.error('Charity Navigator API error:', error);
    return null;
  }
}

// ============================================================================
// Candid/GuideStar Integration
// ============================================================================

async function fetchCandidData(ein: string): Promise<CharityRatingsData['candid'] | null> {
  const apiKey = process.env.CANDID_API_KEY;

  if (!apiKey) {
    console.warn('Candid API key not configured');
    return null;
  }

  try {
    // Remove hyphen from EIN for API
    const cleanEin = ein.replace(/-/g, '');

    const response = await fetch(
      `${RATINGS_CONFIG.CANDID_API}/essentials/${cleanEin}`,
      {
        headers: {
          'Subscription-Key': apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`Candid: No data found for EIN ${ein}`);
        return null;
      }
      throw new Error(`Candid API error: ${response.status}`);
    }

    const data = await response.json();

    // Transform API response to our format
    // Note: Actual API structure may vary, adjust based on real API response
    return {
      sealLevel: data.seal_level?.toLowerCase() as any,
      financials: {
        revenue: data.financials?.revenue,
        expenses: data.financials?.expenses,
        assets: data.financials?.assets,
        programExpenseRatio: data.financials?.program_expense_ratio,
        fundraisingExpenseRatio: data.financials?.fundraising_expense_ratio,
        administrativeExpenseRatio: data.financials?.administrative_expense_ratio,
        workingCapitalRatio: data.financials?.working_capital_ratio,
      },
      mission: data.mission,
      website: data.website,
      ein: data.ein,
      verified: data.verified,
      complianceStatus: data.compliance_status,
    };
  } catch (error: any) {
    console.error('Candid API error:', error);
    return null;
  }
}

// ============================================================================
// Mock Data (Development/Testing)
// ============================================================================

function getMockRatingsData(ein: string): CharityRatingsData {
  // Generate semi-realistic mock data for development
  const hash = ein.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const rating = 60 + (hash % 40); // 60-100 range

  return {
    source: 'manual',
    lastUpdated: new Date().toISOString(),
    nextRefreshAfter: new Date(Date.now() + RATINGS_CONFIG.CACHE_DURATION_MS).toISOString(),

    charityNavigator: {
      rating: rating,
      financialRating: 65 + (hash % 35),
      accountabilityRating: 70 + (hash % 30),
      overallScore: rating,
      encompassRating: rating > 80 ? 'Give with Confidence' : 'Need More Information',
      cause: 'Human Services',
      irsClassification: '501(c)(3) Public Charity',
      dataUrl: `https://www.charitynavigator.org/ein/${ein.replace(/-/g, '')}`,
    },

    candid: {
      sealLevel: rating > 90 ? 'platinum' : rating > 75 ? 'gold' : rating > 60 ? 'silver' : 'bronze',
      financials: {
        revenue: 1000000 + (hash * 10000),
        expenses: 950000 + (hash * 9000),
        programExpenseRatio: 75 + (hash % 15),
        fundraisingExpenseRatio: 10 + (hash % 5),
        administrativeExpenseRatio: 10 + (hash % 5),
      },
      verified: true,
      complianceStatus: 'compliant',
    },

    summary: {
      overallHealthScore: rating,
      financialHealthGrade: rating > 90 ? 'A' : rating > 80 ? 'B' : rating > 70 ? 'C' : rating > 60 ? 'D' : 'F',
      transparencyLevel: rating > 80 ? 'high' : rating > 60 ? 'medium' : 'low',
      recommendationConfidence: 'medium',
      programExpenseRatio: 75 + (hash % 15),
    },

    warnings: [
      'Using mock data - configure CHARITY_NAVIGATOR_API_KEY and CANDID_API_KEY for live data',
    ],
  };
}

// ============================================================================
// Main Service Functions
// ============================================================================

/**
 * Compute summary metrics from combined data sources
 */
function computeSummary(
  charityNav?: CharityRatingsData['charityNavigator'],
  candid?: CharityRatingsData['candid']
): CharityRatingsData['summary'] {
  const summary: CharityRatingsData['summary'] = {};

  // Overall health score (combine both sources)
  let scoreCount = 0;
  let scoreSum = 0;

  if (charityNav?.overallScore) {
    scoreSum += charityNav.overallScore;
    scoreCount++;
  }

  if (candid?.sealLevel) {
    const sealScore = {
      platinum: 95,
      gold: 85,
      silver: 75,
      bronze: 65,
      none: 50,
    }[candid.sealLevel];
    scoreSum += sealScore;
    scoreCount++;
  }

  if (scoreCount > 0) {
    summary.overallHealthScore = Math.round(scoreSum / scoreCount);

    const score = summary.overallHealthScore;
    summary.financialHealthGrade =
      score >= 90 ? 'A' :
      score >= 80 ? 'B' :
      score >= 70 ? 'C' :
      score >= 60 ? 'D' : 'F';
  }

  // Transparency level
  const hasCharityNav = !!charityNav?.rating;
  const hasCandid = !!candid?.sealLevel;
  const hasFinancials = !!candid?.financials?.programExpenseRatio;

  if (hasCharityNav && hasCandid && hasFinancials) {
    summary.transparencyLevel = 'high';
    summary.recommendationConfidence = 'high';
  } else if (hasCharityNav || hasCandid) {
    summary.transparencyLevel = 'medium';
    summary.recommendationConfidence = 'medium';
  } else {
    summary.transparencyLevel = 'low';
    summary.recommendationConfidence = 'low';
  }

  // Program expense ratio (prefer Candid, fallback to Charity Navigator)
  summary.programExpenseRatio =
    candid?.financials?.programExpenseRatio ||
    charityNav?.financialRating;

  return summary;
}

/**
 * Fetch charity ratings from all available sources
 */
export async function fetchCharityRatings(
  params: CharityLookupParams
): Promise<CharityRatingsData> {
  const { ein, name } = params;

  if (!ein) {
    return {
      source: 'manual',
      lastUpdated: new Date().toISOString(),
      nextRefreshAfter: new Date(Date.now() + RATINGS_CONFIG.CACHE_DURATION_MS).toISOString(),
      errors: ['EIN required for charity ratings lookup'],
    };
  }

  // If in development without API keys, use mock data
  if (RATINGS_CONFIG.USE_MOCK_DATA) {
    console.log('Using mock charity ratings data (configure API keys for live data)');
    return getMockRatingsData(ein);
  }

  // Fetch from both sources in parallel
  const [charityNavData, candidData] = await Promise.all([
    fetchCharityNavigatorRating(ein),
    fetchCandidData(ein),
  ]);

  const errors: string[] = [];
  const warnings: string[] = [];

  // Determine data source
  let source: CharityRatingsData['source'] = 'manual';
  if (charityNavData && candidData) {
    source = 'combined';
  } else if (charityNavData) {
    source = 'charity_navigator';
    warnings.push('Candid data unavailable - using Charity Navigator only');
  } else if (candidData) {
    source = 'candid';
    warnings.push('Charity Navigator data unavailable - using Candid only');
  } else {
    errors.push('Unable to fetch data from any charity rating service');
  }

  // Compute summary metrics
  const summary = computeSummary(charityNavData || undefined, candidData || undefined);

  return {
    source,
    lastUpdated: new Date().toISOString(),
    nextRefreshAfter: new Date(Date.now() + RATINGS_CONFIG.CACHE_DURATION_MS).toISOString(),
    charityNavigator: charityNavData || undefined,
    candid: candidData || undefined,
    summary,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Check if cached ratings data is stale and needs refresh
 */
export function shouldRefreshRatings(lastUpdated: string, nextRefreshAfter?: string): boolean {
  if (nextRefreshAfter) {
    return new Date(nextRefreshAfter) < new Date();
  }

  // Fallback: refresh if older than 30 days
  const lastUpdateDate = new Date(lastUpdated);
  const daysSinceUpdate = (Date.now() - lastUpdateDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceUpdate > 30;
}

/**
 * Batch fetch ratings for multiple organizations
 */
export async function fetchCharityRatingsBatch(
  eins: string[]
): Promise<Record<string, CharityRatingsData>> {
  const results: Record<string, CharityRatingsData> = {};

  // Fetch in parallel (with rate limiting if needed)
  const promises = eins.map(async (ein) => {
    const data = await fetchCharityRatings({ ein });
    results[ein] = data;
  });

  await Promise.all(promises);

  return results;
}

/**
 * Helper: Format rating for display
 */
export function formatRating(rating?: number, maxValue: number = 100): string {
  if (!rating) return 'N/A';

  if (maxValue === 4) {
    // Stars format
    return `${rating.toFixed(1)} / 4 ★`;
  }

  // Percentage format
  return `${Math.round(rating)}%`;
}

/**
 * Helper: Get rating color class
 */
export function getRatingColorClass(score?: number): string {
  if (!score) return 'text-neutral-500';

  if (score >= 90) return 'text-emerald-600';
  if (score >= 80) return 'text-green-600';
  if (score >= 70) return 'text-yellow-600';
  if (score >= 60) return 'text-orange-600';
  return 'text-red-600';
}

/**
 * Helper: Get seal badge properties
 */
export function getSealBadge(sealLevel?: string): { color: string; label: string } {
  switch (sealLevel) {
    case 'platinum':
      return { color: 'bg-purple-100 text-purple-700 border-purple-300', label: 'Platinum Seal' };
    case 'gold':
      return { color: 'bg-yellow-100 text-yellow-700 border-yellow-300', label: 'Gold Seal' };
    case 'silver':
      return { color: 'bg-neutral-100 text-neutral-700 border-neutral-300', label: 'Silver Seal' };
    case 'bronze':
      return { color: 'bg-orange-100 text-orange-700 border-orange-300', label: 'Bronze Seal' };
    default:
      return { color: 'bg-neutral-100 text-neutral-500 border-neutral-200', label: 'Not Rated' };
  }
}
