// @vitest-environment node
//
// Tests for POST /api/org/[orgId]/builder/proposals/[proposalId]/build
//
// Increment 2: the route no longer does its own phase-based compare-and-set.
// It reads code_state once to short-circuit in-flight runs (so an
// already-running proposal doesn't consume the claim RPC's row lock), then
// delegates the atomic claim to claimCodeRun (builder_claim_code_run RPC,
// Task 2), best-effort stamps the new revision's base_commit_sha from
// GitHub, and enqueues the build job keyed by revisionId.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { ClaimResult } from '@/lib/builder/proposal-state';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const PROPOSAL_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const REVISION_ID = '33333333-3333-3333-3333-333333333333';

let _authUser: { id: string } | null = { id: USER_ID };
let _canReview = true;
let _codeStateRow: { code_state: string } | null = { code_state: 'plan_ready' };
let _revisionUpdateValues: Array<Record<string, unknown>> = [];
let _revisionUpdateError: { message: string } | null = null;

const enqueueMock = vi.fn(async (_data?: unknown) => 'job-1');
const claimCodeRunMock = vi.fn(async (..._args: unknown[]): Promise<ClaimResult> => (
  { ok: true, revisionId: REVISION_ID, reused: false }
));
const failInFlightRunMock = vi.fn(async (..._args: unknown[]) => {});
const getDefaultBranchShaMock = vi.fn(async (..._args: unknown[]) => 'sha-abc123');
let _githubConfigured = false;

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: _authUser } })) },
  })),
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'builder_proposals') {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: _codeStateRow, error: null }),
        };
        return chain;
      }
      if (table === 'builder_proposal_revisions') {
        const chain: any = {
          update: (values: Record<string, unknown>) => {
            _revisionUpdateValues.push(values);
            return chain;
          },
          eq: () => chain,
          then: (resolve: any, reject: any) =>
            Promise.resolve({ data: null, error: _revisionUpdateError }).then(resolve, reject),
        };
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    },
  })),
}));

vi.mock('@/lib/org-capabilities', () => ({
  canReviewImplementation: vi.fn(async () => _canReview),
}));

vi.mock('@/lib/builder/scaffold-worker', () => ({
  enqueueScaffoldBuildJob: (data: unknown) => enqueueMock(data),
}));

// Every export below is wrapped in a lambda (rather than referencing the
// mock function directly) so the outer `const` binding is only read when
// actually *called*, not when this factory object literal is constructed.
// vi.mock() factories are hoisted above local const declarations and can
// run before they've been initialized when this file's module graph is
// evaluated alongside sibling test files (TDZ ReferenceError otherwise).
vi.mock('@/lib/builder/proposal-state', () => ({
  claimCodeRun: (...args: unknown[]) => claimCodeRunMock(...args),
  failInFlightRun: (...args: unknown[]) => failInFlightRunMock(...args),
  IN_FLIGHT_STATES: ['queued', 'generating', 'verifying'],
}));

vi.mock('@/lib/builder/github-apply', () => ({
  isGitHubConfigured: () => _githubConfigured,
  getDefaultBranchSha: (...args: unknown[]) => getDefaultBranchShaMock(...args),
}));

import { POST } from '@/app/api/org/[orgId]/builder/proposals/[proposalId]/build/route';

function call() {
  return POST(new NextRequest('http://localhost/api/build', { method: 'POST' }), {
    params: Promise.resolve({ orgId: ORG_ID, proposalId: PROPOSAL_ID }),
  });
}

beforeEach(() => {
  _authUser = { id: USER_ID };
  _canReview = true;
  _codeStateRow = { code_state: 'plan_ready' };
  _revisionUpdateValues = [];
  _revisionUpdateError = null;
  _githubConfigured = false;
  enqueueMock.mockClear();
  enqueueMock.mockResolvedValue('job-1');
  claimCodeRunMock.mockClear();
  claimCodeRunMock.mockResolvedValue({ ok: true, revisionId: REVISION_ID, reused: false });
  failInFlightRunMock.mockClear();
  getDefaultBranchShaMock.mockClear();
  getDefaultBranchShaMock.mockResolvedValue('sha-abc123');
});

