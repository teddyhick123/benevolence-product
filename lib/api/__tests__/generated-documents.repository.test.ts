// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createGeneratedDocumentsRepository } from '@/lib/api/repositories/generated-documents';
import type { PortfolioAccessContext } from '@/lib/api/principals';

const validContent = {
  letter_content: '<p>Hello</p>',
  summary_data: { portfolio: {}, summary: {}, kpis: [], holdings: [] },
};

function scopeWithDb(db: unknown): PortfolioAccessContext {
  return {
    principal: { kind: 'user', userId: 'user-1' },
    user: { id: 'user-1' },
    db,
    orgId: 'org-1',
    portfolioId: 'portfolio-1',
    role: 'member',
  } as unknown as PortfolioAccessContext;
}

describe('generated document repository', () => {
  it('skips malformed newer documents when resolving the latest reusable letter', async () => {
    const order = vi.fn(async () => ({
      data: [
        { id: 'bad', version: 3, generated_at: '2026-08-06T00:00:00Z', content: { broken: true } },
        { id: 'good', version: 2, generated_at: '2026-08-05T00:00:00Z', content: validContent },
      ],
      error: null,
    }));
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order,
    };
    const db = { from: vi.fn(() => query) };

    const result = await createGeneratedDocumentsRepository(scopeWithDb(db)).latestLetter();

    expect(result?.id).toBe('good');
    expect(result?.version).toBe(2);
  });

  it('delegates version allocation and insertion to the atomic RPC', async () => {
    const single = vi.fn(async () => ({
      data: { id: 'letter-1', version: 4, generated_at: '2026-08-06T00:00:00Z' },
      error: null,
    }));
    const rpc = vi.fn(() => ({ single }));
    const db = { rpc, from: vi.fn() };

    const result = await createGeneratedDocumentsRepository(scopeWithDb(db)).saveLetter(validContent);

    expect(result.version).toBe(4);
    expect(rpc).toHaveBeenCalledWith('create_generated_letter', {
      p_portfolio_id: 'portfolio-1',
      p_generated_by: 'user-1',
      p_content: validContent,
    });
    expect(db.from).not.toHaveBeenCalled();
  });
});
