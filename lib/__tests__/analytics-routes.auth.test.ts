import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const routes = [
  'app/api/portfolio/[id]/analytics/projections/route.ts',
  'app/api/portfolio/[id]/analytics/benchmarks/route.ts',
  'app/api/portfolio/[id]/analytics/risk/route.ts',
  'app/api/portfolio/[id]/analytics/insights/route.ts',
];

describe('analytics routes auth contract', () => {
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
