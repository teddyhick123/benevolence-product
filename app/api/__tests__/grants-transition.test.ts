// app/api/__tests__/grants-transition.test.ts
//
// Tests for POST /api/org/[orgId]/grants/[grantId]/transition
// Route: app/api/org/[orgId]/grants/[grantId]/transition/route.ts
//
// Auth model:
//   - createServerClient() → auth.getUser() → rpc('user_org_role')
//   - POST: role must be member, admin, or owner
//
// DB boundary:
//   - transitionGrant() in lib/grants/lifecycle.ts calls createAdminClient() internally.
//   - We mock createAdminClient at the module boundary so canTransition() (pure
//     in-process logic) runs real — only DB calls are stubbed.
//
// Error mapping (from the route's catch block):
//   - InvalidTransitionError | DecisionRequiredError → 422
//   - GrantNotFoundError → 404
//   - Any other thrown Error → 500

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Constants ─────────────────────────────────────────────────────────────────

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const GRANT_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// ─── Mutable mock state ────────────────────────────────────────────────────────

let _authUser: { id: string } | null = { id: USER_ID };
let _orgRole: string | null = 'admin';

// State for the grant fetch inside transitionGrant
let _grantFetchData: {
  lifecycle_stage: string;
  org_id: string;
  purpose?: string | null;
  internal_owner_id?: string | null;
  requested_amount?: number | null;
  approved_amount?: number | null;
  grant_period_start?: string | null;
  grant_period_end?: string | null;
  risk_level?: string | null;
  deliverables?: string | null;
  reporting_frequency?: string | null;
} | null = {
  lifecycle_stage: 'draft',
  org_id: ORG_ID,
};
let _grantFetchError: { message: string } | null = null;

// State for the atomic transition RPC inside transitionGrant
let _transitionRpcError: { message: string } | null = null;

// State for workflow config and checklist completions
let _workflowConfigRows: any[] = [];
let _checklistCompletionRows: any[] = [];

// ─── Mock infrastructure ───────────────────────────────────────────────────────

const mockServerRpc = vi.fn();
const mockAdminFrom = vi.fn();
const mockAdminRpc = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: _authUser } })),
    },
    rpc: mockServerRpc,
  })),
  createAdminClient: vi.fn(() => ({ from: mockAdminFrom, rpc: mockAdminRpc })),
}));

function setupMocks() {
  mockServerRpc.mockImplementation(async (fn: string) => {
    if (fn === 'user_org_role') return { data: _orgRole, error: null };
    return { data: null, error: null };
  });

  mockAdminRpc.mockImplementation(async (fn: string) => {
    if (fn === 'transition_grant_lifecycle') return { data: null, error: _transitionRpcError };
    return { data: null, error: null };
  });

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'grants') {
      return {
        // transitionGrant: fetch current stage
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: _grantFetchData,
              error: _grantFetchError,
            })),
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
    // Fallback
    const b: any = {
      select: vi.fn(() => b),
      eq: vi.fn(() => b),
      insert: vi.fn(async () => ({ error: null })),
    };
    return b;
  });
}

// ─── Subject under test ────────────────────────────────────────────────────────

import { POST } from '@/app/api/org/[orgId]/grants/[grantId]/transition/route';

// ─── Test helpers ──────────────────────────────────────────────────────────────

function makeRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeParams(orgId: string, grantId: string) {
  return { params: Promise.resolve({ orgId, grantId }) } as any;
}

function transitionUrl(orgId = ORG_ID, grantId = GRANT_ID) {
  return `http://localhost/api/org/${orgId}/grants/${grantId}/transition`;
}

// ─── beforeEach ────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Arrange: reset all mock state to a clean, happy-path baseline
  _authUser = { id: USER_ID };
  _orgRole = 'admin';
  _grantFetchData = { lifecycle_stage: 'draft', org_id: ORG_ID };
  _grantFetchError = null;
  _transitionRpcError = null;
  _workflowConfigRows = [];
  _checklistCompletionRows = [];

  setupMocks();
});

// ─── Auth & access control (P0) ────────────────────────────────────────────────

