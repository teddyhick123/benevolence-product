// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPortfolioVisualizationRepository } from '@/lib/api/repositories/visualizations';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockCreateElevatedClient, mockFrom } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue({ from: mockFrom });
});

function repository() {
  return createPortfolioVisualizationRepository({
    portfolioId: 'portfolio-1',
    actorId: 'member-1',
  });
}

describe('createPortfolioVisualizationRepository', () => {
  it('forces portfolio widgets into the authorized portfolio scope', async () => {
    const positionQuery = stubQuery({ data: [{ position: 2 }], error: null });
    const insertQuery = stubQuery(
      { data: null, error: null },
      { single: { data: { id: 'widget-1', position: 3 }, error: null } }
    );
    mockFrom.mockReturnValueOnce(positionQuery).mockReturnValueOnce(insertQuery);

    const result = await repository().savePreview({
      type: 'metric',
      title: 'People served',
      config: { metric: 'PEOPLE_SERVED' },
    });

    expect(positionQuery.calls).toContainEqual({
      method: 'eq',
      args: ['portfolio_id', 'portfolio-1'],
    });
    expect(insertQuery.calls).toContainEqual({
      method: 'insert',
      args: [{
        portfolio_id: 'portfolio-1',
        type: 'metric',
        title: 'People served',
        config: { metric: 'PEOPLE_SERVED' },
        position: 3,
      }],
    });
    expect(result).toEqual({ id: 'widget-1', position: 3 });
  });

  it('verifies holding ownership before creating a holding widget', async () => {
    const holdingQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'holding-1' }, error: null } }
    );
    const positionQuery = stubQuery({ data: [], error: null });
    const insertQuery = stubQuery(
      { data: null, error: null },
      { single: { data: { id: 'widget-1', position: 0 }, error: null } }
    );
    mockFrom
      .mockReturnValueOnce(holdingQuery)
      .mockReturnValueOnce(positionQuery)
      .mockReturnValueOnce(insertQuery);

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
    expect(positionQuery.calls).toContainEqual({
      method: 'eq',
      args: ['holding_id', 'holding-1'],
    });
    expect(insertQuery.calls).toContainEqual({
      method: 'insert',
      args: [expect.objectContaining({ holding_id: 'holding-1', position: 0 })],
    });
  });

  it('does not expose the elevated client or generic table access', () => {
    const scopedRepository = repository();

    expect(scopedRepository).not.toHaveProperty('db');
    expect(scopedRepository).not.toHaveProperty('from');
  });
});
