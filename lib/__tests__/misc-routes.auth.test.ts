// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const routes = [
  'app/api/portfolio/[id]/board-report/route.ts',
  'app/api/portfolio/[id]/widgets/route.ts',
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

  for (const route of [
    'app/api/portfolio/[id]/widgets/route.ts',
    'app/api/portfolio/[id]/kpi-series/route.ts',
    'app/api/portfolio/[id]/meta/route.ts',
    'app/api/portfolio/[id]/settings/route.ts',
    'app/api/portfolio/[id]/map/route.ts',
  ]) {
    it(`${route} does not publicly cache portfolio-scoped data`, () => {
      const src = readFileSync(route, 'utf8');
      expect(src).toContain("'Cache-Control': 'no-store'");
      expect(src).not.toContain('s-maxage');
      expect(src).not.toContain('public,');
    });
  }
});
