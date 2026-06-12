# Task Center Completion Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add task dashboard summary widgets, entity-link affordances in the task inbox, and a Tasks nav entry so the task system is discoverable and actionable from the main product surfaces.

**Architecture:** Three independent layers — (1) a new `/api/org/[orgId]/tasks/summary` endpoint returns aggregate counts without loading task rows; (2) a client `TaskSummaryWidget` self-fetches and renders 4 count tiles on the main dashboard; (3) the existing `TaskInbox` gets a pure entity-link helper that maps `task_entity_links` to clickable destination URLs. The `reportApprovalsProducer` stub is intentionally deferred until Phase 2.3 Reporting is shipped.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Tailwind, Supabase admin client (`{ count: 'exact', head: true }` for zero-row aggregate queries).

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `app/api/org/[orgId]/tasks/summary/route.ts` | Returns `{ overdue, due_soon, blocked, mine, total_open }` counts |
| Create | `app/api/__tests__/tasks-summary.test.ts` | API auth + contract tests |
| Create | `lib/tasks/entity-links.ts` | Pure function mapping entity_type → destination URL |
| Create | `lib/tasks/__tests__/entity-links.test.ts` | Unit tests for the link helper |
| Create | `components/tasks/TaskSummaryWidget.tsx` | 4-tile client widget |
| Modify | `app/dashboard/page.tsx` | Extract `orgId` from `/api/me`, render `TaskSummaryWidget` |
| Modify | `components/tasks/TaskInbox.tsx` | Render entity links using the helper |
| Modify | `app/org/layout.tsx` | Add Tasks to org sidebar nav |

---

## Task 1: Task Summary API Endpoint

**Files:**
- Create: `app/api/org/[orgId]/tasks/summary/route.ts`
- Create: `app/api/__tests__/tasks-summary.test.ts`

### Background

The GET `/api/org/[orgId]/tasks` endpoint loads full task rows. The dashboard widget only needs counts. Use Supabase's `{ count: 'exact', head: true }` mode — it fires a `SELECT count(*)` with no row data returned.

The five counts:
- `overdue`: `due_at < now AND status NOT IN ('completed','cancelled')`
- `due_soon`: `now <= due_at <= now + 7 days AND status NOT IN ('completed','cancelled')`
- `blocked`: `status = 'blocked'`
- `mine`: `assigned_to = current_user AND status NOT IN ('completed','cancelled')`
- `total_open`: `status NOT IN ('completed','cancelled')`

All queries also filter `deleted_at IS NULL` and `org_id = orgId`.

- [ ] **Step 1: Write the failing test**

Create `app/api/__tests__/tasks-summary.test.ts`:

```typescript
// app/api/__tests__/tasks-summary.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const ORG_ID  = '11111111-1111-1111-1111-111111111111';
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

let _authUser: { id: string } | null = { id: USER_ID };
let _orgRole: string | null = 'admin';
// Each count query returns { count: N, error: null }; override per test
let _counts: Record<string, number> = { overdue: 3, due_soon: 5, blocked: 1, mine: 7, total_open: 12 };
let _countError: { message: string } | null = null;

const mockServerRpc = vi.fn();
const mockAdminFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: _authUser } })) },
    rpc: mockServerRpc,
  })),
  createAdminClient: vi.fn(() => ({ from: mockAdminFrom })),
}));

// Counts are issued as five parallel queries. Each returns { count, error }.
// The mock intercepts .select().eq().lt()... chains and resolves to { count, error }.
let _callIndex = 0; // increments per from('tasks') call so each parallel call gets the right count

function setupMocks() {
  mockServerRpc.mockImplementation(async (fn: string) => {
    if (fn === 'user_org_role') return { data: _orgRole, error: null };
    return { data: null, error: null };
  });

  // Count key order: overdue, due_soon, blocked, mine, total_open
  const ORDER = ['overdue', 'due_soon', 'blocked', 'mine', 'total_open'] as const;
  _callIndex = 0;

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'tasks') {
      const idx = _callIndex++;
      const key = ORDER[idx] ?? 'total_open';
      const countVal = _counts[key] ?? 0;
      const b: any = {
        select: vi.fn(() => b),
        eq:     vi.fn(() => b),
        lt:     vi.fn(() => b),
        gte:    vi.fn(() => b),
        lte:    vi.fn(() => b),
        not:    vi.fn(() => b),
        is:     vi.fn(() => b),
        then:   vi.fn(async (resolve: Function) => resolve({ count: _countError ? null : countVal, error: _countError })),
      };
      return b;
    }
    return { select: vi.fn().mockReturnThis() };
  });
}

beforeEach(() => {
  _authUser   = { id: USER_ID };
  _orgRole    = 'admin';
  _counts     = { overdue: 3, due_soon: 5, blocked: 1, mine: 7, total_open: 12 };
  _countError = null;
  setupMocks();
});

function makeRequest(orgId = ORG_ID) {
  return new NextRequest(`http://localhost/api/org/${orgId}/tasks/summary`);
}
function makeParams(orgId = ORG_ID) {
  return { params: Promise.resolve({ orgId }) };
}

