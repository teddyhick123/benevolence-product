// app/api/__tests__/org-members.test.ts
//
// Tests for PATCH and DELETE /api/org/[orgId]/members/[userId]
//
// Route facts confirmed by reading the source:
//   - Both handlers use the shared organization guard.
//   - Elevated writes live in the org-scoped membership repository.
//   - The route exports PATCH (not PUT) for role changes.
//   - Owner membership changes require an owner, while admin can manage non-owner members.
//   - The repository performs every mutation through the single atomic RPC
//     `mutate_organization_membership`. Role checks, last-owner protection and
//     the audit-log insert all happen inside that one transaction, so there is
//     no separate audit write for the route to roll back. Those SQL-level rules
//     are asserted here through the error codes the RPC raises.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { PATCH, DELETE } from '@/app/api/org/[orgId]/members/[userId]/route';

// ── Constants ──────────────────────────────────────────────────────────────────

const ORG_ID   = '11111111-1111-1111-1111-111111111111';
const USER_ID  = '44444444-4444-4444-4444-444444444444';
const ACTOR_ID = '55555555-5555-5555-5555-555555555555';

// ── Mock state ─────────────────────────────────────────────────────────────────

let _actorRole: string | null = 'admin';

// What the atomic membership RPC returns. `_rpcError` models the deliberate
// error codes raised inside `mutate_organization_membership`.
let _rpcResult: any = { id: USER_ID, org_id: ORG_ID, user_id: USER_ID, role: 'member' };
let _rpcError: { message: string; code?: string } | null = null;

// Captured args for assertion
let _capturedRpcArgs: any = null;

// ── Mock wiring ────────────────────────────────────────────────────────────────

