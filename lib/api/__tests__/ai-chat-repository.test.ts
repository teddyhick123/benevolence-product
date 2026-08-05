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
  it('starts a session and constrains both message operations to user and portfolio', async () => {
    const read = stubQuery(
      { data: null, error: null },
      { single: { data: { messages: [] }, error: null } }
    );
    const update = stubQuery({ data: null, error: null });
    const db = {
      rpc: vi.fn().mockResolvedValue({ data: 'session-1', error: null }),
      from: vi.fn()
        .mockReturnValueOnce(read)
        .mockReturnValueOnce(update),
    };

    const result = await createAiChatRepository({ ...scope, db: db as never }).start('Hello');

    expect(db.rpc).toHaveBeenCalledWith('get_or_create_ai_session', {
      p_portfolio_id: 'portfolio-1',
      p_user_id: 'user-1',
    });
    for (const query of [read, update]) {
      expect(query.calls).toContainEqual({ method: 'eq', args: ['id', 'session-1'] });
      expect(query.calls).toContainEqual({
        method: 'eq',
        args: ['portfolio_id', 'portfolio-1'],
      });
      expect(query.calls).toContainEqual({ method: 'eq', args: ['user_id', 'user-1'] });
    }
    expect(result.sessionId).toBe('session-1');
    expect(result.messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'Hello' }),
    ]);
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

  it('fixes every elevated usage-log scope field at repository construction', async () => {
    const insert = stubQuery({ data: null, error: null });
    mockCreateElevatedClient.mockReturnValue({ from: vi.fn(() => insert) });
    const repository = createAiChatRepository({ ...scope, db: {} as never });

    await repository.recordUsage('session-1', {
      model: 'model-1',
      inputTokens: 10,
      outputTokens: 5,
    });

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

  it('constrains history to the authenticated user and portfolio', async () => {
    const history = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'session-1', messages: [] }, error: null } }
    );
    const db = { from: vi.fn(() => history) };

    await createAiChatRepository({ ...scope, db: db as never }).listHistory();

    expect(history.calls).toContainEqual({
      method: 'eq',
      args: ['portfolio_id', 'portfolio-1'],
    });
    expect(history.calls).toContainEqual({ method: 'eq', args: ['user_id', 'user-1'] });
  });
});
