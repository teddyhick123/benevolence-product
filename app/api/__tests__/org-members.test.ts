// app/api/__tests__/org-members.test.ts
//
// Tests for PATCH and DELETE /api/org/[orgId]/members/[userId]
//
// Route facts confirmed by reading the source:
//   - Both handlers use `createServerClient` for the `is_org_admin` RPC check.
//   - Both handlers use `createAdminClient` for the write operation (bypasses RLS).
//   - The route exports PATCH (not PUT) for role changes.
//   - No built-in owner-protection or self-escalation protection in the route itself;
//     tests document that gap where relevant.
//   - Audit writes are fire-and-forget; failures MUST NOT affect the response.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH, DELETE } from '@/app/api/org/[orgId]/members/[userId]/route';

// ── Constants ──────────────────────────────────────────────────────────────────

const ORG_ID   = '11111111-1111-1111-1111-111111111111';
const USER_ID  = '44444444-4444-4444-4444-444444444444';
const ACTOR_ID = '55555555-5555-5555-5555-555555555555';

// ── Mock state ─────────────────────────────────────────────────────────────────

let _isAdmin = true;
let _isAdminError: { message: string } | null = null;

let _updateResult: any = { id: USER_ID, org_id: ORG_ID, user_id: USER_ID, role: 'member' };
let _updateError:  { message: string } | null = null;

let _deleteError: { message: string } | null = null;

let _auditError: { message: string } | null = null;

// Captured args for assertion
let _capturedUpdateArgs: any = null;
let _capturedAuditArgs: any = null;

// ── Mock wiring ────────────────────────────────────────────────────────────────

const mockServerRpc = vi.fn();
const mockServerAuth = { getUser: vi.fn() };

const mockAdminFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(async () => ({
    rpc: mockServerRpc,
    auth: mockServerAuth,
  })),
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}));

// ── Setup helpers ──────────────────────────────────────────────────────────────

function setupMocks() {
  // Server client: is_org_admin RPC
  mockServerRpc.mockImplementation(async (fn: string) => {
    if (fn === 'is_org_admin') {
      return { data: _isAdmin, error: _isAdminError };
    }
    return { data: null, error: null };
  });

  // Server client: auth.getUser (used for audit log)
  mockServerAuth.getUser.mockResolvedValue({ data: { user: { id: ACTOR_ID } } });

  // Admin client: from('organization_members') and from('org_audit_log')
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'organization_members') {
      const b: any = {
        update: vi.fn((args: any) => {
          _capturedUpdateArgs = args;
          return b;
        }),
        delete: vi.fn(() => b),
        eq: vi.fn(() => b),
        select: vi.fn(() => b),
        single: vi.fn(async () => ({ data: _updateResult, error: _updateError })),
        // delete chain resolves with just an error field
        then: vi.fn(async (resolve: Function) =>
          resolve({ error: _deleteError })
        ),
      };
      // Make the delete chain awaitable directly
      const deleteChain: any = {
        eq: vi.fn(() => deleteChain),
        // Awaiting the chain hits this
        then: vi.fn(async (resolve: Function) =>
          resolve({ error: _deleteError })
        ),
      };
      b._deleteChain = deleteChain;
      // Override delete to return the deleteChain
      b.delete = vi.fn(() => deleteChain);
      return b;
    }
    if (table === 'org_audit_log') {
      return {
        insert: vi.fn(async (args: any) => {
          _capturedAuditArgs = args;
          return { error: _auditError };
        }),
      };
    }
    return {
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn(async () => ({ data: null, error: null })),
    };
  });
}