describe('POST /api/org/[orgId]/grants/[grantId]/transition — auth', () => {
  it('returns 401 when the request carries no session', async () => {
    // Arrange
    _authUser = null;
    const req = makeRequest(transitionUrl(), { to_stage: 'prospect' });

    // Act
    const res = await POST(req, makeParams(ORG_ID, GRANT_ID));

    // Assert — no data, just an error
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).not.toHaveProperty('success');
    expect(body.error).toBeDefined();
  });

  it('returns 403 when user has a non-admin role (viewer)', async () => {
    // Arrange — viewer cannot drive lifecycle transitions
    _orgRole = 'viewer';
    const req = makeRequest(transitionUrl(), { to_stage: 'prospect' });

    // Act
    const res = await POST(req, makeParams(ORG_ID, GRANT_ID));

    // Assert
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).not.toHaveProperty('success');
  });

  it('allows a member to transition a grant inside the configured workflow', async () => {
    // Arrange
    _orgRole = 'member';
    const req = makeRequest(transitionUrl(), { to_stage: 'prospect' });

    // Act
    const res = await POST(req, makeParams(ORG_ID, GRANT_ID));

    // Assert
    expect(res.status).toBe(200);
  });

  it('returns 403 when user has no role in the org', async () => {
    // Arrange
    _orgRole = null;
    const req = makeRequest(transitionUrl(), { to_stage: 'prospect' });

    // Act
    const res = await POST(req, makeParams(ORG_ID, GRANT_ID));

    // Assert
    expect(res.status).toBe(403);
  });
});

// ─── Input validation (P0) ────────────────────────────────────────────────────

describe('POST /api/org/[orgId]/grants/[grantId]/transition — input validation', () => {
  it('returns 400 when to_stage is missing from the request body', async () => {
    // Arrange
    const req = makeRequest(transitionUrl(), { reason: 'moving forward' });

    // Act
    const res = await POST(req, makeParams(ORG_ID, GRANT_ID));

    // Assert — checked before reaching transitionGrant
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/to_stage/);
  });

  it('returns 400 when request body is empty', async () => {
    // Arrange
    const req = makeRequest(transitionUrl(), {});

    // Act
    const res = await POST(req, makeParams(ORG_ID, GRANT_ID));

    // Assert
    expect(res.status).toBe(400);
  });
});

// ─── Lifecycle validation (P0) ────────────────────────────────────────────────

describe('POST /api/org/[orgId]/grants/[grantId]/transition — lifecycle validation', () => {
  it('returns 422 for an invalid transition (closed → active is not allowed)', async () => {
    // Arrange — closed is a terminal stage; no exits allowed
    _grantFetchData = { lifecycle_stage: 'closed', org_id: ORG_ID };
    const req = makeRequest(transitionUrl(), { to_stage: 'active' });

    // Act — canTransition('closed','active') = false → InvalidTransitionError → 422
    const res = await POST(req, makeParams(ORG_ID, GRANT_ID));

    // Assert
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBeDefined();
    // Must NOT return 500 for a business-rule rejection
    expect(res.status).not.toBe(500);
  });

  it('returns 422 for an invalid transition (declined → approved is not allowed)', async () => {
    // Arrange — declined is also terminal
    _grantFetchData = { lifecycle_stage: 'declined', org_id: ORG_ID };
    const req = makeRequest(transitionUrl(), { to_stage: 'approved' });

    // Act
    const res = await POST(req, makeParams(ORG_ID, GRANT_ID));

    // Assert
    expect(res.status).toBe(422);
  });

  it('returns 422 for an invalid transition (cancelled → draft is not allowed)', async () => {
    // Arrange — cancelled is also terminal
    _grantFetchData = { lifecycle_stage: 'cancelled', org_id: ORG_ID };
    const req = makeRequest(transitionUrl(), { to_stage: 'draft' });

    // Act
    const res = await POST(req, makeParams(ORG_ID, GRANT_ID));

    // Assert
    expect(res.status).toBe(422);
  });

  it('returns 422 for a skipped-step transition (draft → approved skips required stages)', async () => {
    // Arrange — draft can only go to prospect or cancelled
    _grantFetchData = { lifecycle_stage: 'draft', org_id: ORG_ID };
    const req = makeRequest(transitionUrl(), { to_stage: 'approved' });

    // Act
    const res = await POST(req, makeParams(ORG_ID, GRANT_ID));

    // Assert
    expect(res.status).toBe(422);
  });

  it('returns 422 when a decision-requiring transition has no decision payload', async () => {
    // Arrange — recommended → approved requires a grant_decisions record
    _grantFetchData = { lifecycle_stage: 'recommended', org_id: ORG_ID };
    const req = makeRequest(transitionUrl(), { to_stage: 'approved' });

    // Act — no decision field → DecisionRequiredError → 422
    const res = await POST(req, makeParams(ORG_ID, GRANT_ID));

    // Assert
    expect(res.status).toBe(422);
  });
});

