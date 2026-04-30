import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const routes = [
  'app/api/portfolio/[id]/tax/form8283/route.ts',
  'app/api/portfolio/[id]/tax/export/route.ts',
  'app/api/portfolio/[id]/tax/overview/route.ts',
  'app/api/portfolio/[id]/tax/summary/route.ts',
];

describe('tax routes auth contract', () => {
  for (const route of routes) {
    it(`${route} imports requirePortfolioAccess`, () => {
      const src = readFileSync(route, 'utf8');
      expect(src).toContain('requirePortfolioAccess');
    });

    it(`${route} calls isAccessDenied`, () => {
      const src = readFileSync(route, 'utf8');
      expect(src).toContain('isAccessDenied');
    });
  }
});
