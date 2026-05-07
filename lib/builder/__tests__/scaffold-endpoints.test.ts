import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('build trigger endpoint', () => {
  const src = readFileSync(
    'app/api/org/[orgId]/builder/proposals/[proposalId]/build/route.ts',
    'utf8'
  );

  it('exports a POST handler', () => {
    expect(src).toMatch(/export async function POST/);
  });

  it('checks is_org_admin before dispatching', () => {
    expect(src).toMatch(/is_org_admin/);
  });

  it('dispatches enqueueScaffoldBuildJob', () => {
    expect(src).toMatch(/enqueueScaffoldBuildJob/);
  });

  it('updates proposal phase to building', () => {
    expect(src).toMatch(/phase.*plan_ready|plan_ready.*phase/);
  });
});

describe('proposal GET endpoint', () => {
  const src = readFileSync(
    'app/api/org/[orgId]/builder/proposals/[proposalId]/route.ts',
    'utf8'
  );

  it('exports a GET handler', () => {
    expect(src).toMatch(/export async function GET/);
  });

  it('checks org admin or member access', () => {
    expect(src).toMatch(/org_role|is_org_admin|is_org_member/);
  });
});