// ─── Grant not found (P0) ─────────────────────────────────────────────────────

describe('POST /api/org/[orgId]/grants/[grantId]/transition — grant not found', () => {
  it('returns 404 when the grant belongs to a different organization', async () => {
    _grantFetchData = {
      lifecycle_stage: 'draft',
      org_id: '99999999-9999-9999-9999-999999999999',
    };
    const req = makeRequest(transitionUrl(), { to_stage: 'prospect' });

    const res = await POST(req, makeParams(ORG_ID, GRANT_ID));

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/Grant not found/i) });
  });

  it('returns 404 when the grant does not exist (DB returns no row)', async () => {
    // Arrange — transitionGrant throws GrantNotFoundError, which the route catches → 404
    _grantFetchData = null;
    _grantFetchError = null; // no DB error, just missing row
    const req = makeRequest(transitionUrl(), { to_stage: 'prospect' });

    // Act
    const res = await POST(req, makeParams(ORG_ID, GRANT_ID));

    // Assert
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/Grant not found/i);
  });

  it('returns 500 when the DB errors while fetching the grant', async () => {
    // Arrange
    _grantFetchData = null;
    _grantFetchError = { message: 'relation "grants" does not exist' };
    const req = makeRequest(transitionUrl(), { to_stage: 'prospect' });

    // Act
    const res = await POST(req, makeParams(ORG_ID, GRANT_ID));

    // Assert
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ─── Happy paths (P1) ─────────────────────────────────────────────────────────

describe('POST /api/org/[orgId]/grants/[grantId]/transition — valid transitions', () => {
  it('returns 200 with success=true for a valid transition (draft → prospect)', async () => {
    // Arrange
    _grantFetchData = { lifecycle_stage: 'draft', org_id: ORG_ID };
    const req = makeRequest(transitionUrl(), { to_stage: 'prospect' });

    // Act
    const res = await POST(req, makeParams(ORG_ID, GRANT_ID));

    // Assert
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('response body includes the new lifecycle_stage value', async () => {
    // Arrange
    _grantFetchData = { lifecycle_stage: 'draft', org_id: ORG_ID };
    const req = makeRequest(transitionUrl(), { to_stage: 'prospect' });

    // Act
    const res = await POST(req, makeParams(ORG_ID, GRANT_ID));

    // Assert — caller needs to_stage to update UI state without a refetch
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.to_stage).toBe('prospect');
  });

  it('returns 200 for a valid mid-pipeline transition (due_diligence → recommended)', async () => {
    // Arrange
    _grantFetchData = { lifecycle_stage: 'due_diligence', org_id: ORG_ID };
    const req = makeRequest(transitionUrl(), { to_stage: 'recommended' });

    // Act
    const res = await POST(req, makeParams(ORG_ID, GRANT_ID));

    // Assert
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.to_stage).toBe('recommended');
  });

  it('returns 200 for a valid terminal transition (draft → cancelled)', async () => {
    // Arrange — cancellation is allowed from draft
    _grantFetchData = { lifecycle_stage: 'draft', org_id: ORG_ID };
    const req = makeRequest(transitionUrl(), { to_stage: 'cancelled' });

    // Act
    const res = await POST(req, makeParams(ORG_ID, GRANT_ID));

    // Assert
    expect(res.status).toBe(200);
  });

  it('returns 200 when owner role is used instead of admin', async () => {
    // Arrange — owner retains the full operational grant role.
    _orgRole = 'owner';
    _grantFetchData = { lifecycle_stage: 'prospect', org_id: ORG_ID };
    const req = makeRequest(transitionUrl(), { to_stage: 'invited' });

    // Act
    const res = await POST(req, makeParams(ORG_ID, GRANT_ID));

    // Assert
    expect(res.status).toBe(200);
  });
});

// ─── DB error propagation (P1) ────────────────────────────────────────────────

describe('POST /api/org/[orgId]/grants/[grantId]/transition — DB errors', () => {
  it('returns 500 when the atomic transition RPC fails', async () => {
    // Arrange — fetch succeeds, transition RPC fails
    _grantFetchData = { lifecycle_stage: 'draft', org_id: ORG_ID };
    _transitionRpcError = { message: 'deadlock detected' };
    const req = makeRequest(transitionUrl(), { to_stage: 'prospect' });

    // Act
    const res = await POST(req, makeParams(ORG_ID, GRANT_ID));

    // Assert
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/deadlock/);
  });

  it('returns 409 when the atomic transition RPC reports a stage conflict', async () => {
    _grantFetchData = { lifecycle_stage: 'draft', org_id: ORG_ID };
    _transitionRpcError = { message: 'GRANT_TRANSITION_CONFLICT: expected draft, found prospect' };
    const req = makeRequest(transitionUrl(), { to_stage: 'prospect' });

    const res = await POST(req, makeParams(ORG_ID, GRANT_ID));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/lifecycle changed/i);
  });
});

