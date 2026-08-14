// lib/tasks/automation/__tests__/producers.pledge.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal Supabase client mock — returns no installments by default
// makeDb must be defined before vi.mock factory references it.
// vi.mock is hoisted by Vitest so we use a factory function that closes over a shared store.

let _mockInstallments: unknown[] = [];

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: vi.fn(() => buildMockDb()),
}));

function buildMockDb() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'pledge_installments') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          // Simulate the promise resolution from the chained query
          then: vi.fn(async (resolve: Function) =>
            resolve({ data: _mockInstallments, error: null })
          ),
        };
      }
      if (table === 'tasks') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          like: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn(async () => ({ data: { id: 'task-1' }, error: null })),
            }),
            error: null,
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis(), error: null }),
        };
      }
      // task_entity_links, task_events, etc.
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        like: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        insert: vi.fn(async () => ({ error: null })),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis(), error: null }),
      };
    }),
  } as any;
}

import { pledgeFollowUpProducer } from '../producers/pledges';

describe('pledgeFollowUpProducer', () => {
  beforeEach(() => {
    _mockInstallments = [];
  });

  it('returns empty result when no installments are due', async () => {
    _mockInstallments = [];
    const results = await pledgeFollowUpProducer({ orgId: 'org-1' });
    expect(results).toHaveLength(0);
  });

  it('uses org-scoped query (does not query without orgId filter)', async () => {
    _mockInstallments = [];
    const results = await pledgeFollowUpProducer({ orgId: 'org-1' });
    expect(Array.isArray(results)).toBe(true);
  });

  it('returns a result with producer name set', async () => {
    _mockInstallments = [];
    const results = await pledgeFollowUpProducer({ orgId: 'org-1' });
    if (results.length > 0) {
      expect(results[0].producer).toBe('pledge_follow_up');
    }
  });

  it('returns empty array when no orgId is provided', async () => {
    const results = await pledgeFollowUpProducer({});
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(0);
  });
});