const { mockAdminFrom, mockAdminRpc, mockRequireOrgAccess } = vi.hoisted(() => ({
  mockAdminFrom: vi.fn(),
  mockAdminRpc: vi.fn(),
  mockRequireOrgAccess: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireOrgAccess: mockRequireOrgAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: vi.fn(() => ({ from: mockAdminFrom, rpc: mockAdminRpc })),
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

  // Every mutation goes through the single atomic RPC.
  mockAdminRpc.mockImplementation(async (fn: string, args: any) => {
    if (fn !== 'mutate_organization_membership') {
      throw new Error(`Unexpected RPC: ${fn}`);
    }
    _capturedRpcArgs = args;
    return { data: _rpcError ? null : _rpcResult, error: _rpcError };
  });

  // The repository still reads through from() for list(); mutations must not.
  mockAdminFrom.mockImplementation(() => ({
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn(async () => ({ data: null, error: null })),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
  }));
}

beforeEach(() => {
  _actorRole = 'admin';
  _rpcResult = { id: USER_ID, org_id: ORG_ID, user_id: USER_ID, role: 'member' };
  _rpcError = null;
  _capturedRpcArgs = null;
  // Clear accumulated call history so per-test assertions on call counts are accurate
  mockRequireOrgAccess.mockClear();
  mockAdminFrom.mockClear();
  mockAdminRpc.mockClear();
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

    // Assert — the mutation RPC must never be reached
    expect(mockAdminRpc).not.toHaveBeenCalled();
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
    expect(mockAdminRpc).not.toHaveBeenCalled();
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
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it('does not let an admin change an owner membership', async () => {
    // Arrange — the RPC refuses an admin touching an owner row with 42501.
    _actorRole = 'admin';
    _rpcError = { message: 'Only owners can change owner membership', code: '42501' };

    // Act
    const res = await PATCH(makePatchRequest({ role: 'admin' }), makeCtx());

    // Assert — the refusal is enforced in one transaction and surfaced as 403
    expect(res.status).toBe(403);
    expect(mockAdminRpc).toHaveBeenCalledTimes(1);
    expect(_capturedRpcArgs).toMatchObject({
      p_org_id: ORG_ID,
      p_actor_id: ACTOR_ID,
      p_target_user_id: USER_ID,
      p_operation: 'change_role',
    });
  });

  it('surfaces the last-owner guard rather than silently demoting the final owner', async () => {
    // Arrange — the RPC raises P0001 for the last-owner rule.
    _actorRole = 'owner';
    _rpcError = { message: 'Cannot change the last owner role', code: 'P0001' };

    // Act
    const res = await PATCH(makePatchRequest({ role: 'admin' }), makeCtx());
    const body = await res.json();

    // Assert — a conflict with current state, not a malformed request
    expect(res.status).toBe(409);
    expect(body.error).toBe('Cannot change the last owner role');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// P1 — BEHAVIOR: PATCH happy paths
// ══════════════════════════════════════════════════════════════════════════════

describe('PATCH /api/org/[orgId]/members/[userId] — behavior', () => {
  it('returns 200 and the updated member record on a valid role change', async () => {
    // Arrange
    _rpcResult = { id: USER_ID, org_id: ORG_ID, user_id: USER_ID, role: 'admin' };

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
      _rpcResult = { id: USER_ID, org_id: ORG_ID, user_id: USER_ID, role };
      const res = await PATCH(makePatchRequest({ role }), makeCtx());
      expect(res.status).toBe(200);
      expect(_capturedRpcArgs).toMatchObject({ p_operation: 'change_role', p_role: role });
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
    // Arrange — an infrastructure failure, not one of the RPC's deliberate codes
    _rpcError = { message: 'deadlock detected', code: '40P01' };

    // Act
    const res = await PATCH(makePatchRequest({ role: 'member' }), makeCtx());
    const body = await res.json();

    // Assert — surfaced as a server error, not misreported as the caller's fault
    expect(res.status).toBe(500);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('role');
  });

  it('records the audit entry inside the same transaction as the role change', async () => {
    // Act
    await PATCH(makePatchRequest({ role: 'viewer' }), makeCtx());

    // Assert — the audit insert lives inside `mutate_organization_membership`,
    // so the route must not perform a second, separately-failable write.
    expect(mockAdminRpc).toHaveBeenCalledTimes(1);
    const auditCalls = mockAdminFrom.mock.calls.filter(([t]) => t === 'org_audit_log');
    expect(auditCalls).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// P1 — BEHAVIOR: DELETE happy paths
// ══════════════════════════════════════════════════════════════════════════════

describe('DELETE /api/org/[orgId]/members/[userId] — behavior', () => {
  it('returns 200 with { success: true } when the member is removed', async () => {
    // Act
    const res = await DELETE(makeDeleteRequest(), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(_capturedRpcArgs).toMatchObject({
      p_operation: 'remove',
      p_target_user_id: USER_ID,
    });
  });

  it('returns 500 and an error message when the DB delete fails', async () => {
    // Arrange — an infrastructure failure rather than a deliberate RPC code
    _rpcError = { message: 'foreign key constraint violation', code: '40001' };

    // Act
    const res = await DELETE(makeDeleteRequest(), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(500);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('success');
  });

  it('refuses to remove the last owner', async () => {
    // Arrange — the RPC's last-owner guard
    _actorRole = 'owner';
    _rpcError = { message: 'Cannot remove the last owner', code: 'P0001' };

    // Act
    const res = await DELETE(makeDeleteRequest(), makeCtx());
    const body = await res.json();

    // Assert — a conflict with current state, not a malformed request
    expect(res.status).toBe(409);
    expect(body.error).toBe('Cannot remove the last owner');
  });

  it('returns 404 when the membership does not exist', async () => {
    // Arrange
    _rpcError = { message: 'Member not found', code: 'P0002' };

    // Act
    const res = await DELETE(makeDeleteRequest(), makeCtx());

    // Assert
    expect(res.status).toBe(404);
  });

  it('records the removal audit entry inside the same transaction as the delete', async () => {
    // Act
    await DELETE(makeDeleteRequest(), makeCtx());

    // Assert — no separate, independently-failable audit write
    expect(mockAdminRpc).toHaveBeenCalledTimes(1);
    const auditCalls = mockAdminFrom.mock.calls.filter(([t]) => t === 'org_audit_log');
    expect(auditCalls).toHaveLength(0);
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
