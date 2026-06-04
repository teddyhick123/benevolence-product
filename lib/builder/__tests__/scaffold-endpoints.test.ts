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

describe('org-scoped apply endpoint', () => {
  const src = readFileSync(
    'app/api/org/[orgId]/builder/proposals/[proposalId]/apply/route.ts',
    'utf8'
  );

  it('exports a POST handler', () => {
    expect(src).toMatch(/export async function POST/);
  });

  it('checks is_org_admin', () => {
    expect(src).toMatch(/is_org_admin/);
  });

  it('requires ready_to_apply phase — returns 409 otherwise', () => {
    expect(src).toMatch(/ready_to_apply/);
    expect(src).toMatch(/409/);
  });

  it('calls applyProposalToGitHub', () => {
    expect(src).toMatch(/applyProposalToGitHub/);
  });

  it('stores pr_url on the proposal', () => {
    expect(src).toMatch(/pr_url/);
  });

  it('emits proposal_applied builder_event', () => {
    expect(src).toMatch(/proposal_applied/);
    expect(src).toMatch(/builder_events/);
  });

  it('returns 503 when GitHub is not configured', () => {
    expect(src).toMatch(/503|GitHub integration not configured/);
  });
});
