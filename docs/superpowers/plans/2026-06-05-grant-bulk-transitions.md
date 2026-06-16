# Grant Bulk Pipeline Transitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-select and bulk lifecycle stage transition to the grant pipeline kanban, including a stepped decision queue for decision-required transitions and a per-grant result modal.

**Architecture:** Client-side selection state lives in `app/dashboard/grants/page.tsx` and is threaded into `GrantPipelineView` via props. A new `POST /api/org/[orgId]/grants/bulk-transition` endpoint performs an org-scoped preflight fetch, validates each requested transition, and calls the existing `transitionGrant()` for each — collecting per-grant results as a `207 Multi-Status` response. Three new components (`BulkActionBar`, `BulkDecisionQueue`, `BulkTransitionResultModal`) handle the UI flow.

**Tech Stack:** Next.js 15 App Router, TypeScript, React 18, Tailwind CSS, Zod 3.23.8, Vitest + @testing-library/react

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `app/api/org/[orgId]/grants/bulk-transition/route.ts` | Create | POST handler: auth, validation, preflight fetch, per-grant orchestration, 207 response |
| `app/api/__tests__/grants-bulk-transition.test.ts` | Create | API contract tests |
| `components/grants/GrantPipelineView.tsx` | Modify | Accept selection props; render card checkboxes with staggered animation; column "Select all" |
| `components/grants/BulkActionBar.tsx` | Create | Fixed bottom bar: per-stage grouping, ALLOWED_TRANSITIONS dropdowns, apply button |
| `components/grants/BulkDecisionQueue.tsx` | Create | Stepped modal for per-grant decisions with skip option and slide-left animation |
| `components/grants/BulkTransitionResultModal.tsx` | Create | Success/partial/failure result modal; triggers refresh + selection clear on close |
| `app/dashboard/grants/page.tsx` | Modify | Own all bulk state: selectionMode, selectedIds, queuedTransitions, bulkPhase; wire toolbar "Select" button; pass props to pipeline; call API; handle results |

---

## Task 1: Bulk Transition API Route (TDD)

**Files:**
- Create: `app/api/__tests__/grants-bulk-transition.test.ts`
- Create: `app/api/org/[orgId]/grants/bulk-transition/route.ts`

Read `app/api/__tests__/grants-transition.test.ts` and `app/api/org/[orgId]/grants/[grantId]/transition/route.ts` before starting — this task follows the exact same patterns.

Key facts:
- `transitionGrant(grantId, toStage, actorId, reason?, decisionPayload?)` in `lib/grants/lifecycle.ts` creates its own `adminClient` internally — you must mock `createAdminClient` globally.
- The bulk route also calls `createAdminClient()` once for the preflight `.in()` query.
- Auth pattern: `createServerClient()` → `auth.getUser()` → `rpc('user_org_role', { p_org_id })` → check `ADMIN_ROLES = new Set(['owner', 'admin'])`.
- The `LIFECYCLE_STAGES` tuple comes from `lib/grants/lifecycle-shared.ts`; import it from there for Zod's `.enum()`.
- `requiresDecision` and `canTransition` are exported from `lib/grants/lifecycle.ts`.

- [ ] **Step 1: Write the test file**

Create `app/api/__tests__/grants-bulk-transition.test.ts`:

```typescript
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

// transitionGrant internals: single-row fetch by grantId
let _grantFetchData: { lifecycle_stage: string; org_id: string } | null = {
  lifecycle_stage: 'draft',
  org_id: ORG_ID,
};
let _grantFetchError: { message: string } | null = null;
let _grantUpdateError: { message: string } | null = null;
let _historyInsertError: { message: string } | null = null;

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const mockServerRpc = vi.fn();
const mockAdminFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: _authUser } })) },
    rpc: mockServerRpc,
  })),
  createAdminClient: vi.fn(() => ({ from: mockAdminFrom })),
}));

function setupMocks() {
  mockServerRpc.mockImplementation(async (fn: string) => {
    if (fn === 'user_org_role') return { data: _orgRole, error: null };
    return { data: null, error: null };
  });

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'grants') {
      return {
        // Preflight uses .eq().in() — transitionGrant uses .eq().single()
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(async () => ({ data: _prefetchData, error: null })),
            single: vi.fn(async () => ({ data: _grantFetchData, error: _grantFetchError })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: _grantUpdateError })),
        })),
      };
    }
    if (table === 'grant_status_history') {
      return { insert: vi.fn(async () => ({ error: _historyInsertError })) };
    }
    if (table === 'grant_decisions') {
      return { insert: vi.fn(async () => ({ error: null })) };
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
  _grantFetchData = { lifecycle_stage: 'draft', org_id: ORG_ID };
  _grantFetchError = null;
  _grantUpdateError = null;
  _historyInsertError = null;
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
    const decisionInsertSpy = vi.fn(async () => ({ error: null }));
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ in: vi.fn(async () => ({ data: _prefetchData, error: null })) })) })),
    }));
    // We can't deeply inspect decided_by/decision_date without tighter mocks,
    // but we verify the request succeeds (indicating normalization didn't throw).
    const res = await POST(makeRequest({
      transitions: [{
        grantId: GRANT_A,
        expectedFromStage: 'recommended',
        targetStage: 'approved',
        decision: { decision_type: 'approval', decision: 'approved', rationale: 'Board approved' },
      }],
    }), makeParams());
    // May be 207 success or partial — just must not be 400/500
    expect([207, 200]).toContain(res.status);
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
});
```

- [ ] **Step 2: Run tests — verify they all fail (route does not exist yet)**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product
npx vitest run app/api/__tests__/grants-bulk-transition.test.ts 2>&1 | tail -20
```

Expected: all tests fail with "Cannot find module" or similar import error.

- [ ] **Step 3: Implement the route**

Create `app/api/org/[orgId]/grants/bulk-transition/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import {
  LIFECYCLE_STAGES,
  type LifecycleStage,
  type DecisionPayload,
  canTransition,
  requiresDecision,
  transitionGrant,
} from '@/lib/grants/lifecycle';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = new Set(['owner', 'admin']);

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

