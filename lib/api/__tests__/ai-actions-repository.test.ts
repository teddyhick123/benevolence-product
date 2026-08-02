// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAiActionHistoryRepository,
  resolveAiActionMutation,
} from '@/lib/api/repositories/ai-actions';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const {
  mockUndoAction,
  mockUndoBatch,
  mockRedoAction,
} = vi.hoisted(() => ({
  mockUndoAction: vi.fn(),
  mockUndoBatch: vi.fn(),
  mockRedoAction: vi.fn(),
}));

vi.mock('@/lib/ai-action-executor', () => ({
  AIActionExecutor: class {
    undoAction = mockUndoAction;
    undoBatch = mockUndoBatch;
    redoAction = mockRedoAction;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockUndoAction.mockResolvedValue({ undone: true });
  mockUndoBatch.mockResolvedValue({ undone: 2 });
  mockRedoAction.mockResolvedValue({ redone: true });
});

describe('AI action repository', () => {
  it('resolves an action through user RLS and proves edit access before replay', async () => {
    const sessionLookup = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { portfolio_id: 'portfolio-1' }, error: null } }
    );
    const replayLookup = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'action-1' }, error: null } }
    );
    const sessionDb = {
      from: vi.fn()
        .mockReturnValueOnce(sessionLookup)
        .mockReturnValueOnce(replayLookup),
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };

    const resolved = await resolveAiActionMutation(sessionDb as never, {
      actionId: 'action-1',
    });

    expect(resolved.ok).toBe(true);
    expect(sessionLookup.calls).toContainEqual({ method: 'eq', args: ['id', 'action-1'] });
    expect(sessionDb.rpc).toHaveBeenCalledWith('can_edit_portfolio', {
      p_portfolio_id: 'portfolio-1',
    });
    if (!resolved.ok) throw new Error('Expected resolved repository');
    await resolved.repository.undo();
    expect(replayLookup.calls).toContainEqual({
      method: 'eq',
      args: ['portfolio_id', 'portfolio-1'],
    });
    expect(mockUndoAction).toHaveBeenCalledWith('action-1');
  });

  it('does not construct a replay repository when the user cannot edit the portfolio', async () => {
    const sessionLookup = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { portfolio_id: 'portfolio-1' }, error: null } }
    );
    const sessionDb = {
      from: vi.fn(() => sessionLookup),
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    };

    const resolved = await resolveAiActionMutation(sessionDb as never, {
      actionId: 'action-1',
    });

    expect(resolved).toEqual({ ok: false, status: 403, error: 'Access denied' });
    expect(sessionDb.from).toHaveBeenCalledOnce();
  });

  it('conceals an action hidden by user RLS', async () => {
    const sessionLookup = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: null, error: null } }
    );
    const sessionDb = {
      from: vi.fn(() => sessionLookup),
      rpc: vi.fn(),
    };

    const resolved = await resolveAiActionMutation(sessionDb as never, {
      actionId: 'action-other-tenant',
    });

    expect(resolved).toEqual({ ok: false, status: 404, error: 'Action not found' });
    expect(sessionDb.rpc).not.toHaveBeenCalled();
  });

  it('rejects a batch whose scoped recheck finds another portfolio', async () => {
    const sessionLookup = stubQuery({
      data: [{ portfolio_id: 'portfolio-1' }],
      error: null,
    });
    const replayLookup = stubQuery({
      data: [
        { id: 'action-1', portfolio_id: 'portfolio-1' },
        { id: 'action-2', portfolio_id: 'portfolio-2' },
      ],
      error: null,
    });
    const sessionDb = {
      from: vi.fn()
        .mockReturnValueOnce(sessionLookup)
        .mockReturnValueOnce(replayLookup),
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };

    const resolved = await resolveAiActionMutation(sessionDb as never, {
      batchId: 'batch-1',
    });
    if (!resolved.ok) throw new Error('Expected resolved repository');

    await expect(resolved.repository.undo()).rejects.toThrow('Batch not found');
    expect(mockUndoBatch).not.toHaveBeenCalled();
  });

  it('keeps action history constrained to its portfolio', async () => {
    const history = stubQuery({ data: [{ id: 'action-1' }], error: null });
    const db = { from: vi.fn(() => history) };

    const result = await createAiActionHistoryRepository(
      db as never,
      'portfolio-1'
    ).list(12);

    expect(history.calls).toContainEqual({
      method: 'eq',
      args: ['portfolio_id', 'portfolio-1'],
    });
    expect(history.calls).toContainEqual({ method: 'limit', args: [12] });
    expect(result).toEqual([{ id: 'action-1' }]);
  });
});
