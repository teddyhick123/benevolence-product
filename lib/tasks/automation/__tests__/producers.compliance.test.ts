// lib/tasks/automation/__tests__/producers.compliance.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared mock state — must be declared before vi.mock factory
let _mockFilings: unknown[] = [];
let _mockRegistrations: unknown[] = [];

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: vi.fn(() => buildMockDb()),
}));

function buildMockDb() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'filing_calendar') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          then: vi.fn(async (resolve: Function) =>
            resolve({ data: _mockFilings, error: null })
          ),
        };
      }
      if (table === 'state_registrations') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          then: vi.fn(async (resolve: Function) =>
            resolve({ data: _mockRegistrations, error: null })
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

import { complianceDeadlinesProducer } from '../producers/compliance';

describe('complianceDeadlinesProducer', () => {
  beforeEach(() => {
    _mockFilings = [];
    _mockRegistrations = [];
  });

  it('returns empty array when no orgId provided', async () => {
    const results = await complianceDeadlinesProducer({});
    expect(results).toHaveLength(0);
  });

  it('returns a result when called with orgId', async () => {
    const results = await complianceDeadlinesProducer({ orgId: 'org-1' });
    expect(Array.isArray(results)).toBe(true);
  });

  it('returns empty array when no filings are due soon', async () => {
    _mockFilings = [];
    _mockRegistrations = [];
    const results = await complianceDeadlinesProducer({ orgId: 'org-1' });
    expect(results).toHaveLength(0);
  });

  it('returns a result with producer name set for filings due soon', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    _mockFilings = [
      {
        id: 'filing-1',
        org_id: 'org-1',
        title: 'Form 990',
        filing_type: 'form_990',
        due_date: futureDate.toISOString().slice(0, 10),
        status: 'upcoming',
        reminder_days: [30, 14, 7],
        jurisdiction: 'federal',
      },
    ];
    const results = await complianceDeadlinesProducer({ orgId: 'org-1' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].producer).toBe('compliance_deadlines');
  });

  it('reports scanned count for matched filings', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);
    _mockFilings = [
      {
        id: 'filing-2',
        org_id: 'org-1',
        title: 'State Annual Report',
        filing_type: 'state_annual_report',
        due_date: futureDate.toISOString().slice(0, 10),
        status: 'in_progress',
        reminder_days: [30, 14, 7],
        jurisdiction: 'CA',
      },
    ];
    const results = await complianceDeadlinesProducer({ orgId: 'org-1' });
    const filingResult = results.find((r) => r.producer === 'compliance_deadlines');
    expect(filingResult).toBeDefined();
    expect(filingResult!.scanned).toBeGreaterThan(0);
  });

  it('dryRun=true returns result without creating tasks', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    _mockFilings = [
      {
        id: 'filing-3',
        org_id: 'org-1',
        title: 'Form 990-PF',
        filing_type: 'form_990_pf',
        due_date: futureDate.toISOString().slice(0, 10),
        status: 'upcoming',
        reminder_days: [30, 14, 7],
        jurisdiction: 'federal',
      },
    ];
    const results = await complianceDeadlinesProducer({ orgId: 'org-1', dryRun: true });
    expect(Array.isArray(results)).toBe(true);
    if (results.length > 0) {
      const r = results[0];
      expect(r.created).toBe(0);
      expect(r.updated).toBe(0);
    }
  });

  it('handles overdue filings', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);
    _mockFilings = [
      {
        id: 'filing-4',
        org_id: 'org-1',
        title: 'Overdue Filing',
        filing_type: 'form_990',
        due_date: pastDate.toISOString().slice(0, 10),
        status: 'overdue',
        reminder_days: [30, 14, 7],
        jurisdiction: 'federal',
      },
    ];
    const results = await complianceDeadlinesProducer({ orgId: 'org-1' });
    expect(Array.isArray(results)).toBe(true);
    if (results.length > 0) {
      expect(results[0].producer).toBe('compliance_deadlines');
    }
  });

  it('handles state registrations due for renewal', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    _mockRegistrations = [
      {
        id: 'reg-1',
        org_id: 'org-1',
        state: 'CA',
        registration_type: 'charitable_solicitation',
        status: 'renewal_due',
        renewal_due_date: futureDate.toISOString().slice(0, 10),
        registration_number: 'CT123456',
      },
    ];
    const results = await complianceDeadlinesProducer({ orgId: 'org-1' });
    expect(Array.isArray(results)).toBe(true);
  });
});
