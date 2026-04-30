import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const routes = [
  'app/api/portfolio/[id]/bubble-chart/route.ts',
  'app/api/portfolio/[id]/waterfall/route.ts',
  'app/api/portfolio/[id]/comparison-table/route.ts',
  'app/api/portfolio/[id]/heat-map/route.ts',
  'app/api/portfolio/[id]/timeline/route.ts',
  'app/api/portfolio/[id]/metric-comparison/route.ts',
];

describe('visualization routes auth contract', () => {
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
