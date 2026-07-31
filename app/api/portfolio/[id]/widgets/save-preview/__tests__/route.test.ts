// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const {
  mockRequirePortfolioAccess,
  mockCreateRepository,
  mockSavePreview,
} = vi.hoisted(() => ({
  mockRequirePortfolioAccess: vi.fn(),
  mockCreateRepository: vi.fn(),
  mockSavePreview: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requirePortfolioAccess: mockRequirePortfolioAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/api/repositories/visualizations', () => {
  class PortfolioWidgetHoldingNotFoundError extends Error {
    constructor() {
      super('Holding not found');
    }
  }
  class PortfolioWidgetSaveError extends Error {
    constructor() {
      super('Failed to save widget');
    }
  }
  return {
    PortfolioWidgetHoldingNotFoundError,
    PortfolioWidgetSaveError,
    createPortfolioVisualizationRepository: mockCreateRepository,
  };
});

import { POST } from '@/app/api/portfolio/[id]/widgets/save-preview/route';
import { PortfolioWidgetHoldingNotFoundError } from '@/lib/api/repositories/visualizations';

const params = { params: Promise.resolve({ id: 'portfolio-1' }) };

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/portfolio/portfolio-1/widgets/save-preview', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePortfolioAccess.mockResolvedValue({
    ok: true,
    context: {
      portfolioId: 'portfolio-1',
      orgId: 'org-1',
      role: 'member',
      user: { id: 'member-1' },
    },
  });
  mockCreateRepository.mockReturnValue({ savePreview: mockSavePreview });
  mockSavePreview.mockResolvedValue({ id: 'widget-1', position: 0 });
});

describe('widget preview save route', () => {
  it('returns the shared denial before parsing or writing', async () => {
    mockRequirePortfolioAccess.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Access denied' }, { status: 403 }),
    });

    const response = await POST(request({ type: 'chart', title: 'Impact' }), params);

    expect(response.status).toBe(403);
    expect(mockSavePreview).not.toHaveBeenCalled();
  });

  it('passes only authorized portfolio scope and normalized input to the repository', async () => {
    const response = await POST(request({
      type: 'chart',
      title: 'Impact',
      config: { metric: 'PEOPLE_SERVED' },
      holding_id: 'holding-1',
    }), params);

    expect(mockRequirePortfolioAccess).toHaveBeenCalledWith('portfolio-1', 'member');
    expect(mockCreateRepository).toHaveBeenCalledWith({
      portfolioId: 'portfolio-1',
      actorId: 'member-1',
    });
    expect(mockSavePreview).toHaveBeenCalledWith({
      type: 'chart',
      title: 'Impact',
      config: { metric: 'PEOPLE_SERVED' },
      holdingId: 'holding-1',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ data: { id: 'widget-1', position: 0 } });
  });

  it('preserves the 404 response for a holding outside the portfolio', async () => {
    mockSavePreview.mockRejectedValueOnce(new PortfolioWidgetHoldingNotFoundError());

    const response = await POST(request({
      type: 'chart',
      title: 'Impact',
      holding_id: 'foreign-holding',
    }), params);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Holding not found' });
  });
});