import { GET } from '@/app/api/org/[orgId]/tasks/summary/route';

describe('GET /api/org/[orgId]/tasks/summary — auth', () => {
  it('returns 401 when not authenticated', async () => {
    _authUser = null;
    const res  = await GET(makeRequest(), makeParams());
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body).toHaveProperty('error');
  });

  it('returns 403 when user is not a member of the org', async () => {
    _orgRole = null;
    const res  = await GET(makeRequest(), makeParams());
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body).toHaveProperty('error');
  });
});

describe('GET /api/org/[orgId]/tasks/summary — contract', () => {
  it('returns { overdue, due_soon, blocked, mine, total_open } with correct values', async () => {
    const res  = await GET(makeRequest(), makeParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({
      overdue:    3,
      due_soon:   5,
      blocked:    1,
      mine:       7,
      total_open: 12,
    });
  });

  it('returns zeros when all counts are 0', async () => {
    _counts = { overdue: 0, due_soon: 0, blocked: 0, mine: 0, total_open: 0 };
    const res  = await GET(makeRequest(), makeParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.overdue).toBe(0);
    expect(body.total_open).toBe(0);
  });

  it('returns 500 when a count query errors', async () => {
    _countError = { message: 'relation "tasks" does not exist' };
    const res  = await GET(makeRequest(), makeParams());
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body).toHaveProperty('error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run app/api/__tests__/tasks-summary.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/org/[orgId]/tasks/summary/route'`

- [ ] **Step 3: Implement the route**

Create `app/api/org/[orgId]/tasks/summary/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const db = createAdminClient();
    const now = new Date();
    const nowIso = now.toISOString();
    const sevenDaysIso = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const notDone = '(completed,cancelled)';

    const [overdueRes, dueSoonRes, blockedRes, mineRes, openRes] = await Promise.all([
      db.from('tasks').select('*', { count: 'exact', head: true })
        .eq('org_id', orgId).lt('due_at', nowIso).not('status', 'in', notDone).is('deleted_at', null),
      db.from('tasks').select('*', { count: 'exact', head: true })
        .eq('org_id', orgId).gte('due_at', nowIso).lte('due_at', sevenDaysIso).not('status', 'in', notDone).is('deleted_at', null),
      db.from('tasks').select('*', { count: 'exact', head: true })
        .eq('org_id', orgId).eq('status', 'blocked').is('deleted_at', null),
      db.from('tasks').select('*', { count: 'exact', head: true })
        .eq('org_id', orgId).eq('assigned_to', user.id).not('status', 'in', notDone).is('deleted_at', null),
      db.from('tasks').select('*', { count: 'exact', head: true })
        .eq('org_id', orgId).not('status', 'in', notDone).is('deleted_at', null),
    ]);

    const firstError = [overdueRes, dueSoonRes, blockedRes, mineRes, openRes].find(r => r.error);
    if (firstError?.error) {
      return NextResponse.json({ error: firstError.error.message }, { status: 500 });
    }

    return NextResponse.json({
      overdue:    overdueRes.count  ?? 0,
      due_soon:   dueSoonRes.count  ?? 0,
      blocked:    blockedRes.count  ?? 0,
      mine:       mineRes.count     ?? 0,
      total_open: openRes.count     ?? 0,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run app/api/__tests__/tasks-summary.test.ts
```

Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/org/\[orgId\]/tasks/summary/route.ts app/api/__tests__/tasks-summary.test.ts
git commit -m "feat(tasks): add /tasks/summary aggregate count endpoint"
```

---

## Task 2: Entity Link Helper

**Files:**
- Create: `lib/tasks/entity-links.ts`
- Create: `lib/tasks/__tests__/entity-links.test.ts`

### Background

`TaskInbox` currently renders `task_entity_links` as plain text badges. Each link has `entity_type`, `entity_id`, and `relationship`. This task extracts a pure function that maps a link to its destination URL so the inbox can render clickable chips.

Grant sub-entities (`grant_milestone`, `grant_report`, `grant_payment`) can't be deep-linked directly — their `entity_id` is the sub-entity's UUID, not the grant's UUID. The function also receives the full `links` array so it can find the `grant` context link and derive the grant page URL.

- [ ] **Step 1: Write the failing test**

Create `lib/tasks/__tests__/entity-links.test.ts`:

```typescript
// lib/tasks/__tests__/entity-links.test.ts
import { describe, it, expect } from 'vitest';
import { getEntityUrl } from '../entity-links';

const GRANT_ID     = 'gggggggg-gggg-gggg-gggg-gggggggggggg';
const MILESTONE_ID = 'mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmm';
const DONOR_ID     = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const HOLDING_ID   = 'hhhhhhhh-hhhh-hhhh-hhhh-hhhhhhhhhhhh';
const PORTFOLIO_ID = 'pppppppp-pppp-pppp-pppp-pppppppppppp';
const IMPORT_ID    = 'iiiiiiii-iiii-iiii-iiii-iiiiiiiiiiii';
const ORG_ID       = 'oooooooo-oooo-oooo-oooo-oooooooooooo';

const GRANT_LINK = { entity_type: 'grant' as const, entity_id: GRANT_ID, relationship: 'context' as const };

describe('getEntityUrl', () => {
  it('links a grant entity to /dashboard/grants/[id]', () => {
    expect(getEntityUrl({ entity_type: 'grant', entity_id: GRANT_ID, relationship: 'primary' }, [], ORG_ID))
      .toBe(`/dashboard/grants/${GRANT_ID}`);
  });

  it('links grant_milestone to the context grant page', () => {
    const links = [
      { entity_type: 'grant_milestone' as const, entity_id: MILESTONE_ID, relationship: 'primary' as const },
      GRANT_LINK,
    ];
    expect(getEntityUrl(links[0], links, ORG_ID))
      .toBe(`/dashboard/grants/${GRANT_ID}`);
  });

  it('returns null for grant_milestone when no context grant link exists', () => {
    const links = [{ entity_type: 'grant_milestone' as const, entity_id: MILESTONE_ID, relationship: 'primary' as const }];
    expect(getEntityUrl(links[0], links, ORG_ID)).toBeNull();
  });

  it('links grant_report to the context grant page', () => {
    const reportId = 'rrrrrrrr-rrrr-rrrr-rrrr-rrrrrrrrrrrr';
    const links = [
      { entity_type: 'grant_report' as const, entity_id: reportId, relationship: 'primary' as const },
      GRANT_LINK,
    ];
    expect(getEntityUrl(links[0], links, ORG_ID))
      .toBe(`/dashboard/grants/${GRANT_ID}`);
  });

  it('links grant_payment to the context grant page', () => {
    const payId = 'payyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy';
    const links = [
      { entity_type: 'grant_payment' as const, entity_id: payId, relationship: 'primary' as const },
      GRANT_LINK,
    ];
    expect(getEntityUrl(links[0], links, ORG_ID))
      .toBe(`/dashboard/grants/${GRANT_ID}`);
  });

  it('links filing and state_registration to /dashboard/compliance', () => {
    expect(getEntityUrl({ entity_type: 'filing', entity_id: 'x', relationship: 'primary' }, [], ORG_ID))
      .toBe('/dashboard/compliance');
    expect(getEntityUrl({ entity_type: 'state_registration', entity_id: 'x', relationship: 'primary' }, [], ORG_ID))
      .toBe('/dashboard/compliance');
  });

  it('links donor to /org/[orgId]/donors/[id]', () => {
    expect(getEntityUrl({ entity_type: 'donor', entity_id: DONOR_ID, relationship: 'primary' }, [], ORG_ID))
      .toBe(`/org/${ORG_ID}/donors/${DONOR_ID}`);
  });

  it('links pledge and pledge_installment to /dashboard/pledges', () => {
    expect(getEntityUrl({ entity_type: 'pledge', entity_id: 'x', relationship: 'primary' }, [], ORG_ID))
      .toBe('/dashboard/pledges');
    expect(getEntityUrl({ entity_type: 'pledge_installment', entity_id: 'x', relationship: 'primary' }, [], ORG_ID))
      .toBe('/dashboard/pledges');
  });

  it('links holding to /dashboard/holdings/[id]', () => {
    expect(getEntityUrl({ entity_type: 'holding', entity_id: HOLDING_ID, relationship: 'primary' }, [], ORG_ID))
      .toBe(`/dashboard/holdings/${HOLDING_ID}`);
  });

  it('links portfolio to /dashboard?portfolio_id=[id]', () => {
    expect(getEntityUrl({ entity_type: 'portfolio', entity_id: PORTFOLIO_ID, relationship: 'primary' }, [], ORG_ID))
      .toBe(`/dashboard?portfolio_id=${PORTFOLIO_ID}`);
  });

  it('links import_job to /admin/upload', () => {
    expect(getEntityUrl({ entity_type: 'import_job', entity_id: IMPORT_ID, relationship: 'primary' }, [], ORG_ID))
      .toBe('/admin/upload');
  });

  it('returns null for workflow_instance (no dedicated page)', () => {
    expect(getEntityUrl({ entity_type: 'workflow_instance', entity_id: 'x', relationship: 'primary' }, [], ORG_ID))
      .toBeNull();
  });

  it('returns null for unknown entity types', () => {
    expect(getEntityUrl({ entity_type: 'unknown_type' as any, entity_id: 'x', relationship: 'primary' }, [], ORG_ID))
      .toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/tasks/__tests__/entity-links.test.ts
```

Expected: FAIL — `Cannot find module '../entity-links'`

- [ ] **Step 3: Implement the helper**

Create `lib/tasks/entity-links.ts`:

```typescript
// lib/tasks/entity-links.ts
// Pure function: maps a task_entity_links row + sibling links to a destination URL.

export type EntityLink = {
  entity_type: string;
  entity_id: string;
  relationship: string;
};

// Grant sub-entity types that resolve through a context 'grant' link.
const GRANT_SUB_TYPES = new Set(['grant_milestone', 'grant_report', 'grant_payment']);

export function getEntityUrl(
  link: EntityLink,
  allLinks: EntityLink[],
  orgId: string
): string | null {
  const { entity_type, entity_id } = link;

  if (entity_type === 'grant') {
    return `/dashboard/grants/${entity_id}`;
  }

  if (GRANT_SUB_TYPES.has(entity_type)) {
    const grantLink = allLinks.find(l => l.entity_type === 'grant');
    if (!grantLink) return null;
    return `/dashboard/grants/${grantLink.entity_id}`;
  }

  if (entity_type === 'filing' || entity_type === 'state_registration') {
    return '/dashboard/compliance';
  }

  if (entity_type === 'donor') {
    return `/org/${orgId}/donors/${entity_id}`;
  }

  if (entity_type === 'pledge' || entity_type === 'pledge_installment') {
    return '/dashboard/pledges';
  }

  if (entity_type === 'holding') {
    return `/dashboard/holdings/${entity_id}`;
  }

  if (entity_type === 'portfolio') {
    return `/dashboard?portfolio_id=${entity_id}`;
  }

  if (entity_type === 'import_job') {
    return '/admin/upload';
  }

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/tasks/__tests__/entity-links.test.ts
```

Expected: all 13 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/tasks/entity-links.ts lib/tasks/__tests__/entity-links.test.ts
git commit -m "feat(tasks): add entity-link URL helper with tests"
```

---

## Task 3: Dashboard Widget + Inbox Affordances + Nav Link

**Files:**
- Create: `components/tasks/TaskSummaryWidget.tsx`
- Modify: `app/dashboard/page.tsx` (lines ~95–125, render widget)
- Modify: `components/tasks/TaskInbox.tsx` (entity link chips)
- Modify: `app/org/layout.tsx` (Tasks nav item)

### Background

**TaskSummaryWidget:** Fetches `/api/org/[orgId]/tasks/summary` via `useEffect`, renders four count tiles — Overdue (red), Due Soon (amber), Blocked (neutral), Mine (azure). Each tile links to `/org/[orgId]/tasks?tab=<tab>`. No task rows are fetched; the widget shows a compact loading skeleton and goes blank (renders nothing) if `orgId` is empty.

**Dashboard:** The server page already fetches `/api/me`, which returns `organization_id`. Widen the type annotation and pass it to `TaskSummaryWidget`.

**TaskInbox entity links:** Replace the plain text `entity_type` badge with a link chip using `getEntityUrl`. When the URL is null (e.g. `workflow_instance`), fall back to a plain badge. Context links (`relationship !== 'primary'`) are skipped — only primary entity links are shown.

**Org nav link:** Insert `{ href: /org/${currentOrgId}/tasks, label: "Tasks" }` between Dashboard and Data in `app/org/layout.tsx`.

- [ ] **Step 1: Create `TaskSummaryWidget`**

Create `components/tasks/TaskSummaryWidget.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Summary {
  overdue:    number;
  due_soon:   number;
  blocked:    number;
  mine:       number;
  total_open: number;
}

interface Props {
  orgId: string;
}

const TILES = [
  { key: 'overdue'  as const, label: 'Overdue',  tab: 'overdue',  accent: 'text-red-600',   bg: 'bg-red-50',   badge: 'bg-red-100 text-red-700'   },
  { key: 'due_soon' as const, label: 'Due Soon', tab: 'due_soon', accent: 'text-amber-600', bg: 'bg-amber-50', badge: 'bg-amber-100 text-amber-700' },
  { key: 'blocked'  as const, label: 'Blocked',  tab: 'open',     accent: 'text-neutral-600',bg:'bg-neutral-50',badge:'bg-neutral-100 text-neutral-600'},
  { key: 'mine'     as const, label: 'My Tasks', tab: 'mine',     accent: 'text-azure',      bg: 'bg-azure/5',  badge: 'bg-azure/10 text-azure'      },
] as const;

export default function TaskSummaryWidget({ orgId }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) { setLoading(false); return; }
    fetch(`/api/org/${orgId}/tasks/summary`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setSummary(data); })
      .finally(() => setLoading(false));
  }, [orgId]);

  if (!orgId) return null;

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1,2,3,4].map(i => (
          <div key={i} className="animate-pulse rounded-2xl bg-neutral-100 h-20" />
        ))}
      </div>
    );
  }

  if (!summary) return null;

  const hasAny = summary.total_open > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-neutral-700">Tasks</h2>
        <Link
          href={`/org/${orgId}/tasks`}
          className="text-xs text-azure hover:underline"
        >
          View all {summary.total_open > 0 ? `(${summary.total_open} open)` : ''}
        </Link>
      </div>
      {!hasAny ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 py-4 text-center text-sm text-neutral-400">
          No open tasks
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {TILES.map(tile => {
            const count = summary[tile.key];
            return (
              <Link
                key={tile.key}
                href={`/org/${orgId}/tasks?tab=${tile.tab}`}
                className={`flex flex-col items-center justify-center rounded-2xl border border-black/5 ${tile.bg} p-3 hover:shadow-md transition-shadow`}
              >
                <span className={`text-2xl font-bold tabular-nums ${tile.accent}`}>
                  {count}
                </span>
                <span className="mt-1 text-xs text-neutral-500 font-medium">{tile.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Integrate widget into dashboard page**

In `app/dashboard/page.tsx`, find the line:
```typescript
let me: { recommended_portfolio_id?: string | null } | null = null;
```
Change it to:
```typescript
let me: { recommended_portfolio_id?: string | null; organization_id?: string | null } | null = null;
```

Then find where `portfolioId` is derived:
```typescript
const portfolioId = urlPortfolio || me?.recommended_portfolio_id || '';
```
Add immediately after:
```typescript
const orgId = me?.organization_id || '';
```

Then add the static import at the top of the file:
```typescript
import TaskSummaryWidget from '@/components/tasks/TaskSummaryWidget';
```

Then find the `<Reveal delay={75}>` block (the KPI filter) and add the widget BEFORE it:
```tsx
{orgId && (
  <Reveal>
    <TaskSummaryWidget orgId={orgId} />
  </Reveal>
)}
```

- [ ] **Step 3: Add entity link affordances to TaskInbox**

In `components/tasks/TaskInbox.tsx`, add the import at the top:
```typescript
import Link from 'next/link';
import { getEntityUrl } from '@/lib/tasks/entity-links';
```

Find the entity links rendering block (around line 363):
```tsx
{task.task_entity_links && task.task_entity_links.length > 0 && (
  <div className="mt-2 flex flex-wrap gap-1">
    {task.task_entity_links.map(link => (
      <span key={`${link.entity_type}-${link.entity_id}`} className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
        {link.entity_type.replace(/_/g, ' ')}
      </span>
    ))}
  </div>
)}
```

Replace it with:
```tsx
{task.task_entity_links && task.task_entity_links.length > 0 && (
  <div className="mt-2 flex flex-wrap gap-1">
    {task.task_entity_links
      .filter(link => link.relationship !== 'context')
      .map(link => {
        const url = getEntityUrl(link, task.task_entity_links ?? [], orgId);
        const label = link.entity_type.replace(/_/g, ' ');
        if (url) {
          return (
            <Link
              key={`${link.entity_type}-${link.entity_id}`}
              href={url}
              className="rounded bg-azure/10 px-2 py-0.5 text-xs text-azure hover:bg-azure/20 transition-colors"
              onClick={e => e.stopPropagation()}
            >
              {label}
            </Link>
          );
        }
        return (
          <span key={`${link.entity_type}-${link.entity_id}`} className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
            {label}
          </span>
        );
      })}
  </div>
)}
```

- [ ] **Step 4: Add Tasks to org nav**

In `app/org/layout.tsx`, find:
```typescript
const navItems = [
  { href: `/org/${currentOrgId}`, label: "Dashboard", icon: "chart" },
  { href: `/org/${currentOrgId}/data`, label: "Data", icon: "data" },
  { href: `/org/${currentOrgId}/members`, label: "Team", icon: "users" },
  { href: `/org/${currentOrgId}/settings`, label: "Settings", icon: "settings" },
];
```

Replace with:
```typescript
const navItems = [
  { href: `/org/${currentOrgId}`, label: "Dashboard", icon: "chart" },
  { href: `/org/${currentOrgId}/tasks`, label: "Tasks", icon: "tasks" },
  { href: `/org/${currentOrgId}/data`, label: "Data", icon: "data" },
  { href: `/org/${currentOrgId}/members`, label: "Team", icon: "users" },
  { href: `/org/${currentOrgId}/settings`, label: "Settings", icon: "settings" },
];
```

- [ ] **Step 5: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass (the entity-links and tasks-summary tests added in Tasks 1 and 2, plus all existing tests)

- [ ] **Step 6: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```

Expected: no new errors (the pre-existing TS error in `grants-bulk-transition.test.ts` lines 278-281 is a tuple-index false-positive from the test mock and pre-dates this work)

- [ ] **Step 7: Commit**

```bash
git add components/tasks/TaskSummaryWidget.tsx app/dashboard/page.tsx components/tasks/TaskInbox.tsx app/org/layout.tsx
git commit -m "feat(tasks): dashboard summary widget, entity link affordances, nav entry"
```
