// @vitest-environment node

// app/api/__tests__/grants-bulk-transition.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Constants ─────────────────────────────────────────────────────────────────

const ORG_ID   = '11111111-1111-1111-1111-111111111111';
const GRANT_A  = '22222222-2222-2222-2222-222222222222';
const GRANT_B  = '33333333-3333-3333-3333-333333333333';
const USER_ID  = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// ─── Mutable mock state ────────────────────────────────────────────────────────

let _authUser: { id: string } | null = { id: USER_ID };
let _orgRole: string | null = 'admin';

// Preflight: grants returned by the .eq('org_id').in('id') query
let _prefetchData: Array<{ id: string; lifecycle_stage: string; org_id: string }> | null = [
  { id: GRANT_A, lifecycle_stage: 'draft', org_id: ORG_ID },
];
let _prefetchError: { message: string } | null = null;

// transitionGrant internals: single-row fetch by grantId
let _grantFetchData: { lifecycle_stage: string; org_id: string } | null = {
  lifecycle_stage: 'draft',
  org_id: ORG_ID,
};
let _grantFetchError: { message: string } | null = null;
let _transitionRpcError: { message: string } | null = null;
let _batchRpcError: { message: string } | null = null;
let _workflowConfigRows: any[] = [];
let _checklistCompletionRows: any[] = [];

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const mockServerRpc = vi.fn();
const mockAdminFrom = vi.fn();
const mockAdminRpc = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: _authUser } })) },
    rpc: mockServerRpc,
  })),
  createAdminClient: vi.fn(() => ({ from: mockAdminFrom, rpc: mockAdminRpc })),
}));

function setupMocks() {
  mockServerRpc.mockClear();
  mockAdminFrom.mockClear();
  mockAdminRpc.mockClear();

  mockServerRpc.mockImplementation(async (fn: string) => {
    if (fn === 'user_org_role') return { data: _orgRole, error: null };
    return { data: null, error: null };
  });

  mockAdminRpc.mockImplementation(async (fn: string) => {
    if (fn === 'transition_grant_lifecycle') return { data: null, error: _transitionRpcError };
    if (fn === 'transition_grant_lifecycle_batch') {
      return {
        data: {
          successCount: _prefetchData?.length ?? 0,
          failureCount: 0,
          results: (_prefetchData ?? []).map(g => ({
            grantId: g.id,
            fromStage: g.lifecycle_stage,
            targetStage: 'prospect',
            success: true,
          })),
        },
        error: _batchRpcError,
      };
    }
    return { data: null, error: null };
  });

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'grants') {
      return {
        // Preflight uses .eq().in() — transitionGrant uses .eq().single()
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(async () => ({ data: _prefetchError ? null : _prefetchData, error: _prefetchError })),
            maybeSingle: vi.fn(async () => ({ data: _grantFetchData, error: _grantFetchError })),
          })),
        })),
      };
    }
    if (table === 'org_workflow_config') {
      const b: any = {
        select: vi.fn(() => b),
        eq: vi.fn(() => b),
        order: vi.fn(async () => ({ data: _workflowConfigRows, error: null })),
      };
      return b;
    }
    if (table === 'grant_checklist_completions') {
      const b: any = {
        select: vi.fn(() => b),
        eq: vi.fn(() => b),
        then: (resolve: any) =>
          Promise.resolve({ data: _checklistCompletionRows, error: null }).then(resolve),
      };
      return b;
    }
    const b: any = { select: vi.fn(() => b), eq: vi.fn(() => b), insert: vi.fn(async () => ({ error: null })) };
    return b;
  });
}

// ─── Subject under test ────────────────────────────────────────────────────────

