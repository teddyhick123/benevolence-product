// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const mocks = vi.hoisted(() => ({
  createElevatedClient: vi.fn(),
  writeOrgAuditEvent: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mocks.createElevatedClient,
}));

vi.mock('@/lib/audit/org-audit', () => ({
  ORG_AUDIT_ACTIONS: { GRANT_PAYMENT_RECORDED: 'grant.payment.recorded' },
  writeOrgAuditEvent: mocks.writeOrgAuditEvent,
}));

import { createAssistantToolCapabilities } from '@/lib/api/repositories/ai-tools';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('assistant tool capabilities', () => {
  it('proves grant scope before writing an elevated payment audit', async () => {
    const grant = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'grant-1' }, error: null } }
    );
    const db = { from: vi.fn(() => grant) };
    mocks.createElevatedClient.mockReturnValue(db);
    mocks.writeOrgAuditEvent.mockResolvedValue(undefined);

    const capabilities = createAssistantToolCapabilities({
      orgId: 'org-1',
      portfolioId: 'portfolio-1',
      principal: { kind: 'user', userId: 'user-1' },
    });
    await capabilities.recordGrantPaymentAudit({
      grantId: 'grant-1',
      paymentId: 'payment-1',
      operation: 'insert',
      amount: 100,
      status: 'scheduled',
      scheduledDate: '2026-08-05',
      paidDate: null,
    });

    expect(grant.calls).toContainEqual({ method: 'eq', args: ['id', 'grant-1'] });
    expect(grant.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(grant.calls).toContainEqual({
      method: 'eq',
      args: ['portfolio_id', 'portfolio-1'],
    });
    expect(mocks.writeOrgAuditEvent).toHaveBeenCalledWith(db, expect.objectContaining({
      orgId: 'org-1',
      actorId: 'user-1',
      targetId: 'grant-1',
    }));
    expect(capabilities).not.toHaveProperty('db');
  });

  it('does not audit a grant outside the authorized scope', async () => {
    const grant = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: null, error: null } }
    );
    mocks.createElevatedClient.mockReturnValue({ from: vi.fn(() => grant) });
    const capabilities = createAssistantToolCapabilities({
      orgId: 'org-1',
      portfolioId: 'portfolio-1',
      principal: { kind: 'user', userId: 'user-1' },
    });

    await expect(capabilities.recordGrantPaymentAudit({
      grantId: 'grant-other',
      paymentId: 'payment-1',
      operation: 'update',
      amount: 100,
      status: 'paid',
      scheduledDate: null,
      paidDate: '2026-08-05',
    })).rejects.toThrow('Grant not found in the authorized portfolio');
    expect(mocks.writeOrgAuditEvent).not.toHaveBeenCalled();
  });
});
