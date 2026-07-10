// @vitest-environment node
//
// Tests for POST /api/org/[orgId]/builder/proposals/[proposalId]/apply
// The release gate: a PR may open only for a ready_to_apply proposal whose
// stored review report passes the review gate and whose files pass the
// path policy. A model score is never an authorization signal.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const PROPOSAL_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

let _authUser: { id: string } | null = { id: USER_ID };
let _canReview = true;
let _githubConfigured = true;
let _proposalRow: Record<string, unknown> | null = null;
let _updateCalls: Array<Record<string, unknown>> = [];
let _eventInserts: Array<Record<string, unknown>> = [];

const applyMock = vi.fn(async (..._args: unknown[]) => ({
  prUrl: 'https://github.com/acme/repo/pull/7',
  branchName: 'builder/scaffold-22222222',
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: _authUser } })) },
  })),
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'builder_proposals') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({
                  data: _proposalRow,
                  error: _proposalRow ? null : { message: 'not found' },
                }),
              }),
            }),
          }),
          update: (values: Record<string, unknown>) => {
            _updateCalls.push(values);
            return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
          },
        };
      }
      if (table === 'builder_events') {
        return {
          insert: async (row: Record<string, unknown>) => {
            _eventInserts.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  })),
}));

vi.mock('@/lib/builder/github-apply', () => ({
  isGitHubConfigured: () => _githubConfigured,
  applyProposalToGitHub: (...args: unknown[]) => applyMock(...args),
}));

vi.mock('@/lib/org-capabilities', () => ({
  canReviewImplementation: vi.fn(async () => _canReview),
}));

import { POST } from '@/app/api/org/[orgId]/builder/proposals/[proposalId]/apply/route';

function call() {
  return POST(new NextRequest('http://localhost/api/apply', { method: 'POST' }), {
    params: Promise.resolve({ orgId: ORG_ID, proposalId: PROPOSAL_ID }),
  });
}

function healthyProposal(): Record<string, unknown> {
  return {
    id: PROPOSAL_ID,
    phase: 'ready_to_apply',
    plan_content: { moduleName: 'Volunteer Tracking' },
    generated_code: {
      files: [{ path: 'components/volunteer/VolunteerList.tsx', content: 'export default function VolunteerList() { return null; }' }],
    },
    review_report: { score: 88, findings: [{ severity: 'warning', description: 'Consider an empty state.' }] },
  };
}

beforeEach(() => {
  _authUser = { id: USER_ID };
  _canReview = true;
  _githubConfigured = true;
  _proposalRow = healthyProposal();
  _updateCalls = [];
  _eventInserts = [];
  applyMock.mockClear();
});

describe('POST apply — auth and preconditions', () => {
  it('401 when unauthenticated', async () => {
    _authUser = null;
    expect((await call()).status).toBe(401);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('403 without implementation reviewer capability', async () => {
    _canReview = false;
    expect((await call()).status).toBe(403);
  });

  it('503 when GitHub is not configured', async () => {
    _githubConfigured = false;
    expect((await call()).status).toBe(503);
  });

  it('404 when the proposal does not exist in this org', async () => {
    _proposalRow = null;
    expect((await call()).status).toBe(404);
  });

  it('409 when the proposal is not ready_to_apply', async () => {
    _proposalRow = { ...healthyProposal(), phase: 'needs_repair' };
    expect((await call()).status).toBe(409);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('400 when there are no files', async () => {
    _proposalRow = { ...healthyProposal(), generated_code: { files: [] } };
    expect((await call()).status).toBe(400);
  });
});

describe('POST apply — release gate', () => {
  it('422 with violations when a file touches a protected path — GitHub is never called', async () => {
    _proposalRow = {
      ...healthyProposal(),
      generated_code: { files: [{ path: '.github/workflows/deploy.yml', content: 'on: push' }] },
    };
    const res = await call();
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.violations?.length).toBeGreaterThan(0);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('409 with blockers when the review report has a blocking finding, even with a high score', async () => {
    _proposalRow = {
      ...healthyProposal(),
      review_report: { score: 97, findings: [{ severity: 'error', description: 'New table has no RLS policies.' }] },
    };
    const res = await call();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.blockers).toEqual(['New table has no RLS policies.']);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('409 when the review report is missing — a phase value alone is not evidence', async () => {
    _proposalRow = { ...healthyProposal(), review_report: null };
    const res = await call();
    expect(res.status).toBe(409);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('opens the PR and records pr_opened for a passing proposal', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prUrl).toBe('https://github.com/acme/repo/pull/7');
    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(_updateCalls[0]).toMatchObject({ phase: 'pr_opened', status: 'approved', pr_url: 'https://github.com/acme/repo/pull/7' });
    expect(_eventInserts[0]).toMatchObject({ org_id: ORG_ID, event_type: 'proposal_applied' });
  });
});
