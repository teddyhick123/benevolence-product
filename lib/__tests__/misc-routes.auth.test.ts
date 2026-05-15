import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const routes = [
  'app/api/portfolio/[id]/board-report/route.ts',
  'app/api/portfolio/[id]/kpi-series/route.ts',
  'app/api/portfolio/[id]/letter/route.ts',
  'app/api/portfolio/[id]/meta/route.ts',
  'app/api/portfolio/[id]/settings/route.ts',
  'app/api/portfolio/[id]/metrics/sector-aggregate/route.ts',
];

describe('misc portfolio routes auth contract', () => {
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