import { POST } from '@/app/api/org/[orgId]/grants/bulk-transition/route';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/org/${ORG_ID}/grants/bulk-transition`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeParams(orgId = ORG_ID) {
  return { params: Promise.resolve({ orgId }) } as any;
}

// ─── beforeEach ────────────────────────────────────────────────────────────────

beforeEach(() => {
  _authUser = { id: USER_ID };
  _orgRole = 'admin';
  _prefetchData = [{ id: GRANT_A, lifecycle_stage: 'draft', org_id: ORG_ID }];
  _prefetchError = null;
  _grantFetchData = { lifecycle_stage: 'draft', org_id: ORG_ID };
  _grantFetchError = null;
  _transitionRpcError = null;
  _batchRpcError = null;
  _workflowConfigRows = [];
  _checklistCompletionRows = [];
  setupMocks();
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe('POST bulk-transition — auth', () => {
  it('returns 401 when unauthenticated', async () => {
    _authUser = null;
    const res = await POST(makeRequest({ transitions: [{ grantId: GRANT_A, expectedFromStage: 'draft', targetStage: 'prospect' }] }), makeParams());
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is viewer', async () => {
    _orgRole = 'viewer';
    const res = await POST(makeRequest({ transitions: [{ grantId: GRANT_A, expectedFromStage: 'draft', targetStage: 'prospect' }] }), makeParams());
    expect(res.status).toBe(403);
  });

  it('returns 403 when role is member', async () => {
    _orgRole = 'member';
    const res = await POST(makeRequest({ transitions: [{ grantId: GRANT_A, expectedFromStage: 'draft', targetStage: 'prospect' }] }), makeParams());
    expect(res.status).toBe(403);
  });

  it('accepts owner role', async () => {
    _orgRole = 'owner';
    const res = await POST(makeRequest({ transitions: [{ grantId: GRANT_A, expectedFromStage: 'draft', targetStage: 'prospect' }] }), makeParams());
    expect(res.status).toBe(207);
  });
});

// ─── Body validation ──────────────────────────────────────────────────────────

describe('POST bulk-transition — body validation', () => {
  it('returns 400 for empty transitions array', async () => {
    const res = await POST(makeRequest({ transitions: [] }), makeParams());
    expect(res.status).toBe(400);
  });

  it('returns 400 for more than 50 transitions', async () => {
    const transitions = Array.from({ length: 51 }, (_, i) => ({
      grantId: `${i.toString().padStart(8, '0')}-0000-0000-0000-000000000000`,
      expectedFromStage: 'draft',
      targetStage: 'prospect',
    }));
    const res = await POST(makeRequest({ transitions }), makeParams());
    expect(res.status).toBe(400);
  });

  it('returns 400 for duplicate grantId values', async () => {
    const res = await POST(makeRequest({
      transitions: [
        { grantId: GRANT_A, expectedFromStage: 'draft', targetStage: 'prospect' },
        { grantId: GRANT_A, expectedFromStage: 'draft', targetStage: 'cancelled' },
      ],
    }), makeParams());
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid UUID grantId', async () => {
    const res = await POST(makeRequest({ transitions: [{ grantId: 'not-a-uuid', expectedFromStage: 'draft', targetStage: 'prospect' }] }), makeParams());
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid expectedFromStage', async () => {
    const res = await POST(makeRequest({ transitions: [{ grantId: GRANT_A, expectedFromStage: 'flying', targetStage: 'prospect' }] }), makeParams());
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid targetStage', async () => {
    const res = await POST(makeRequest({ transitions: [{ grantId: GRANT_A, expectedFromStage: 'draft', targetStage: 'flying' }] }), makeParams());
    expect(res.status).toBe(400);
  });

  it('returns 400 for unknown top-level field in transition object', async () => {
    const res = await POST(makeRequest({ transitions: [{ grantId: GRANT_A, expectedFromStage: 'draft', targetStage: 'prospect', hacked: true }] }), makeParams());
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid decision.amount (negative)', async () => {
    const res = await POST(makeRequest({
      transitions: [{
        grantId: GRANT_A,
        expectedFromStage: 'recommended',
        targetStage: 'approved',
        decision: { decision_type: 'approval', decision: 'approved', amount: -100 },
      }],
    }), makeParams());
    expect(res.status).toBe(400);
  });
});

// ─── Per-grant failures (207) ─────────────────────────────────────────────────

describe('POST bulk-transition — per-grant failures (207)', () => {
  it('marks grant as failed when it is not in the org', async () => {
    _prefetchData = []; // GRANT_A not returned — not in org
    const res = await POST(makeRequest({ transitions: [{ grantId: GRANT_A, expectedFromStage: 'draft', targetStage: 'prospect' }] }), makeParams());
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].error).toMatch(/not found/i);
  });

  it('marks grant as failed when expectedFromStage is stale', async () => {
    _prefetchData = [{ id: GRANT_A, lifecycle_stage: 'prospect', org_id: ORG_ID }]; // already at prospect
    const res = await POST(makeRequest({ transitions: [{ grantId: GRANT_A, expectedFromStage: 'draft', targetStage: 'prospect' }] }), makeParams());
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].error).toMatch(/stage has changed/i);
  });

  it('marks grant as failed for invalid transition', async () => {
    _prefetchData = [{ id: GRANT_A, lifecycle_stage: 'closed', org_id: ORG_ID }];
    const res = await POST(makeRequest({ transitions: [{ grantId: GRANT_A, expectedFromStage: 'closed', targetStage: 'active' }] }), makeParams());
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.results[0].success).toBe(false);
  });

  it('marks grant as failed when decision required but not supplied', async () => {
    _prefetchData = [{ id: GRANT_A, lifecycle_stage: 'recommended', org_id: ORG_ID }];
    _grantFetchData = { lifecycle_stage: 'recommended', org_id: ORG_ID };
    const res = await POST(makeRequest({ transitions: [{ grantId: GRANT_A, expectedFromStage: 'recommended', targetStage: 'approved' }] }), makeParams());
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].error).toMatch(/decision required/i);
  });
});

// ─── Happy paths (207 success) ────────────────────────────────────────────────

describe('POST bulk-transition — success paths (207)', () => {
  it('returns 207 with success:true for a valid transition', async () => {
    const res = await POST(makeRequest({ transitions: [{ grantId: GRANT_A, expectedFromStage: 'draft', targetStage: 'prospect' }] }), makeParams());
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.successCount).toBe(1);
    expect(body.failureCount).toBe(0);
    expect(body.results[0].success).toBe(true);
    expect(body.results[0].grantId).toBe(GRANT_A);
  });

  it('defaults decision_date when not supplied and decision is provided', async () => {
    _prefetchData = [{ id: GRANT_A, lifecycle_stage: 'recommended', org_id: ORG_ID }];
    _grantFetchData = { lifecycle_stage: 'recommended', org_id: ORG_ID };

    const res = await POST(makeRequest({
      transitions: [{
        grantId: GRANT_A,
        expectedFromStage: 'recommended',
        targetStage: 'approved',
        decision: { decision_type: 'approval', decision: 'approved', rationale: 'Board approved' },
      }],
    }), makeParams());

    expect(res.status).toBe(207);

    expect(mockAdminRpc).toHaveBeenCalledWith(
      'transition_grant_lifecycle',
      expect.objectContaining({
        p_grant_id: GRANT_A,
        p_expected_org_id: ORG_ID,
        p_expected_from_stage: 'recommended',
        p_to_stage: 'approved',
      })
    );
    const rpcPayload = (mockAdminRpc.mock.calls as any[][]).find(
      ([fn]) => fn === 'transition_grant_lifecycle'
    )?.[1];
    expect(rpcPayload).toBeDefined();
    const inserted = rpcPayload!.p_decision_payload;
    const today = new Date().toISOString().slice(0, 10);
    expect(inserted.decision_date).toBe(today);
    expect(inserted.decided_by).toBe(USER_ID);
  });

  it('returns mixed results for a batch with one success and one stale grant', async () => {
    _prefetchData = [
      { id: GRANT_A, lifecycle_stage: 'draft', org_id: ORG_ID },
      { id: GRANT_B, lifecycle_stage: 'prospect', org_id: ORG_ID }, // stale — client sends 'draft'
    ];
    _grantFetchData = { lifecycle_stage: 'draft', org_id: ORG_ID };

    const res = await POST(makeRequest({
      transitions: [
        { grantId: GRANT_A, expectedFromStage: 'draft', targetStage: 'prospect' },
        { grantId: GRANT_B, expectedFromStage: 'draft', targetStage: 'prospect' }, // stale
      ],
    }), makeParams());
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.successCount).toBe(1);
    expect(body.failureCount).toBe(1);
    expect(body.results).toHaveLength(2);
    const aResult = body.results.find((r: any) => r.grantId === GRANT_A);
    const bResult = body.results.find((r: any) => r.grantId === GRANT_B);
    expect(aResult.success).toBe(true);
    expect(bResult.success).toBe(false);
  });

  it('response includes successCount, failureCount, and one result per input transition', async () => {
    const res = await POST(makeRequest({ transitions: [{ grantId: GRANT_A, expectedFromStage: 'draft', targetStage: 'prospect' }] }), makeParams());
    const body = await res.json();
    expect(body).toHaveProperty('successCount');
    expect(body).toHaveProperty('failureCount');
    expect(body).toHaveProperty('results');
    expect(body.results).toHaveLength(1);
  });

  it('documents default partial execution mode in the response', async () => {
    const res = await POST(makeRequest({ transitions: [{ grantId: GRANT_A, expectedFromStage: 'draft', targetStage: 'prospect' }] }), makeParams());
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.mode).toBe('partial');
    expect(body.partialExecution).toBe(true);
    expect(body.contract).toMatch(/not rolled back in partial mode/i);
  });

  it('preflight query includes org_id scope', async () => {
    // Capture eq calls to verify org_id scoping
    const eqSpy = vi.fn((col: string, _val: string) => ({
      in: vi.fn(async () => ({ data: _prefetchData, error: null })),
      single: vi.fn(async () => ({ data: _grantFetchData, error: _grantFetchError })),
    }));
    mockAdminFrom.mockImplementationOnce((table: string) => {
      if (table === 'grants') {
        return {
          select: vi.fn(() => ({ eq: eqSpy })),
          update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
        };
      }
      const b: any = { select: vi.fn(() => b), eq: vi.fn(() => b), insert: vi.fn(async () => ({ error: null })) };
      return b;
    });

    await POST(
      makeRequest({ transitions: [{ grantId: GRANT_A, expectedFromStage: 'draft', targetStage: 'prospect' }] }),
      makeParams(),
    );

    // The first eq call on the grants table must scope to org_id
    const firstCall = eqSpy.mock.calls[0];
    expect(firstCall[0]).toBe('org_id');
    expect(firstCall[1]).toBe(ORG_ID);
  });
});

// ─── Safety modes ────────────────────────────────────────────────────────────

describe('POST bulk-transition — safety modes', () => {
  it('dry_run validates transitions without calling transition RPCs', async () => {
    const res = await POST(makeRequest({
      dry_run: true,
      transitions: [{ grantId: GRANT_A, expectedFromStage: 'draft', targetStage: 'prospect' }],
    }), makeParams());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('dry_run');
    expect(body.dryRun).toBe(true);
    expect(body.partialExecution).toBe(false);
    expect(body.successCount).toBe(1);
    expect(mockAdminRpc).not.toHaveBeenCalledWith('transition_grant_lifecycle', expect.anything());
    expect(mockAdminRpc).not.toHaveBeenCalledWith('transition_grant_lifecycle_batch', expect.anything());
  });

  it('dry_run returns validation failures without writes', async () => {
    _prefetchData = [{ id: GRANT_A, lifecycle_stage: 'prospect', org_id: ORG_ID }];
    const res = await POST(makeRequest({
      dry_run: true,
      transitions: [{ grantId: GRANT_A, expectedFromStage: 'draft', targetStage: 'prospect' }],
    }), makeParams());

    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.mode).toBe('dry_run');
    expect(body.failureCount).toBe(1);
    expect(mockAdminRpc).not.toHaveBeenCalledWith('transition_grant_lifecycle', expect.anything());
    expect(mockAdminRpc).not.toHaveBeenCalledWith('transition_grant_lifecycle_batch', expect.anything());
  });

  it('rollback_on_error blocks the whole batch when preflight has failures', async () => {
    _prefetchData = [
      { id: GRANT_A, lifecycle_stage: 'draft', org_id: ORG_ID },
      { id: GRANT_B, lifecycle_stage: 'prospect', org_id: ORG_ID },
    ];

    const res = await POST(makeRequest({
      rollback_on_error: true,
      transitions: [
        { grantId: GRANT_A, expectedFromStage: 'draft', targetStage: 'prospect' },
        { grantId: GRANT_B, expectedFromStage: 'draft', targetStage: 'prospect' },
      ],
    }), makeParams());

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.mode).toBe('rollback_on_error');
    expect(body.writesStarted).toBe(false);
    expect(body.successCount).toBe(0);
    expect(body.results.every((r: any) => r.success === false)).toBe(true);
    expect(mockAdminRpc).not.toHaveBeenCalledWith('transition_grant_lifecycle', expect.anything());
    expect(mockAdminRpc).not.toHaveBeenCalledWith('transition_grant_lifecycle_batch', expect.anything());
  });

  it('rollback_on_error uses the atomic batch transition RPC when preflight passes', async () => {
    const res = await POST(makeRequest({
      rollback_on_error: true,
      transitions: [{ grantId: GRANT_A, expectedFromStage: 'draft', targetStage: 'prospect' }],
    }), makeParams());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('rollback_on_error');
    expect(body.partialExecution).toBe(false);
    expect(body.successCount).toBe(1);
    expect(mockAdminRpc).toHaveBeenCalledWith(
      'transition_grant_lifecycle_batch',
      expect.objectContaining({
        p_expected_org_id: ORG_ID,
        p_actor_id: USER_ID,
      })
    );
    expect(mockAdminRpc).not.toHaveBeenCalledWith('transition_grant_lifecycle', expect.anything());
  });

  it('rollback_on_error reports a rolled-back batch when the batch RPC fails', async () => {
    _batchRpcError = { message: 'GRANT_TRANSITION_CONFLICT' };
    const res = await POST(makeRequest({
      rollback_on_error: true,
      transitions: [{ grantId: GRANT_A, expectedFromStage: 'draft', targetStage: 'prospect' }],
    }), makeParams());

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.rollbackPerformed).toBe(true);
    expect(body.successCount).toBe(0);
    expect(body.failureCount).toBe(1);
    expect(body.results[0].error).toMatch(/rolled back/i);
  });
});

// ─── Preflight DB error ───────────────────────────────────────────────────────

describe('POST bulk-transition — preflight DB error', () => {
  it('returns 500 when the preflight DB query fails', async () => {
    _prefetchError = { message: 'connection refused' };
    const res = await POST(makeRequest({ transitions: [{ grantId: GRANT_A, expectedFromStage: 'draft', targetStage: 'prospect' }] }), makeParams());
    expect(res.status).toBe(500);
  });
});

// ─── Workflow gate ─────────────────────────────────────────────────────────────

describe('POST bulk-transition — workflow gate', () => {
  const GRANT_1 = '33333333-3333-3333-3333-333333333331';
  const GRANT_2 = '33333333-3333-3333-3333-333333333332';

  it('preflight rejects gate-blocked grants (rollback_on_error=false)', async () => {
    // Both grants exist with valid transitions from due_diligence → recommended
    _prefetchData = [
      { id: GRANT_1, lifecycle_stage: 'due_diligence', org_id: ORG_ID },
      { id: GRANT_2, lifecycle_stage: 'due_diligence', org_id: ORG_ID },
    ];
    // A required checklist item exists for due_diligence → both blocked
    _workflowConfigRows = [{
      id: 'cfg-1',
      config_type: 'stage_checklist',
      stage_key: 'due_diligence',
      config_key: 'site_visit',
      config_value: { label: 'Site visit completed', required: true },
      sort_order: 0,
    }];
    // No completions → both grants are blocked
    _checklistCompletionRows = [];

    const res = await POST(makeRequest({
      transitions: [
        { grantId: GRANT_1, expectedFromStage: 'due_diligence', targetStage: 'recommended' },
        { grantId: GRANT_2, expectedFromStage: 'due_diligence', targetStage: 'recommended' },
      ],
      rollback_on_error: false,
    }), makeParams());

    expect(res.status).toBe(207);
    const body = await res.json();
    const errors = body.results.filter((r: any) => !r.success);
    expect(errors.length).toBe(2);
    expect(errors[0].error).toMatch(/blocked/i);
  });

  it('preflight blocks rollback_on_error execution when gate fails', async () => {
    _prefetchData = [
      { id: GRANT_1, lifecycle_stage: 'due_diligence', org_id: ORG_ID },
    ];
    _workflowConfigRows = [{
      id: 'cfg-1',
      config_type: 'stage_checklist',
      stage_key: 'due_diligence',
      config_key: 'site_visit',
      config_value: { label: 'Site visit completed', required: true },
      sort_order: 0,
    }];
    _checklistCompletionRows = [];

    const res = await POST(makeRequest({
      transitions: [{ grantId: GRANT_1, expectedFromStage: 'due_diligence', targetStage: 'recommended' }],
      rollback_on_error: true,
    }), makeParams());

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.rollbackOnError).toBe(true);
    expect(body.results[0].success).toBe(false);
  });
});
