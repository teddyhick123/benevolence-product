// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAiChatRepository } from '@/lib/api/repositories/ai-chat';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockCreateElevatedClient } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

const scope = {
  orgId: 'org-1',
  portfolioId: 'portfolio-1',
  principal: { kind: 'user' as const, userId: 'user-1' },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AI chat repository', () => {
  it('atomically begins a turn and loads authoritative scoped history', async () => {
    const history = stubQuery({
      data: [
        {
          role: 'assistant',
          content: 'Prior answer',
          widgets: null,
          content_blocks: null,
          created_at: '2026-08-05T10:00:00.000Z',
        },
      ],
      error: null,
    });
    const db = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          started: true,
          turn_id: 'turn-1',
          session_id: 'session-1',
          status: 'in_progress',
        },
        error: null,
      }),
      from: vi.fn(() => history),
    };

    const result = await createAiChatRepository({
      ...scope,
      db: db as never,
    }).beginTurn('request-1', 'Hello');

    expect(db.rpc).toHaveBeenCalledWith('begin_ai_turn', {
      p_portfolio_id: 'portfolio-1',
      p_user_id: 'user-1',
      p_request_id: 'request-1',
      p_content: 'Hello',
    });
    expect(history.calls).toContainEqual({
      method: 'eq',
      args: ['session_id', 'session-1'],
    });
    expect(history.calls).toContainEqual({
      method: 'eq',
      args: ['portfolio_id', 'portfolio-1'],
    });
    expect(history.calls).toContainEqual({
      method: 'eq',
      args: ['user_id', 'user-1'],
    });
    expect(history.calls).toContainEqual({
      method: 'neq',
      args: ['turn_id', 'turn-1'],
    });
    expect(result).toEqual({
      state: 'started',
      turnId: 'turn-1',
      sessionId: 'session-1',
      status: 'in_progress',
      history: [{ role: 'assistant', content: 'Prior answer' }],
    });
  });

  it('replays a completed request without reading or appending history', async () => {
    const response = {
      message: 'Already done',
      actions: [],
      widgets: [],
      sessionId: 'session-1',
    };
    const db = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          started: false,
          turn_id: 'turn-1',
          session_id: 'session-1',
          status: 'completed',
          response,
        },
        error: null,
      }),
      from: vi.fn(),
    };

    await expect(createAiChatRepository({
      ...scope,
      db: db as never,
    }).beginTurn('request-1', 'Hello')).resolves.toEqual({
      state: 'completed',
      turnId: 'turn-1',
      sessionId: 'session-1',
      status: 'completed',
      response,
    });
    expect(db.from).not.toHaveBeenCalled();
  });

  it('completes and fails turns only through scope-fixed RPC arguments', async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: {}, error: null }) };
    const repository = createAiChatRepository({ ...scope, db: db as never });
    const response = {
      message: 'Done',
      actions: [],
      widgets: [],
      sessionId: 'session-1',
    };

    await repository.completeTurn('turn-1', {
      role: 'assistant',
      content: 'Done',
      timestamp: '2026-08-05T10:00:00.000Z',
    }, response);
    await repository.failTurn('turn-2', 'stream_failed', 'Disconnected');

    expect(db.rpc).toHaveBeenNthCalledWith(1, 'complete_ai_turn', {
      p_turn_id: 'turn-1',
      p_portfolio_id: 'portfolio-1',
      p_user_id: 'user-1',
      p_content: 'Done',
      p_widgets: null,
      p_content_blocks: null,
      p_response: response,
    });
    expect(db.rpc).toHaveBeenNthCalledWith(2, 'fail_ai_turn', {
      p_turn_id: 'turn-2',
      p_portfolio_id: 'portfolio-1',
      p_user_id: 'user-1',
      p_failure_code: 'stream_failed',
      p_failure_message: 'Disconnected',
    });
  });

  it('loads saved widgets only through direct or parent portfolio scope', async () => {
    const portfolioWidgets = stubQuery({ data: [{ id: 'widget-1' }], error: null });
    const holdingWidgets = stubQuery({
      data: [{ id: 'widget-2', holdings: { portfolio_id: 'portfolio-1' } }],
      error: null,
    });
    const db = {
      from: vi.fn((table: string) => (
        table === 'widgets' ? portfolioWidgets : holdingWidgets
      )),
    };

    const widgets = await createAiChatRepository({
      ...scope,
      db: db as never,
    }).loadSavedWidgets(['widget-1', 'widget-2']);

    expect(portfolioWidgets.calls).toContainEqual({
      method: 'eq',
      args: ['portfolio_id', 'portfolio-1'],
    });
    expect(holdingWidgets.calls).toContainEqual({
      method: 'select',
      args: ['*, holdings!inner(portfolio_id)'],
    });
    expect(holdingWidgets.calls).toContainEqual({
      method: 'eq',
      args: ['holdings.portfolio_id', 'portfolio-1'],
    });
    expect(widgets).toEqual([{ id: 'widget-1' }, { id: 'widget-2' }]);
  });

  it('proves session scope before an elevated usage-log insert', async () => {
    const session = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'session-1' }, error: null } }
    );
    const insert = stubQuery({ data: null, error: null });
    mockCreateElevatedClient.mockReturnValue({ from: vi.fn(() => insert) });
    const repository = createAiChatRepository({
      ...scope,
      db: { from: vi.fn(() => session) } as never,
    });

    await repository.recordUsage('session-1', {
      model: 'model-1',
      inputTokens: 10,
      outputTokens: 5,
    });

    for (const [field, value] of [
      ['id', 'session-1'],
      ['portfolio_id', 'portfolio-1'],
      ['user_id', 'user-1'],
    ]) {
      expect(session.calls).toContainEqual({ method: 'eq', args: [field, value] });
    }
    expect(insert.calls).toContainEqual({
      method: 'insert',
      args: [{
        user_id: 'user-1',
        org_id: 'org-1',
        portfolio_id: 'portfolio-1',
        session_id: 'session-1',
        model: 'model-1',
        input_tokens: 10,
        output_tokens: 5,
      }],
    });
    expect(repository).not.toHaveProperty('db');
  });

  it('constrains normalized history to the authenticated user and portfolio', async () => {
    const session = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'session-1' }, error: null } }
    );
    const messages = stubQuery({ data: [], error: null });
    const db = { from: vi.fn().mockReturnValueOnce(session).mockReturnValueOnce(messages) };

    await createAiChatRepository({ ...scope, db: db as never }).listHistory();

    for (const query of [session, messages]) {
      expect(query.calls).toContainEqual({
        method: 'eq',
        args: ['portfolio_id', 'portfolio-1'],
      });
      expect(query.calls).toContainEqual({
        method: 'eq',
        args: ['user_id', 'user-1'],
      });
    }
  });
});