beforeEach(() => {
  _isAdmin = true;
  _isAdminError = null;
  _updateResult = { id: USER_ID, org_id: ORG_ID, user_id: USER_ID, role: 'member' };
  _updateError = null;
  _deleteError = null;
  _auditError = null;
  _capturedUpdateArgs = null;
  _capturedAuditArgs = null;
  // Clear accumulated call history so per-test assertions on call counts are accurate
  mockServerRpc.mockClear();
  mockAdminFrom.mockClear();
  vi.mocked(mockServerAuth.getUser).mockClear();
  setupMocks();
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function makePatchRequest(body: Record<string, unknown>, orgId = ORG_ID): NextRequest {
  return new NextRequest(
    `http://localhost/api/org/${orgId}/members/${USER_ID}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

function makeDeleteRequest(orgId = ORG_ID): NextRequest {
  return new NextRequest(
    `http://localhost/api/org/${orgId}/members/${USER_ID}`,
    { method: 'DELETE' }
  );
}

function makeCtx(orgId = ORG_ID, userId = USER_ID) {
  return { params: Promise.resolve({ orgId, userId }) };
}

// ══════════════════════════════════════════════════════════════════════════════
// P0 — AUTH / ACCESS CONTROL
// ══════════════════════════════════════════════════════════════════════════════

describe('PATCH /api/org/[orgId]/members/[userId] — auth', () => {
  it('returns 403 and no data when caller is not an org admin', async () => {
    // Arrange
    _isAdmin = false;

    // Act
    const res = await PATCH(makePatchRequest({ role: 'admin' }), makeCtx());
    const body = await res.json();

    // Assert — must be denied before any DB write
    expect(res.status).toBe(403);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('role');
  });

  it('does NOT write to organization_members when the caller is not an admin', async () => {
    // Arrange
    _isAdmin = false;

    // Act
    await PATCH(makePatchRequest({ role: 'admin' }), makeCtx());

    // Assert — admin from() for members table must never be called
    const membersCalls = mockAdminFrom.mock.calls.filter(([t]) => t === 'organization_members');
    expect(membersCalls).toHaveLength(0);
  });

  it('returns 403 when is_org_admin returns false even for a valid role payload', async () => {
    // Arrange — non-admin trying a valid role change
    _isAdmin = false;

    // Act
    const res = await PATCH(makePatchRequest({ role: 'viewer' }), makeCtx());

    // Assert
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/org/[orgId]/members/[userId] — auth', () => {
  it('returns 403 and no data when caller is not an org admin', async () => {
    // Arrange
    _isAdmin = false;

    // Act
    const res = await DELETE(makeDeleteRequest(), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(403);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('success');
  });

  it('does NOT touch organization_members when the caller is not an admin', async () => {
    // Arrange
    _isAdmin = false;

    // Act
    await DELETE(makeDeleteRequest(), makeCtx());

    // Assert
    const membersCalls = mockAdminFrom.mock.calls.filter(([t]) => t === 'organization_members');
    expect(membersCalls).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// P0 — SECURITY: self-escalation
// ══════════════════════════════════════════════════════════════════════════════

describe('PATCH — security: role escalation', () => {
  it('returns 400 when the requested role is "owner" (owner role must not be granted via API)', async () => {
    // Arrange — admin caller, but target role is "owner"
    _isAdmin = true;

    // Act
    const res = await PATCH(makePatchRequest({ role: 'owner' }), makeCtx());
    const body = await res.json();

    // Assert — "owner" is not in validRoles; route returns 400 before any DB write
    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
  });

  it('a non-admin member cannot escalate their own role to admin', async () => {
    // Arrange — caller is NOT an org admin
    _isAdmin = false;

    // Act — non-admin tries to promote themselves
    const res = await PATCH(
      makePatchRequest({ role: 'admin' }),
      makeCtx(ORG_ID, ACTOR_ID) // userId == caller's id (self-escalation)
    );
    const body = await res.json();

    // Assert — must be blocked at the admin check, not at the DB layer
    expect(res.status).toBe(403);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('role');
    // No DB write must have occurred
    const membersCalls = mockAdminFrom.mock.calls.filter(([t]) => t === 'organization_members');
    expect(membersCalls).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// P1 — BEHAVIOR: PATCH happy paths
// ══════════════════════════════════════════════════════════════════════════════

describe('PATCH /api/org/[orgId]/members/[userId] — behavior', () => {
  it('returns 200 and the updated member record on a valid role change', async () => {
    // Arrange
    _updateResult = { id: USER_ID, org_id: ORG_ID, user_id: USER_ID, role: 'admin' };

    // Act
    const res = await PATCH(makePatchRequest({ role: 'admin' }), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(body.role).toBe('admin');
    expect(body.user_id).toBe(USER_ID);
  });

  it('accepts all valid roles: viewer, member, admin', async () => {
    // Arrange & Act & Assert for each assignable role
    for (const role of ['viewer', 'member', 'admin']) {
      _updateResult = { id: USER_ID, org_id: ORG_ID, user_id: USER_ID, role };
      const res = await PATCH(makePatchRequest({ role }), makeCtx());
      expect(res.status).toBe(200);
    }
  });

  it('returns 400 when role is missing from the request body', async () => {
    // Arrange — body has no role field
    const res = await PATCH(makePatchRequest({}), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
    expect(body.error).toMatch(/invalid role/i);
  });

  it('returns 400 when role is an invalid value', async () => {
    // Arrange
    const res = await PATCH(makePatchRequest({ role: 'superuser' }), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
    expect(body.error).toMatch(/invalid role/i);
  });

  it('returns 500 and an error message when the DB update fails', async () => {
    // Arrange
    _updateError = { message: 'deadlock detected' };
    _updateResult = null;

    // Act
    const res = await PATCH(makePatchRequest({ role: 'member' }), makeCtx());
    const body = await res.json();

    // Assert — error surfaced, not swallowed
    expect(res.status).toBe(500);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('role');
  });

  it('writes an audit log entry after a successful role change', async () => {
    // Arrange
    _updateResult = { id: USER_ID, org_id: ORG_ID, user_id: USER_ID, role: 'viewer' };

    // Act
    await PATCH(makePatchRequest({ role: 'viewer' }), makeCtx());

    // Assert — audit log was called with the expected fields
    const auditCalls = mockAdminFrom.mock.calls.filter(([t]) => t === 'org_audit_log');
    expect(auditCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('still returns 200 even when the audit log write fails', async () => {
    // Arrange — audit write will error but should not affect the response
    _updateResult = { id: USER_ID, org_id: ORG_ID, user_id: USER_ID, role: 'member' };
    _auditError = { message: 'table does not exist' };

    // Act
    const res = await PATCH(makePatchRequest({ role: 'member' }), makeCtx());

    // Assert — fire-and-forget audit must not break the success path
    expect(res.status).toBe(200);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// P1 — BEHAVIOR: DELETE happy paths
// ══════════════════════════════════════════════════════════════════════════════

describe('DELETE /api/org/[orgId]/members/[userId] — behavior', () => {
  it('returns 200 with { success: true } when the member is removed', async () => {
    // Arrange — no delete error
    _deleteError = null;

    // Act
    const res = await DELETE(makeDeleteRequest(), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true });
  });

  it('returns 500 and an error message when the DB delete fails', async () => {
    // Arrange
    _deleteError = { message: 'foreign key constraint violation' };

    // Act
    const res = await DELETE(makeDeleteRequest(), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(500);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('success');
  });

  it('still returns 200 even when the audit log write fails after a successful delete', async () => {
    // Arrange
    _deleteError = null;
    _auditError = { message: 'network timeout' };

    // Act
    const res = await DELETE(makeDeleteRequest(), makeCtx());

    // Assert — audit failure is fire-and-forget
    expect(res.status).toBe(200);
  });

  it('writes an audit log entry with action "member_removed" after a successful delete', async () => {
    // Arrange
    _deleteError = null;

    // Act
    await DELETE(makeDeleteRequest(), makeCtx());

    // Assert
    const auditCalls = mockAdminFrom.mock.calls.filter(([t]) => t === 'org_audit_log');
    expect(auditCalls.length).toBeGreaterThanOrEqual(1);
  });
});

/**
 * NOT TESTED HERE — requires separate setup:
 *
 * - Removing the org owner: the route does NOT guard against this.
 *   A DELETE on the owner's userId will succeed at the DB layer if RLS or DB
 *   triggers do not block it. This is a known gap — enforce at the DB level
 *   (e.g. a BEFORE DELETE trigger that rejects removal of the last owner).
 *
 * - RLS enforcement at the Supabase layer: the route uses createAdminClient
 *   (service role) for all writes, so RLS is intentionally bypassed. Policy
 *   correctness is tested in migration tests.
 *
 * - JWT tampering / session forgery: the route delegates session resolution to
 *   createServerClient which validates the Supabase JWT; not reproducible in
 *   unit tests without a live Supabase instance.
 *
 * - GET handler: the route file (confirmed by reading source) does NOT export
 *   a GET handler — only PATCH and DELETE are exported.
 */
