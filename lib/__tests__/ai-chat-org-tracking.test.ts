import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('AI chat per-org usage counter', () => {
  const src = readFileSync('app/api/ai/chat/route.ts', 'utf8');

  it('imports Redis from @upstash/redis', () => {
    expect(src).toMatch(/from ['"]@upstash\/redis['"]/);
  });

  it('increments a usage counter keyed by orgId', () => {
    expect(src).toMatch(/usage:ai.*orgId|orgId.*usage:ai/);
  });

  it('counter is fire-and-forget (catch swallows errors)', () => {
    expect(src).toMatch(/\.incr\(.*\).*\.catch|catch.*\.incr/s);
  });
});
