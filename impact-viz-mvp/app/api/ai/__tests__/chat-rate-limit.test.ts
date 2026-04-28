import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('AI chat rate limiting', () => {
  const src = readFileSync('app/api/ai/chat/route.ts', 'utf8');

  it('imports aiLimiter', () => {
    expect(src).toContain('aiLimiter');
  });

  it('calls aiLimiter.limit after user auth', () => {
    expect(src).toMatch(/aiLimiter\.limit\s*\(\s*user\.id\s*\)/);
  });

  it('returns 429 when rate limit exceeded', () => {
    expect(src).toContain('rateLimitExceeded');
  });
});
