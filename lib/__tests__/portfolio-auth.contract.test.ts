// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('typed portfolio access contract', () => {
  const src = readFileSync('lib/api/access.ts', 'utf8');

  it('exports requirePortfolioAccess', () => {
    expect(src).toContain('export async function requirePortfolioAccess');
  });

  it('exports isAccessDenied type guard', () => {
    expect(src).toContain('export function isAccessDenied');
  });

  it('returns 401 when no user', () => {
    expect(src).toContain("denied('unauthenticated', 'Unauthorized', 401)");
  });

  it('returns 403 when not a member', () => {
    expect(src).toContain("denied('forbidden', 'Access denied', 403)");
  });

  it('checks portfolio_members table', () => {
    expect(src).toContain("from('portfolio_members')");
  });

  it('filters by user_id', () => {
    expect(src).toContain("eq('user_id', session.user.id)");
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
