// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const {
  mockRequireAppAdmin,
  mockListProposals,
  mockReviewProposal,
} = vi.hoisted(() => ({
  mockRequireAppAdmin: vi.fn(),
  mockListProposals: vi.fn(),
  mockReviewProposal: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireAppAdmin: mockRequireAppAdmin,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/api/repositories/builder', () => ({
  createAppAdminBuilderRepository: () => ({
    listProposals: mockListProposals,
    reviewProposal: mockReviewProposal,
  }),
}));

import { GET } from '@/app/api/admin/builder/proposals/route';
import { PATCH } from '@/app/api/admin/builder/proposals/[proposalId]/route';

const accessGranted = {
  ok: true,
  context: {
    isAppAdmin: true,
    user: { id: 'admin-1' },
  },
};

function get(status = 'pending') {
  return GET(new NextRequest(`http://localhost/api/admin/builder/proposals?status=${status}`));
}

function patch(body: Record<string, unknown>) {
  return PATCH(new NextRequest('http://localhost/api/admin/builder/proposals/proposal-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  }), {
    params: Promise.resolve({ proposalId: 'proposal-1' }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAppAdmin.mockResolvedValue(accessGranted);
  mockListProposals.mockResolvedValue([]);
  mockReviewProposal.mockResolvedValue({
    ok: true,
    proposal: { id: 'proposal-1', status: 'approved', org_id: 'org-1' },
  });
});

describe('admin Builder proposal routes', () => {
  it('returns the shared access denial before reading proposals', async () => {
    mockRequireAppAdmin.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await get();

    expect(response.status).toBe(401);
    expect(mockListProposals).not.toHaveBeenCalled();
  });

  it('rejects an invalid list status and defaults authenticated responses to no-store', async () => {
    const response = await get('unknown');

    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mockListProposals).not.toHaveBeenCalled();
  });

  it('preserves the flattened proposal-list response shape', async () => {
    mockListProposals.mockResolvedValueOnce([{
      id: 'proposal-1',
      org_id: 'org-1',
      current_revision: [{ file_count: 3 }],
      organizations: [{ name: 'Example Foundation' }],
    }]);

    const response = await get('approved');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      proposals: [{
        id: 'proposal-1',
        org_id: 'org-1',
        file_count: 3,
        org_name: 'Example Foundation',
      }],
    });
    expect(mockListProposals).toHaveBeenCalledWith('approved');
  });

  it('maps a code-state transition conflict to the existing 409 response', async () => {
    mockReviewProposal.mockResolvedValueOnce({
      ok: false,
      reason: 'transition_conflict',
      currentState: 'pr_opened',
    });

    const response = await patch({ status: 'rejected', reviewer_notes: 'No' });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Cannot reject a proposal in state: pr_opened',
      currentState: 'pr_opened',
    });
  });

  it('passes the proposal ID and reviewer input to the scoped repository', async () => {
    const response = await patch({ status: 'approved', reviewer_notes: 'Looks good' });

    expect(response.status).toBe(200);
    expect(mockReviewProposal).toHaveBeenCalledWith({
      proposalId: 'proposal-1',
      status: 'approved',
      reviewerNotes: 'Looks good',
    });
  });
});
