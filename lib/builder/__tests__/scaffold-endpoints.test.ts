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
  const repositorySrc = readFileSync('lib/api/repositories/builder-apply.ts', 'utf8');

  it('exports a POST handler', () => {
    expect(src).toMatch(/export async function POST/);
  });

  it('checks implementation reviewer access', () => {
    expect(src).toMatch(/canReviewImplementation/);
  });

  it('requires ready_to_apply phase — returns 409 otherwise', () => {
    expect(repositorySrc).toMatch(/ready_to_apply/);
    expect(repositorySrc).toMatch(/409/);
  });

  it('calls applyProposalToGitHub', () => {
    expect(repositorySrc).toMatch(/applyProposalToGitHub/);
  });

  it('records provider facts in a builder_delivery_records row', () => {
    expect(repositorySrc).toMatch(/builder_delivery_records/);
    expect(repositorySrc).toMatch(/pr_url/);
    expect(repositorySrc).toMatch(/status:\s*['"]pr_open['"]/);
  });

  it('transitions to pr_opened via the state service and never writes a status/pr_url column on the proposal', () => {
    expect(repositorySrc).toMatch(/transitionProposal/);
    expect(repositorySrc).toMatch(/to:\s*['"]pr_opened['"]/);
    // The deleted phase/status columns must not be written on builder_proposals.
    expect(repositorySrc).not.toMatch(/phase:\s*['"]pr_opened['"]/);
    expect(repositorySrc).not.toMatch(/status:\s*['"]approved['"]/);
  });

  it('emits proposal_applied builder_event', () => {
    expect(repositorySrc).toMatch(/proposal_applied/);
    expect(repositorySrc).toMatch(/builder_events/);
  });

  it('returns 503 when GitHub is not configured', () => {
    expect(src).toMatch(/503|GitHub integration not configured/);
  });

  it('enforces the path policy and review gate before GitHub', () => {
    expect(repositorySrc).toMatch(/evaluatePathPolicy/);
    expect(repositorySrc).toMatch(/evaluateAttemptGate/);
    expect(repositorySrc).toMatch(/422/);
  });

  it('fails when proposal_applied audit event is not recorded', () => {
    expect(repositorySrc).toMatch(/if \(eventError\)/);
    expect(repositorySrc).toMatch(/BuilderApplyError\(eventError\.message/);
    expect(repositorySrc).not.toMatch(/Failed to emit builder proposal_applied event/);
  });
});
