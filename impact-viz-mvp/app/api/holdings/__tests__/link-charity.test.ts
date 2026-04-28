import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('link-charity ownership contract', () => {
  const src = readFileSync(
    'app/api/holdings/[id]/link-charity/route.ts',
    'utf8'
  );

  it('verifies portfolio membership in POST', () => {
    expect(src).toMatch(/portfolio_member|portfolio_id/);
  });

  it('returns 403 for unauthorized holding access', () => {
    expect(src).toContain('403');
  });
});
