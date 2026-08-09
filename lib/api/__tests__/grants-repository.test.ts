// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createGrantDocumentRepository,
  createGrantRepository,
  GrantDocumentGrantNotFoundError,
  InvalidGrantDocumentPathError,
} from '@/lib/api/repositories/grants';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const {
  mockCreateElevatedClient,
  mockFrom,
  mockRpc,
  mockWriteOrgAuditEvent,
  mockStorageFrom,
  mockCreateSignedUrl,
  mockUpload,
  mockRemove,
} = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockWriteOrgAuditEvent: vi.fn(),
  mockStorageFrom: vi.fn(),
  mockCreateSignedUrl: vi.fn(),
  mockUpload: vi.fn(),
  mockRemove: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

vi.mock('@/lib/audit/org-audit', () => ({
  ORG_AUDIT_ACTIONS: { GRANT_DECISION_RECORDED: 'grant.decision_recorded' },
  writeOrgAuditEvent: mockWriteOrgAuditEvent,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReset();
  mockRpc.mockReset();
  mockStorageFrom.mockReset();
  mockCreateSignedUrl.mockReset();
  mockUpload.mockReset();
  mockRemove.mockReset();
  mockStorageFrom.mockReturnValue({
    createSignedUrl: mockCreateSignedUrl,
    upload: mockUpload,
    remove: mockRemove,
  });
  mockCreateElevatedClient.mockReturnValue({
    from: mockFrom,
    rpc: mockRpc,
    storage: { from: mockStorageFrom },
  });
});

describe('createGrantRepository', () => {
  it('applies milestone and generated-task changes through the scoped atomic RPC', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { id: 'milestone-1', status: 'completed' },
      error: null,
    });

    const result = await createGrantRepository({ orgId: 'org-1', actorId: 'user-1' })
      .updateMilestoneWithTaskSync({
        portfolioId: 'portfolio-1',
        holdingId: 'holding-1',
        milestoneId: 'milestone-1',
        patch: { status: 'completed' },
      });

    expect(mockRpc).toHaveBeenCalledWith('update_grant_milestone_with_task_sync', {
      p_expected_org_id: 'org-1',
      p_expected_portfolio_id: 'portfolio-1',
      p_expected_holding_id: 'holding-1',
      p_milestone_id: 'milestone-1',
      p_actor_id: 'user-1',
      p_patch: { status: 'completed' },
    });
    expect(result).toEqual({ id: 'milestone-1', status: 'completed' });
  });

  it('forces portfolio lookups into the repository org scope', async () => {
    const query = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'portfolio-1', org_id: 'org-1' }, error: null } }
    );
    mockFrom.mockReturnValue(query);
    const repository = createGrantRepository({ orgId: 'org-1', actorId: 'user-1' });

    await repository.findPortfolio('portfolio-1');

    expect(mockFrom).toHaveBeenCalledWith('portfolios');
    expect(query.calls).toContainEqual({ method: 'eq', args: ['id', 'portfolio-1'] });
    expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(query.calls).toContainEqual({ method: 'is', args: ['deleted_at', null] });
  });

  it('only resolves active accepted owner assignments in the scoped org', async () => {
    const query = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'membership-1' }, error: null } }
    );
    mockFrom.mockReturnValue(query);
    const repository = createGrantRepository({ orgId: 'org-1', actorId: 'user-1' });

    await repository.findOrganizationMember('owner-1');

    expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(query.calls).toContainEqual({ method: 'eq', args: ['user_id', 'owner-1'] });
    expect(query.calls).toContainEqual({ method: 'not', args: ['accepted_at', 'is', null] });
  });

  it('injects org and actor scope into atomic grant creation', async () => {
    mockRpc.mockResolvedValue({ data: { grant: { id: 'grant-1' } }, error: null });
    const repository = createGrantRepository({ orgId: 'org-1', actorId: 'user-1' });

    await repository.createWithFoundationRecords({
      portfolioId: 'portfolio-1',
      purpose: 'Education',
      requestedAmount: 100_000,
      investeeId: 'investee-1',
      currency: 'USD',
      lifecycleStage: 'draft',
      renewalEligible: false,
    });

    expect(mockRpc).toHaveBeenCalledWith('create_grant_with_foundation_records', {
      p_org_id: 'org-1',
      p_portfolio_id: 'portfolio-1',
      p_actor_id: 'user-1',
      p_purpose: 'Education',
      p_requested_amount: 100_000,
      p_investee_id: 'investee-1',
      p_new_grantee: null,
      p_currency: 'USD',
      p_grant_type: null,
      p_grant_period_start: null,
      p_grant_period_end: null,
      p_lifecycle_stage: 'draft',
      p_internal_owner_id: null,
      p_risk_level: null,
      p_reporting_frequency: null,
      p_renewal_eligible: false,
      p_workflow_template_id: null,
    });
  });

  it('records decisions and their audit event inside the authorized org scope', async () => {
    const grantQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'grant-1' }, error: null } }
    );
    const decisionQuery = stubQuery(
      { data: null, error: null },
      { single: { data: { id: 'decision-1' }, error: null } }
    );
    mockFrom.mockImplementation(table => table === 'grants' ? grantQuery : decisionQuery);
    const repository = createGrantRepository({ orgId: 'org-1', actorId: 'user-1' });

    await repository.recordDecision({
      grantId: 'grant-1',
      decisionType: 'approval',
      decision: 'approved',
      decisionDate: '2026-07-27',
      decidedBy: 'board-member-1',
      amount: 25_000,
    });

    expect(mockFrom).toHaveBeenCalledWith('grant_decisions');
    expect(grantQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(decisionQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      org_id: 'org-1',
      grant_id: 'grant-1',
      decided_by: 'board-member-1',
    }));
    expect(mockWriteOrgAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: 'org-1',
        actorId: 'user-1',
        targetId: 'grant-1',
      })
    );
  });

  it('refuses to record a decision when the grant is outside the repository org', async () => {
    const grantQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: null, error: null } }
    );
    mockFrom.mockReturnValue(grantQuery);
    const repository = createGrantRepository({ orgId: 'org-1', actorId: 'user-1' });

    const result = await repository.recordDecision({
      grantId: 'grant-from-another-org',
      decisionType: 'approval',
      decision: 'approved',
      decisionDate: '2026-07-27',
      decidedBy: 'board-member-1',
    });

    expect(result.notFound).toBe(true);
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockWriteOrgAuditEvent).not.toHaveBeenCalled();
  });

  it('does not expose the elevated client or generic table access', () => {
    const repository = createGrantRepository({ orgId: 'org-1', actorId: 'user-1' });

    expect(repository).not.toHaveProperty('db');
    expect(repository).not.toHaveProperty('from');
  });

  it('forces lifecycle grant reads into the repository org scope', async () => {
    const query = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: { id: 'grant-1', org_id: 'org-1', lifecycle_stage: 'draft' },
          error: null,
        },
      }
    );
    mockFrom.mockReturnValue(query);
    const repository = createGrantRepository({ orgId: 'org-1', actorId: 'user-1' });

    await repository.findWorkflowGrant('grant-1');

    expect(query.calls).toContainEqual({ method: 'eq', args: ['id', 'grant-1'] });
    expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
  });

  it('injects org, actor, and expected stage into the atomic transition RPC', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const repository = createGrantRepository({ orgId: 'org-1', actorId: 'user-1' });

    await repository.transitionLifecycle({
      grantId: 'grant-1',
      expectedFromStage: 'draft',
      targetStage: 'prospect',
      reason: 'Qualified prospect',
    });

    expect(mockRpc).toHaveBeenCalledWith('transition_grant_lifecycle', {
      p_grant_id: 'grant-1',
      p_expected_org_id: 'org-1',
      p_expected_from_stage: 'draft',
      p_to_stage: 'prospect',
      p_actor_id: 'user-1',
      p_reason: 'Qualified prospect',
      p_decision_payload: null,
    });
  });
});

