// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const FILING_ID = '22222222-2222-2222-2222-222222222222';

const {
  mockRequireOrgAccess,
  mockCreateOrgComplianceRepository,
  mockSyncFilingStatusTasks,
  mockFrom,
} = vi.hoisted(() => ({
  mockRequireOrgAccess: vi.fn(),
  mockCreateOrgComplianceRepository: vi.fn(),
  mockSyncFilingStatusTasks: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireOrgAccess: mockRequireOrgAccess,
}));

vi.mock('@/lib/api/repositories/compliance', () => ({
  createOrgComplianceRepository: mockCreateOrgComplianceRepository,
}));

import {
  PATCH,
  POST,
} from '@/app/api/org/[orgId]/compliance/filing-calendar/route';

function request(method: 'POST' | 'PATCH', body: unknown) {
  return new NextRequest(
    `http://localhost/api/org/${ORG_ID}/compliance/filing-calendar`,
    {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

function params() {
  return { params: Promise.resolve({ orgId: ORG_ID }) } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireOrgAccess.mockResolvedValue({
    ok: true,
    context: {
      orgId: ORG_ID,
      user: { id: 'user-1' },
      db: { from: mockFrom },
    },
  });
  mockCreateOrgComplianceRepository.mockReturnValue({
    syncFilingStatusTasks: mockSyncFilingStatusTasks,
  });
  mockSyncFilingStatusTasks.mockResolvedValue(undefined);
});

describe('filing calendar mutations', () => {
  it('preserves the federal default when the form submits an empty jurisdiction', async () => {
    const createQuery = stubQuery(
      { data: null, error: null },
      { single: { data: { id: FILING_ID }, error: null } }
    );
    mockFrom.mockReturnValue(createQuery);

    const response = await POST(request('POST', {
      filing_type: 'form_990_pf',
      title: 'Annual filing',
      due_date: '2027-05-15',
      jurisdiction: '',
    }), params());

    expect(response.status).toBe(201);
    expect(mockRequireOrgAccess).toHaveBeenCalledWith(ORG_ID, 'admin');
    expect(createQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      org_id: ORG_ID,
      jurisdiction: 'federal',
      status: 'upcoming',
    }));
  });

  it('rejects unknown mutation fields instead of forwarding them to the database', async () => {
    const response = await POST(request('POST', {
      filing_type: 'form_990_pf',
      title: 'Annual filing',
      due_date: '2027-05-15',
      org_id: 'attacker-controlled-org',
    }), params());

    expect(response.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('synchronizes generated tasks after a terminal status update', async () => {
    const existing = {
      id: FILING_ID,
      filing_type: 'form_990_pf',
      title: 'Annual filing',
      due_date: '2027-05-15',
      status: 'upcoming',
    };
    const existingQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: existing, error: null } }
    );
    const updateQuery = stubQuery(
      { data: null, error: null },
      { single: { data: { ...existing, status: 'filed' }, error: null } }
    );
    mockFrom
      .mockReturnValueOnce(existingQuery)
      .mockReturnValueOnce(updateQuery);

    const response = await PATCH(request('PATCH', {
      id: FILING_ID,
      status: 'filed',
    }), params());

    expect(response.status).toBe(200);
    expect(mockCreateOrgComplianceRepository).toHaveBeenCalledWith({
      orgId: ORG_ID,
      actorId: 'user-1',
    });
    expect(mockSyncFilingStatusTasks).toHaveBeenCalledWith(FILING_ID, 'filed');
  });

  it('does not update a filing ID that is outside the authorized organization', async () => {
    const existingQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: null, error: null } }
    );
    mockFrom.mockReturnValue(existingQuery);

    const response = await PATCH(request('PATCH', {
      id: FILING_ID,
      status: 'filed',
    }), params());

    expect(response.status).toBe(404);
    expect(existingQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', ORG_ID] });
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockSyncFilingStatusTasks).not.toHaveBeenCalled();
  });

  it('rolls the filing back when generated-task synchronization fails', async () => {
    const existing = {
      id: FILING_ID,
      filing_type: 'form_990_pf',
      title: 'Annual filing',
      due_date: '2027-05-15',
      status: 'upcoming',
      description: null,
      jurisdiction: 'federal',
      extension_due_date: null,
      period_start: null,
      period_end: null,
      completed_at: null,
      completed_by: null,
      completed_by_name: null,
      filing_reference: null,
      notes: null,
      reminder_days: [30, 14, 7],
      is_recurring: false,
      recurrence_rule: null,
    };
    const existingQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: existing, error: null } }
    );
    const updateQuery = stubQuery(
      { data: null, error: null },
      { single: { data: { ...existing, status: 'filed' }, error: null } }
    );
    const rollbackQuery = stubQuery({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(existingQuery)
      .mockReturnValueOnce(updateQuery)
      .mockReturnValueOnce(rollbackQuery);
    mockSyncFilingStatusTasks.mockRejectedValue(new Error('Task sync failed'));

    const response = await PATCH(request('PATCH', {
      id: FILING_ID,
      status: 'filed',
      completed_at: '2026-07-28T12:00:00.000Z',
    }), params());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Task sync failed' });
    expect(rollbackQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'upcoming',
      completed_at: null,
    }));
    expect(rollbackQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', ORG_ID] });
  });
});
