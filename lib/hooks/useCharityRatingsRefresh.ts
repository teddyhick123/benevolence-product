import { apiRequest } from "@/lib/api/client";
import { useEffect, useRef } from 'react';
import { shouldRefreshRatings } from '@/lib/services/charity-ratings';

/**
 * Hook to automatically refresh stale charity ratings in the background
 *
 * This hook checks recommendations for stale ratings data and triggers
 * a background refresh when needed. It respects rate limits and avoids
 * overwhelming the API.
 *
 * Usage:
 * ```tsx
 * const { refreshStaleRatings, isRefreshing } = useCharityRatingsRefresh(recommendations);
 *
 * useEffect(() => {
 *   refreshStaleRatings();
 * }, [recommendations]);
 * ```
 */

type Recommendation = {
  id: string;
  ein: string | null;
  accreditation?: {
    ratings?: {
      lastUpdated: string;
      nextRefreshAfter?: string;
    };
  };
};

export function useCharityRatingsRefresh(recommendations: Recommendation[]) {
  const refreshingRef = useRef<Set<string>>(new Set());
  const lastRefreshTimeRef = useRef<number>(0);

  const RATE_LIMIT_MS = 2000; // Minimum 2 seconds between API calls
  const MAX_CONCURRENT = 3; // Max concurrent refresh requests

  /**
   * Check if a recommendation has stale ratings
   */
  const hasStaleRatings = (rec: Recommendation): boolean => {
    if (!rec.ein) return false;

    const ratings = rec.accreditation?.ratings;
    if (!ratings) return true; // No ratings = needs fetch

    return shouldRefreshRatings(
      ratings.lastUpdated,
      ratings.nextRefreshAfter
    );
  };

  /**
   * Refresh ratings for a single recommendation
   */
  const refreshRatings = async (recommendationId: string): Promise<boolean> => {
    // Check if already refreshing
    if (refreshingRef.current.has(recommendationId)) {
      return false;
    }

    // Check rate limit
    const now = Date.now();
    if (now - lastRefreshTimeRef.current < RATE_LIMIT_MS) {
      return false;
    }

    try {
      refreshingRef.current.add(recommendationId);
      lastRefreshTimeRef.current = now;

      const res = await apiRequest(
        `/api/recommendations/${recommendationId}/ratings?forceRefresh=true`,
        {
          method: 'GET',
        }
      );

      if (!res.ok) {
        console.error(`Failed to refresh ratings for ${recommendationId}`);
        return false;
      }

      console.log(`Successfully refreshed ratings for ${recommendationId}`);
      return true;
    } catch (error) {
      console.error('Error refreshing ratings:', error);
      return false;
    } finally {
      refreshingRef.current.delete(recommendationId);
    }
  };

  /**
   * Refresh all stale ratings with rate limiting
   */
  const refreshStaleRatings = async () => {
    const staleRecommendations = recommendations.filter(hasStaleRatings);

    if (staleRecommendations.length === 0) {
      return;
    }

    console.log(`Found ${staleRecommendations.length} recommendations with stale ratings`);

    // Refresh in batches to respect rate limits
    for (let i = 0; i < staleRecommendations.length; i += MAX_CONCURRENT) {
      const batch = staleRecommendations.slice(i, i + MAX_CONCURRENT);

      await Promise.all(
        batch.map((rec) => refreshRatings(rec.id))
      );

      // Wait before next batch
      if (i + MAX_CONCURRENT < staleRecommendations.length) {
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));
      }
    }
  };

  /**
   * Refresh ratings for specific recommendation IDs
   */
  const refreshSpecific = async (recommendationIds: string[]) => {
    for (let i = 0; i < recommendationIds.length; i += MAX_CONCURRENT) {
      const batch = recommendationIds.slice(i, i + MAX_CONCURRENT);

      await Promise.all(
        batch.map((id) => refreshRatings(id))
      );

      // Wait before next batch
      if (i + MAX_CONCURRENT < recommendationIds.length) {
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));
      }
    }
  };

  return {
    refreshStaleRatings,
    refreshSpecific,
    hasStaleRatings,
    isRefreshing: (id: string) => refreshingRef.current.has(id),
    staleCount: recommendations.filter(hasStaleRatings).length,
  };
}

/**
 * Hook to auto-refresh stale ratings on mount (optional behavior)
 *
 * Usage:
 * ```tsx
 * useAutoRefreshRatings(recommendations, { enabled: true });
 * ```
 */
export function useAutoRefreshRatings(
  recommendations: Recommendation[],
  options: {
    enabled?: boolean;
    onMount?: boolean;
    interval?: number; // Auto-refresh interval in ms (default: disabled)
  } = {}
) {
  const { enabled = true, onMount = true, interval } = options;
  const { refreshStaleRatings, staleCount } = useCharityRatingsRefresh(recommendations);
  const hasRefreshedRef = useRef(false);

  // Auto-refresh on mount
  useEffect(() => {
    if (!enabled || !onMount || hasRefreshedRef.current) return;

    if (staleCount > 0) {
      console.log(`Auto-refreshing ${staleCount} stale charity ratings`);
      refreshStaleRatings();
      hasRefreshedRef.current = true;
    }
  }, [enabled, onMount, staleCount]);

  // Auto-refresh on interval
  useEffect(() => {
    if (!enabled || !interval) return;

    const timer = setInterval(() => {
      if (staleCount > 0) {
        console.log(`Interval refresh: ${staleCount} stale ratings`);
        refreshStaleRatings();
      }
    }, interval);

    return () => clearInterval(timer);
  }, [enabled, interval, staleCount]);

  return {
    refreshStaleRatings,
    staleCount,
  };
}
