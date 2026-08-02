// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const {
  mockRequireUserAccess,
  mockRequirePortfolioAccess,
  mockResolveAiActionMutation,
  mockCreateHistoryRepository,
  mockUndo,
  mockRedo,
  mockList,
  mockLimit,
} = vi.hoisted(() => ({
  mockRequireUserAccess: vi.fn(),
  mockRequirePortfolioAccess: vi.fn(),
  mockResolveAiActionMutation: vi.fn(),
  mockCreateHistoryRepository: vi.fn(),
  mockUndo: vi.fn(),
  mockRedo: vi.fn(),
  mockList: vi.fn(),
  mockLimit: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireUserAccess: mockRequireUserAccess,
  requirePortfolioAccess: mockRequirePortfolioAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/api/repositories/ai-actions', () => ({
  resolveAiActionMutation: mockResolveAiActionMutation,
  createAiActionHistoryRepository: mockCreateHistoryRepository,
}));

vi.mock('@/lib/rate-limit', () => ({
  aiLimiter: { limit: mockLimit },
}));

vi.mock('@/lib/rate-limit-response', () => ({
  rateLimitExceeded: () => NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 }),
}));

import { POST as redo } from '@/app/api/ai/redo/route';
import { GET as history, POST as undo } from '@/app/api/ai/undo/route';

const ACTION_ID = '11111111-1111-4111-8111-111111111111';
const BATCH_ID = '22222222-2222-4222-8222-222222222222';
const sessionDb = { from: vi.fn(), rpc: vi.fn() };
const userContext = {
  principal: { kind: 'user', userId: 'user-1' },
  user: { id: 'user-1' },
  db: sessionDb,
};
const portfolioContext = {
  ...userContext,
  portfolioId: 'portfolio-1',
  orgId: 'org-1',
  role: 'editor',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUserAccess.mockResolvedValue({ ok: true, context: userContext });
  mockRequirePortfolioAccess.mockResolvedValue({ ok: true, context: portfolioContext });
  mockLimit.mockResolvedValue({ success: true, reset: 0, remaining: 9, limit: 10 });
  mockUndo.mockResolvedValue({ undone: true });
  mockRedo.mockResolvedValue({ redone: true });
  mockList.mockResolvedValue([{ id: ACTION_ID }]);
  mockResolveAiActionMutation.mockResolvedValue({
    ok: true,
    portfolioId: 'portfolio-1',
    repository: { undo: mockUndo, redo: mockRedo },
  });
  mockCreateHistoryRepository.mockReturnValue({ list: mockList });
});

describe('AI action routes', () => {
  it('authenticates before resolving an undo action', async () => {
    mockRequireUserAccess.mockResolvedValueOnce({
      ok: false,
      reason: 'unauthenticated',
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await undo(new NextRequest('http://localhost/api/ai/undo', {
      method: 'POST',
      body: JSON.stringify({ actionId: ACTION_ID }),
    }));

    expect(response.status).toBe(401);
    expect(mockResolveAiActionMutation).not.toHaveBeenCalled();
  });

  it('undoes only through the action scope resolved from the session', async () => {
    const response = await undo(new NextRequest('http://localhost/api/ai/undo', {
      method: 'POST',
      body: JSON.stringify({ batchId: BATCH_ID }),
    }));

    expect(mockResolveAiActionMutation).toHaveBeenCalledWith(sessionDb, { batchId: BATCH_ID });
    expect(mockUndo).toHaveBeenCalledOnce();
    expect(await response.json()).toEqual({ success: true, result: { undone: true } });
  });

  it('returns a resolver denial without invoking the scoped operation', async () => {
    mockResolveAiActionMutation.mockResolvedValueOnce({
      ok: false,
      status: 404,
      error: 'Action not found',
    });

    const response = await undo(new NextRequest('http://localhost/api/ai/undo', {
      method: 'POST',
      body: JSON.stringify({ actionId: ACTION_ID }),
    }));

    expect(response.status).toBe(404);
    expect(mockUndo).not.toHaveBeenCalled();
  });

  it('redoes only through the action scope resolved from the session', async () => {
    const response = await redo(new NextRequest('http://localhost/api/ai/redo', {
      method: 'POST',
      body: JSON.stringify({ actionId: ACTION_ID }),
    }));

    expect(mockResolveAiActionMutation).toHaveBeenCalledWith(sessionDb, { actionId: ACTION_ID });
    expect(mockRedo).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
  });

  it('guards and scopes action history to the requested portfolio', async () => {
    const response = await history(new NextRequest(
      'http://localhost/api/ai/undo?portfolioId=portfolio-1&limit=12'
    ));

    expect(mockRequirePortfolioAccess).toHaveBeenCalledWith('portfolio-1', 'viewer');
    expect(mockCreateHistoryRepository).toHaveBeenCalledWith(sessionDb, 'portfolio-1');
    expect(mockList).toHaveBeenCalledWith(12);
    expect(await response.json()).toEqual({ actions: [{ id: ACTION_ID }] });
  });

});
