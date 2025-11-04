import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Initialize Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Rate limiter for anonymous API requests (general protection)
// 100 requests per hour for unauthenticated users
export const anonymousLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '1h'),
  analytics: true,
  prefix: 'ratelimit:anonymous',
});

// Rate limiter for authentication endpoints (brute force protection)
// 10 attempts per 15 minutes
export const authLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '15m'),
  analytics: true,
  prefix: 'ratelimit:auth',
});

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
  limiter: Ratelimit,
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
