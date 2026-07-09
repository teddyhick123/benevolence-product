// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('portfolio-auth helper contract', () => {
  const src = readFileSync('lib/portfolio-auth.ts', 'utf8');

  it('exports requirePortfolioAccess', () => {
    expect(src).toContain('export async function requirePortfolioAccess');
  });

  it('exports isAccessDenied type guard', () => {
    expect(src).toContain('export function isAccessDenied');
  });

  it('returns 401 when no user', () => {
    expect(src).toContain('status: 401');
  });

  it('returns 403 when not a member', () => {
    expect(src).toContain('status: 403');
  });

  it('checks portfolio_members table', () => {
    expect(src).toContain("from('portfolio_members')");
  });

  it('filters by user_id', () => {
    expect(src).toContain("eq('user_id', user.id)");
  });

  it('filters out soft-deleted portfolio memberships', () => {
    expect(src).toContain(".is('deleted_at', null)");
  });

  it('requires an active accepted organization membership for the portfolio org', () => {
    expect(src).toContain('portfolios!inner(org_id)');
    expect(src).toContain("from('organization_members')");
    expect(src).toContain("eq('org_id', orgId)");
    expect(src).toContain(".not('accepted_at', 'is', null)");
  });
});
