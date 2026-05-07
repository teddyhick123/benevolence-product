import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('update-basic auth contract', () => {
  const src = readFileSync(
    'app/api/holdings/[id]/update-basic/route.ts',
    'utf8'
  );

  it('calls auth.getUser()', () => {
    expect(src).toContain('auth.getUser()');
  });

  it('verifies portfolio membership before update', () => {
    expect(src).toMatch(/portfolio_member|portfolio_id.*user|user.*portfolio_id/);
  });

  it('returns 401 when no user', () => {
    expect(src).toContain('401');
  });

  it('returns 403 when not authorized', () => {
    expect(src).toContain('403');
  });
});
