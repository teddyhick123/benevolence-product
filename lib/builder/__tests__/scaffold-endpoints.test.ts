// @vitest-environment node
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

  it('checks implementation reviewer access before dispatching', () => {
    expect(src).toMatch(/canReviewImplementation/);
  });

  it('dispatches enqueueScaffoldBuildJob', () => {
    expect(src).toMatch(/enqueueScaffoldBuildJob/);
  });

  it('atomically claims the proposal with a compare-and-set before enqueueing', () => {
    expect(src).toMatch(/\.in\('phase', CLAIMABLE_PHASES\)/);
    expect(src).toMatch(/'plan_ready', 'needs_repair', 'failed'/);
    expect(src).toMatch(/alreadyRunning/);
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

  it('requires org admin access', () => {
    expect(src).toMatch(/is_org_admin/);
    expect(src).not.toMatch(/user_org_role/);
  });

  it('selects pr_url so applied proposals can show review links', () => {
    const selectIdx = src.indexOf('.select(');
    expect(src.slice(selectIdx, selectIdx + 300)).toMatch(/pr_url/);
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

  it('checks implementation reviewer access', () => {
    expect(src).toMatch(/canReviewImplementation/);
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

  it('records an open PR until the separate ship action completes deployment', () => {
    expect(src).toMatch(/phase:\s*['"]pr_opened['"]/);
    expect(src).toMatch(/status:\s*['"]approved['"]/);
  });

  it('emits proposal_applied builder_event', () => {
    expect(src).toMatch(/proposal_applied/);
    expect(src).toMatch(/builder_events/);
  });

  it('returns 503 when GitHub is not configured', () => {
    expect(src).toMatch(/503|GitHub integration not configured/);
  });

  it('fails when proposal_applied audit event is not recorded', () => {
    expect(src).toMatch(/if \(eventErr\)/);
    expect(src).toMatch(/error: eventErr\.message/);
    expect(src).not.toMatch(/Failed to emit builder proposal_applied event/);
  });
});
