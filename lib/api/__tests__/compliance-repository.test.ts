// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InvalidComplianceAttachmentPathError,
  createOrgComplianceRepository,
  createPortfolioComplianceRepository,
} from '@/lib/api/repositories/compliance';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const {
  mockCreateElevatedClient,
  mockFrom,
  mockStorageFrom,
  mockCompleteGeneratedTasks,
  mockCancelGeneratedTasks,
  mockWriteOrgAuditEvent,
} = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
  mockStorageFrom: vi.fn(),
  mockCompleteGeneratedTasks: vi.fn(),
  mockCancelGeneratedTasks: vi.fn(),
  mockWriteOrgAuditEvent: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

vi.mock('@/lib/tasks/automation/task-writer', () => ({
  completeGeneratedTasks: mockCompleteGeneratedTasks,
  cancelGeneratedTasks: mockCancelGeneratedTasks,
}));

vi.mock('@/lib/audit/org-audit', () => ({
  ORG_AUDIT_ACTIONS: { COMPLIANCE_990PF_EXPORTED: 'compliance.990pf_exported' },
  writeOrgAuditEvent: mockWriteOrgAuditEvent,
}));

const db = {
  from: mockFrom,
  storage: { from: mockStorageFrom },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue(db);
});

describe('createOrgComplianceRepository', () => {
  const scope = { orgId: 'org-1', actorId: 'user-1' };
  const attachment = {
    path: 'org-1/filing-1/receipt.pdf',
    name: 'receipt.pdf',
    size: 100,
    uploaded_at: '2026-07-28T00:00:00.000Z',
  };

  it('synchronizes terminal filing tasks within the fixed org and filing prefix', async () => {
    const repository = createOrgComplianceRepository(scope);

    await repository.syncFilingStatusTasks('filing-1', 'filed');
    await repository.syncFilingStatusTasks('filing-2', 'waived');

    expect(mockCompleteGeneratedTasks).toHaveBeenCalledWith(
      db,
      'org-1',
      'filing:filing-1:',
      'Filing marked as filed'
    );
    expect(mockCancelGeneratedTasks).toHaveBeenCalledWith(
      db,
      'org-1',
      'filing:filing-2:',
      'Filing waived'
    );
  });

  it('scopes attachment lookup to the authorized organization before signing', async () => {
    const filingQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'filing-1', attachments: [attachment] }, error: null } }
    );
    const createSignedUrl = vi.fn(async () => ({
      data: { signedUrl: 'https://signed.example.test/receipt.pdf' },
      error: null,
    }));
    mockFrom.mockReturnValue(filingQuery);
    mockStorageFrom.mockReturnValue({ createSignedUrl });

    const result = await createOrgComplianceRepository(scope)
      .listFilingAttachments('filing-1');

    expect(filingQuery.calls).toContainEqual({ method: 'eq', args: ['id', 'filing-1'] });
    expect(filingQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(createSignedUrl).toHaveBeenCalledWith(attachment.path, 3600);
    expect(result[0].signed_url).toBe('https://signed.example.test/receipt.pdf');
  });

  it('refuses to sign attachment metadata outside the authorized filing prefix', async () => {
    const filingQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: {
            id: 'filing-1',
            attachments: [{ ...attachment, path: 'org-2/filing-2/private.pdf' }],
          },
          error: null,
        },
      }
    );
    mockFrom.mockReturnValue(filingQuery);
    const repository = createOrgComplianceRepository(scope);

    await expect(repository.listFilingAttachments('filing-1'))
      .rejects.toBeInstanceOf(InvalidComplianceAttachmentPathError);
    expect(mockStorageFrom).not.toHaveBeenCalled();
  });

  it('builds uploaded object paths inside the authorized org and filing', async () => {
    const filingQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'filing-1', attachments: [] }, error: null } }
    );
    const updateQuery = stubQuery({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(filingQuery)
      .mockReturnValueOnce(updateQuery);
    const upload = vi.fn(async () => ({ data: {}, error: null }));
    const createSignedUrl = vi.fn(async () => ({
      data: { signedUrl: 'https://signed.example.test/new.pdf' },
      error: null,
    }));
    mockStorageFrom.mockReturnValue({ upload, createSignedUrl });

    const result = await createOrgComplianceRepository(scope).uploadFilingAttachment({
      filingId: 'filing-1',
      fileName: '../board packet.pdf',
      fileSize: 100,
      contentType: 'application/pdf',
      body: new ArrayBuffer(8),
    });

    const uploadedPath = (upload.mock.calls as unknown[][])[0][0] as string;
    expect(uploadedPath).toMatch(/^org-1\/filing-1\/[0-9a-f-]+___board_packet\.pdf$/);
    expect(uploadedPath).not.toContain('..');
    expect(result.path).toBe(uploadedPath);
    expect(updateQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
  });

  it('rejects deletion paths outside scope before any database or storage call', async () => {
    const repository = createOrgComplianceRepository(scope);

    await expect(repository.deleteFilingAttachment(
      'filing-1',
      'org-2/filing-2/private.pdf'
    )).rejects.toBeInstanceOf(InvalidComplianceAttachmentPathError);

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockStorageFrom).not.toHaveBeenCalled();
  });

  it('removes metadata before attempting best-effort storage cleanup', async () => {
    const filingQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'filing-1', attachments: [attachment] }, error: null } }
    );
    const updateQuery = stubQuery({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(filingQuery)
      .mockReturnValueOnce(updateQuery);
    const remove = vi.fn(async () => ({ error: null }));
    mockStorageFrom.mockReturnValue({ remove });

    await createOrgComplianceRepository(scope)
      .deleteFilingAttachment('filing-1', attachment.path);

    expect(updateQuery.update).toHaveBeenCalledWith({ attachments: [] });
    expect(updateQuery.update.mock.invocationCallOrder[0])
      .toBeLessThan(remove.mock.invocationCallOrder[0]);
    expect(remove).toHaveBeenCalledWith([attachment.path]);
  });

  it('does not expose the elevated client or generic table access', () => {
    const repository = createOrgComplianceRepository(scope);

    expect(repository).not.toHaveProperty('db');
    expect(repository).not.toHaveProperty('from');
  });
});

describe('createPortfolioComplianceRepository', () => {
  it('forces org, portfolio, and actor scope into 990-PF audit events', async () => {
    const repository = createPortfolioComplianceRepository({
      orgId: 'org-1',
      portfolioId: 'portfolio-1',
      actorId: 'user-1',
    });

    await repository.record990PfExport({ tax_year: 2025 });

    expect(mockWriteOrgAuditEvent).toHaveBeenCalledWith(db, {
      orgId: 'org-1',
      actorId: 'user-1',
      action: 'compliance.990pf_exported',
      targetId: 'portfolio-1',
      metadata: { tax_year: 2025 },
    });
  });
});