describe('createGrantDocumentRepository', () => {
  const scope = { orgId: 'org-1', portfolioId: 'portfolio-1', actorId: 'user-1' };

  it('rejects grants outside the authorized org and portfolio', async () => {
    const grantQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: null, error: null } }
    );
    mockFrom.mockReturnValue(grantQuery);
    const repository = createGrantDocumentRepository(scope);

    await expect(repository.listDocuments('grant-2')).rejects.toBeInstanceOf(
      GrantDocumentGrantNotFoundError
    );

    expect(grantQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(grantQuery.calls).toContainEqual({ method: 'eq', args: ['portfolio_id', 'portfolio-1'] });
    expect(mockStorageFrom).not.toHaveBeenCalled();
  });

  it('does not sign a document path outside the authorized portfolio and grant prefix', async () => {
    const grantQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'grant-1' }, error: null } }
    );
    const documentsQuery = stubQuery({
      data: [{ id: 'doc-1', storage_path: 'portfolio-2/grant-2/private.pdf' }],
      error: null,
    });
    mockFrom.mockImplementation(table => table === 'grants' ? grantQuery : documentsQuery);
    const repository = createGrantDocumentRepository(scope);

    await expect(repository.listDocuments('grant-1')).rejects.toBeInstanceOf(
      InvalidGrantDocumentPathError
    );
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  it('builds uploads inside the authorized portfolio and records the actor', async () => {
    const grantQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'grant-1' }, error: null } }
    );
    const documentQuery = stubQuery(
      { data: null, error: null },
      { single: { data: { id: 'doc-1' }, error: null } }
    );
    mockFrom.mockImplementation(table => table === 'grants' ? grantQuery : documentQuery);
    mockUpload.mockResolvedValue({ error: null });
    const repository = createGrantDocumentRepository(scope);

    await repository.uploadDocument({
      grantId: 'grant-1',
      documentType: 'proposal',
      fileName: 'proposal.pdf',
      fileSize: 128,
      mimeType: 'application/pdf',
      extension: 'pdf',
      body: new ArrayBuffer(128),
    });

    expect(mockUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^portfolio-1\/grant-1\/proposal-[0-9a-f-]+\.pdf$/),
      expect.any(ArrayBuffer),
      { contentType: 'application/pdf', upsert: false }
    );
    expect(documentQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      grant_id: 'grant-1',
      uploaded_by: 'user-1',
    }));
  });
});