describe('POST build — auth', () => {
  it('401 when unauthenticated', async () => {
    _authUser = null;
    const res = await call();
    expect(res.status).toBe(401);
    expect(claimCodeRunMock).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('403 without implementation reviewer capability', async () => {
    _canReview = false;
    const res = await call();
    expect(res.status).toBe(403);
    expect(claimCodeRunMock).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});

describe('POST build — in-flight short-circuit', () => {
  it('returns alreadyRunning without calling claimCodeRun when code_state is already in flight', async () => {
    _codeStateRow = { code_state: 'generating' };
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ proposalId: PROPOSAL_ID, alreadyRunning: true });
    expect(claimCodeRunMock).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('404 when the proposal does not exist in this org', async () => {
    _codeStateRow = null;
    const res = await call();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'Proposal not found' });
    expect(claimCodeRunMock).not.toHaveBeenCalled();
  });
});

describe('POST build — claim via RPC', () => {
  it('409 with currentState when claimCodeRun reports a conflict', async () => {
    claimCodeRunMock.mockResolvedValueOnce({ ok: false, code: 'conflict', currentState: 'pr_opened' });
    const res = await call();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({
      error: 'Proposal must be claimable to start a run, currently: pr_opened',
      currentState: 'pr_opened',
    });
    expect(claimCodeRunMock).toHaveBeenCalledWith(
      expect.anything(),
      { proposalId: PROPOSAL_ID, orgId: ORG_ID, actorId: USER_ID }
    );
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('404 when claimCodeRun reports not_found (race after the pre-check)', async () => {
    claimCodeRunMock.mockResolvedValueOnce({ ok: false, code: 'not_found' });
    const res = await call();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'Proposal not found' });
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('500 when claimCodeRun reports no_revision (generic proposal missing its revision)', async () => {
    claimCodeRunMock.mockResolvedValueOnce({ ok: false, code: 'no_revision' });
    const res = await call();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Proposal has no revision to build' });
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('succeeds, returns revisionId, and enqueues exactly one job keyed by proposalId/orgId/revisionId', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ jobId: 'job-1', proposalId: PROPOSAL_ID, revisionId: REVISION_ID });
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).toHaveBeenCalledWith({ proposalId: PROPOSAL_ID, orgId: ORG_ID, revisionId: REVISION_ID });
  });
});

describe('POST build — base SHA capture', () => {
  it('stamps base_commit_sha on the revision when GitHub is configured', async () => {
    _githubConfigured = true;
    const res = await call();
    expect(res.status).toBe(200);
    expect(getDefaultBranchShaMock).toHaveBeenCalledTimes(1);
    expect(_revisionUpdateValues).toEqual([{ base_commit_sha: 'sha-abc123' }]);
  });

  it('leaves base_commit_sha untouched when GitHub is not configured, and still returns 200', async () => {
    _githubConfigured = false;
    const res = await call();
    expect(res.status).toBe(200);
    expect(getDefaultBranchShaMock).not.toHaveBeenCalled();
    expect(_revisionUpdateValues).toEqual([]);
  });

  it('is best-effort: a GitHub error during SHA capture does not fail the claim', async () => {
    _githubConfigured = true;
    getDefaultBranchShaMock.mockRejectedValueOnce(new Error('GitHub is down'));
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ jobId: 'job-1', proposalId: PROPOSAL_ID, revisionId: REVISION_ID });
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });
});

describe('POST build — enqueue failure', () => {
  it('fails the in-flight run and returns 500 when the queue rejects the job', async () => {
    enqueueMock.mockRejectedValueOnce(new Error('redis down'));
    const res = await call();
    expect(res.status).toBe(500);
    expect(failInFlightRunMock).toHaveBeenCalledTimes(1);
    expect(failInFlightRunMock).toHaveBeenCalledWith(expect.anything(), PROPOSAL_ID);
  });
});
// Integration test.
