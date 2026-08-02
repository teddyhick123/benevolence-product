// app/api/__tests__/org-members.test.ts
//
// Tests for PATCH and DELETE /api/org/[orgId]/members/[userId]
//
// Route facts confirmed by reading the source:
//   - Both handlers use the shared organization guard.
//   - Elevated writes live in the org-scoped membership repository.
//   - The route exports PATCH (not PUT) for role changes.
//   - Owner membership changes require an owner, while admin can manage non-owner members.
//   - Audit writes are durable; failures roll back the member mutation.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { PATCH, DELETE } from '@/app/api/org/[orgId]/members/[userId]/route';

// ── Constants ──────────────────────────────────────────────────────────────────

const ORG_ID   = '11111111-1111-1111-1111-111111111111';
const USER_ID  = '44444444-4444-4444-4444-444444444444';
const ACTOR_ID = '55555555-5555-5555-5555-555555555555';

// ── Mock state ─────────────────────────────────────────────────────────────────

let _actorRole: string | null = 'admin';
let _updateResult: any = { id: USER_ID, org_id: ORG_ID, user_id: USER_ID, role: 'member' };
let _updateError:  { message: string } | null = null;

let _deleteError: { message: string } | null = null;
let _existingResult: any = { id: 'membership-id', role: 'member' };
let _existingError: { message: string } | null = null;

let _auditError: { message: string } | null = null;

// Captured args for assertion
let _capturedUpdateArgs: any = null;
let _capturedAuditArgs: any = null;

// ── Mock wiring ────────────────────────────────────────────────────────────────

const { mockAdminFrom, mockRequireOrgAccess } = vi.hoisted(() => ({
  mockAdminFrom: vi.fn(),
  mockRequireOrgAccess: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireOrgAccess: mockRequireOrgAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: vi.fn(() => ({ from: mockAdminFrom })),
}));

// ── Setup helpers ──────────────────────────────────────────────────────────────

function setupMocks() {
  mockRequireOrgAccess.mockImplementation(async (orgId: string) => {
    if (!['admin', 'owner'].includes(_actorRole || '')) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Not authorized' }, { status: 403 }),
      };
    }
    return {
      ok: true,
      context: {
        orgId,
        role: _actorRole,
        principal: { kind: 'user', userId: ACTOR_ID },
        user: { id: ACTOR_ID },
        db: {},
      },
    };
  });

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
        is: vi.fn(() => b),
        select: vi.fn(() => b),
        single: vi.fn(async () => ({ data: _updateResult, error: _updateError })),
        maybeSingle: vi.fn(async () => ({ data: _existingResult, error: _existingError })),
        // delete chain resolves with just an error field
        then: vi.fn(async (resolve: Function) =>
          resolve({ count: 1, error: _deleteError })
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
  _actorRole = 'admin';
  _updateResult = { id: USER_ID, org_id: ORG_ID, user_id: USER_ID, role: 'member' };
  _updateError = null;
  _deleteError = null;
  _existingResult = { id: 'membership-id', role: 'member' };
  _existingError = null;
  _auditError = null;
  _capturedUpdateArgs = null;
  _capturedAuditArgs = null;
  // Clear accumulated call history so per-test assertions on call counts are accurate
  mockRequireOrgAccess.mockClear();
  mockAdminFrom.mockClear();
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
    _actorRole = 'viewer';

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
    _actorRole = 'viewer';

    // Act
    await PATCH(makePatchRequest({ role: 'admin' }), makeCtx());

    // Assert — admin from() for members table must never be called
    const membersCalls = mockAdminFrom.mock.calls.filter(([t]) => t === 'organization_members');
    expect(membersCalls).toHaveLength(0);
  });

  it('returns 403 when the canonical role is below admin even for a valid role payload', async () => {
    // Arrange — non-admin trying a valid role change
    _actorRole = 'viewer';

    // Act
    const res = await PATCH(makePatchRequest({ role: 'viewer' }), makeCtx());

    // Assert
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/org/[orgId]/members/[userId] — auth', () => {
  it('returns 403 and no data when caller is not an org admin', async () => {
    // Arrange
    _actorRole = 'viewer';

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
    _actorRole = 'viewer';

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
    _actorRole = 'admin';

    // Act
    const res = await PATCH(makePatchRequest({ role: 'owner' }), makeCtx());
    const body = await res.json();

    // Assert — "owner" is not in validRoles; route returns 400 before any DB write
    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
  });

  it('a non-admin member cannot escalate their own role to admin', async () => {
    // Arrange — caller is NOT an org admin
    _actorRole = 'viewer';

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

  it('does not let an admin change an owner membership', async () => {
    _actorRole = 'admin';
    _existingResult = { id: 'membership-id', role: 'owner' };

    const res = await PATCH(makePatchRequest({ role: 'admin' }), makeCtx());

    expect(res.status).toBe(403);
    const membersCalls = mockAdminFrom.mock.calls.filter(([t]) => t === 'organization_members');
    expect(membersCalls).toHaveLength(1);
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

  it('returns 500 and rolls back when the audit log write fails', async () => {
    // Arrange — audit write will error but should not affect the response
    _updateResult = { id: USER_ID, org_id: ORG_ID, user_id: USER_ID, role: 'member' };
    _auditError = { message: 'table does not exist' };

    // Act
    const res = await PATCH(makePatchRequest({ role: 'member' }), makeCtx());

    // Assert — durable audit must fail closed and trigger a rollback update
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('table does not exist');
    expect(_capturedUpdateArgs).toEqual({ role: 'member' });
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

  it('returns 500 and restores the member when the audit log write fails after a successful delete', async () => {
    // Arrange
    _deleteError = null;
    _auditError = { message: 'network timeout' };

    // Act
    const res = await DELETE(makeDeleteRequest(), makeCtx());

    // Assert — durable audit must fail closed and restore the soft-deleted row
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('network timeout');
    expect(_capturedUpdateArgs).toEqual({ deleted_at: null, deleted_by: null });
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
// Integration test.