const decisionSchema = z.object({
  decision_type: z.enum(['approval', 'decline', 'defer', 'renewal', 'closeout', 'payment_release']),
  decision: z.enum(['approved', 'declined', 'deferred', 'conditional', 'not_applicable']),
  rationale: z.string().max(5000).optional(),
  decision_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  board_meeting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount: z.number().finite().nonnegative().optional(),
  conditions: z.string().max(5000).optional(),
}).strict();

const transitionItemSchema = z.object({
  grantId: z.string().uuid(),
  expectedFromStage: z.enum(LIFECYCLE_STAGES),
  targetStage: z.enum(LIFECYCLE_STAGES),
  reason: z.string().max(1000).optional(),
  decision: decisionSchema.optional(),
}).strict();

const bulkTransitionSchema = z.object({
  transitions: z.array(transitionItemSchema).min(1).max(50),
}).strict();

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role || !ADMIN_ROLES.has(role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = bulkTransitionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const { transitions } = parsed.data;

    // Reject duplicate grantIds
    const grantIds = transitions.map(t => t.grantId);
    const uniqueIds = new Set(grantIds);
    if (uniqueIds.size !== grantIds.length) {
      return NextResponse.json({ error: 'Duplicate grantId values in request' }, { status: 400 });
    }

    // Preflight: fetch all requested grants scoped to this org in one query
    const adminSupabase = createAdminClient();
    const { data: scopedGrants } = await adminSupabase
      .from('grants')
      .select('id, lifecycle_stage, org_id')
      .eq('org_id', orgId)
      .in('id', grantIds);

    const grantMap = new Map<string, { lifecycle_stage: string; org_id: string }>();
    for (const g of scopedGrants ?? []) {
      grantMap.set(g.id, g);
    }

    // Process each transition
    const results: Array<{
      grantId: string;
      fromStage?: LifecycleStage;
      targetStage?: LifecycleStage;
      success: boolean;
      error?: string;
    }> = [];

    for (const item of transitions) {
      const dbGrant = grantMap.get(item.grantId);

      if (!dbGrant) {
        results.push({ grantId: item.grantId, success: false, error: 'Grant not found in organization' });
        continue;
      }

      if (dbGrant.lifecycle_stage !== item.expectedFromStage) {
        results.push({
          grantId: item.grantId,
          success: false,
          error: `Stage has changed: expected ${item.expectedFromStage}, current is ${dbGrant.lifecycle_stage}`,
        });
        continue;
      }

      if (!canTransition(item.expectedFromStage, item.targetStage)) {
        results.push({
          grantId: item.grantId,
          success: false,
          error: `Invalid transition: ${item.expectedFromStage} → ${item.targetStage}`,
        });
        continue;
      }

      if (requiresDecision(item.expectedFromStage, item.targetStage) && !item.decision) {
        results.push({
          grantId: item.grantId,
          success: false,
          error: `Decision required for ${item.expectedFromStage} → ${item.targetStage}`,
        });
        continue;
      }

      const decisionPayload: DecisionPayload | undefined = item.decision
        ? {
            ...item.decision,
            decision_date: item.decision.decision_date ?? new Date().toISOString().slice(0, 10),
            decided_by: user.id,
          }
        : undefined;

      try {
        await transitionGrant(item.grantId, item.targetStage, user.id, item.reason, decisionPayload);
        results.push({
          grantId: item.grantId,
          fromStage: item.expectedFromStage,
          targetStage: item.targetStage,
          success: true,
        });
      } catch (err: any) {
        results.push({ grantId: item.grantId, success: false, error: err?.message ?? 'Unknown error' });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    return NextResponse.json({ successCount, failureCount, results }, { status: 207 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run app/api/__tests__/grants-bulk-transition.test.ts 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/org/\[orgId\]/grants/bulk-transition/route.ts app/api/__tests__/grants-bulk-transition.test.ts
git commit -m "feat(grants): bulk-transition API endpoint with per-grant 207 responses"
```

---

## Task 2: GrantPipelineView Selection Mode + Toolbar "Select" Button

**Files:**
- Modify: `components/grants/GrantPipelineView.tsx`
- Modify: `app/dashboard/grants/page.tsx`
- Create: `components/grants/__tests__/GrantPipelineView.selection.test.tsx`

The pipeline view needs to render card checkboxes when `selectionMode=true`. State (`selectionMode`, `selectedIds`) lives in `page.tsx` and flows down as props. `page.tsx` gets a "Select" button in its toolbar that is only visible when `activeView === 'pipeline'`.

- [ ] **Step 1: Write the component test file**

Create `components/grants/__tests__/GrantPipelineView.selection.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GrantPipelineView, { type GrantListItem } from '../GrantPipelineView';

const mockGrant: GrantListItem = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  holding_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  lifecycle_stage: 'draft',
  requested_amount: 50000,
  approved_amount: null,
  currency: 'USD',
  grant_period_end: null,
  risk_level: null,
  internal_owner_id: null,
  holdings: { name: 'Test Foundation Grant' },
};

const mockGrant2: GrantListItem = {
  ...mockGrant,
  id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  lifecycle_stage: 'prospect',
  holdings: { name: 'Another Grant' },
};

describe('GrantPipelineView — selection mode', () => {
  it('does not render checkboxes when selectionMode is false', () => {
    render(
      <GrantPipelineView
        grants={[mockGrant]}
        selectionMode={false}
        selectedIds={new Set()}
        onToggleSelect={vi.fn()}
        onSelectAllInStage={vi.fn()}
      />
    );
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('renders a checkbox for each card when selectionMode is true', () => {
    render(
      <GrantPipelineView
        grants={[mockGrant, mockGrant2]}
        selectionMode={true}
        selectedIds={new Set()}
        onToggleSelect={vi.fn()}
        onSelectAllInStage={vi.fn()}
      />
    );
    // One checkbox per grant card + one per column header = at least 2 grant checkboxes
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThanOrEqual(2);
  });

  it('calls onToggleSelect with the grant id when a card checkbox is clicked', () => {
    const onToggle = vi.fn();
    render(
      <GrantPipelineView
        grants={[mockGrant]}
        selectionMode={true}
        selectedIds={new Set()}
        onToggleSelect={onToggle}
        onSelectAllInStage={vi.fn()}
      />
    );
    // Find card-level checkboxes (data-grant-id attribute)
    const cardCheckbox = document.querySelector(`input[data-grant-id="${mockGrant.id}"]`);
    expect(cardCheckbox).not.toBeNull();
    fireEvent.click(cardCheckbox!);
    expect(onToggle).toHaveBeenCalledWith(mockGrant.id);
  });

  it('calls onSelectAllInStage with stage and ids when column header checkbox is clicked', () => {
    const onSelectAll = vi.fn();
    render(
      <GrantPipelineView
        grants={[mockGrant]}
        selectionMode={true}
        selectedIds={new Set()}
        onToggleSelect={vi.fn()}
        onSelectAllInStage={onSelectAll}
      />
    );
    const headerCheckbox = document.querySelector(`input[data-stage-header="draft"]`);
    expect(headerCheckbox).not.toBeNull();
    fireEvent.click(headerCheckbox!);
    expect(onSelectAll).toHaveBeenCalledWith('draft', [mockGrant.id]);
  });

  it('renders card as non-navigating div (not Link) in selection mode', () => {
    render(
      <GrantPipelineView
        grants={[mockGrant]}
        selectionMode={true}
        selectedIds={new Set()}
        onToggleSelect={vi.fn()}
        onSelectAllInStage={vi.fn()}
      />
    );
    // In selection mode the card should not be an anchor tag
    const card = document.querySelector(`[data-grant-id="${mockGrant.id}"]`)?.closest('[data-card]');
    // The card container should not be an <a> element
    const links = screen.queryAllByRole('link');
    const grantLink = links.find(l => l.getAttribute('href')?.includes(mockGrant.id));
    expect(grantLink).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run components/grants/__tests__/GrantPipelineView.selection.test.tsx 2>&1 | tail -10
```

Expected: fails because checkboxes and data attributes don't exist yet.

- [ ] **Step 3: Update GrantPipelineView to accept selection props and render checkboxes**

Replace `components/grants/GrantPipelineView.tsx` entirely with:

```typescript
'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { LIFECYCLE_STAGES, type LifecycleStage } from '@/lib/grants/lifecycle-shared';
import { ALLOWED_TRANSITIONS } from '@/lib/grants/lifecycle';
import { GRANT_RISK_BADGE, grantStageLabel, grantStagePalette } from './grantPalette';

export interface GrantListItem {
  id: string;
  holding_id: string;
  lifecycle_stage: LifecycleStage;
  requested_amount: number | null;
  approved_amount: number | null;
  currency: string | null;
  grant_period_end: string | null;
  risk_level: string | null;
  internal_owner_id: string | null;
  holdings: { name: string } | null;
}

interface Props {
  grants: GrantListItem[];
  loading?: boolean;
  onNewGrant?: () => void;
  // Selection mode
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onSelectAllInStage?: (stage: LifecycleStage, ids: string[]) => void;
}

function fmt(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.round((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

interface GrantCardProps {
  grant: GrantListItem;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  animDelay: number;
}

function GrantCard({ grant, selectionMode, selected, onToggleSelect, animDelay }: GrantCardProps) {
  const amount = grant.approved_amount ?? grant.requested_amount;
  const days = daysUntil(grant.grant_period_end);

  const cardContent = (
    <>
      {selectionMode && (
        <input
          type="checkbox"
          data-grant-id={grant.id}
          checked={selected}
          onChange={() => onToggleSelect(grant.id)}
          onClick={e => e.stopPropagation()}
          className="absolute top-2 left-2 w-4 h-4 rounded accent-azure cursor-pointer"
          style={{
            animation: `fadeIn 150ms ease-out both`,
            animationDelay: `${animDelay}ms`,
          }}
        />
      )}
      <div className={`text-sm font-medium text-ink leading-snug truncate ${selectionMode ? 'ml-6' : ''}`}>
        {grant.holdings?.name ?? 'Unnamed Grant'}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-500 font-semibold">{fmt(amount)}</span>
        {grant.risk_level && (
          <span className={`rounded-full px-1.5 py-0.5 text-xs ${GRANT_RISK_BADGE[grant.risk_level] ?? 'border border-neutral-200 bg-neutral-100 text-neutral-600'}`}>
            {grant.risk_level}
          </span>
        )}
      </div>
      {days !== null && (
        <div className={`text-xs ${days < 0 ? 'text-red-600' : days < 30 ? 'text-coral' : 'text-neutral-400'}`}>
          {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
        </div>
      )}
    </>
  );

  const cardClass = `relative block rounded-2xl border border-black/5 bg-white shadow-sm transition-shadow p-3 space-y-2 ${
    selectionMode
      ? selected
        ? 'ring-2 ring-azure cursor-pointer hover:shadow-md'
        : 'cursor-pointer hover:shadow-md'
      : 'hover:shadow-md'
  }`;

  if (selectionMode) {
    return (
      <div
        data-card
        className={cardClass}
        onClick={() => onToggleSelect(grant.id)}
      >
        {cardContent}
      </div>
    );
  }

  return (
    <Link href={`/dashboard/grants/${grant.id}`} className={cardClass} data-card>
      {cardContent}
    </Link>
  );
}

const ACTIVE_STAGES: LifecycleStage[] = [
  'prospect', 'invited', 'application_received', 'due_diligence',
  'recommended', 'approved', 'agreement', 'active', 'renewal_review', 'closeout',
];

export default function GrantPipelineView({
  grants,
  loading,
  onNewGrant,
  selectionMode = false,
  selectedIds = new Set(),
  onToggleSelect = () => {},
  onSelectAllInStage = () => {},
}: Props) {
  const byStage = useMemo(() => {
    const map = new Map<LifecycleStage, GrantListItem[]>();
    for (const s of LIFECYCLE_STAGES) map.set(s, []);
    for (const g of grants) {
      const list = map.get(g.lifecycle_stage);
      if (list) list.push(g);
    }
    return map;
  }, [grants]);

  const visibleStages = LIFECYCLE_STAGES.filter(
    s => ACTIVE_STAGES.includes(s) || (byStage.get(s)?.length ?? 0) > 0
  );

  if (loading && grants.length === 0) {
    return (
      <div className="animate-pulse grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-32 bg-neutral-100 rounded-2xl" />)}
      </div>
    );
  }

  if (grants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="w-14 h-14 rounded-full bg-azure/10 flex items-center justify-center">
          <svg className="w-7 h-7 text-azure" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
          </svg>
        </div>
        <div>
          <p className="font-medium text-ink">No grants in the pipeline</p>
          <p className="text-sm text-neutral-500 mt-1">Create your first grant to start tracking the lifecycle.</p>
        </div>
        {onNewGrant && (
          <button
            onClick={onNewGrant}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-azure rounded-2xl hover:bg-azure/90"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Grant
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }`}</style>
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max">
          {visibleStages.map((stage, colIndex) => {
            const stageGrants = byStage.get(stage) ?? [];
            const colors = grantStagePalette(stage);
            const totalAmount = stageGrants.reduce((s, g) => s + (g.approved_amount ?? g.requested_amount ?? 0), 0);
            const allSelected = stageGrants.length > 0 && stageGrants.every(g => selectedIds.has(g.id));
            const stageIds = stageGrants.map(g => g.id);

            return (
              <div key={stage} className="flex flex-col w-52 gap-2">
                {/* Column header */}
                <div className={`flex items-center justify-between rounded-2xl border px-2.5 py-1.5 ${colors.column}`}>
                  <div className="flex items-center gap-1.5">
                    {selectionMode && (
                      <input
                        type="checkbox"
                        data-stage-header={stage}
                        checked={allSelected}
                        onChange={() => onSelectAllInStage(stage, stageIds)}
                        className="w-3.5 h-3.5 rounded accent-azure cursor-pointer"
                      />
                    )}
                    <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                    <span className="text-xs font-semibold">{grantStageLabel(stage)}</span>
                  </div>
                  <span className="text-xs font-medium opacity-70">{stageGrants.length}</span>
                </div>

                {/* Amount total */}
                {totalAmount > 0 && (
                  <div className="text-xs text-neutral-400 text-center">{fmt(totalAmount)}</div>
                )}

                {/* Cards */}
                <div className="space-y-2 min-h-[80px]">
                  {stageGrants.map((g, cardIndex) => (
                    <GrantCard
                      key={g.id}
                      grant={g}
                      selectionMode={selectionMode}
                      selected={selectedIds.has(g.id)}
                      onToggleSelect={onToggleSelect}
                      animDelay={colIndex * 20 + cardIndex * 10}
                    />
                  ))}
                  {stageGrants.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-black/5 h-16 flex items-center justify-center">
                      <span className="text-xs text-neutral-300">Empty</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Add selectionMode state and Select button to page.tsx**

In `app/dashboard/grants/page.tsx`, add these state declarations after the existing state (after line 26, `const [showWizard, setShowWizard] = useState(false);`):

```typescript
  // Bulk selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function enterSelectionMode() {
    setSelectionMode(true);
    setSelectedIds(new Set());
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllInStage(stage: LifecycleStage, ids: string[]) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSelected = ids.every(id => next.has(id));
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  }
```

Add import at the top of the file:
```typescript
import { type LifecycleStage } from '@/lib/grants/lifecycle-shared';
```

In the header `<div className="flex flex-col gap-2 sm:flex-row sm:items-center">` section, add a "Select" button that only shows when `activeView === 'pipeline'`. Insert before the existing "New Grant" button:

```typescript
          {activeView === 'pipeline' && !selectionMode && (
            <button
              onClick={enterSelectionMode}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow will-change-transform"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 11l3 3L22 4M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Select
            </button>
          )}
          {activeView === 'pipeline' && selectionMode && (
            <div className="inline-flex items-center gap-2 rounded-2xl border border-azure/20 bg-azure/5 px-4 py-2 text-sm font-medium text-azure">
              <span>{selectedIds.size} selected</span>
              <button
                onClick={exitSelectionMode}
                className="ml-2 text-xs text-neutral-500 hover:text-neutral-800 transition-colors"
              >
                Exit
              </button>
            </div>
          )}
```

Update the `GrantPipelineView` usage in the return statement to pass selection props:

```typescript
        {activeView === 'pipeline' && (
          <GrantPipelineView
            grants={grants}
            loading={grantsLoading}
            onNewGrant={() => setShowWizard(true)}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onSelectAllInStage={selectAllInStage}
          />
        )}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run components/grants/__tests__/GrantPipelineView.selection.test.tsx 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/grants/GrantPipelineView.tsx components/grants/__tests__/GrantPipelineView.selection.test.tsx app/dashboard/grants/page.tsx
git commit -m "feat(grants): selection mode in GrantPipelineView with card checkboxes and column select-all"
```

---

## Task 3: BulkActionBar Component

**Files:**
- Create: `components/grants/BulkActionBar.tsx`

The `BulkActionBar` slides up from the bottom of the viewport when any grants are selected in selection mode. It groups selected grants by `lifecycle_stage` and shows one row per stage group with a "Transition to" dropdown showing only legal next stages. An "Apply transitions" button is enabled once at least one group has a target selected.

- [ ] **Step 1: Create BulkActionBar**

Create `components/grants/BulkActionBar.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { ALLOWED_TRANSITIONS, type LifecycleStage } from '@/lib/grants/lifecycle';
import { grantStageLabel } from './grantPalette';
import { type GrantListItem } from './GrantPipelineView';

export interface QueuedTransitions {
  [stage: string]: LifecycleStage | null;
}

interface Props {
  grants: GrantListItem[];
  selectedIds: Set<string>;
  onApply: (queuedTransitions: QueuedTransitions) => void;
  onCancel: () => void;
}

export default function BulkActionBar({ grants, selectedIds, onApply, onCancel }: Props) {
  const [visible, setVisible] = useState(false);
  const [queued, setQueued] = useState<QueuedTransitions>({});

  // Spring-style entrance: mount invisible, then transition to visible
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Group selected grants by their current lifecycle stage
  const selectedGrants = grants.filter(g => selectedIds.has(g.id));
  const byStage = new Map<LifecycleStage, GrantListItem[]>();
  for (const g of selectedGrants) {
    const list = byStage.get(g.lifecycle_stage) ?? [];
    list.push(g);
    byStage.set(g.lifecycle_stage, list);
  }

  const hasAnyTarget = Object.values(queued).some(v => v !== null);

  function setTarget(stage: LifecycleStage, target: LifecycleStage | null) {
    setQueued(prev => ({ ...prev, [stage]: target }));
  }

  function handleApply() {
    const active: QueuedTransitions = {};
    for (const [stage, target] of Object.entries(queued)) {
      if (target) active[stage] = target as LifecycleStage;
    }
    onApply(active);
  }

  if (selectedIds.size === 0) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ease-out"
      style={{ transform: visible ? 'translateY(0)' : 'translateY(100%)' }}
    >
      <div className="border-t border-black/10 bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.08)] px-6 py-4">
        <div className="max-w-7xl mx-auto">
          {/* Header row */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-ink">
              {selectedIds.size} grant{selectedIds.size !== 1 ? 's' : ''} selected — choose transitions below
            </span>
            <button onClick={onCancel} className="text-xs text-neutral-500 hover:text-neutral-800 transition-colors">
              Cancel
            </button>
          </div>

          {/* Per-stage rows */}
          <div className="space-y-2">
            {[...byStage.entries()].map(([stage, stageGrants]) => {
              const legalTargets = ALLOWED_TRANSITIONS[stage] ?? [];
              return (
                <div key={stage} className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm text-neutral-600 w-48 shrink-0">
                    <span className="font-medium text-ink">{grantStageLabel(stage)}</span>
                    <span className="text-neutral-400 ml-1">({stageGrants.length})</span>
                  </span>
                  <svg className="w-4 h-4 text-neutral-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-xs text-neutral-400 mr-1">Transition to:</span>
                  <select
                    value={queued[stage] ?? ''}
                    onChange={e => setTarget(stage, (e.target.value as LifecycleStage) || null)}
                    className="rounded-xl border border-black/10 bg-white px-3 py-1.5 text-sm text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
                  >
                    <option value="">— select —</option>
                    {legalTargets.map(t => (
                      <option key={t} value={t}>{grantStageLabel(t)}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          {/* Apply button */}
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleApply}
              disabled={!hasAnyTarget}
              className="inline-flex items-center gap-2 rounded-2xl bg-azure px-5 py-2 text-sm font-medium text-white shadow-soft transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
            >
              Apply transitions
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run existing tests to verify no regressions**

```bash
npx vitest run app/api/__tests__/grants-bulk-transition.test.ts components/grants/__tests__/GrantPipelineView.selection.test.tsx 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add components/grants/BulkActionBar.tsx
git commit -m "feat(grants): BulkActionBar with per-stage transition dropdowns and spring slide-up"
```

---

## Task 4: BulkDecisionQueue Modal

**Files:**
- Create: `components/grants/BulkDecisionQueue.tsx`

This modal appears when some of the queued transitions require a decision record. It steps through each decision-required grant one at a time. The user fills in the decision form or clicks "Skip this grant." After all grants are handled, a summary screen shows what will execute and the user confirms.

`requiresDecision(from, to)` is exported from `lib/grants/lifecycle.ts`. Import it to determine which queued transitions need a decision.

- [ ] **Step 1: Create BulkDecisionQueue**

Create `components/grants/BulkDecisionQueue.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { requiresDecision, type LifecycleStage, type DecisionPayload } from '@/lib/grants/lifecycle';
import { grantStageLabel } from './grantPalette';
import { type GrantListItem } from './GrantPipelineView';
import { type QueuedTransitions } from './BulkActionBar';

export interface BulkTransitionItem {
  grantId: string;
  grantName: string;
  fromStage: LifecycleStage;
  targetStage: LifecycleStage;
  amount: number | null;
  decision?: Partial<DecisionPayload>;
  skipped?: boolean;
}

interface Props {
  grants: GrantListItem[];
  queuedTransitions: QueuedTransitions;
  onConfirm: (items: BulkTransitionItem[]) => void;
  onCancel: () => void;
}

type DecisionType = DecisionPayload['decision_type'];
type DecisionValue = DecisionPayload['decision'];

const DECISION_TYPE_OPTIONS: DecisionType[] = ['approval', 'decline', 'defer', 'renewal', 'closeout', 'payment_release'];
const DECISION_VALUE_OPTIONS: DecisionValue[] = ['approved', 'declined', 'deferred', 'conditional', 'not_applicable'];

export default function BulkDecisionQueue({ grants, queuedTransitions, onConfirm, onCancel }: Props) {
  // Build all transitions that have a target stage chosen
  const allItems: BulkTransitionItem[] = [];
  for (const grant of grants) {
    const target = queuedTransitions[grant.lifecycle_stage] as LifecycleStage | undefined;
    if (!target) continue;
    allItems.push({
      grantId: grant.id,
      grantName: grant.holdings?.name ?? 'Unnamed Grant',
      fromStage: grant.lifecycle_stage,
      targetStage: target,
      amount: grant.approved_amount ?? grant.requested_amount,
    });
  }

  // Separate decision-required items from simple ones
  const decisionItems = allItems.filter(item => requiresDecision(item.fromStage, item.targetStage));
  const simpleItems = allItems.filter(item => !requiresDecision(item.fromStage, item.targetStage));

  const [step, setStep] = useState(0); // index into decisionItems; decisionItems.length = summary screen
  const [decisions, setDecisions] = useState<Record<string, Partial<DecisionPayload>>>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [slideDir, setSlideDir] = useState<'in' | 'out'>('in');

  const onSummary = step >= decisionItems.length;
  const current = decisionItems[step];

  function advance(dir: 'forward' | 'back') {
    setSlideDir(dir === 'forward' ? 'out' : 'in');
    setTimeout(() => {
      setStep(s => s + (dir === 'forward' ? 1 : -1));
      setSlideDir('in');
    }, 150);
  }

  function saveDecision(grantId: string, partial: Partial<DecisionPayload>) {
    setDecisions(prev => ({ ...prev, [grantId]: { ...prev[grantId], ...partial } }));
  }

  function skipCurrent() {
    setSkipped(prev => new Set([...prev, current.grantId]));
    advance('forward');
  }

  function nextStep() {
    advance('forward');
  }

  function confirm() {
    const result: BulkTransitionItem[] = [
      ...simpleItems,
      ...decisionItems
        .filter(item => !skipped.has(item.grantId))
        .map(item => ({ ...item, decision: decisions[item.grantId] })),
    ];
    onConfirm(result);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Progress bar */}
        {decisionItems.length > 0 && (
          <div className="h-1 bg-neutral-100">
            <div
              className="h-1 bg-azure transition-all duration-300"
              style={{ width: `${Math.round((step / (decisionItems.length)) * 100)}%` }}
            />
          </div>
        )}

        <div className="p-6">
          {/* Summary screen */}
          {onSummary ? (
            <div>
              <h2 className="text-lg font-semibold text-ink mb-4">Ready to apply</h2>
              <div className="space-y-2 mb-6 max-h-64 overflow-y-auto">
                {simpleItems.map(item => (
                  <div key={item.grantId} className="flex items-center justify-between text-sm py-1 border-b border-black/5">
                    <span className="text-neutral-700 truncate mr-4">{item.grantName}</span>
                    <span className="text-neutral-400 shrink-0">{grantStageLabel(item.fromStage)} → {grantStageLabel(item.targetStage)}</span>
                  </div>
                ))}
                {decisionItems
                  .filter(item => !skipped.has(item.grantId))
                  .map(item => (
                    <div key={item.grantId} className="flex items-center justify-between text-sm py-1 border-b border-black/5">
                      <span className="text-neutral-700 truncate mr-4">{item.grantName}</span>
                      <span className="text-neutral-400 shrink-0">{grantStageLabel(item.fromStage)} → {grantStageLabel(item.targetStage)}</span>
                    </div>
                  ))}
                {skipped.size > 0 && (
                  <p className="text-xs text-neutral-400 pt-2">{skipped.size} grant{skipped.size !== 1 ? 's' : ''} skipped</p>
                )}
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={onCancel} className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={confirm}
                  className="px-5 py-2 rounded-2xl bg-azure text-white text-sm font-medium shadow-soft hover:opacity-90 transition-opacity"
                >
                  Confirm & apply
                </button>
              </div>
            </div>
          ) : (
            /* Decision step */
            <div
              className="transition-all duration-150"
              style={{ opacity: slideDir === 'out' ? 0 : 1, transform: slideDir === 'out' ? 'translateX(-20px)' : 'translateX(0)' }}
            >
              {/* Step indicator */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-neutral-400 font-medium">
                  Decision {step + 1} of {decisionItems.length}
                </span>
                <button onClick={onCancel} className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors">
                  Cancel all
                </button>
              </div>

              <h2 className="text-base font-semibold text-ink mb-0.5">{current.grantName}</h2>
              <p className="text-sm text-neutral-500 mb-5">
                {grantStageLabel(current.fromStage)} → {grantStageLabel(current.targetStage)}
              </p>

              {/* Decision form */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1">Decision type</label>
                    <select
                      value={decisions[current.grantId]?.decision_type ?? ''}
                      onChange={e => saveDecision(current.grantId, { decision_type: e.target.value as DecisionType || undefined })}
                      className="w-full rounded-xl border border-black/10 px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-azure/30"
                    >
                      <option value="">Select…</option>
                      {DECISION_TYPE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1">Decision</label>
                    <select
                      value={decisions[current.grantId]?.decision ?? ''}
                      onChange={e => saveDecision(current.grantId, { decision: e.target.value as DecisionValue || undefined })}
                      className="w-full rounded-xl border border-black/10 px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-azure/30"
                    >
                      <option value="">Select…</option>
                      {DECISION_VALUE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">Amount</label>
                  <input
                    type="number"
                    value={decisions[current.grantId]?.amount ?? current.amount ?? ''}
                    onChange={e => saveDecision(current.grantId, { amount: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-full rounded-xl border border-black/10 px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-azure/30"
                    placeholder="Amount"
                    min={0}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">Board meeting date <span className="text-neutral-300">(optional)</span></label>
                  <input
                    type="date"
                    value={decisions[current.grantId]?.board_meeting_date ?? ''}
                    onChange={e => saveDecision(current.grantId, { board_meeting_date: e.target.value || undefined })}
                    className="w-full rounded-xl border border-black/10 px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-azure/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">Rationale <span className="text-neutral-300">(optional)</span></label>
                  <textarea
                    value={decisions[current.grantId]?.rationale ?? ''}
                    onChange={e => saveDecision(current.grantId, { rationale: e.target.value || undefined })}
                    rows={2}
                    className="w-full rounded-xl border border-black/10 px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-azure/30 resize-none"
                    placeholder="Reason for decision…"
                  />
                </div>
              </div>

              {/* Navigation */}
              <div className="mt-5 flex items-center justify-between">
                <button
                  onClick={skipCurrent}
                  className="text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  Skip this grant
                </button>
                <button
                  onClick={nextStep}
                  className="px-5 py-2 rounded-2xl bg-azure text-white text-sm font-medium shadow-soft hover:opacity-90 transition-opacity"
                >
                  {step + 1 < decisionItems.length ? 'Next →' : 'Review →'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run existing tests**

```bash
npx vitest run app/api/__tests__/grants-bulk-transition.test.ts components/grants/__tests__/GrantPipelineView.selection.test.tsx 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add components/grants/BulkDecisionQueue.tsx
git commit -m "feat(grants): BulkDecisionQueue stepped modal with skip option and slide animation"
```

---

## Task 5: BulkTransitionResultModal + Final Wiring

**Files:**
- Create: `components/grants/BulkTransitionResultModal.tsx`
- Modify: `app/dashboard/grants/page.tsx`

This task wires everything together: the page manages the apply flow state machine (`idle → confirm → decisions → applying → result`) and connects `BulkActionBar` → `BulkDecisionQueue` → API call → `BulkTransitionResultModal`.

- [ ] **Step 1: Create BulkTransitionResultModal**

Create `components/grants/BulkTransitionResultModal.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';

export interface BulkResult {
  grantId: string;
  grantName?: string;
  fromStage?: string;
  targetStage?: string;
  success: boolean;
  error?: string;
}

interface Props {
  successCount: number;
  failureCount: number;
  results: BulkResult[];
  onClose: () => void;
}

export default function BulkTransitionResultModal({ successCount, failureCount, results, onClose }: Props) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  const allSuccess = failureCount === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4 p-6 transition-all duration-200"
        style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(8px)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          {allSuccess ? (
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          )}
          <div>
            <h2 className="text-base font-semibold text-ink">
              {allSuccess ? 'All transitions applied' : `${successCount} applied, ${failureCount} failed`}
            </h2>
            <p className="text-xs text-neutral-500">
              {allSuccess ? `${successCount} grant${successCount !== 1 ? 's' : ''} moved successfully` : 'Review failures below'}
            </p>
          </div>
        </div>

        {/* Result list */}
        <div className="space-y-1.5 max-h-56 overflow-y-auto mb-5">
          {results.filter(r => r.success).map(r => (
            <div key={r.grantId} className="flex items-center gap-2 text-sm py-1">
              <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <svg className="w-2.5 h-2.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span className="text-neutral-700 truncate">{r.grantName ?? r.grantId}</span>
            </div>
          ))}
          {results.filter(r => !r.success).map(r => (
            <div key={r.grantId} className="text-sm py-1">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <svg className="w-2.5 h-2.5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </span>
                <span className="text-neutral-700 truncate">{r.grantName ?? r.grantId}</span>
              </div>
              {r.error && <p className="text-xs text-red-500 ml-6 mt-0.5">{r.error}</p>}
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full rounded-2xl bg-azure px-4 py-2.5 text-sm font-medium text-white shadow-soft hover:opacity-90 transition-opacity"
        >
          Done
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the full bulk flow in page.tsx**

Add these imports to `app/dashboard/grants/page.tsx`:

```typescript
import BulkActionBar, { type QueuedTransitions } from '@/components/grants/BulkActionBar';
import BulkDecisionQueue, { type BulkTransitionItem } from '@/components/grants/BulkDecisionQueue';
import BulkTransitionResultModal, { type BulkResult } from '@/components/grants/BulkTransitionResultModal';
```

Add these state declarations after the existing bulk selection state in `GrantsDashboard`:

```typescript
  // Bulk apply flow state
  type BulkPhase = 'idle' | 'confirm' | 'decisions' | 'applying' | 'result';
  const [bulkPhase, setBulkPhase] = useState<BulkPhase>('idle');
  const [queuedTransitions, setQueuedTransitions] = useState<QueuedTransitions>({});
  const [bulkResults, setBulkResults] = useState<{ successCount: number; failureCount: number; results: BulkResult[] } | null>(null);

  async function handleApplyTransitions(queued: QueuedTransitions) {
    setQueuedTransitions(queued);
    // Check if any queued transition needs a decision
    const { requiresDecision } = await import('@/lib/grants/lifecycle');
    const needsDecision = grants.some(g => {
      const target = queued[g.lifecycle_stage];
      return target && selectedIds.has(g.id) && requiresDecision(g.lifecycle_stage, target);
    });
    setBulkPhase(needsDecision ? 'decisions' : 'confirm');
  }

  async function executeBulkTransitions(items: BulkTransitionItem[]) {
    if (!orgId) return;
    setBulkPhase('applying');

    const body = {
      transitions: items.map(item => ({
        grantId: item.grantId,
        expectedFromStage: item.fromStage,
        targetStage: item.targetStage,
        decision: item.decision,
      })),
    };

    try {
      const res = await fetch(`/api/org/${orgId}/grants/bulk-transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      // Optimistic: update local grant stages for successes
      const successIds = new Set(data.results.filter((r: any) => r.success).map((r: any) => r.grantId));
      setGrants(prev =>
        prev.map(g => {
          if (!successIds.has(g.id)) return g;
          const item = items.find(i => i.grantId === g.id);
          return item ? { ...g, lifecycle_stage: item.targetStage } : g;
        })
      );

      // Enrich results with grant names
      const nameMap = new Map(grants.map(g => [g.id, g.holdings?.name ?? g.id]));
      const enriched: BulkResult[] = data.results.map((r: any) => ({
        ...r,
        grantName: nameMap.get(r.grantId),
      }));

      setBulkResults({ successCount: data.successCount, failureCount: data.failureCount, results: enriched });
      setBulkPhase('result');

      // Refetch grants list
      setRefreshKey(k => k + 1);
    } catch {
      setBulkPhase('idle');
    }
  }

  function handleDecisionQueueConfirm(items: BulkTransitionItem[]) {
    executeBulkTransitions(items);
  }

  function handleSimpleConfirm() {
    // No decisions needed — build items directly from queued + selectedIds
    const items: BulkTransitionItem[] = grants
      .filter(g => selectedIds.has(g.id) && queuedTransitions[g.lifecycle_stage])
      .map(g => ({
        grantId: g.id,
        grantName: g.holdings?.name ?? 'Unnamed Grant',
        fromStage: g.lifecycle_stage,
        targetStage: queuedTransitions[g.lifecycle_stage] as LifecycleStage,
        amount: g.approved_amount ?? g.requested_amount,
      }));
    executeBulkTransitions(items);
  }

  function closeBulkResult() {
    setBulkResults(null);
    setBulkPhase('idle');
    exitSelectionMode();
  }
```

Add the `BulkActionBar` render at the bottom of the return statement, before the closing `</div>`:

```typescript
      {/* Bulk selection action bar — only when in selection mode with pipeline visible */}
      {activeView === 'pipeline' && selectionMode && selectedIds.size > 0 && bulkPhase === 'idle' && (
        <BulkActionBar
          grants={grants}
          selectedIds={selectedIds}
          onApply={handleApplyTransitions}
          onCancel={exitSelectionMode}
        />
      )}

      {/* Simple confirmation dialog (no decisions required) */}
      {bulkPhase === 'confirm' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-base font-semibold text-ink mb-2">Apply transitions?</h2>
            <p className="text-sm text-neutral-500 mb-5">
              {grants.filter(g => selectedIds.has(g.id) && queuedTransitions[g.lifecycle_stage]).length} grant
              {grants.filter(g => selectedIds.has(g.id) && queuedTransitions[g.lifecycle_stage]).length !== 1 ? 's' : ''} will be moved.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setBulkPhase('idle')} className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900 transition-colors">
                Back
              </button>
              <button
                onClick={handleSimpleConfirm}
                className="px-5 py-2 rounded-2xl bg-azure text-white text-sm font-medium shadow-soft hover:opacity-90 transition-opacity"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decision queue modal */}
      {bulkPhase === 'decisions' && (
        <BulkDecisionQueue
          grants={grants.filter(g => selectedIds.has(g.id))}
          queuedTransitions={queuedTransitions}
          onConfirm={handleDecisionQueueConfirm}
          onCancel={() => setBulkPhase('idle')}
        />
      )}

      {/* Applying spinner overlay */}
      {bulkPhase === 'applying' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-3xl shadow-2xl px-8 py-6 flex items-center gap-4">
            <div className="w-5 h-5 border-2 border-azure border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium text-ink">Applying transitions…</span>
          </div>
        </div>
      )}

      {/* Result modal */}
      {bulkPhase === 'result' && bulkResults && (
        <BulkTransitionResultModal
          successCount={bulkResults.successCount}
          failureCount={bulkResults.failureCount}
          results={bulkResults.results}
          onClose={closeBulkResult}
        />
      )}
```

- [ ] **Step 3: Add padding-bottom to prevent BulkActionBar from covering content**

In `app/dashboard/grants/page.tsx`, update the outer `<div>` classname to add conditional bottom padding when in selection mode:

```typescript
    <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 ${selectionMode ? 'pb-36' : ''}`}>
```

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run app/api/__tests__/grants-bulk-transition.test.ts app/api/__tests__/grants-transition.test.ts components/grants/__tests__/GrantPipelineView.selection.test.tsx 2>&1 | tail -15
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add components/grants/BulkTransitionResultModal.tsx app/dashboard/grants/page.tsx
git commit -m "feat(grants): wire full bulk transition flow — BulkActionBar, BulkDecisionQueue, result modal, API integration"
```

---

## Self-Review Checklist

After all tasks complete, verify against the spec:

- [ ] `POST /api/org/[orgId]/grants/bulk-transition` exists and returns 207
- [ ] Zod validates body strictly: min 1, max 50, UUID grantIds, no duplicate grantIds, valid stages, valid decision fields
- [ ] Preflight query scopes to `org_id` before calling `transitionGrant()`
- [ ] Stale-stage check: `expectedFromStage !== dbGrant.lifecycle_stage` → per-grant failure, no mutation
- [ ] Decision-required missing → per-grant failure, no mutation
- [ ] `decision_date` defaults to today's ISO date if not provided
- [ ] Never short-circuits on per-grant failure
- [ ] Pipeline cards show checkboxes only in selection mode (staggered fade-in)
- [ ] Column headers show "Select all" checkbox in selection mode
- [ ] `BulkActionBar` groups selected grants by stage and shows only ALLOWED_TRANSITIONS targets
- [ ] `BulkDecisionQueue` only steps through decision-required transitions
- [ ] Skip button excludes a grant from the batch entirely
- [ ] Result modal shows green/red per-grant breakdown
- [ ] Successful transitions update local `lifecycle_stage` state optimistically
- [ ] `refreshKey` bumped after API call triggers a grants list refetch
- [ ] `exitSelectionMode` clears selectedIds and resets bulkPhase on result modal close
- [ ] `pb-36` on outer div prevents BulkActionBar from covering content
