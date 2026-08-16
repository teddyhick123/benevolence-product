// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPortfolioVisualizationRepository } from '@/lib/api/repositories/visualizations';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockCreateElevatedClient, mockFrom, mockRpc } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockRpc.mockResolvedValue({ data: null, error: null });
  mockCreateElevatedClient.mockReturnValue({ from: mockFrom, rpc: mockRpc });
});

function repository() {
  return createPortfolioVisualizationRepository({
    portfolioId: 'portfolio-1',
    actorId: 'member-1',
  });
}

describe('createPortfolioVisualizationRepository', () => {
  it('forces portfolio widgets into the authorized portfolio scope', async () => {
    mockRpc.mockResolvedValueOnce({ data: { id: 'widget-1', position: 3 }, error: null });

    const result = await repository().savePreview({
      type: 'metric',
      title: 'People served',
      config: { metric: 'PEOPLE_SERVED' },
    });

    expect(mockRpc).toHaveBeenCalledWith('create_portfolio_widget', {
      p_portfolio_id: 'portfolio-1',
      p_type: 'metric',
      p_title: 'People served',
      p_config: { metric: 'PEOPLE_SERVED' },
    });
    expect(result).toEqual({ id: 'widget-1', position: 3 });
  });

  it('allocates the position in the database, never from a client-side read', async () => {
    // Reading MAX(position) here and inserting max+1 let two people adding a
    // widget at the same time claim the same slot.
    mockRpc.mockResolvedValueOnce({ data: { id: 'widget-1', position: 3 }, error: null });

    await repository().savePreview({ type: 'metric', title: 'A', config: {} });

    expect(mockFrom).not.toHaveBeenCalled();
    const [, args] = mockRpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(args).not.toHaveProperty('p_position');
  });

  it('verifies holding ownership before creating a holding widget', async () => {
    const holdingQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'holding-1' }, error: null } }
    );
    mockFrom.mockReturnValueOnce(holdingQuery);
    mockRpc.mockResolvedValueOnce({ data: { id: 'widget-1', position: 0 }, error: null });

    await repository().savePreview({
      type: 'chart',
      title: 'Impact trend',
      config: {},
      holdingId: 'holding-1',
    });

    expect(holdingQuery.calls).toContainEqual({ method: 'eq', args: ['id', 'holding-1'] });
    expect(holdingQuery.calls).toContainEqual({
      method: 'eq',
      args: ['portfolio_id', 'portfolio-1'],
    });
    expect(mockRpc).toHaveBeenCalledWith('create_holding_widget', {
      p_holding_id: 'holding-1',
      p_type: 'chart',
      p_title: 'Impact trend',
      p_config: {},
    });
  });

  it('refuses to create a holding widget on a holding outside the portfolio', async () => {
    const holdingQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: null, error: null } }
    );
    mockFrom.mockReturnValueOnce(holdingQuery);

    await expect(
      repository().savePreview({ type: 'chart', title: 'x', config: {}, holdingId: 'holding-9' })
    ).rejects.toThrow(/holding not found/i);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('swaps two portfolio widgets through the transactional RPC', async () => {
    // The previous client did this as three chained requests through a sentinel
    // position, so a failure partway stranded a widget outside the ordering.
    mockRpc.mockResolvedValueOnce({ data: [{ id: 'widget-2' }, { id: 'widget-1' }], error: null });

    const result = await repository().swapPositions({ widgetA: 'widget-1', widgetB: 'widget-2' });

    expect(mockRpc).toHaveBeenCalledWith('swap_portfolio_widget_positions', {
      p_portfolio_id: 'portfolio-1',
      p_widget_a: 'widget-1',
      p_widget_b: 'widget-2',
    });
    expect(result).toEqual([{ id: 'widget-2' }, { id: 'widget-1' }]);
  });

  it('scope-checks the holding before swapping holding widgets', async () => {
    const holdingQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: null, error: null } }
    );
    mockFrom.mockReturnValueOnce(holdingQuery);

    await expect(
      repository().swapPositions({ widgetA: 'w1', widgetB: 'w2', holdingId: 'holding-9' })
    ).rejects.toThrow(/holding not found/i);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('does not expose the elevated client or generic table access', () => {
    const scopedRepository = repository();

    expect(scopedRepository).not.toHaveProperty('db');
    expect(scopedRepository).not.toHaveProperty('from');
  });
});
