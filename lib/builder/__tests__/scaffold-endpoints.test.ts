// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('build trigger endpoint', () => {
  const src = readFileSync(
    'app/api/org/[orgId]/builder/proposals/[proposalId]/build/route.ts',
    'utf8'
  );
  const repositorySrc = readFileSync('lib/api/repositories/builder.ts', 'utf8');

  it('exports a POST handler', () => {
    expect(src).toMatch(/export async function POST/);
  });

  it('checks implementation reviewer access before dispatching', () => {
    expect(src).toMatch(/canReviewImplementation/);
  });

  it('dispatches enqueueScaffoldBuildJob', () => {
    expect(repositorySrc).toMatch(/enqueueScaffoldBuildJob/);
  });

  it('atomically claims the proposal via the builder_claim_code_run RPC before enqueueing', () => {
    expect(repositorySrc).toMatch(/claimCodeRun\(/);
    expect(repositorySrc).toMatch(/IN_FLIGHT_STATES/);
    expect(repositorySrc).toMatch(/alreadyRunning/);
  });
});

describe('proposal GET endpoint', () => {
  const src = readFileSync(
    'app/api/org/[orgId]/builder/proposals/[proposalId]/route.ts',
    'utf8'
  );
  const repositorySrc = readFileSync('lib/api/repositories/builder-reads.ts', 'utf8');

  it('exports a GET handler', () => {
    expect(src).toMatch(/export async function GET/);
  });

  it('requires org admin access', () => {
    expect(src).toMatch(/requireOrgAccess\(orgId, 'admin'\)/);
    expect(src).not.toMatch(/createAdminClient/);
  });

  it('surfaces pr_url via builder_delivery_records, not a proposal column (that column was dropped)', () => {
    expect(repositorySrc).toMatch(/builder_delivery_records/);
    expect(repositorySrc).toMatch(/pr_url/);
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

  it('records provider facts in a builder_delivery_records row', () => {
    expect(src).toMatch(/builder_delivery_records/);
    expect(src).toMatch(/pr_url/);
    expect(src).toMatch(/status:\s*['"]pr_open['"]/);
  });

  it('transitions to pr_opened via the state service and never writes a status/pr_url column on the proposal', () => {
    expect(src).toMatch(/transitionProposal/);
    expect(src).toMatch(/to:\s*['"]pr_opened['"]/);
    // The deleted phase/status columns must not be written on builder_proposals.
    expect(src).not.toMatch(/phase:\s*['"]pr_opened['"]/);
    expect(src).not.toMatch(/status:\s*['"]approved['"]/);
  });

  it('emits proposal_applied builder_event', () => {
    expect(src).toMatch(/proposal_applied/);
    expect(src).toMatch(/builder_events/);
  });

  it('returns 503 when GitHub is not configured', () => {
    expect(src).toMatch(/503|GitHub integration not configured/);
  });

  it('enforces the path policy and review gate before GitHub', () => {
    expect(src).toMatch(/evaluatePathPolicy/);
    expect(src).toMatch(/evaluateAttemptGate/);
    expect(src).toMatch(/422/);
  });

  it('fails when proposal_applied audit event is not recorded', () => {
    expect(src).toMatch(/if \(eventErr\)/);
    expect(src).toMatch(/error: eventErr\.message/);
    expect(src).not.toMatch(/Failed to emit builder proposal_applied event/);
  });
});