// ─── Workflow gate (P0) ───────────────────────────────────────────────────────

describe('POST /api/org/[orgId]/grants/[grantId]/transition — workflow gate', () => {
  it('returns 422 with blocking_items when a required checklist item is not complete', async () => {
    // Arrange — configure a required checklist item; no completions
    _grantFetchData = { lifecycle_stage: 'due_diligence', org_id: ORG_ID };
    _workflowConfigRows = [{
      id: 'cfg-1',
      config_type: 'stage_checklist',
      stage_key: 'due_diligence',
      config_key: 'site_visit',
      config_value: { label: 'Site visit completed', required: true },
      sort_order: 0,
    }];
    _checklistCompletionRows = [];
    const req = makeRequest(transitionUrl(), { to_stage: 'recommended' });

    // Act
    const res = await POST(req, makeParams(ORG_ID, GRANT_ID));

    // Assert
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.blocking_items).toBeDefined();
    expect(Array.isArray(body.blocking_items)).toBe(true);
    expect(body.blocking_items.length).toBeGreaterThan(0);
  });

  it('returns 200 when all required checklist items are complete', async () => {
    // Arrange — same checklist item, but with a completion row
    _grantFetchData = { lifecycle_stage: 'due_diligence', org_id: ORG_ID };
    _workflowConfigRows = [{
      id: 'cfg-1',
      config_type: 'stage_checklist',
      stage_key: 'due_diligence',
      config_key: 'site_visit',
      config_value: { label: 'Site visit completed', required: true },
      sort_order: 0,
    }];
    _checklistCompletionRows = [{ checklist_item_key: 'site_visit' }];
    const req = makeRequest(transitionUrl(), { to_stage: 'recommended' });

    // Act
    const res = await POST(req, makeParams(ORG_ID, GRANT_ID));

    // Assert
    expect(res.status).toBe(200);
  });

  it('returns 422 with blocking_items when a required field is null', async () => {
    _grantFetchData = {
      lifecycle_stage: 'due_diligence',
      org_id: ORG_ID,
      purpose: null,
    };
    _workflowConfigRows = [{
      id: 'cfg-2',
      config_type: 'required_field',
      stage_key: 'due_diligence',
      config_key: 'purpose',
      config_value: { field_name: 'purpose', error_message: 'Grant purpose required' },
      sort_order: 0,
    }];
    const req = makeRequest(transitionUrl(), { to_stage: 'recommended' });

    const res = await POST(req, makeParams(ORG_ID, GRANT_ID));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.blocking_items).toContain('Grant purpose required');
  });
});

// ─── NOT TESTED HERE ───────────────────────────────────────────────────────────
// - Actual Supabase RLS enforcement (requires a live DB)
// - DECISION_REQUIRED_TRANSITIONS that supply a valid decisionPayload (integration)
// - grant_decisions / grant_status_history transactional behavior inside the RPC
// - All 14 × 14 transition pairs (covered by lib/grants/lifecycle unit tests)
// - Concurrent transition race conditions (requires integration test)
// - Idempotency of repeated identical transitions
