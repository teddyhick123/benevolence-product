import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

type RateLimitResult = {
  success: boolean;
  reset: number;
  remaining: number;
  limit: number;
};

type RateLimiter = {
  limit(identifier: string): Promise<RateLimitResult>;
};

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

function createLimiter(limit: number, window: Parameters<typeof Ratelimit.slidingWindow>[1], prefix: string): RateLimiter {
  if (!redis) {
    return {
      async limit() {
        return { success: true, reset: 0, remaining: limit, limit };
      },
    };
  }

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window),
    analytics: true,
    prefix,
  });
}

// Rate limiter for anonymous API requests (general protection)
// 100 requests per hour for unauthenticated users
export const anonymousLimiter = createLimiter(100, '1h', 'ratelimit:anonymous');

// Rate limiter for authentication endpoints (brute force protection)
// 10 attempts per 15 minutes
export const authLimiter = createLimiter(10, '15m', 'ratelimit:auth');

// Rate limiter for AI endpoints — keyed per user ID, not IP
// Prevents runaway API spend from a single user/org
// 30 requests per hour for expensive AI provider routes
export const aiLimiter = createLimiter(30, '1h', 'ratelimit:ai');

// Rate limiter for charity search — keyed per IP
// 120 requests per minute protects the 2M-row charities table from scraping
export const charitiesLimiter = createLimiter(120, '1m', 'ratelimit:charities');

// Rate limiter for public CPA share links — keyed per IP
// 20 requests per minute reduces token enumeration risk
export const cpaPortalLimiter = createLimiter(20, '1m', 'ratelimit:cpa-portal');

/**
 * Extract IP address from request headers
 * Checks x-forwarded-for (Vercel), x-real-ip, and falls back to 'unknown'
 */
export function getIP(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for can be a comma-separated list, take the first one
    return forwarded.split(',')[0].trim();
  }

  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  return 'unknown';
}

/**
 * Check rate limit and return result
 * @param limiter - The rate limiter to use
 * @param identifier - Unique identifier (IP, user ID, etc.)
 * @returns Object with success status and reset timestamp
 */
export async function checkRateLimit(
  limiter: RateLimiter,
  identifier: string
): Promise<{ success: boolean; reset: number; remaining: number; limit: number }> {
  const { success, reset, remaining, limit } = await limiter.limit(identifier);

  return {
    success,
    reset,
    remaining,
    limit,
  };
}
