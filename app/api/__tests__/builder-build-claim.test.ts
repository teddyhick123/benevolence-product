// @vitest-environment node
//
// Tests for POST /api/org/[orgId]/builder/proposals/[proposalId]/build
// The route must atomically claim the proposal (compare-and-set on phase)
// before enqueueing, so two concurrent starts produce one job.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const PROPOSAL_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

let _authUser: { id: string } | null = { id: USER_ID };
let _canReview = true;
let _claimResult: { id: string } | null = { id: PROPOSAL_ID };
let _claimPhases: string[] = [];
let _updateValues: Array<Record<string, unknown>> = [];
let _fetchRow: { id: string; phase: string } | null = null;

const enqueueMock = vi.fn(async () => 'job-1');

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: _authUser } })) },
  })),
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table !== 'builder_proposals') throw new Error(`unexpected table ${table}`);
      const claimChain: any = {
        eq: () => claimChain,
        in: (_col: string, phases: string[]) => { _claimPhases = phases; return claimChain; },
        select: () => claimChain,
        maybeSingle: async () => ({ data: _claimResult, error: null }),
        // The reset-on-enqueue-failure path awaits update().eq().eq() directly.
        then: (resolve: any) => Promise.resolve({ error: null }).then(resolve),
      };
      const fetchChain: any = {
        eq: () => fetchChain,
        maybeSingle: async () => ({ data: _fetchRow, error: null }),
      };
      return {
        update: (values: Record<string, unknown>) => { _updateValues.push(values); return claimChain; },
        select: () => fetchChain,
      };
    },
  })),
}));

vi.mock('@/lib/org-capabilities', () => ({
  canReviewImplementation: vi.fn(async () => _canReview),
}));

vi.mock('@/lib/builder/scaffold-worker', () => ({
  enqueueScaffoldBuildJob: (data: unknown) => enqueueMock(data),
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
  _claimResult = { id: PROPOSAL_ID };
  _claimPhases = [];
  _updateValues = [];
  _fetchRow = null;
  enqueueMock.mockClear();
  enqueueMock.mockResolvedValue('job-1');
});

describe('POST build — auth', () => {
  it('401 when unauthenticated', async () => {
    _authUser = null;
    const res = await call();
    expect(res.status).toBe(401);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('403 without implementation reviewer capability', async () => {
    _canReview = false;
    const res = await call();
    expect(res.status).toBe(403);
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});

describe('POST build — atomic claim', () => {
  it('claims via compare-and-set on retryable phases and enqueues exactly one job', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ jobId: 'job-1', proposalId: PROPOSAL_ID });
    expect(_updateValues[0]).toEqual({ phase: 'queued' });
    expect(_claimPhases).toEqual(['plan_ready', 'needs_repair', 'failed']);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).toHaveBeenCalledWith({ proposalId: PROPOSAL_ID, orgId: ORG_ID });
  });

  it('returns alreadyRunning without enqueueing when a run is in flight (lost the claim)', async () => {
    _claimResult = null;
    _fetchRow = { id: PROPOSAL_ID, phase: 'building' };
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ proposalId: PROPOSAL_ID, alreadyRunning: true });
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('409 when the proposal is not in a claimable phase', async () => {
    _claimResult = null;
    _fetchRow = { id: PROPOSAL_ID, phase: 'pr_opened' };
    const res = await call();
    expect(res.status).toBe(409);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('404 when the proposal does not exist in this org', async () => {
    _claimResult = null;
    _fetchRow = null;
    const res = await call();
    expect(res.status).toBe(404);
  });

  it('resets the claim to failed when the queue rejects the job', async () => {
    enqueueMock.mockRejectedValueOnce(new Error('redis down'));
    const res = await call();
    expect(res.status).toBe(500);
    expect(_updateValues).toEqual([{ phase: 'queued' }, { phase: 'failed' }]);
  });
});
