import { NextResponse } from 'next/server';

/**
 * Create a 429 Too Many Requests response
 * @param reset - Timestamp when the rate limit resets
 * @param remaining - Number of requests remaining
 * @param limit - Total rate limit
 */
export function rateLimitExceeded(
  reset: number,
  remaining: number = 0,
  limit: number = 100
) {
  const retryAfter = Math.ceil((reset - Date.now()) / 1000);

  return NextResponse.json(
    {
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter,
    },
    {
      status: 429,
      headers: {
        'Retry-After': retryAfter.toString(),
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': reset.toString(),
      },
    }
  );
}

/**
 * Create a 401 Unauthorized response for endpoints requiring authentication
 */
export function authRequired() {
  return NextResponse.json(
    {
      error: 'Authentication required',
      message: 'This endpoint requires authentication.',
    },
    { status: 401 }
  );
}

/**
 * Create a 401 Unauthorized response specifically for AI endpoints
 */
export function aiAuthRequired() {
  return NextResponse.json(
    {
      error: 'Authentication required',
      message: 'AI features require authentication. Please sign in to continue.',
    },
    { status: 401 }
  );
}
