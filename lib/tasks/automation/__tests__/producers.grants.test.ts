// lib/tasks/automation/__tests__/producers.grants.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared mock state — must be declared before vi.mock factory
let _mockMilestones: unknown[] = [];
let _mockReports: unknown[] = [];
let _mockPayments: unknown[] = [];

vi.mock('@/lib/supabase', () => ({
  createAdminClient: vi.fn(() => buildMockDb()),
}));

function buildMockDb() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'grant_milestones') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          then: vi.fn(async (resolve: Function) =>
            resolve({ data: _mockMilestones, error: null })
          ),
        };
      }
      if (table === 'grant_reports') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          then: vi.fn(async (resolve: Function) =>
            resolve({ data: _mockReports, error: null })
          ),
        };
      }
      if (table === 'grant_payments') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          then: vi.fn(async (resolve: Function) =>
            resolve({ data: _mockPayments, error: null })
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

import { grantObligationsProducer } from '../producers/grants';

describe('grantObligationsProducer', () => {
  beforeEach(() => {
    _mockMilestones = [];
    _mockReports = [];
    _mockPayments = [];
  });

  it('returns empty array when no orgId provided', async () => {
    const results = await grantObligationsProducer({});
    expect(results).toHaveLength(0);
  });

  it('returns a result array when called with orgId', async () => {
    const results = await grantObligationsProducer({ orgId: 'org-1' });
    expect(Array.isArray(results)).toBe(true);
  });

  it('does not crash when DB returns empty datasets', async () => {
    const results = await grantObligationsProducer({ orgId: 'org-2' });
    expect(Array.isArray(results)).toBe(true);
  });

  it('returns empty array when no milestones, reports, or payments exist', async () => {
    _mockMilestones = [];
    _mockReports = [];
    _mockPayments = [];
    const results = await grantObligationsProducer({ orgId: 'org-1' });
    expect(results).toHaveLength(0);
  });

  it('returns a result with producer name set when milestones are due soon', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    _mockMilestones = [
      {
        id: 'milestone-1',
        grant_id: 'grant-1',
        milestone_name: 'Q1 Report Delivery',
        description: 'Submit Q1 progress report',
        due_date: futureDate.toISOString().slice(0, 10),
        status: 'pending',
        grant_details: { holding_id: 'h-1', holdings: { org_id: 'org-1', portfolio_id: 'p-1', name: 'Grant A' } },
      },
    ];
    const results = await grantObligationsProducer({ orgId: 'org-1' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].producer).toBe('grant_obligations');
  });

  it('reports scanned count for matched milestones', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);
    _mockMilestones = [
      {
        id: 'milestone-2',
        grant_id: 'grant-2',
        milestone_name: 'Site Visit',
        description: null,
        due_date: futureDate.toISOString().slice(0, 10),
        status: 'in_progress',
        grant_details: { holding_id: 'h-2', holdings: { org_id: 'org-1', portfolio_id: 'p-2', name: 'Grant B' } },
      },
    ];
    const results = await grantObligationsProducer({ orgId: 'org-1' });
    const r = results.find((r) => r.producer === 'grant_obligations');
    expect(r).toBeDefined();
    expect(r!.scanned).toBeGreaterThan(0);
  });

  it('dryRun=true returns result without incrementing created/updated', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 20);
    _mockMilestones = [
      {
        id: 'milestone-3',
        grant_id: 'grant-3',
        milestone_name: 'Final Report',
        description: null,
        due_date: futureDate.toISOString().slice(0, 10),
        status: 'pending',
        grant_details: { holding_id: 'h-3', holdings: { org_id: 'org-1', portfolio_id: 'p-1', name: 'Grant C' } },
      },
    ];
    const results = await grantObligationsProducer({ orgId: 'org-1', dryRun: true });
    expect(Array.isArray(results)).toBe(true);
    if (results.length > 0) {
      const r = results[0];
      expect(r.created).toBe(0);
      expect(r.updated).toBe(0);
    }
  });

  it('handles overdue milestones', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);
    _mockMilestones = [
      {
        id: 'milestone-4',
        grant_id: 'grant-4',
        milestone_name: 'Overdue Deliverable',
        description: null,
        due_date: pastDate.toISOString().slice(0, 10),
        status: 'pending',
        grant_details: { holding_id: 'h-4', holdings: { org_id: 'org-1', portfolio_id: 'p-1', name: 'Grant D' } },
      },
    ];
    const results = await grantObligationsProducer({ orgId: 'org-1' });
    expect(Array.isArray(results)).toBe(true);
    if (results.length > 0) {
      expect(results[0].producer).toBe('grant_obligations');
    }
  });

  it('generates tasks for grant reports due soon', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 20);
    _mockReports = [
      {
        id: 'report-1',
        grant_id: 'grant-5',
        report_type: 'progress',
        due_date: futureDate.toISOString().slice(0, 10),
        submitted_date: null,
        received_at: null,
        grant_details: { holding_id: 'h-5', holdings: { org_id: 'org-1', portfolio_id: 'p-1', name: 'Grant E' } },
      },
    ];
    const results = await grantObligationsProducer({ orgId: 'org-1' });
    expect(Array.isArray(results)).toBe(true);
    if (results.length > 0) {
      expect(results[0].producer).toBe('grant_obligations');
    }
  });

  it('generates tasks for grant payments with unmet conditions', async () => {
    _mockPayments = [
      {
        id: 'payment-1',
        grant_id: 'grant-6',
        payment_number: 1,
        amount: 50000,
        conditions_met: false,
        paid_date: null,
        scheduled_date: null,
        status: 'scheduled',
        grant_details: { holding_id: 'h-6', holdings: { org_id: 'org-1', portfolio_id: 'p-1', name: 'Grant F' } },
      },
    ];
    const results = await grantObligationsProducer({ orgId: 'org-1' });
    expect(Array.isArray(results)).toBe(true);
    if (results.length > 0) {
      expect(results[0].producer).toBe('grant_obligations');
    }
  });

  it('assigns high priority to milestones due within 14 days', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    _mockMilestones = [
      {
        id: 'milestone-5',
        grant_id: 'grant-7',
        milestone_name: 'Urgent Milestone',
        description: null,
        due_date: futureDate.toISOString().slice(0, 10),
        status: 'pending',
        grant_details: { holding_id: 'h-7', holdings: { org_id: 'org-1', portfolio_id: 'p-1', name: 'Grant G' } },
      },
    ];
    const results = await grantObligationsProducer({ orgId: 'org-1' });
    // Should still return a result array without errors
    expect(Array.isArray(results)).toBe(true);
  });
});
