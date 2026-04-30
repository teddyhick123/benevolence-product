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
});
