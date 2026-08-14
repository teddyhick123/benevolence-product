import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function source(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('Phase 4 thin-page boundaries', () => {
  it('keeps every App Router page at or below the Phase 4 line budget', () => {
    const oversized: Array<{ file: string; lines: number }> = [];

    const visit = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(absolute);
        else if (entry.name === 'page.tsx') {
          const lines = fs.readFileSync(absolute, 'utf8').split('\n').length;
          if (lines > 300) oversized.push({ file: path.relative(root, absolute), lines });
        }
      }
    };

    visit(path.join(root, 'app'));
    expect(oversized).toEqual([]);
  });

  it('keeps the holdings route free of direct persistence after the pilot extraction', () => {
    const page = source('app/dashboard/holdings/[holdingId]/page.tsx');
    const screen = source('components/holdings/detail/HoldingDetailPage.tsx');

    expect(page).toContain("@/components/holdings/detail/HoldingDetailPage");
    expect(screen).toContain("from '@/lib/holdings/detail/queries'");
    expect(screen).toContain("from '@/lib/holdings/detail/actions'");
    expect(screen).not.toContain(".from('");
    expect(screen).not.toContain('createSupabaseServerClient');
    expect(screen).not.toContain("'use server'");
  });

  it('does not update grant lifecycle stages from route pages or components', () => {
    const roots = ['app/dashboard/grants', 'components/grants'];
    const offenders: string[] = [];

    const visit = (directory: string) => {
      if (!fs.existsSync(directory)) return;
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(absolute);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          const contents = fs.readFileSync(absolute, 'utf8');
          if (/\.update\s*\(\s*\{[^}]*lifecycle_stage/s.test(contents)) {
            offenders.push(path.relative(root, absolute));
          }
        }
      }
    };

    roots.forEach((directory) => visit(path.join(root, directory)));
    expect(offenders).toEqual([]);
  });

  it('keeps grant lifecycle writes behind the canonical service', () => {
    const transitionRoute = source('app/api/org/[orgId]/grants/[grantId]/transition/route.ts');
    const bulkRoute = source('app/api/org/[orgId]/grants/bulk-transition/route.ts');

    expect(transitionRoute).toContain('transitionGrant(');
    expect(bulkRoute).toContain('transitionGrantBatch(');
    expect(transitionRoute).not.toContain('transitionLifecycle(');
    expect(bulkRoute).not.toContain('repository.transitionLifecycleBatch');
  });

  it('keeps settings and donor legacy URLs as thin canonical adapters', () => {
    const dashboardAi = source('app/dashboard/settings/ai/page.tsx');
    const dashboardIntegrations = source('app/dashboard/settings/integrations/page.tsx');
    const orgSettings = source('app/org/[orgId]/settings/page.tsx');
    const orgDonors = source('app/org/[orgId]/donors/page.tsx');
    const orgDonorDetail = source('app/org/[orgId]/donors/[donorId]/page.tsx');
    const orgNewDonor = source('app/org/[orgId]/donors/new/page.tsx');

    expect(dashboardAi).toContain("redirect('/settings/ai')");
    expect(dashboardIntegrations).toContain('/settings/integrations');
    expect(orgSettings).toContain('/settings/organization?org=');
    expect(orgDonors).toContain('/dashboard/donors?org=');
    expect(orgDonorDetail).toContain('/dashboard/donors/${encodeURIComponent(donorId)}?org=');
    expect(orgNewDonor).toContain('/dashboard/donors/new?org=');
  });
});
